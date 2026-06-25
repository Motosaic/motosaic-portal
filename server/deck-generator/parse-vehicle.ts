/**
 * Interpret a user's plain-English vehicle request into a structured
 * {year_make_model, msrp, key, note}. Used by the workspace's "+ Add vehicle"
 * input so the operator can type "Cadillac CT5" and get back
 * "2026 Cadillac CT5 Premium Luxury, $48–$58K".
 *
 * Uses Sonnet (cheap + fast). Not Opus — this is a small interpretation task,
 * not the deck-quality writing that Opus is reserved for.
 */

import { checkQuota, recordUsage } from "../anthropic-quota";

const MODEL = process.env.PARSE_MODEL || "claude-sonnet-4-6";
const MAX_TOKENS = 400;
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

const SYSTEM_PROMPT = `You identify cars from short user requests. Given text like "Cadillac CT5" or "I want a fast luxury SUV under 90k", you return a single JSON object describing the most likely current-model-year luxury vehicle that matches.

Return EXACTLY this JSON shape, no preamble, no markdown fences:
{
  "year_make_model": "2026 Make Model Trim",
  "msrp": "$XX,000 – $XX,000",
  "key": "snake_case_identifier",
  "note": "One short sentence explaining which trim you picked and any caveats."
}

Rules:
- Prefer 2026 model year unless the user specifies a year.
- Pick a sensible mid-or-upper trim that matches MotoMatch's $60K-$120K clientele (Premium Luxury, Reserve, 4MATIC, xDrive40i, etc.). Not base, not the very top.
- msrp must be a realistic price range for that specific trim, not a fixed price.
- key is lowercase snake_case from make+model (e.g. "cadillac_ct5", "mercedes_gle450", "range_rover_sport").
- note is one sentence. Explain the trim choice briefly and mention if the user's request was ambiguous.

If the user's text is too vague or doesn't refer to a real car, return:
{"error": "Couldn't identify a vehicle — try 'Make Model' or 'Make Model Trim'."}`;

export interface ParsedVehicle {
  year_make_model: string;
  msrp: string;
  key: string;
  note: string;
}

export async function parseVehicle(text: string): Promise<ParsedVehicle> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Empty text");

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

  const quota = checkQuota();
  if (!quota.ok) throw new Error(`Spend cap hit: ${quota.reason}`);

  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: trimmed }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Claude API error ${res.status}: ${errText.slice(0, 500)}`);
  }

  const data = (await res.json()) as any;
  const replyText: string = data.content?.[0]?.text ?? "";
  recordUsage(data.usage?.input_tokens ?? 0, data.usage?.output_tokens ?? 0);

  // Strip markdown fences defensively
  let cleaned = replyText.trim();
  if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7).trim();
  else if (cleaned.startsWith("```")) cleaned = cleaned.slice(3).trim();
  if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3).trim();

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Couldn't parse Claude response: ${cleaned.slice(0, 200)}`);
  }

  if (parsed.error) throw new Error(parsed.error);
  if (!parsed.year_make_model || !parsed.key) {
    throw new Error("Claude returned an incomplete vehicle suggestion");
  }

  return {
    year_make_model: String(parsed.year_make_model),
    msrp: String(parsed.msrp ?? ""),
    key: String(parsed.key)
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "_"),
    note: String(parsed.note ?? ""),
  };
}
