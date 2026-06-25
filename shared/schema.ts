import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─── Clients ───────────────────────────────────────────────────────────────
export const clients = sqliteTable("clients", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  // Personal
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email"),
  phone: text("phone").notNull(),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  zip: text("zip"),
  // Budget & Financing
  purchaseType: text("purchase_type"), // cash | finance | lease
  budget: text("budget"),
  downPayment: text("down_payment"),
  monthlyPayment: text("monthly_payment"),
  annualMileage: text("annual_mileage"),
  creditScore: text("credit_score"),
  timeframe: text("timeframe"),
  // Vehicle Preferences
  bodyStyles: text("body_styles"), // JSON array
  preferredMakes: text("preferred_makes"), // JSON array
  preferredModels: text("preferred_models"),
  mustHaveFeatures: text("must_have_features"),
  niceToHaveFeatures: text("nice_to_have_features"),
  exteriorColors: text("exterior_colors"),
  interiorColors: text("interior_colors"), // JSON array
  // New Questionnaire Fields (batch 2)
  notInterestedMakes: text("not_interested_makes"),  // JSON array
  passengerCount: text("passenger_count"),           // "1-2" | "3" | "4+"
  suvSeatConfig: text("suv_seat_config"),             // "captains" | "bench" | "no_preference"
  suvMaxSeating: text("suv_max_seating"),             // "6" | "7" | "8"
  suvNumChildren: text("suv_num_children"),           // "0" | "1" | "2" | "3" | "4+"
  suvChildAges: text("suv_child_ages"),               // free text
  suvHasPets: text("suv_has_pets"),                   // "yes" | "no"
  costcoMembership: text("costco_membership"),        // "executive" | "standard" | "none"
  isVeteran: text("is_veteran"),                     // "yes" | "no"
  householdVehicles: text("household_vehicles"),     // JSON array of {year, make}
  powertrain: text("powertrain"),                    // "ev" | "phev" | "gas" | "indifferent"
  evLongRange: text("ev_long_range"),                // "yes" | "no"
  // New Questionnaire Fields (batch 3 — 2025 overhaul)
  budgetPriorityStance: text("budget_priority_stance"), // "perfect_car" | "balanced" | "budget_ceiling"
  primaryUseCases: text("primary_use_cases"),         // JSON array of selected use case strings
  specialUseCases: text("special_use_cases"),         // free text
  passengerRequirement: text("passenger_requirement"), // "just_me" | "2_adults" | "2_adults_1_2" | "2_adults_3_plus"
  childrenInVehicle: text("children_in_vehicle"),     // JSON array of {age, seatType}
  dogSpace: text("dog_space"),                        // "yes" | "no"
  thirdRowUsage: text("third_row_usage"),             // "daily" | "occasional" | "rarely"
  secondRowPreference: text("second_row_preference"), // "bench_only" | "bench_preferred" | "captains_only" | "captains_preferred" | "captains_if_necessary" | "no_preference"
  homeCharging: text("home_charging"),                // "level2" | "level1" | "no_charging" | "na"
  safetyTechFeatures: text("safety_tech_features"),   // JSON array of selected safety chip strings
  comfortFeatures: text("comfort_features"),          // JSON array of selected comfort chip strings
  additionalNotes: text("additional_notes"),          // catch-all free text (replaces mustHaveFeatures usage)
  // Priority Rankings — JSON: { category: string, rank: 1|2|3|4|5|"na" }[]
  priorityRankings: text("priority_rankings"),
  // Trade-In
  hasTradeIn: integer("has_trade_in", { mode: "boolean" }).default(false),
  tradeYear: text("trade_year"),
  tradeMake: text("trade_make"),
  tradeModel: text("trade_model"),
  tradeTrim: text("trade_trim"),
  tradeMileage: text("trade_mileage"),
  tradeCondition: text("trade_condition"),
  tradeOwed: text("trade_owed"),
  // Progress tracking
  questionnaireComplete: integer("questionnaire_complete", { mode: "boolean" }).default(false),
  // Deal Assignment
  assignedTo: text("assigned_to"), // "mike_minerva" | "mike_standen" | null
  // Final Vehicle Build (filled in by admin, sent to sourcing partner)
  finalMake: text("final_make"),
  finalModel: text("final_model"),
  finalTrim: text("final_trim"),
  finalExtColor: text("final_ext_color"),
  finalIntColor: text("final_int_color"),
  finalOptions: text("final_options"),   // must-have options/config notes
  finalZip: text("final_zip"),           // shipping zip
  finalDealNotes: text("final_deal_notes"), // internal deal notes for sourcing
  // Meta
  status: text("status").default("new"), // new | in_progress | ready | closed
  notes: text("notes"),
  driveFolder: text("drive_folder"),
  createdAt: text("created_at").default(new Date().toISOString()),
  // Briefing / dossier (Phase 5)
  briefingContext: text("briefing_context"),            // operator's free-form context paste box
  briefingSummary: text("briefing_summary"),            // cached Claude synthesis
  briefingSummaryGeneratedAt: text("briefing_summary_generated_at"),
});

export const insertClientSchema = createInsertSchema(clients).omit({
  id: true,
  createdAt: true,
  driveFolder: true,
});
export type InsertClient = z.infer<typeof insertClientSchema>;
export type Client = typeof clients.$inferSelect;

// ─── Documents ─────────────────────────────────────────────────────────────
export const documents = sqliteTable("documents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id").notNull(),
  docType: text("doc_type").notNull(),
  originalName: text("original_name").notNull(),
  storedName: text("stored_name").notNull(),
  mimeType: text("mime_type").notNull(),
  fileSize: integer("file_size").notNull(),
  driveFileId: text("drive_file_id"),
  uploadedAt: text("uploaded_at").default(new Date().toISOString()),
});

export const insertDocumentSchema = createInsertSchema(documents).omit({
  id: true,
  uploadedAt: true,
  driveFileId: true,
});
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documents.$inferSelect;

// ─── Deck Drafts ───────────────────────────────────────────────────────────
// A draft is a workspace for building one MotoMatch deck for a client.
// Lives in the top-level /decks section of the portal. Holds chat + uploaded
// attachments. Each Generate creates a new versioned row in deck_outputs.
export const deckDrafts = sqliteTable("deck_drafts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id").notNull(),
  title: text("title"), // optional human label; defaults derived at render time
  status: text("status").default("active"), // "active" | "archived"
  createdBy: text("created_by"), // free-text operator identifier (e.g. "mike", "lexi")
  createdAt: text("created_at").default(new Date().toISOString()),
  updatedAt: text("updated_at").default(new Date().toISOString()),
});

export const insertDeckDraftSchema = createInsertSchema(deckDrafts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertDeckDraft = z.infer<typeof insertDeckDraftSchema>;
export type DeckDraft = typeof deckDrafts.$inferSelect;

// ─── Deck Messages ─────────────────────────────────────────────────────────
// Persistent chat history per draft. Read in full at Generate time so the
// model re-derives current deck state from the conversation each call.
export const deckMessages = sqliteTable("deck_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  draftId: integer("draft_id").notNull(),
  role: text("role").notNull(), // "user" | "assistant"
  content: text("content").notNull(),
  createdAt: text("created_at").default(new Date().toISOString()),
});

export const insertDeckMessageSchema = createInsertSchema(deckMessages).omit({
  id: true,
  createdAt: true,
});
export type InsertDeckMessage = z.infer<typeof insertDeckMessageSchema>;
export type DeckMessage = typeof deckMessages.$inferSelect;

// ─── Deck Attachments ──────────────────────────────────────────────────────
// Files uploaded into a draft (call transcripts, notes, prior decks, etc.).
// `contentText` is the extracted plaintext, stored once at upload time so
// Generate doesn't re-extract on every call. Original file lives on disk
// at `${UPLOADS_DIR}/deck-attachments/${storedName}`.
// Note: the client's questionnaire is NOT an attachment — it's read live
// from the `clients` table at Generate time so updates flow through.
export const deckAttachments = sqliteTable("deck_attachments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  draftId: integer("draft_id").notNull(),
  filename: text("filename").notNull(), // original user-facing name
  storedName: text("stored_name").notNull(), // sanitized on-disk name
  mimeType: text("mime_type").notNull(),
  fileSize: integer("file_size").notNull(),
  contentText: text("content_text"), // null if extraction failed
  createdAt: text("created_at").default(new Date().toISOString()),
});

export const insertDeckAttachmentSchema = createInsertSchema(deckAttachments).omit({
  id: true,
  createdAt: true,
});
export type InsertDeckAttachment = z.infer<typeof insertDeckAttachmentSchema>;
export type DeckAttachment = typeof deckAttachments.$inferSelect;

// ─── Deck Outputs ──────────────────────────────────────────────────────────
// Every successful Generate creates a new versioned row. Old versions are
// preserved for audit/diff. The .pptx lives on disk at
// `${UPLOADS_DIR}/deck-outputs/${path}` and (optionally) on Google Drive.
//
// `compiledJson` is the JSON Claude produced before the Python renderer ran
// — diffable across versions to see exactly what changed in selection or copy.
// `houseStyleSnapshot` is the full text of house-style.md at gen time, so a
// later edit to house-style can't silently change a regenerated deck.
export const deckOutputs = sqliteTable("deck_outputs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  draftId: integer("draft_id").notNull(),
  version: integer("version").notNull(), // 1-indexed, monotonic per draft
  filePath: text("file_path").notNull(), // relative to UPLOADS_DIR/deck-outputs
  driveFileId: text("drive_file_id"),
  compiledJson: text("compiled_json").notNull(),
  houseStyleSnapshot: text("house_style_snapshot").notNull(),
  houseStyleCommit: text("house_style_commit"), // best-effort git SHA
  modelUsed: text("model_used"),
  tokensInput: integer("tokens_input"),
  tokensOutput: integer("tokens_output"),
  generatedAt: text("generated_at").default(new Date().toISOString()),
});

export const insertDeckOutputSchema = createInsertSchema(deckOutputs).omit({
  id: true,
  generatedAt: true,
});
export type InsertDeckOutput = z.infer<typeof insertDeckOutputSchema>;
export type DeckOutput = typeof deckOutputs.$inferSelect;

// ─── Deck Vehicles ─────────────────────────────────────────────────────────
// Stateful, per-draft working list of vehicles being considered.
// - On first Generate, populated automatically from Claude's proposal.
// - Operator edits (add/delete/reorder) survive across Generates.
// - Subsequent Generates use this list as the authoritative selection —
//   Claude only writes blurbs/why/considerations, doesn't pick vehicles.
// position is 1-indexed and contiguous; storage methods keep it tight.
export const deckVehicles = sqliteTable("deck_vehicles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  draftId: integer("draft_id").notNull(),
  position: integer("position").notNull(),
  key: text("key").notNull(), // snake_case match for python-pptx
  yearMakeModel: text("year_make_model").notNull(),
  msrp: text("msrp"),
  source: text("source").default("llm"), // "llm" | "manual"
  createdAt: text("created_at").default(new Date().toISOString()),
});

export const insertDeckVehicleSchema = createInsertSchema(deckVehicles).omit({
  id: true,
  createdAt: true,
});
export type InsertDeckVehicle = z.infer<typeof insertDeckVehicleSchema>;
export type DeckVehicle = typeof deckVehicles.$inferSelect;

// ─── Client Transcripts ────────────────────────────────────────────────────
// Discovery-call (and follow-up) transcripts. Ingested via the Zoom webhook
// (recording.transcript_completed), parsed from VTT into plain text, and
// either auto-attached to a matched client or held in an "unattached" tray
// until an admin claims them.
//
// clientId is nullable: null = unattached. The webhook tries to match the
// Zoom meeting topic against client first/last names; when there's no match,
// the row lands here for manual claim from the admin dashboard.
export const clientTranscripts = sqliteTable("client_transcripts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: integer("client_id"),                            // null = unattached
  source: text("source").notNull().default("zoom"),          // "zoom" | "manual" (future)
  zoomMeetingUuid: text("zoom_meeting_uuid"),                // Zoom's meeting UUID (unique per occurrence)
  zoomMeetingId: text("zoom_meeting_id"),                    // human-readable numeric meeting ID
  meetingTopic: text("meeting_topic"),
  meetingStartTime: text("meeting_start_time"),              // ISO from Zoom
  meetingDurationMinutes: integer("meeting_duration_minutes"),
  hostEmail: text("host_email"),
  transcriptText: text("transcript_text").notNull(),         // VTT parsed to plain text
  rawPayload: text("raw_payload"),                           // JSON of the original webhook event, for debugging
  createdAt: text("created_at").default(new Date().toISOString()),
});

export const insertClientTranscriptSchema = createInsertSchema(clientTranscripts).omit({
  id: true,
  createdAt: true,
});
export type InsertClientTranscript = z.infer<typeof insertClientTranscriptSchema>;
export type ClientTranscript = typeof clientTranscripts.$inferSelect;
