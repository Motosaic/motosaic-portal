import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, desc, and } from "drizzle-orm";
import * as schema from "@shared/schema";
import path from "path";

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "motosaic.db");
const sqlite = new Database(DB_PATH);
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
  getDocumentsByClient(clientId: number): schema.Document[];
  getAllDocuments(): schema.Document[];
  createDocument(data: schema.InsertDocument): schema.Document;
  deleteDocument(id: number): void;
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
    return db
      .select()
      .from(schema.clients)
      .where(
        and(
          eq(schema.clients.email, email.trim().toLowerCase()),
          eq(schema.clients.phone, phone.replace(/\D/g, ""))
        )
      )
      .get();
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
}

export const storage = new Storage();
