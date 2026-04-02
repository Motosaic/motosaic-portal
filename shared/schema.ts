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
  // Meta
  status: text("status").default("new"), // new | in_progress | ready | closed
  notes: text("notes"),
  driveFolder: text("drive_folder"),
  createdAt: text("created_at").default(new Date().toISOString()),
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
