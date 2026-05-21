import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import path from "path";
import fs from "fs";
import { storage } from "./storage";
import { insertClientSchema, insertDocumentSchema } from "@shared/schema";
import { z } from "zod";
import { getAuthUrl, exchangeCodeForTokens, syncClientToDrive, syncMinervaSheet, getStoredSheetUrl } from "./drive";
import { sendQuestionnaireCompleteEmail } from "./email";
import { registerAuthRoutes, requireAdmin, requireClientOrAdmin } from "./auth";
import { backupNow, getBackupStatus } from "./backup";
import { checkQuota, recordUsage, getUsageStatus } from "./anthropic-quota";
import { sqlite } from "./storage";
import os from "os";

// ─── Shared auth resolvers ──────────────────────────────────────────────────

const clientIdFromUrlParam = (req: Request) => {
  const n = parseInt(String(req.params.id), 10);
  return Number.isFinite(n) ? n : null;
};

const clientIdFromDocument = (req: Request) => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) return null;
  const doc = storage.getDocument(id);
  return doc ? doc.clientId : null;
};

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

  // ─── Health check (public, no auth) ─────────────────────────────────────
  // For Render's health check + external uptime monitors. Verifies SQLite can
  // be queried — if the DB connection is broken, returns 503 so Render can
  // restart instead of leaving us serving requests against a dead DB.
  const startedAt = Date.now();
  app.get("/healthz", (_req, res) => {
    try {
      // Cheap connectivity probe — SELECT 1
      const row = sqlite.prepare("SELECT 1 as ok").get() as { ok: number } | undefined;
      if (!row || row.ok !== 1) {
        return res.status(503).json({ status: "unhealthy", reason: "db probe returned unexpected value" });
      }
      res.json({
        status: "ok",
        uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
        node: process.version,
        platform: `${os.platform()} ${os.arch()}`,
        memoryRssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      });
    } catch (err: any) {
      res.status(503).json({ status: "unhealthy", reason: String(err?.message || err) });
    }
  });

  // ─── Auth (login / logout / status) ─────────────────────────────────────
  registerAuthRoutes(app);

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
  app.post("/api/clients/:id/sync-drive", requireAdmin, async (req, res) => {
    const id = parseInt(String(req.params.id));
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
  app.post("/api/admin/reseed", requireAdmin, (_req, res) => {
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
  app.post("/api/admin/sync-sheet", requireAdmin, async (_req, res) => {
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

  // ─── Backups ────────────────────────────────────────────────────────────

  app.get("/api/admin/backup/status", requireAdmin, (_req, res) => {
    res.json(getBackupStatus());
  });

  app.get("/api/admin/anthropic/usage", requireAdmin, (_req, res) => {
    res.json(getUsageStatus());
  });

  // Deliberately throws — used to verify Sentry error capture is wired correctly.
  // Admin-only so it can't be hammered by random visitors.
  app.get("/api/admin/debug-sentry", requireAdmin, (_req, _res, next) => {
    next(new Error("Sentry test error from /api/admin/debug-sentry — ignore"));
  });

  app.post("/api/admin/backup/now", requireAdmin, async (_req, res) => {
    try {
      const status = await backupNow();
      res.json(status);
    } catch (err: any) {
      res.status(500).json({ message: "Backup failed", error: String(err?.message || err) });
    }
  });

  // Return the persisted sheet URL (so the admin dashboard can link to it)
  app.get("/api/admin/sheet-url", requireAdmin, (_req, res) => {
    const url = getStoredSheetUrl();
    if (url) {
      res.json({ sheetUrl: url });
    } else {
      res.status(404).json({ message: "Sheet not yet created. Trigger a sync first." });
    }
  });

  // All doc types grouped by clientId — used by admin dashboard for at-a-glance status
  app.get("/api/documents/all", requireAdmin, (_req, res) => {
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

  app.get("/api/clients", requireAdmin, (_req, res) => {
    const clients = storage.getClients();
    res.json(clients);
  });

  app.get("/api/clients/:id", requireClientOrAdmin(clientIdFromUrlParam), (req, res) => {
    const id = parseInt(String(req.params.id));
    const client = storage.getClient(id);
    if (!client) return res.status(404).json({ message: "Client not found" });
    res.json(client);
  });

  app.post("/api/clients", (req, res) => {
    // Allow EITHER:
    //   1. A logged-in admin session (the dashboard's "New Client" button), OR
    //   2. A trusted external service presenting a matching PORTAL_API_SECRET header.
    // Previously this check failed open when the header was absent — anonymous
    // POSTs created client records. With Phase 1 sessions live we can be strict.
    const isAdminSession = Boolean(req.session?.admin);
    const portalSecret = process.env.PORTAL_API_SECRET;
    const incomingSecret = req.headers["x-portal-secret"];
    const hasValidSecret =
      typeof portalSecret === "string" &&
      portalSecret.length > 0 &&
      typeof incomingSecret === "string" &&
      incomingSecret === portalSecret;
    if (!isAdminSession && !hasValidSecret) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const data = insertClientSchema.parse(req.body);
      const client = storage.createClient(data);
      res.status(201).json(client);
    } catch (err) {
      res.status(400).json({ message: "Invalid data", error: String(err) });
    }
  });

  app.patch("/api/clients/:id/status", requireAdmin, (req, res) => {
    const id = parseInt(String(req.params.id));
    const { status } = z.object({ status: z.string() }).parse(req.body);
    const client = storage.updateClientStatus(id, status);
    if (!client) return res.status(404).json({ message: "Client not found" });
    res.json(client);
    triggerSheetSync();
  });

  app.patch("/api/clients/:id/notes", requireAdmin, (req, res) => {
    const id = parseInt(String(req.params.id));
    const { notes } = z.object({ notes: z.string() }).parse(req.body);
    const client = storage.updateClientNotes(id, notes);
    if (!client) return res.status(404).json({ message: "Client not found" });
    res.json(client);
  });

  app.patch("/api/clients/:id/assigned-to", requireAdmin, (req, res) => {
    const id = parseInt(String(req.params.id));
    const { assignedTo } = z.object({ assignedTo: z.string().nullable() }).parse(req.body);
    const client = storage.updateClientAssignment(id, assignedTo);
    if (!client) return res.status(404).json({ message: "Client not found" });
    res.json(client);
    triggerSheetSync();
  });

  app.patch("/api/clients/:id/deal-build", requireAdmin, (req, res) => {
    const id = parseInt(String(req.params.id));
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

  app.delete("/api/clients/:id", requireAdmin, (req, res) => {
    const id = parseInt(String(req.params.id));
    const client = storage.getClient(id);
    if (!client) return res.status(404).json({ message: "Client not found" });
    storage.deleteClient(id);
    res.json({ message: "Client deleted" });
  });

  app.patch("/api/clients/:id/drive-folder", requireAdmin, (req, res) => {
    const id = parseInt(String(req.params.id));
    const { driveFolder } = z.object({ driveFolder: z.string() }).parse(req.body);
    const client = storage.updateClientDriveFolder(id, driveFolder);
    if (!client) return res.status(404).json({ message: "Client not found" });
    res.json(client);
  });

  // (Client login moved to /api/auth/client/login — see server/auth.ts)

  // Save questionnaire progress (PATCH, partial update)
  app.patch("/api/clients/:id/questionnaire", requireClientOrAdmin(clientIdFromUrlParam), (req, res) => {
    const id = parseInt(String(req.params.id));
    const client = storage.getClient(id);
    if (!client) return res.status(404).json({ message: "Client not found" });
    const updated = storage.updateClientQuestionnaire(id, req.body);
    res.json(updated);
  });

  // Mark questionnaire complete + auto-sync to Drive + sheet + email notification
  app.post("/api/clients/:id/questionnaire-complete", requireClientOrAdmin(clientIdFromUrlParam), async (req, res) => {
    const id = parseInt(String(req.params.id));
    const client = storage.markQuestionnaireComplete(id);
    if (!client) return res.status(404).json({ message: "Client not found" });
    res.json(client);
    // Fire-and-forget post-processing. The client already has a 200 by this point.
    // Failures here DON'T reach the user — they're admin/ops problems — but we tag
    // them with a clear prefix so they're easy to find in Render logs.
    const tag = `[questionnaire-complete][client=${id} ${client.lastName}/${client.firstName}]`;
    (async () => {
      if (process.env.GOOGLE_REFRESH_TOKEN) {
        try {
          const docs = storage.getDocumentsByClient(id);
          const folderUrl = await syncClientToDrive(client, docs, UPLOADS_DIR);
          storage.updateClientDriveFolder(id, folderUrl);
        } catch (err) {
          console.error(`${tag} drive sync failed:`, err);
        }
        try {
          triggerSheetSync();
        } catch (err) {
          console.error(`${tag} sheet sync trigger failed:`, err);
        }
      } else {
        console.log(`${tag} GOOGLE_REFRESH_TOKEN not configured — skipping Drive/Sheet sync`);
      }
      try {
        await sendQuestionnaireCompleteEmail(client);
      } catch (err) {
        console.error(`${tag} notification email failed:`, err);
      }
    })().catch((err) => {
      // Defense-in-depth — the IIFE wraps each await in try/catch, but a top-level
      // throw (e.g. synchronous error before the first await) would otherwise vanish.
      console.error(`${tag} post-processing IIFE crashed:`, err);
    });
  });

  // ─── Intelligence (Supabase Edge Function proxy) ───────────────────────

  app.get("/api/clients/:id/intelligence", requireAdmin, async (req, res) => {
    const id = parseInt(String(req.params.id));
    // Email can come from query param or we look it up from storage
    let email = req.query.email as string | undefined;
    if (!email) {
      const client = storage.getClient(id);
      if (!client) return res.status(404).json({ message: "Client not found" });
      email = client.email ?? undefined;
    }
    try {
      // Build query: prefer email lookup, fall back to name search
      let queryParam: string;
      if (email) {
        queryParam = `email=${encodeURIComponent(email)}`;
      } else {
        const client = storage.getClient(id);
        const fullName = client ? `${client.firstName} ${client.lastName}`.trim() : "";
        queryParam = fullName ? `name=${encodeURIComponent(fullName)}` : "";
      }
      if (!queryParam) {
        return res.json({ not_found: true });
      }
      const supabaseUrl = `https://onkpufezwbrkuqbqfele.supabase.co/functions/v1/client-profile-query?${queryParam}`;
      const supabaseRes = await fetch(supabaseUrl, {
        headers: {
          Authorization: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ua3B1ZmV6d2Jya3VxYnFmZWxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MDIyMzcsImV4cCI6MjA5MTA3ODIzN30.kji9VxGi-tbKJlSGrofC5A2_m9_D944VjjKUGTQM_YQ",
          "Content-Type": "application/json",
        },
      });
      if (supabaseRes.status === 404) {
        return res.json({ not_found: true });
      }
      if (!supabaseRes.ok) {
        const errText = await supabaseRes.text();
        console.error("[intelligence] Supabase error:", supabaseRes.status, errText);
        return res.status(502).json({ message: "Hub query failed", status: supabaseRes.status });
      }
      const data = await supabaseRes.json();
      return res.json(data);
    } catch (err) {
      console.error("[intelligence] Fetch error:", err);
      return res.status(500).json({ message: "Intelligence fetch failed", error: String(err) });
    }
  });

  // ─── Client Chat (Claude AI) ─────────────────────────────────────────────

  app.post("/api/clients/:id/chat", requireAdmin, async (req, res) => {
    const id = parseInt(String(req.params.id));
    const { message, history } = req.body as { message: string; history?: { role: string; content: string }[] };
    if (!message) return res.status(400).json({ message: "Missing message" });

    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_API_KEY) return res.status(500).json({ message: "Anthropic API key not configured" });

    // Daily spend cap — blocks before the network call so an attacker (or buggy
    // client looping) can't burn through credits even if they have a session.
    const quota = checkQuota();
    if (!quota.ok) {
      return res.status(quota.statusCode).json({ message: quota.reason });
    }

    // Fetch intelligence profile for this client
    let intelData: any = null;
    try {
      const client = storage.getClient(id);
      if (!client) return res.status(404).json({ message: "Client not found" });
      const email = client.email;
      const fullName = `${client.firstName} ${client.lastName}`.trim();
      const queryParam = email
        ? `email=${encodeURIComponent(email)}`
        : `name=${encodeURIComponent(fullName)}`;
      const supabaseRes = await fetch(
        `https://onkpufezwbrkuqbqfele.supabase.co/functions/v1/client-profile-query?${queryParam}`,
        { headers: { Authorization: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ua3B1ZmV6d2Jya3VxYnFmZWxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MDIyMzcsImV4cCI6MjA5MTA3ODIzN30.kji9VxGi-tbKJlSGrofC5A2_m9_D944VjjKUGTQM_YQ" } }
      );
      if (supabaseRes.ok) intelData = await supabaseRes.json();
      // Also attach portal client record
      intelData = { ...intelData, portal_client: client };
    } catch (e) {
      // Non-fatal — answer with what we have
    }

    const systemPrompt = `You are an assistant for Mike Calcara, a car-buying concierge at Motosaic. 
You have access to all data about this client. Answer questions concisely and helpfully.
Be direct — Mike is a professional who needs quick, actionable answers.
Format lists with bullet points when helpful. Keep responses under 200 words unless detail is specifically requested.

CLIENT DATA:
${JSON.stringify(intelData, null, 2)}`;

    const messages = [
      ...(history ?? []),
      { role: "user", content: message },
    ];

    try {
      const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-5",
          max_tokens: 1024,
          system: systemPrompt,
          messages,
        }),
      });
      if (!claudeRes.ok) {
        const err = await claudeRes.text();
        console.error("[chat] Claude error:", claudeRes.status, err);
        return res.status(502).json({ message: "Claude API error", error: err });
      }
      const data = await claudeRes.json() as any;
      const reply = data.content?.[0]?.text ?? "No response";
      // Track usage for the daily cap. Anthropic returns `usage.input_tokens`
      // and `usage.output_tokens` on every response.
      recordUsage(data.usage?.input_tokens ?? 0, data.usage?.output_tokens ?? 0);
      return res.json({ reply });
    } catch (err) {
      console.error("[chat] Error:", err);
      return res.status(500).json({ message: "Chat failed", error: String(err) });
    }
  });

  // ─── Documents ──────────────────────────────────────────────────────────

  app.get("/api/clients/:id/documents", requireClientOrAdmin(clientIdFromUrlParam), (req, res) => {
    const clientId = parseInt(String(req.params.id));
    const docs = storage.getDocumentsByClient(clientId);
    res.json(docs);
  });

  app.post("/api/clients/:id/documents", requireClientOrAdmin(clientIdFromUrlParam), upload.single("file"), async (req, res) => {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });
    const clientId = parseInt(String(req.params.id));
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
    // Mirror to Drive immediately — no longer gated on questionnaireComplete
    if (process.env.GOOGLE_REFRESH_TOKEN) {
      const client = storage.getClient(clientId);
      if (client) {
        (async () => {
          try {
            const allDocs = storage.getDocumentsByClient(clientId);
            const folderUrl = await syncClientToDrive(client, allDocs, UPLOADS_DIR);
            storage.updateClientDriveFolder(clientId, folderUrl);
          } catch (err) {
            console.error("[drive] Doc upload sync failed:", err);
          }
          triggerSheetSync();
        })();
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
    const clientId = parseInt(String(req.params.id));
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

  // Serve uploaded files — admin only (clients never download their own docs from the portal)
  app.get("/api/files/:filename", requireAdmin, (req, res) => {
    const filePath = path.join(UPLOADS_DIR, String(req.params.filename));
    if (!fs.existsSync(filePath)) return res.status(404).json({ message: "File not found" });
    res.sendFile(filePath);
  });

  app.get("/api/files/:filename/download", requireAdmin, (req, res) => {
    const filePath = path.join(UPLOADS_DIR, String(req.params.filename));
    if (!fs.existsSync(filePath)) return res.status(404).json({ message: "File not found" });
    res.download(filePath);
  });

  // Delete a document — admin OR the owning client (resolved via the doc record).
  app.delete("/api/documents/:id", requireClientOrAdmin(clientIdFromDocument), (req, res) => {
    const id = parseInt(String(req.params.id));
    storage.deleteDocument(id);
    res.json({ message: "Deleted" });
  });
}
