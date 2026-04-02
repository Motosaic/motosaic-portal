import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import path from "path";
import fs from "fs";
import { storage } from "./storage";
import { insertClientSchema, insertDocumentSchema } from "@shared/schema";
import { z } from "zod";
import { getAuthUrl, exchangeCodeForTokens, syncClientToDrive } from "./drive";

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

  // ─── Google OAuth ────────────────────────────────────────────────────────

  // Step 1: Redirect admin to Google consent screen
  app.get("/auth/google", (_req, res) => {
    const url = getAuthUrl();
    res.redirect(url);
  });

  // Step 2: Google redirects back here with a code
  app.get("/auth/google/callback", async (req, res) => {
    const code = req.query.code as string;
    if (!code) return res.status(400).send("Missing code");
    try {
      const refreshToken = await exchangeCodeForTokens(code);
      if (!refreshToken) {
        return res.send(`<h2>Auth succeeded but no refresh token returned.</h2><p>Try visiting <a href="/auth/google">/auth/google</a> again — make sure to click 'Allow'.</p>`);
      }
      res.send(`
        <html><body style="font-family:monospace;padding:40px;background:#001f30;color:#1FC3EF">
          <h2 style="color:#ADF029">✓ Google Drive Connected!</h2>
          <p>Copy this refresh token and add it as a Render environment variable:</p>
          <p><strong>Key:</strong> GOOGLE_REFRESH_TOKEN</p>
          <p><strong>Value:</strong></p>
          <textarea rows="4" style="width:100%;background:#002639;color:#1FC3EF;border:1px solid #1FC3EF;padding:8px;font-size:12px">${refreshToken}</textarea>
          <p style="color:rgba(255,255,255,0.5);font-size:12px">After adding to Render and redeploying, Drive sync will be fully automatic.</p>
        </body></html>
      `);
    } catch (err) {
      res.status(500).send(`Auth error: ${String(err)}`);
    }
  });

  // Manual sync trigger (admin use)
  app.post("/api/clients/:id/sync-drive", async (req, res) => {
    const id = parseInt(req.params.id);
    const client = storage.getClient(id);
    if (!client) return res.status(404).json({ message: "Client not found" });
    try {
      const docs = storage.getDocumentsByClient(id);
      const folderUrl = await syncClientToDrive(client, docs, UPLOADS_DIR);
      storage.updateClientDriveFolder(id, folderUrl);
      res.json({ folderUrl });
    } catch (err) {
      res.status(500).json({ message: "Drive sync failed", error: String(err) });
    }
  });

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

  app.patch("/api/clients/:id/assigned-to", (req, res) => {
    const id = parseInt(req.params.id);
    const { assignedTo } = z.object({ assignedTo: z.string().nullable() }).parse(req.body);
    const client = storage.updateClientAssignment(id, assignedTo);
    if (!client) return res.status(404).json({ message: "Client not found" });
    res.json(client);
  });

  app.patch("/api/clients/:id/deal-build", (req, res) => {
    const id = parseInt(req.params.id);
    const schema = z.object({
      finalMake: z.string().optional(),
      finalModel: z.string().optional(),
      finalTrim: z.string().optional(),
      finalExtColor: z.string().optional(),
      finalIntColor: z.string().optional(),
      finalOptions: z.string().optional(),
      finalZip: z.string().optional(),
      finalDealNotes: z.string().optional(),
    });
    const data = schema.parse(req.body);
    const client = storage.updateClientDealBuild(id, data);
    if (!client) return res.status(404).json({ message: "Client not found" });
    res.json(client);
  });

  app.delete("/api/clients/:id", (req, res) => {
    const id = parseInt(req.params.id);
    const client = storage.getClient(id);
    if (!client) return res.status(404).json({ message: "Client not found" });
    storage.deleteClient(id);
    res.json({ message: "Client deleted" });
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

  // Mark questionnaire complete + auto-sync to Drive
  app.post("/api/clients/:id/questionnaire-complete", async (req, res) => {
    const id = parseInt(req.params.id);
    const client = storage.markQuestionnaireComplete(id);
    if (!client) return res.status(404).json({ message: "Client not found" });
    res.json(client);
    // Fire-and-forget Drive sync (don't block the response)
    if (process.env.GOOGLE_REFRESH_TOKEN) {
      try {
        const docs = storage.getDocumentsByClient(id);
        const folderUrl = await syncClientToDrive(client, docs, UPLOADS_DIR);
        storage.updateClientDriveFolder(id, folderUrl);
      } catch (err) {
        console.error("Drive sync failed:", err);
      }
    }
  });

  // ─── Documents ──────────────────────────────────────────────────────────

  app.get("/api/clients/:id/documents", (req, res) => {
    const clientId = parseInt(req.params.id);
    const docs = storage.getDocumentsByClient(clientId);
    res.json(docs);
  });

  app.post("/api/clients/:id/documents", upload.single("file"), async (req, res) => {
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
    // Mirror to Drive if connected
    if (process.env.GOOGLE_REFRESH_TOKEN) {
      const client = storage.getClient(clientId);
      if (client?.questionnaireComplete) {
        try {
          const allDocs = storage.getDocumentsByClient(clientId);
          const folderUrl = await syncClientToDrive(client, allDocs, UPLOADS_DIR);
          storage.updateClientDriveFolder(clientId, folderUrl);
        } catch (err) {
          console.error("Drive doc sync failed:", err);
        }
      }
    }
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
