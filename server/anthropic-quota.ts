/**
 * Daily spend cap for the /admin Claude chat endpoint.
 *
 * Phase 1 already locks the endpoint behind admin auth. The remaining concern
 * is "what if the ADMIN_PASSWORD leaks?" — without a cap, an attacker could
 * burn through thousands of dollars in Anthropic credits in hours.
 *
 * This module tracks daily token usage (input + output) and request count in
 * a single JSON file on the persistent disk. Resets at midnight ET.
 *
 * Env vars (all optional, with safe defaults):
 *   ANTHROPIC_DAILY_REQUEST_LIMIT  — max chat calls per day (default: 200)
 *   ANTHROPIC_DAILY_TOKEN_LIMIT    — max input+output tokens per day (default: 1_000_000)
 *   ANTHROPIC_USAGE_FILE           — file path (default: /data/anthropic-usage.json)
 */

import fs from "fs";
import path from "path";

const USAGE_FILE = process.env.ANTHROPIC_USAGE_FILE || "/data/anthropic-usage.json";

const DEFAULT_REQUEST_LIMIT = 200;
const DEFAULT_TOKEN_LIMIT = 1_000_000;

interface UsageRecord {
  // YYYY-MM-DD in America/New_York — rolls over at midnight ET
  date: string;
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
}

const EMPTY_USAGE: UsageRecord = {
  date: "",
  requestCount: 0,
  inputTokens: 0,
  outputTokens: 0,
};

function todayKeyET(d: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(d);
}

function getRequestLimit(): number {
  const raw = process.env.ANTHROPIC_DAILY_REQUEST_LIMIT;
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_REQUEST_LIMIT;
}

function getTokenLimit(): number {
  const raw = process.env.ANTHROPIC_DAILY_TOKEN_LIMIT;
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TOKEN_LIMIT;
}

function readUsage(): UsageRecord {
  try {
    if (fs.existsSync(USAGE_FILE)) {
      const raw = JSON.parse(fs.readFileSync(USAGE_FILE, "utf-8"));
      return { ...EMPTY_USAGE, ...raw };
    }
  } catch (err) {
    console.error("[anthropic-quota] Failed to read usage file:", err);
  }
  return { ...EMPTY_USAGE };
}

function writeUsage(u: UsageRecord): void {
  try {
    const dir = path.dirname(USAGE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(USAGE_FILE, JSON.stringify(u, null, 2), "utf-8");
  } catch (err) {
    console.error("[anthropic-quota] Failed to persist usage:", err);
  }
}

/**
 * Rolls the record over if the current day has changed.
 */
function currentUsage(): UsageRecord {
  const today = todayKeyET();
  const u = readUsage();
  if (u.date !== today) {
    return { ...EMPTY_USAGE, date: today };
  }
  return u;
}

/** Check if a new request would exceed limits. Returns null if OK, error string if blocked. */
export function checkQuota(): { ok: true } | { ok: false; reason: string; statusCode: 429 } {
  const u = currentUsage();
  const reqLimit = getRequestLimit();
  const tokLimit = getTokenLimit();
  if (u.requestCount >= reqLimit) {
    return {
      ok: false,
      statusCode: 429,
      reason: `Daily chat request limit reached (${u.requestCount}/${reqLimit}). Resets at midnight ET.`,
    };
  }
  if (u.inputTokens + u.outputTokens >= tokLimit) {
    return {
      ok: false,
      statusCode: 429,
      reason: `Daily token limit reached (${u.inputTokens + u.outputTokens}/${tokLimit}). Resets at midnight ET.`,
    };
  }
  return { ok: true };
}

/** Record a completed chat call. Pass token counts from Anthropic's usage block. */
export function recordUsage(inputTokens: number, outputTokens: number): void {
  const u = currentUsage();
  u.requestCount += 1;
  u.inputTokens += Math.max(0, inputTokens || 0);
  u.outputTokens += Math.max(0, outputTokens || 0);
  writeUsage(u);
}

/** Snapshot for admin UI / debugging. */
export function getUsageStatus(): UsageRecord & { requestLimit: number; tokenLimit: number } {
  return {
    ...currentUsage(),
    requestLimit: getRequestLimit(),
    tokenLimit: getTokenLimit(),
  };
}
