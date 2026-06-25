/**
 * MotoMatch deck generation orchestration.
 *
 * Pipeline: load draft + client + messages + attachments → assemble user payload
 * → call Claude (Opus) with house-style.md as system prompt → validate JSON →
 * write config + spawn render.py → persist deck_outputs row → append assistant
 * message to chat with download link.
 *
 * Photo sourcing is a separate Phase 4.5 step. Until that's built, missing
 * photos render as the script's Nardo placeholder boxes (graceful fallback).
 */

import fs from "fs";
import path from "path";
import { spawn, execSync } from "child_process";
import { z } from "zod";
import { storage } from "../storage";
import { checkQuota, recordUsage } from "../anthropic-quota";
import { PYTHON_BIN } from "./python-bin";
import type {
  Client,
  DeckAttachment,
  DeckMessage,
  DeckOutput,
  DeckVehicle,
} from "@shared/schema";

// ─── Constants ───────────────────────────────────────────────────────────────

const DECK_GENERATOR_DIR = path.join(process.cwd(), "server", "deck-generator");
const HOUSE_STYLE_PATH = path.join(DECK_GENERATOR_DIR, "house-style.md");
const RENDER_PY = path.join(DECK_GENERATOR_DIR, "render.py");
const ASSETS_DIR = path.join(DECK_GENERATOR_DIR, "assets");

const UPLOADS_DIR =
  process.env.UPLOADS_DIR || path.join(process.cwd(), "uploads");
const OUTPUTS_DIR = path.join(UPLOADS_DIR, "deck-outputs");

const MODEL = process.env.DECK_MODEL || "claude-opus-4-7";
const MAX_TOKENS = 8000;
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

// ─── Zod schemas for LLM output validation ──────────────────────────────────
// Mirrors the python-pptx data contract in build_motomatch_template.py.
// JSON encodes the Python tuples as arrays — tuple unpacking accepts both.

const PrioritySchema = z.tuple([z.string().min(1), z.number().int().min(1).max(5)]);
const WhyRowSchema = z.tuple([z.string().min(1), z.string().min(1)]);
const ComparisonRowSchema = z.tuple([
  z.string().min(1),
  z.array(z.string()),
  z.union([z.number().int().min(0), z.null()]),
]);

const ClientBlockSchema = z.object({
  name: z.string().min(1),
  date: z.string().min(1),
  budget: z.string().min(1),
  purchase_type: z.string().min(1),
  priorities: z.array(PrioritySchema),
  considerations: z.array(z.string()).min(3).max(8),
  footnote: z.string().min(1),
});

const VehicleBlockSchema = z.object({
  key: z
    .string()
    .min(1)
    .regex(/^[a-z0-9_]+$/, "key must be lowercase snake_case"),
  rec_num: z.number().int().min(1),
  year_make_model: z.string().min(1),
  msrp: z.string().min(1),
  mfr_url: z.string().url(),
  cd_url: z.string().url(),
  edmunds_url: z.string().url(),
  blurb: z.string().min(20),
  specs: z.string().min(1),
  why: z.array(WhyRowSchema).length(4),
  star_line: z.union([z.string(), z.null()]).optional(),
  considerations: z.array(z.string()).length(3),
});

const DeckOutputSchema = z.object({
  client: ClientBlockSchema,
  vehicles: z.array(VehicleBlockSchema).min(3).max(7),
  comparison_rows: z.array(ComparisonRowSchema).default([]),
  include_comparison_slide: z.boolean().default(true),
  output_filename: z.string().optional(),
});

export type DeckLLMOutput = z.infer<typeof DeckOutputSchema>;

// ─── Public orchestration ────────────────────────────────────────────────────

export interface GenerateResult {
  output: DeckOutput;
  assistantMessage: DeckMessage;
}

export async function generateDeck(draftId: number): Promise<GenerateResult> {
  // 1. Load draft + related rows
  const draft = storage.getDraft(draftId);
  if (!draft) throw new Error(`Draft ${draftId} not found`);
  const client = storage.getClient(draft.clientId);
  if (!client) throw new Error(`Client ${draft.clientId} not found`);
  const messages = storage.listMessagesByDraft(draftId);
  const attachments = storage.listAttachmentsByDraft(draftId);
  const existingVehicles = storage.listVehiclesByDraft(draftId);

  // 2. Read house-style.md + best-effort git SHA
  if (!fs.existsSync(HOUSE_STYLE_PATH)) {
    throw new Error(`house-style.md missing at ${HOUSE_STYLE_PATH}`);
  }
  const houseStyle = fs.readFileSync(HOUSE_STYLE_PATH, "utf-8");
  const houseStyleCommit = readHouseStyleCommit();

  // 3. Verify env + quota
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");
  const quota = checkQuota();
  if (!quota.ok) throw new Error(`Spend cap hit: ${quota.reason}`);

  // 4. Assemble the user payload
  const userPayload = buildUserPayload({
    client,
    messages,
    attachments,
    requiredVehicles: existingVehicles,
    instruction:
      latestUserInstruction(messages) ?? "Generate the initial deck draft.",
  });

  // 5. Call Claude
  const claudeRes = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: houseStyle,
      messages: [{ role: "user", content: userPayload }],
    }),
  });
  if (!claudeRes.ok) {
    const errText = await claudeRes.text();
    throw new Error(
      `Claude API error ${claudeRes.status}: ${errText.slice(0, 1000)}`
    );
  }
  const claudeData = (await claudeRes.json()) as any;
  const replyText: string = claudeData.content?.[0]?.text ?? "";
  const inputTokens: number = claudeData.usage?.input_tokens ?? 0;
  const outputTokens: number = claudeData.usage?.output_tokens ?? 0;
  recordUsage(inputTokens, outputTokens);

  // 6. Parse + validate
  const compiledJson = parseAndValidateLLMOutput(replyText);

  // 7. Compute output paths
  if (!fs.existsSync(OUTPUTS_DIR)) fs.mkdirSync(OUTPUTS_DIR, { recursive: true });
  const version = storage.nextVersionForDraft(draftId);
  const safeLast = (client.lastName || "Client").replace(/[^A-Za-z0-9]/g, "");
  const safeFirst = (client.firstName || "").replace(/[^A-Za-z0-9]/g, "");
  // Include draftId in the on-disk name so two drafts for the same client
  // can both keep a v1, v2, ... without colliding. The download endpoint
  // can re-pretty-name via Content-Disposition later if needed.
  const fileBaseName = `${safeLast}_${safeFirst}_d${draftId}_v${version}.pptx`;
  const absoluteOutputPath = path.join(OUTPUTS_DIR, fileBaseName);

  // 8. Write config + invoke render.py
  const configPath = path.join(
    OUTPUTS_DIR,
    `.config-${draftId}-v${version}.json`
  );
  const renderConfig = {
    ...compiledJson,
    output_path: absoluteOutputPath,
    assets_dir: ASSETS_DIR,
  };
  fs.writeFileSync(configPath, JSON.stringify(renderConfig, null, 2));
  try {
    await runRender(configPath);
  } finally {
    // Clean up the config file regardless of success
    try {
      fs.unlinkSync(configPath);
    } catch {
      // best-effort
    }
  }

  // 9. Verify renderer actually produced a file
  if (!fs.existsSync(absoluteOutputPath)) {
    throw new Error(
      `render.py completed but no file at ${absoluteOutputPath}`
    );
  }

  // 10. Drive sync — TODO Phase 4.5 (deferred)
  const driveFileId: string | null = null;

  // 11. Persist deck_outputs row
  const output = storage.createOutput({
    draftId,
    version,
    filePath: fileBaseName, // relative to OUTPUTS_DIR
    driveFileId,
    compiledJson: JSON.stringify(compiledJson),
    houseStyleSnapshot: houseStyle,
    houseStyleCommit,
    modelUsed: MODEL,
    tokensInput: inputTokens,
    tokensOutput: outputTokens,
  });

  // 11b. Sync the vehicles table when the list was empty — Claude's
  // proposal becomes the working list the operator then edits. If the
  // list was already populated, we leave it alone (Claude was told to
  // use it as-is, so it should match anyway).
  if (existingVehicles.length === 0) {
    storage.replaceAllVehicles(
      draftId,
      compiledJson.vehicles.map((v) => ({
        key: v.key,
        yearMakeModel: v.year_make_model,
        msrp: v.msrp ?? null,
        source: "llm" as const,
      }))
    );
  }

  // 12. Append assistant message with download link
  const slideCount =
    2 +
    compiledJson.vehicles.length +
    (compiledJson.include_comparison_slide === false ? 0 : 1);
  const assistantMessage = storage.createMessage({
    draftId,
    role: "assistant",
    content:
      `Generated v${version} — ${compiledJson.vehicles.length} vehicles, ` +
      `${slideCount} slides. ` +
      `[Download .pptx](/api/decks/${draftId}/outputs/${output.id}/file)`,
  });

  return { output, assistantMessage };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function latestUserInstruction(messages: DeckMessage[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") return messages[i].content;
  }
  return undefined;
}

function buildUserPayload(input: {
  client: Client;
  messages: DeckMessage[];
  attachments: DeckAttachment[];
  requiredVehicles: DeckVehicle[];
  instruction: string;
}): string {
  const { client, messages, attachments, requiredVehicles, instruction } = input;
  const sections: string[] = [];

  // Anchor the model on a real date — without this it picks something from
  // its training cutoff and the deck ends up dated months in the past.
  sections.push("=== DECK DATE ===");
  sections.push(currentMonthYear());
  sections.push("");

  // If the operator has curated a vehicles list (via the workspace UI or
  // from a prior Generate), it's authoritative. Claude writes copy against
  // these exact picks in this order — no selection autonomy.
  if (requiredVehicles.length > 0) {
    sections.push("=== REQUIRED VEHICLES (use exactly these, in this order) ===");
    requiredVehicles.forEach((v) => {
      sections.push(
        `${v.position}. ${v.yearMakeModel}${v.msrp ? ` (${v.msrp})` : ""} [key: ${v.key}]`
      );
    });
    sections.push("");
  }

  sections.push("=== CLIENT QUESTIONNAIRE ===");
  sections.push(JSON.stringify(clientSummary(client), null, 2));
  sections.push("");

  if (attachments.length > 0) {
    sections.push("=== ATTACHMENTS ===");
    for (const a of attachments) {
      sections.push(`--- ${a.filename} (${a.mimeType}) ---`);
      sections.push(a.contentText ?? "[no text extracted]");
      sections.push("");
    }
  }

  if (messages.length > 0) {
    sections.push("=== CHAT HISTORY ===");
    for (const m of messages) {
      sections.push(`[${m.role}]: ${m.content}`);
    }
    sections.push("");
  }

  sections.push("=== INSTRUCTION ===");
  sections.push(instruction);
  sections.push("");
  sections.push(
    "Produce the deck JSON object now. Strict JSON only, no markdown fences, no preamble."
  );

  return sections.join("\n");
}

/**
 * Project the SQLite client row into a focused JSON object containing only
 * the fields relevant to deck generation. JSON-array fields are parsed back
 * into structured values so the model doesn't have to handle string-encoded
 * arrays.
 */
function clientSummary(c: Client): Record<string, unknown> {
  return {
    name: `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim(),
    location: [c.city, c.state, c.zip].filter(Boolean).join(", "),
    email: c.email,
    phone: c.phone,
    purchase_type: c.purchaseType,
    budget: c.budget,
    down_payment: c.downPayment,
    monthly_payment: c.monthlyPayment,
    annual_mileage: c.annualMileage,
    credit_score: c.creditScore,
    timeframe: c.timeframe,
    body_styles: tryParse(c.bodyStyles),
    preferred_makes: tryParse(c.preferredMakes),
    preferred_models: c.preferredModels,
    not_interested_makes: tryParse(c.notInterestedMakes),
    must_have_features: c.mustHaveFeatures,
    nice_to_have_features: c.niceToHaveFeatures,
    exterior_colors: c.exteriorColors,
    interior_colors: tryParse(c.interiorColors),
    safety_tech_features: tryParse(c.safetyTechFeatures),
    comfort_features: tryParse(c.comfortFeatures),
    primary_use_cases: tryParse(c.primaryUseCases),
    special_use_cases: c.specialUseCases,
    passenger_requirement: c.passengerRequirement,
    children_in_vehicle: tryParse(c.childrenInVehicle),
    dog_space: c.dogSpace,
    third_row_usage: c.thirdRowUsage,
    second_row_preference: c.secondRowPreference,
    powertrain: c.powertrain,
    ev_long_range: c.evLongRange,
    home_charging: c.homeCharging,
    priority_rankings: tryParse(c.priorityRankings),
    additional_notes: c.additionalNotes,
    costco_membership: c.costcoMembership,
    is_veteran: c.isVeteran,
    household_vehicles: tryParse(c.householdVehicles),
    budget_priority_stance: c.budgetPriorityStance,
    trade_in: c.hasTradeIn
      ? {
          year: c.tradeYear,
          make: c.tradeMake,
          model: c.tradeModel,
          trim: c.tradeTrim,
          mileage: c.tradeMileage,
          condition: c.tradeCondition,
          owed: c.tradeOwed,
        }
      : null,
  };
}

function tryParse(v: string | null | undefined): unknown {
  if (!v) return null;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}

function currentMonthYear(): string {
  // "May 2026" — matches the Build Guide's `client.date` format.
  return new Date().toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function parseAndValidateLLMOutput(text: string): DeckLLMOutput {
  // Strip markdown fences if Claude adds them despite the prompt
  let cleaned = text.trim();
  if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7).trim();
  else if (cleaned.startsWith("```")) cleaned = cleaned.slice(3).trim();
  if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3).trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    throw new Error(
      `LLM output is not valid JSON: ${String(e)}\n` +
        `First 500 chars: ${cleaned.slice(0, 500)}`
    );
  }

  // Honor the prompt's `{"error": "..."}` sentinel for unsolvable inputs
  if (
    parsed &&
    typeof parsed === "object" &&
    "error" in (parsed as Record<string, unknown>)
  ) {
    throw new Error(
      `LLM declined: ${String((parsed as Record<string, unknown>).error)}`
    );
  }

  const result = DeckOutputSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `LLM JSON failed validation:\n${JSON.stringify(
        result.error.flatten(),
        null,
        2
      )}`
    );
  }
  return result.data;
}

function runRender(configPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(PYTHON_BIN, [RENDER_PY, configPath], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `render.py exited ${code}\n` +
              `stderr: ${stderr.slice(0, 2000)}\n` +
              `stdout: ${stdout.slice(0, 500)}`
          )
        );
      }
    });
    proc.on("error", (err) =>
      reject(new Error(`Failed to spawn python3: ${err.message}`))
    );
  });
}

function readHouseStyleCommit(): string | null {
  try {
    const sha = execSync(
      `git log -1 --format=%H -- "${HOUSE_STYLE_PATH}"`,
      { cwd: process.cwd(), encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] }
    ).trim();
    return sha || null;
  } catch {
    // Not in a git repo, or file hasn't been committed yet — both fine
    return null;
  }
}

// Exported for the route handler that serves the .pptx download.
export function resolveOutputPath(fileBaseName: string): string {
  return path.join(OUTPUTS_DIR, fileBaseName);
}
