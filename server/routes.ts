import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import path from "path";
import fs from "fs";
import { storage } from "./storage";
import { insertClientSchema, insertDocumentSchema } from "@shared/schema";
import { z } from "zod";

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(process.cwd(), "uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const upload = multer({
  dest: UPLOADS_DIR,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"];
    cb(null, allowed.includes(file.mimetype));
  },
});

export async function registerRoutes(httpServer: Server, app: Express): Promise<void> {
  // ─── Clients ────────────────────────────────────────────────────────────

  app.get("/api/clients", (_req, res) => {
    const clients = storage.getClients();
    res.json(clients);
  });

  app.get("/api/clients/:id", (req, res) => {
    const id = parseInt(req.params.id);
    const client = storage.getClient(id);
    if (!client) return res.status(404).json({ message: "Client not found" });
    res.json(client);
  });

  app.post("/api/clients", (req, res) => {
    try {
      const data = insertClientSchema.parse(req.body);
      const client = storage.createClient(data);
      res.status(201).json(client);
    } catch (err) {
      res.status(400).json({ message: "Invalid data", error: String(err) });
    }
  });

  app.patch("/api/clients/:id/status", (req, res) => {
    const id = parseInt(req.params.id);
    const { status } = z.object({ status: z.string() }).parse(req.body);
    const client = storage.updateClientStatus(id, status);
    if (!client) return res.status(404).json({ message: "Client not found" });
    res.json(client);
  });

  app.patch("/api/clients/:id/notes", (req, res) => {
    const id = parseInt(req.params.id);
    const { notes } = z.object({ notes: z.string() }).parse(req.body);
    const client = storage.updateClientNotes(id, notes);
    if (!client) return res.status(404).json({ message: "Client not found" });
    res.json(client);
  });

  app.patch("/api/clients/:id/drive-folder", (req, res) => {
    const id = parseInt(req.params.id);
    const { driveFolder } = z.object({ driveFolder: z.string() }).parse(req.body);
    const client = storage.updateClientDriveFolder(id, driveFolder);
    if (!client) return res.status(404).json({ message: "Client not found" });
    res.json(client);
  });

  // ─── Client identity / session ──────────────────────────────────────────

  // Look up or create a client by name+phone (client "login")
  app.post("/api/client-login", (req, res) => {
    const { phone, email, firstName, lastName } = z
      .object({
        phone: z.string().min(7),
        email: z.string().min(3),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
      })
      .parse(req.body);

    // Look up by email + phone
    let client = storage.findClientByEmailPhone(email, phone);
    if (!client) {
      // Create a new shell — use name if provided, otherwise placeholders
      client = storage.createClientShell(
        firstName?.trim() || "New",
        lastName?.trim() || "Client",
        phone,
        email,
      );
    }
    res.json({
      id: client.id,
      firstName: client.firstName,
      lastName: client.lastName,
      email: client.email ?? "",
      phone: client.phone ?? "",
      questionnaireComplete: client.questionnaireComplete,
      status: client.status,
    });
  });

  // Save questionnaire progress (PATCH, partial update)
  app.patch("/api/clients/:id/questionnaire", (req, res) => {
    const id = parseInt(req.params.id);
    const client = storage.getClient(id);
    if (!client) return res.status(404).json({ message: "Client not found" });
    const updated = storage.updateClientQuestionnaire(id, req.body);
    res.json(updated);
  });

  // Mark questionnaire complete
  app.post("/api/clients/:id/questionnaire-complete", (req, res) => {
    const id = parseInt(req.params.id);
    const client = storage.markQuestionnaireComplete(id);
    if (!client) return res.status(404).json({ message: "Client not found" });
    res.json(client);
  });

  // ─── Documents ──────────────────────────────────────────────────────────

  app.get("/api/clients/:id/documents", (req, res) => {
    const clientId = parseInt(req.params.id);
    const docs = storage.getDocumentsByClient(clientId);
    res.json(docs);
  });

  app.post("/api/clients/:id/documents", upload.single("file"), (req, res) => {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });
    const clientId = parseInt(req.params.id);
    const { docType } = req.body;

    const doc = storage.createDocument({
      clientId,
      docType: docType || "other",
      originalName: req.file.originalname,
      storedName: req.file.filename,
      mimeType: req.file.mimetype,
      fileSize: req.file.size,
    });
    res.status(201).json(doc);
  });

  // Public intake form submission — still supported for backwards compat
  app.post("/api/intake", (req, res) => {
    try {
      const data = insertClientSchema.parse(req.body);
      const client = storage.createClient(data);
      res.status(201).json({ id: client.id, message: "Intake submitted successfully" });
    } catch (err) {
      res.status(400).json({ message: "Invalid data", error: String(err) });
    }
  });

  // Public document upload (uses client id)
  app.post("/api/intake/:id/documents", upload.single("file"), (req, res) => {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });
    const clientId = parseInt(req.params.id);
    const { docType } = req.body;

    const client = storage.getClient(clientId);
    if (!client) return res.status(404).json({ message: "Client not found" });

    const doc = storage.createDocument({
      clientId,
      docType: docType || "other",
      originalName: req.file.originalname,
      storedName: req.file.filename,
      mimeType: req.file.mimetype,
      fileSize: req.file.size,
    });
    res.status(201).json(doc);
  });

  // Serve uploaded files
  app.get("/api/files/:filename", (req, res) => {
    const filePath = path.join(UPLOADS_DIR, req.params.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ message: "File not found" });
    res.sendFile(filePath);
  });

  app.get("/api/files/:filename/download", (req, res) => {
    const filePath = path.join(UPLOADS_DIR, req.params.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ message: "File not found" });
    res.download(filePath);
  });

  app.delete("/api/documents/:id", (req, res) => {
    const id = parseInt(req.params.id);
    storage.deleteDocument(id);
    res.json({ message: "Deleted" });
  });
}
