import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import path from "path";
import fs from "fs";
import { storage } from "./storage";
import { insertClientSchema, insertDocumentSchema } from "@shared/schema";
import { z } from "zod";
import { getAuthUrl, exchangeCodeForTokens, syncClientToDrive, syncMinervaSheet, getStoredSheetUrl } from "./drive";

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(process.cwd(), "uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const upload = multer({
  dest: UPLOADS_DIR,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf",
      "image/heic", "image/heif",  // iPhone HEIC photos
    ];
    // Some iOS devices send HEIC with a generic octet-stream mime — allow by extension too
    const ext = (file.originalname || "").split(".").pop()?.toLowerCase();
    cb(null, allowed.includes(file.mimetype) || ext === "heic" || ext === "heif");
  },
});

// Fire-and-forget sheet sync helper (module-level so it can be called from anywhere in routes)
export function triggerSheetSync() {
  if (!process.env.GOOGLE_REFRESH_TOKEN) return;
  syncMinervaSheet(
    () => storage.getClients(),
    (id: number) => storage.getDocumentsByClient(id),
  ).catch((err) => console.error("[sheet] Background sync failed:", err));
}

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

  // Debug: check what env vars the server actually sees (safe – only shows key presence)
  app.get("/api/debug/env", (_req, res) => {
    res.json({
      NODE_ENV: process.env.NODE_ENV,
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ? `set (${process.env.GOOGLE_CLIENT_ID.slice(0, 12)}...)` : "MISSING",
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ? `set (${process.env.GOOGLE_CLIENT_SECRET.slice(0, 8)}...)` : "MISSING",
      GOOGLE_REFRESH_TOKEN: process.env.GOOGLE_REFRESH_TOKEN ? `set (${process.env.GOOGLE_REFRESH_TOKEN.slice(0, 12)}...)` : "MISSING",
      DB_PATH: process.env.DB_PATH || "not set",
      UPLOADS_DIR: process.env.UPLOADS_DIR || "not set",
      PORT: process.env.PORT || "not set",
    });
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

  // Reseed example clients (admin use — skips if they already exist)
  app.post("/api/admin/reseed", (_req, res) => {
    try {
      const existing = storage.getClients();
      // Only seed if fewer than 4 clients (avoid duplicating real clients)
      if (existing.length >= 4) {
        return res.json({ message: "Database already has clients — skipping reseed", count: existing.length });
      }
      const examples = [
        {
          firstName: "James", lastName: "Thornton",
          email: "james.thornton@email.com", phone: "3125550191",
          address: "842 Lakeview Dr", city: "Chicago", state: "IL", zip: "60614",
          purchaseType: "finance", budget: "$85,000", downPayment: "$15,000",
          monthlyPayment: "$1,200", annualMileage: "12,000", creditScore: "740",
          timeframe: "Within 30 days",
          bodyStyles: JSON.stringify(["SUV"]),
          preferredMakes: JSON.stringify(["BMW", "Mercedes-Benz", "Audi"]),
          preferredModels: "X5, GLE, Q7",
          mustHaveFeatures: "Panoramic sunroof, heated seats, adaptive cruise",
          niceToHaveFeatures: "Massaging seats, head-up display",
          exteriorColors: "Alpine White or Mineral White",
          interiorColors: JSON.stringify(["Black", "Cognac"]),
          hasTradeIn: true,
          tradeYear: "2019", tradeMake: "BMW", tradeModel: "X3", tradeTrim: "xDrive30i",
          tradeMileage: "41,200", tradeCondition: "Good", tradeOwed: "$0",
          questionnaireComplete: true,
          assignedTo: "mike_calcara",
          finalMake: "BMW", finalModel: "X5", finalTrim: "xDrive40i",
          finalExtColor: "Alpine White", finalIntColor: "Cognac Leather",
          finalOptions: "M Sport Package, Panoramic Sky Lounge, Harman Kardon",
          finalZip: "60614",
          status: "in_progress",
          notes: "Client is flexible on color. Has pre-approval from Chase at 5.9%.",
        },
        {
          firstName: "Sarah", lastName: "Delgado",
          email: "sarah.delgado@email.com", phone: "3055550284",
          address: "2201 Biscayne Blvd", city: "Miami", state: "FL", zip: "33137",
          purchaseType: "lease", budget: "$70,000", downPayment: "$5,000",
          monthlyPayment: "$850", annualMileage: "10,000", creditScore: "780",
          timeframe: "Within 60 days",
          bodyStyles: JSON.stringify(["Sedan", "Coupe"]),
          preferredMakes: JSON.stringify(["Porsche", "Mercedes-Benz", "Lexus"]),
          preferredModels: "Cayenne, GLC, NX",
          mustHaveFeatures: "Ventilated seats, wireless CarPlay",
          niceToHaveFeatures: "Burmester audio, 360 camera",
          exteriorColors: "Black or dark grey",
          interiorColors: JSON.stringify(["Cream", "Beige"]),
          hasTradeIn: false,
          questionnaireComplete: false,
          assignedTo: "mike_calcara",
          status: "new",
          notes: "First-time lease client. Referred by James Thornton.",
        },
        {
          firstName: "Derek", lastName: "Okafor",
          email: "derek.okafor@email.com", phone: "7135550347",
          address: "5500 Kirby Dr", city: "Houston", state: "TX", zip: "77005",
          purchaseType: "cash", budget: "$180,000", downPayment: "$180,000",
          timeframe: "ASAP",
          bodyStyles: JSON.stringify(["Coupe", "Convertible"]),
          preferredMakes: JSON.stringify(["Porsche", "Ferrari", "Lamborghini"]),
          preferredModels: "911, Roma, Huracán",
          mustHaveFeatures: "Sport exhaust, rear-wheel drive",
          niceToHaveFeatures: "Carbon ceramic brakes, sport chrono",
          exteriorColors: "Racing Yellow or GT Silver",
          interiorColors: JSON.stringify(["Black", "Club leather"]),
          hasTradeIn: true,
          tradeYear: "2021", tradeMake: "Porsche", tradeModel: "911", tradeTrim: "Carrera S",
          tradeMileage: "8,400", tradeCondition: "Excellent", tradeOwed: "$0",
          questionnaireComplete: true,
          assignedTo: "mike_calcara",
          finalMake: "Porsche", finalModel: "911", finalTrim: "GT3",
          finalExtColor: "Racing Yellow", finalIntColor: "Black w/ yellow stitching",
          finalOptions: "Clubsport Package, Lift System, BOSE",
          finalZip: "77005",
          status: "in_progress",
          notes: "Has GT3 Touring on allocation at Porsche of Houston. Needs to confirm color.",
        },
        {
          firstName: "Monica", lastName: "Reyes",
          email: "monica.reyes@email.com", phone: "4245550462",
          address: "1200 Wilshire Blvd", city: "Los Angeles", state: "CA", zip: "90025",
          purchaseType: "finance", budget: "$55,000", downPayment: "$10,000",
          monthlyPayment: "$900", annualMileage: "15,000", creditScore: "700",
          timeframe: "1-3 months",
          bodyStyles: JSON.stringify(["SUV", "Crossover"]),
          preferredMakes: JSON.stringify(["Toyota", "Honda", "Subaru"]),
          preferredModels: "RAV4, CR-V, Outback",
          mustHaveFeatures: "All-wheel drive, Apple CarPlay, safety suite",
          exteriorColors: "Silver or Blue",
          interiorColors: JSON.stringify(["Gray", "Black"]),
          hasTradeIn: false,
          questionnaireComplete: false,
          status: "new",
          notes: "Budget-conscious, practical driver. No specific brand loyalty.",
        },
      ];
      let count = 0;
      for (const ex of examples) {
        storage.createClient(ex as any);
        count++;
      }
      res.json({ message: `Seeded ${count} example clients`, count });
    } catch (err) {
      res.status(500).json({ message: "Reseed failed", error: String(err) });
    }
  });

  // ─── Minerva Google Sheet ────────────────────────────────────────────────────────────

  // Manual full sync — returns the sheet URL
  app.post("/api/admin/sync-sheet", async (_req, res) => {
    if (!process.env.GOOGLE_REFRESH_TOKEN) {
      return res.status(503).json({ message: "Google Drive not configured" });
    }
    try {
      const sheetUrl = await syncMinervaSheet(
        () => storage.getClients(),
        (id: number) => storage.getDocumentsByClient(id),
      );
      res.json({ sheetUrl });
    } catch (err) {
      console.error("[sheet] Manual sync failed:", err);
      res.status(500).json({ message: "Sheet sync failed", error: String(err) });
    }
  });

  // Return the persisted sheet URL (so the admin dashboard can link to it)
  app.get("/api/admin/sheet-url", (_req, res) => {
    const url = getStoredSheetUrl();
    if (url) {
      res.json({ sheetUrl: url });
    } else {
      res.status(404).json({ message: "Sheet not yet created. Trigger a sync first." });
    }
  });

  // All doc types grouped by clientId — used by admin dashboard for at-a-glance status
  app.get("/api/documents/all", (_req, res) => {
    const docs = storage.getAllDocuments();
    // Return map: { [clientId]: string[] } of uploaded docTypes
    const map: Record<number, string[]> = {};
    for (const doc of docs) {
      if (!map[doc.clientId]) map[doc.clientId] = [];
      map[doc.clientId].push(doc.docType);
    }
    res.json(map);
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
    triggerSheetSync();
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
    triggerSheetSync();
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

  // Mark questionnaire complete + auto-sync to Drive + sheet
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
      // Trigger Minerva sheet update
      triggerSheetSync();
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
        // Trigger Minerva sheet update (doc uploaded)
        triggerSheetSync();
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
