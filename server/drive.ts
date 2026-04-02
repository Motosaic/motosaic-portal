/**
 * Google Drive integration for Motosaic Portal
 * Uses OAuth2 with a stored refresh token to create client folders,
 * upload branded PDF questionnaire summaries, and mirror uploaded documents.
 */

import { google } from "googleapis";
import fs from "fs";
import path from "path";
import { Readable } from "stream";
import PDFDocument from "pdfkit";
import type { Client, Document } from "@shared/schema";

// ─── OAuth2 Client ────────────────────────────────────────────────────────────

export function getOAuthClient() {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    "https://portal.motosaic.com/auth/google/callback"
  );
  if (process.env.GOOGLE_REFRESH_TOKEN) {
    client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  }
  return client;
}

export function getAuthUrl(): string {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/drive"],
  });
}

export async function exchangeCodeForTokens(code: string): Promise<string> {
  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);
  return tokens.refresh_token || "";
}

// ─── Drive helpers ────────────────────────────────────────────────────────────

const PARENT_FOLDER_NAME = "Motosaic Clients";

async function getDrive() {
  const auth = getOAuthClient();
  return google.drive({ version: "v3", auth });
}

async function getOrCreateFolder(drive: any, name: string, parentId?: string): Promise<string> {
  // Search for existing folder
  const q = parentId
    ? `name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`
    : `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;

  const res = await drive.files.list({ q, fields: "files(id, name)", spaces: "drive" });
  if (res.data.files && res.data.files.length > 0) {
    return res.data.files[0].id;
  }

  // Create it
  const meta: any = {
    name,
    mimeType: "application/vnd.google-apps.folder",
  };
  if (parentId) meta.parents = [parentId];
  const created = await drive.files.create({ requestBody: meta, fields: "id" });
  return created.data.id;
}

// ─── PDF Generation ───────────────────────────────────────────────────────────

function parseJson(str?: string | null): string[] {
  try { return JSON.parse(str || "[]"); } catch { return []; }
}

export async function generateQuestionnairePDF(client: Client): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // ── Brand colors
    const SHELBY   = "#004363";
    const MIAMI    = "#1FC3EF";
    const YELLOW   = "#F2EA00";
    const WHITE    = "#FFFFFF";
    const LIGHT    = "#E1F3F5";

    // ── Header bar
    doc.rect(0, 0, doc.page.width, 70).fill(SHELBY);
    doc.fontSize(22).fillColor(MIAMI).font("Helvetica-Bold")
      .text("MOTOSAIC", 50, 20);
    doc.fontSize(9).fillColor(LIGHT).font("Helvetica")
      .text("CLIENT QUESTIONNAIRE SUMMARY", 50, 46);

    // Client name + date top right
    const rightX = doc.page.width - 220;
    doc.fontSize(14).fillColor(WHITE).font("Helvetica-Bold")
      .text(`${client.firstName} ${client.lastName}`, rightX, 18, { width: 170, align: "right" });
    doc.fontSize(8).fillColor(LIGHT).font("Helvetica")
      .text(new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }), rightX, 38, { width: 170, align: "right" });

    let y = 90;

    // ── Section renderer
    const section = (title: string) => {
      doc.rect(50, y, doc.page.width - 100, 20).fill(MIAMI);
      doc.fontSize(9).fillColor(SHELBY).font("Helvetica-Bold")
        .text(title.toUpperCase(), 58, y + 6);
      y += 28;
    };

    const row = (label: string, value?: string | null, highlight = false) => {
      if (!value) return;
      if (y > 700) { doc.addPage(); y = 50; }
      doc.fontSize(8).fillColor("#666666").font("Helvetica-Bold")
        .text(label.toUpperCase(), 58, y, { width: 130 });
      doc.fontSize(9).fillColor(highlight ? MIAMI : "#1a1a1a").font(highlight ? "Helvetica-Bold" : "Helvetica")
        .text(value, 195, y, { width: doc.page.width - 245 });
      y += 16;
    };

    const divider = () => {
      doc.moveTo(58, y).lineTo(doc.page.width - 58, y).strokeColor("#e0e0e0").lineWidth(0.5).stroke();
      y += 8;
    };

    // ── 1. Contact Info
    section("Contact Information");
    row("Name", `${client.firstName} ${client.lastName}`);
    row("Email", client.email);
    row("Phone", client.phone);
    if (client.address) row("Registration Address", `${client.address}, ${client.city}, ${client.state} ${client.zip}`);
    divider();

    // ── 2. Purchase Details
    section("Purchase Details");
    row("Purchase Type", client.purchaseType?.toUpperCase(), true);
    row("Budget", client.budget);
    row("Down Payment", client.downPayment);
    if (client.monthlyPayment) row("Target Monthly", client.monthlyPayment);
    if (client.annualMileage) row("Annual Mileage", client.annualMileage);
    if (client.creditScore) row("Credit Score", client.creditScore);
    row("Timeframe", client.timeframe, true);
    divider();

    // ── 3. Vehicle Preferences
    section("Vehicle Preferences");
    const makes = parseJson(client.preferredMakes);
    if (makes.length > 0) row("Preferred Makes", makes.join(" · "), true);
    const bodies = parseJson(client.bodyStyles);
    if (bodies.length > 0) row("Body Style", bodies.join(", "));
    if (client.preferredModels) row("Models in Mind", client.preferredModels);
    if (client.exteriorColors) row("Exterior Colors", client.exteriorColors);
    const intColors = parseJson(client.interiorColors);
    if (intColors.length > 0) row("Interior Colors", intColors.join(", "));
    if (client.mustHaveFeatures) row("Must-Have Features", client.mustHaveFeatures);
    if (client.niceToHaveFeatures) row("Nice-to-Have", client.niceToHaveFeatures);
    divider();

    // ── 4. Trade-In
    if (client.hasTradeIn) {
      section("Trade-In Vehicle");
      const tradeDesc = [client.tradeYear, client.tradeMake, client.tradeModel, client.tradeTrim].filter(Boolean).join(" ");
      if (tradeDesc) row("Vehicle", tradeDesc);
      if (client.tradeMileage) row("Mileage", client.tradeMileage);
      if (client.tradeCondition) row("Condition", client.tradeCondition);
      if (client.tradeOwed) row("Amount Owed", client.tradeOwed);
      divider();
    }

    // ── 5. Deal Build (if set)
    if (client.finalMake) {
      section("Final Vehicle Build");
      const vehicle = [client.finalMake, client.finalModel, client.finalTrim].filter(Boolean).join(" ");
      row("Vehicle", vehicle, true);
      if (client.finalExtColor) row("Exterior", client.finalExtColor);
      if (client.finalIntColor) row("Interior", client.finalIntColor);
      if (client.finalOptions) row("Options", client.finalOptions);
      if (client.finalZip) row("Delivery ZIP", client.finalZip);
      divider();
    }

    // ── Footer
    const footerY = doc.page.height - 40;
    doc.rect(0, footerY - 8, doc.page.width, 48).fill(SHELBY);
    doc.fontSize(7).fillColor(LIGHT).font("Helvetica")
      .text("MOTOSAIC · Confidential Client Record · motosaic.com", 50, footerY, { align: "center", width: doc.page.width - 100 });

    doc.end();
  });
}

// ─── Main sync function ───────────────────────────────────────────────────────

export async function syncClientToDrive(client: Client, documents: Document[], uploadsDir: string): Promise<string> {
  const drive = await getDrive();

  // Get or create parent "Motosaic Clients" folder
  const parentId = await getOrCreateFolder(drive, PARENT_FOLDER_NAME);

  // Get or create client subfolder: "Last, First"
  const clientFolderName = `${client.lastName}, ${client.firstName}`;
  const clientFolderId = await getOrCreateFolder(drive, clientFolderName, parentId);

  // Get or create Documents subfolder
  const docsFolderId = await getOrCreateFolder(drive, "Documents", clientFolderId);

  // Generate + upload/replace PDF
  const pdfBuffer = await generateQuestionnairePDF(client);
  const pdfName = "Questionnaire Summary.pdf";

  // Check if PDF already exists (to replace it)
  const existingPdf = await drive.files.list({
    q: `name='${pdfName}' and '${clientFolderId}' in parents and trashed=false`,
    fields: "files(id)",
    spaces: "drive",
  });

  if (existingPdf.data.files && existingPdf.data.files.length > 0) {
    // Update existing
    await drive.files.update({
      fileId: existingPdf.data.files[0].id,
      media: { mimeType: "application/pdf", body: Readable.from(pdfBuffer) },
    });
  } else {
    // Create new
    await drive.files.create({
      requestBody: { name: pdfName, parents: [clientFolderId] },
      media: { mimeType: "application/pdf", body: Readable.from(pdfBuffer) },
      fields: "id",
    });
  }

  // Mirror any uploaded documents into the Documents subfolder
  for (const doc of documents) {
    const filePath = path.join(uploadsDir, doc.storedName);
    if (!fs.existsSync(filePath)) continue;

    // Check if already uploaded
    const existing = await drive.files.list({
      q: `name='${doc.originalName}' and '${docsFolderId}' in parents and trashed=false`,
      fields: "files(id)",
      spaces: "drive",
    });
    if (existing.data.files && existing.data.files.length > 0) continue; // already there

    await drive.files.create({
      requestBody: { name: doc.originalName, parents: [docsFolderId] },
      media: { mimeType: doc.mimeType, body: fs.createReadStream(filePath) },
      fields: "id",
    });
  }

  // Return the Drive folder URL
  return `https://drive.google.com/drive/folders/${clientFolderId}`;
}
