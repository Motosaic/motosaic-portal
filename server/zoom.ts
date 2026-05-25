// Zoom webhook + recording fetch helpers.
//
// We don't use Server-to-Server OAuth in v1 — Zoom's recording webhook payload
// already includes a short-lived `download_token` (JWT) that authorizes the
// transcript download, so the round-trip is: webhook arrives → verify HMAC →
// fetch transcript via download_url + download_token → parse VTT → store.
//
// OAuth would only be needed if/when we want to list past recordings or
// re-fetch a transcript outside the webhook window. Punt to a later phase.

import crypto from "crypto";

const SECRET_TOKEN = () => process.env.ZOOM_WEBHOOK_SECRET_TOKEN || "";

// ─── Signature verification ─────────────────────────────────────────────────
// Zoom sends two headers on every event delivery:
//   x-zm-request-timestamp: <unix-seconds>
//   x-zm-signature:         "v0=<hex hmac-sha256>"
// The signed string is `v0:<timestamp>:<raw request body>`, HMAC'd with the
// app's Secret Token. Use the rawBody we capture in index.ts — JSON.stringify
// of the parsed body re-orders keys and breaks the hash.

export function verifyWebhookSignature(
  rawBody: Buffer | string | undefined,
  timestamp: string | undefined,
  signature: string | undefined,
): boolean {
  const secret = SECRET_TOKEN();
  if (!secret) return false;
  if (!rawBody || !timestamp || !signature) return false;

  // Reject deliveries older than 5 minutes — defends against replay.
  const ts = parseInt(timestamp, 10);
  if (!Number.isFinite(ts)) return false;
  const skewSeconds = Math.abs(Math.floor(Date.now() / 1000) - ts);
  if (skewSeconds > 300) return false;

  const body = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");
  const message = `v0:${timestamp}:${body}`;
  const expected = "v0=" + crypto.createHmac("sha256", secret).update(message).digest("hex");

  // Timing-safe compare. Buffers must be equal length or .equals throws.
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// ─── URL validation challenge ───────────────────────────────────────────────
// On first save in the marketplace UI, Zoom posts `endpoint.url_validation`
// with `{ payload: { plainToken } }`. We must reply within ~3s with
// `{ plainToken, encryptedToken: HMAC-SHA256(plainToken, SecretToken) }`.

export function buildUrlValidationResponse(plainToken: string): {
  plainToken: string;
  encryptedToken: string;
} {
  const secret = SECRET_TOKEN();
  const encryptedToken = crypto.createHmac("sha256", secret).update(plainToken).digest("hex");
  return { plainToken, encryptedToken };
}

// ─── Transcript download ────────────────────────────────────────────────────
// `download_url` is in the event payload. Zoom requires the access token to be
// passed as a query param (?access_token=...) rather than as a Bearer header
// for cloud recording downloads — both technically work, but query-param is
// what the Zoom docs document and what Render's outbound HTTP handles cleanly.

export async function fetchTranscriptVtt(
  downloadUrl: string,
  downloadToken: string,
): Promise<string> {
  const sep = downloadUrl.includes("?") ? "&" : "?";
  const url = `${downloadUrl}${sep}access_token=${encodeURIComponent(downloadToken)}`;
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) {
    throw new Error(`Zoom transcript fetch failed: ${res.status} ${res.statusText}`);
  }
  return await res.text();
}

// ─── VTT → plain text ───────────────────────────────────────────────────────
// Zoom transcripts are WebVTT format:
//
//   WEBVTT
//
//   1
//   00:00:01.350 --> 00:00:04.880
//   Michael Calcara: Hey Tyler, can you hear me okay?
//
//   2
//   00:00:05.120 --> 00:00:06.700
//   Tyler Daniels: Yeah, loud and clear.
//
// We strip the header, cue numbers, and timestamp lines, keeping only the
// "Speaker: text" lines. That's the form Claude reasons about best, and it
// massively reduces tokens compared to leaving timestamps in.

export function parseVttToPlainText(vtt: string): string {
  const lines = vtt.split(/\r?\n/);
  const out: string[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line === "WEBVTT") continue;
    if (line.startsWith("NOTE")) continue;            // VTT comment block
    if (/^\d+$/.test(line)) continue;                 // cue number
    if (line.includes("-->")) continue;               // timestamp
    if (line.startsWith("Kind:") || line.startsWith("Language:")) continue;
    out.push(line);
  }

  return out.join("\n");
}

// ─── Match meeting topic → client ──────────────────────────────────────────
// Strategy: case-insensitive substring search for "<firstName> <lastName>" in
// the meeting topic. Mike's convention is topics like "Tyler Daniels and
// Michael Calcara" so this matches reliably. Returns the first match; on tie
// (extremely unlikely for two clients with identical names) the caller can
// fall back to the unattached tray and pick manually.

export interface ClientNameLike {
  id: number;
  firstName: string;
  lastName: string;
}

export function matchClientByTopic<T extends ClientNameLike>(
  topic: string | undefined,
  clients: T[],
): T | undefined {
  if (!topic) return undefined;
  const haystack = topic.toLowerCase();
  for (const c of clients) {
    const needle = `${c.firstName} ${c.lastName}`.trim().toLowerCase();
    if (needle.length < 3) continue;     // guard against empty/initials-only
    if (haystack.includes(needle)) return c;
  }
  return undefined;
}
