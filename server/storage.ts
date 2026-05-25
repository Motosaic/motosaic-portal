import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, desc, and, asc, sql } from "drizzle-orm";
import * as schema from "@shared/schema";
import path from "path";

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "motosaic.db");
export const sqlite = new Database(DB_PATH);
const db = drizzle(sqlite, { schema });

// Initialize tables — use ALTER TABLE to add new columns if they don't exist
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT,
    phone TEXT NOT NULL,
    address TEXT,
    city TEXT,
    state TEXT,
    zip TEXT,
    purchase_type TEXT,
    budget TEXT,
    down_payment TEXT,
    monthly_payment TEXT,
    annual_mileage TEXT,
    credit_score TEXT,
    timeframe TEXT,
    body_styles TEXT,
    preferred_makes TEXT,
    preferred_models TEXT,
    must_have_features TEXT,
    nice_to_have_features TEXT,
    exterior_colors TEXT,
    interior_colors TEXT,
    has_trade_in INTEGER DEFAULT 0,
    trade_year TEXT,
    trade_make TEXT,
    trade_model TEXT,
    trade_trim TEXT,
    trade_mileage TEXT,
    trade_condition TEXT,
    trade_owed TEXT,
    questionnaire_complete INTEGER DEFAULT 0,
    status TEXT DEFAULT 'new',
    notes TEXT,
    drive_folder TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    doc_type TEXT NOT NULL,
    original_name TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    drive_file_id TEXT,
    uploaded_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS deck_drafts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    title TEXT,
    status TEXT DEFAULT 'active',
    created_by TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS deck_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    draft_id INTEGER NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS deck_attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    draft_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    content_text TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS deck_outputs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    draft_id INTEGER NOT NULL,
    version INTEGER NOT NULL,
    file_path TEXT NOT NULL,
    drive_file_id TEXT,
    compiled_json TEXT NOT NULL,
    house_style_snapshot TEXT NOT NULL,
    house_style_commit TEXT,
    model_used TEXT,
    tokens_input INTEGER,
    tokens_output INTEGER,
    generated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_deck_drafts_client ON deck_drafts(client_id);
  CREATE INDEX IF NOT EXISTS idx_deck_drafts_updated ON deck_drafts(updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_deck_messages_draft ON deck_messages(draft_id, id);
  CREATE INDEX IF NOT EXISTS idx_deck_attachments_draft ON deck_attachments(draft_id);
  CREATE INDEX IF NOT EXISTS idx_deck_outputs_draft ON deck_outputs(draft_id, version DESC);
`);

// Safe migrations for existing databases
const addColumnIfMissing = (table: string, col: string, type: string) => {
  try {
    sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
  } catch {
    // Column already exists — ignore
  }
};

addColumnIfMissing("clients", "annual_mileage", "TEXT");
addColumnIfMissing("clients", "exterior_colors", "TEXT");
addColumnIfMissing("clients", "interior_colors", "TEXT");
addColumnIfMissing("clients", "questionnaire_complete", "INTEGER DEFAULT 0");
// Deal builder columns
addColumnIfMissing("clients", "assigned_to", "TEXT");
addColumnIfMissing("clients", "final_make", "TEXT");
addColumnIfMissing("clients", "final_model", "TEXT");
addColumnIfMissing("clients", "final_trim", "TEXT");
addColumnIfMissing("clients", "final_ext_color", "TEXT");
addColumnIfMissing("clients", "final_int_color", "TEXT");
addColumnIfMissing("clients", "final_options", "TEXT");
addColumnIfMissing("clients", "final_zip", "TEXT");
addColumnIfMissing("clients", "final_deal_notes", "TEXT");
// Batch 2 questionnaire fields
addColumnIfMissing("clients", "not_interested_makes", "TEXT");
addColumnIfMissing("clients", "passenger_count", "TEXT");
addColumnIfMissing("clients", "suv_seat_config", "TEXT");
addColumnIfMissing("clients", "suv_num_children", "TEXT");
addColumnIfMissing("clients", "suv_child_ages", "TEXT");
addColumnIfMissing("clients", "suv_has_pets", "TEXT");
addColumnIfMissing("clients", "costco_membership", "TEXT");
addColumnIfMissing("clients", "is_veteran", "TEXT");
addColumnIfMissing("clients", "household_vehicles", "TEXT");
addColumnIfMissing("clients", "suv_max_seating", "TEXT");
addColumnIfMissing("clients", "powertrain", "TEXT");
addColumnIfMissing("clients", "ev_long_range", "TEXT");
addColumnIfMissing("clients", "priority_rankings", "TEXT");
// Batch 3 questionnaire fields (2025 overhaul)
addColumnIfMissing("clients", "budget_priority_stance", "TEXT");
addColumnIfMissing("clients", "primary_use_cases", "TEXT");
addColumnIfMissing("clients", "special_use_cases", "TEXT");
addColumnIfMissing("clients", "passenger_requirement", "TEXT");
addColumnIfMissing("clients", "children_in_vehicle", "TEXT");
addColumnIfMissing("clients", "dog_space", "TEXT");
addColumnIfMissing("clients", "third_row_usage", "TEXT");
addColumnIfMissing("clients", "second_row_preference", "TEXT");
addColumnIfMissing("clients", "home_charging", "TEXT");
addColumnIfMissing("clients", "safety_tech_features", "TEXT");
addColumnIfMissing("clients", "comfort_features", "TEXT");
addColumnIfMissing("clients", "additional_notes", "TEXT");

export interface IStorage {
  // Clients
  getClients(): schema.Client[];
  getClient(id: number): schema.Client | undefined;
  findClientByPhone(firstName: string, lastName: string, phone: string): schema.Client | undefined;
  findClientByEmailPhone(email: string, phone: string): schema.Client | undefined;
  createClientShell(firstName: string, lastName: string, phone: string, email?: string): schema.Client;
  createClient(data: schema.InsertClient): schema.Client;
  updateClientStatus(id: number, status: string): schema.Client | undefined;
  updateClientNotes(id: number, notes: string): schema.Client | undefined;
  updateClientDriveFolder(id: number, driveFolder: string): schema.Client | undefined;
  updateClientQuestionnaire(id: number, data: Partial<schema.InsertClient>): schema.Client | undefined;
  markQuestionnaireComplete(id: number): schema.Client | undefined;
  deleteClient(id: number): void;
  // Documents
  getDocument(id: number): schema.Document | undefined;
  getDocumentsByClient(clientId: number): schema.Document[];
  getAllDocuments(): schema.Document[];
  createDocument(data: schema.InsertDocument): schema.Document;
  deleteDocument(id: number): void;
  // Deck drafts
  listDrafts(opts?: { status?: string }): schema.DeckDraft[];
  listDraftsByClient(clientId: number, opts?: { status?: string }): schema.DeckDraft[];
  getDraft(id: number): schema.DeckDraft | undefined;
  createDraft(data: schema.InsertDeckDraft): schema.DeckDraft;
  updateDraftStatus(id: number, status: string): schema.DeckDraft | undefined;
  updateDraftTitle(id: number, title: string): schema.DeckDraft | undefined;
  touchDraft(id: number): void;
  deleteDraft(id: number): void;
  // Deck messages
  listMessagesByDraft(draftId: number): schema.DeckMessage[];
  createMessage(data: schema.InsertDeckMessage): schema.DeckMessage;
  // Deck attachments
  listAttachmentsByDraft(draftId: number): schema.DeckAttachment[];
  getAttachment(id: number): schema.DeckAttachment | undefined;
  createAttachment(data: schema.InsertDeckAttachment): schema.DeckAttachment;
  deleteAttachment(id: number): void;
  // Deck outputs
  listOutputsByDraft(draftId: number): schema.DeckOutput[];
  getOutput(id: number): schema.DeckOutput | undefined;
  createOutput(data: schema.InsertDeckOutput): schema.DeckOutput;
  nextVersionForDraft(draftId: number): number;
}

export class Storage implements IStorage {
  getClients(): schema.Client[] {
    return db.select().from(schema.clients).orderBy(desc(schema.clients.id)).all();
  }

  getClient(id: number): schema.Client | undefined {
    return db.select().from(schema.clients).where(eq(schema.clients.id, id)).get();
  }

  findClientByPhone(firstName: string, lastName: string, phone: string): schema.Client | undefined {
    return db
      .select()
      .from(schema.clients)
      .where(
        and(
          eq(schema.clients.phone, phone.replace(/\D/g, "")),
          eq(schema.clients.firstName, firstName.trim()),
          eq(schema.clients.lastName, lastName.trim())
        )
      )
      .get();
  }

  findClientByEmailPhone(email: string, phone: string): schema.Client | undefined {
    const normalizedPhone = phone.replace(/\D/g, "");
    const normalizedEmail = email.trim().toLowerCase();
    // First try exact match (covers clients created via the portal with normalized phone)
    const exact = db
      .select()
      .from(schema.clients)
      .where(
        and(
          eq(schema.clients.email, normalizedEmail),
          eq(schema.clients.phone, normalizedPhone)
        )
      )
      .get();
    if (exact) return exact;
    // Fallback: load all and compare normalized phones (covers seed data with formatted phones)
    const all = db
      .select()
      .from(schema.clients)
      .where(eq(schema.clients.email, normalizedEmail))
      .all();
    const match = all.find(c => (c.phone ?? "").replace(/\D/g, "") === normalizedPhone);
    // Self-heal: normalize the stored phone so future lookups hit the fast path
    if (match && (match.phone ?? "") !== normalizedPhone) {
      db.update(schema.clients).set({ phone: normalizedPhone }).where(eq(schema.clients.id, match.id)).run();
      match.phone = normalizedPhone;
    }
    return match;
  }

  createClientShell(firstName: string, lastName: string, phone: string, email?: string): schema.Client {
    return db
      .insert(schema.clients)
      .values({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.replace(/\D/g, ""),
        ...(email ? { email: email.trim().toLowerCase() } : {}),
      })
      .returning()
      .get();
  }

  createClient(data: schema.InsertClient): schema.Client {
    return db.insert(schema.clients).values(data).returning().get();
  }

  updateClientStatus(id: number, status: string): schema.Client | undefined {
    return db.update(schema.clients).set({ status }).where(eq(schema.clients.id, id)).returning().get();
  }

  updateClientNotes(id: number, notes: string): schema.Client | undefined {
    return db.update(schema.clients).set({ notes }).where(eq(schema.clients.id, id)).returning().get();
  }

  updateClientDriveFolder(id: number, driveFolder: string): schema.Client | undefined {
    return db.update(schema.clients).set({ driveFolder }).where(eq(schema.clients.id, id)).returning().get();
  }

  updateClientQuestionnaire(id: number, data: Partial<schema.InsertClient>): schema.Client | undefined {
    return db.update(schema.clients).set(data).where(eq(schema.clients.id, id)).returning().get();
  }

  markQuestionnaireComplete(id: number): schema.Client | undefined {
    return db
      .update(schema.clients)
      .set({ questionnaireComplete: true, status: "in_progress" })
      .where(eq(schema.clients.id, id))
      .returning()
      .get();
  }

  getDocument(id: number): schema.Document | undefined {
    return db.select().from(schema.documents).where(eq(schema.documents.id, id)).get();
  }

  getDocumentsByClient(clientId: number): schema.Document[] {
    return db.select().from(schema.documents).where(eq(schema.documents.clientId, clientId)).all();
  }

  getAllDocuments(): schema.Document[] {
    return db.select().from(schema.documents).all();
  }

  createDocument(data: schema.InsertDocument): schema.Document {
    return db.insert(schema.documents).values(data).returning().get();
  }

  deleteDocument(id: number): void {
    db.delete(schema.documents).where(eq(schema.documents.id, id)).run();
  }

  deleteClient(id: number): void {
    db.delete(schema.documents).where(eq(schema.documents.clientId, id)).run();
    db.delete(schema.clients).where(eq(schema.clients.id, id)).run();
  }

  updateClientAssignment(id: number, assignedTo: string | null): schema.Client | undefined {
    return db.update(schema.clients).set({ assignedTo }).where(eq(schema.clients.id, id)).returning().get();
  }

  updateClientDealBuild(id: number, data: {
    finalMake?: string;
    finalModel?: string;
    finalTrim?: string;
    finalExtColor?: string;
    finalIntColor?: string;
    finalOptions?: string;
    finalZip?: string;
    finalDealNotes?: string;
  }): schema.Client | undefined {
    return db.update(schema.clients).set(data).where(eq(schema.clients.id, id)).returning().get();
  }

  // ─── Deck drafts ─────────────────────────────────────────────────────────
  listDrafts(opts?: { status?: string }): schema.DeckDraft[] {
    if (opts?.status) {
      return db
        .select()
        .from(schema.deckDrafts)
        .where(eq(schema.deckDrafts.status, opts.status))
        .orderBy(desc(schema.deckDrafts.updatedAt))
        .all();
    }
    return db
      .select()
      .from(schema.deckDrafts)
      .orderBy(desc(schema.deckDrafts.updatedAt))
      .all();
  }

  listDraftsByClient(clientId: number, opts?: { status?: string }): schema.DeckDraft[] {
    if (opts?.status) {
      return db
        .select()
        .from(schema.deckDrafts)
        .where(
          and(
            eq(schema.deckDrafts.clientId, clientId),
            eq(schema.deckDrafts.status, opts.status)
          )
        )
        .orderBy(desc(schema.deckDrafts.updatedAt))
        .all();
    }
    return db
      .select()
      .from(schema.deckDrafts)
      .where(eq(schema.deckDrafts.clientId, clientId))
      .orderBy(desc(schema.deckDrafts.updatedAt))
      .all();
  }

  getDraft(id: number): schema.DeckDraft | undefined {
    return db.select().from(schema.deckDrafts).where(eq(schema.deckDrafts.id, id)).get();
  }

  createDraft(data: schema.InsertDeckDraft): schema.DeckDraft {
    return db.insert(schema.deckDrafts).values(data).returning().get();
  }

  updateDraftStatus(id: number, status: string): schema.DeckDraft | undefined {
    return db
      .update(schema.deckDrafts)
      .set({ status, updatedAt: sql`(datetime('now'))` as any })
      .where(eq(schema.deckDrafts.id, id))
      .returning()
      .get();
  }

  updateDraftTitle(id: number, title: string): schema.DeckDraft | undefined {
    return db
      .update(schema.deckDrafts)
      .set({ title, updatedAt: sql`(datetime('now'))` as any })
      .where(eq(schema.deckDrafts.id, id))
      .returning()
      .get();
  }

  touchDraft(id: number): void {
    db.update(schema.deckDrafts)
      .set({ updatedAt: sql`(datetime('now'))` as any })
      .where(eq(schema.deckDrafts.id, id))
      .run();
  }

  // Cascade delete. File cleanup (attachments + outputs on disk) is the
  // route handler's job — call this AFTER unlinking files, matching the
  // existing deleteClient pattern.
  deleteDraft(id: number): void {
    db.delete(schema.deckOutputs).where(eq(schema.deckOutputs.draftId, id)).run();
    db.delete(schema.deckAttachments).where(eq(schema.deckAttachments.draftId, id)).run();
    db.delete(schema.deckMessages).where(eq(schema.deckMessages.draftId, id)).run();
    db.delete(schema.deckDrafts).where(eq(schema.deckDrafts.id, id)).run();
  }

  // ─── Deck messages ───────────────────────────────────────────────────────
  listMessagesByDraft(draftId: number): schema.DeckMessage[] {
    return db
      .select()
      .from(schema.deckMessages)
      .where(eq(schema.deckMessages.draftId, draftId))
      .orderBy(asc(schema.deckMessages.id))
      .all();
  }

  createMessage(data: schema.InsertDeckMessage): schema.DeckMessage {
    const msg = db.insert(schema.deckMessages).values(data).returning().get();
    this.touchDraft(data.draftId);
    return msg;
  }

  // ─── Deck attachments ────────────────────────────────────────────────────
  listAttachmentsByDraft(draftId: number): schema.DeckAttachment[] {
    return db
      .select()
      .from(schema.deckAttachments)
      .where(eq(schema.deckAttachments.draftId, draftId))
      .orderBy(asc(schema.deckAttachments.id))
      .all();
  }

  getAttachment(id: number): schema.DeckAttachment | undefined {
    return db.select().from(schema.deckAttachments).where(eq(schema.deckAttachments.id, id)).get();
  }

  createAttachment(data: schema.InsertDeckAttachment): schema.DeckAttachment {
    const att = db.insert(schema.deckAttachments).values(data).returning().get();
    this.touchDraft(data.draftId);
    return att;
  }

  deleteAttachment(id: number): void {
    const att = this.getAttachment(id);
    db.delete(schema.deckAttachments).where(eq(schema.deckAttachments.id, id)).run();
    if (att) this.touchDraft(att.draftId);
  }

  // ─── Deck outputs ────────────────────────────────────────────────────────
  listOutputsByDraft(draftId: number): schema.DeckOutput[] {
    return db
      .select()
      .from(schema.deckOutputs)
      .where(eq(schema.deckOutputs.draftId, draftId))
      .orderBy(desc(schema.deckOutputs.version))
      .all();
  }

  getOutput(id: number): schema.DeckOutput | undefined {
    return db.select().from(schema.deckOutputs).where(eq(schema.deckOutputs.id, id)).get();
  }

  createOutput(data: schema.InsertDeckOutput): schema.DeckOutput {
    const out = db.insert(schema.deckOutputs).values(data).returning().get();
    this.touchDraft(data.draftId);
    return out;
  }

  nextVersionForDraft(draftId: number): number {
    const latest = db
      .select()
      .from(schema.deckOutputs)
      .where(eq(schema.deckOutputs.draftId, draftId))
      .orderBy(desc(schema.deckOutputs.version))
      .limit(1)
      .get();
    return (latest?.version ?? 0) + 1;
  }
}

export const storage = new Storage();
