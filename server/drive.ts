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

// ─── Persistent sheet URL ─────────────────────────────────────────────────────
const SHEET_URL_FILE = process.env.MINERVA_SHEET_URL_FILE || "/data/minerva-sheet-url.txt";

export function getStoredSheetUrl(): string | null {
  try {
    if (fs.existsSync(SHEET_URL_FILE)) {
      return fs.readFileSync(SHEET_URL_FILE, "utf-8").trim() || null;
    }
  } catch { /* ignore */ }
  return null;
}

function storeSheetUrl(url: string): void {
  try {
    const dir = path.dirname(SHEET_URL_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(SHEET_URL_FILE, url, "utf-8");
  } catch (err) {
    console.error("[sheet] Failed to persist sheet URL:", err);
  }
}

// ─── OAuth2 Client ────────────────────────────────────────────────────────────

export function getOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    const missing = [
      !clientId && "GOOGLE_CLIENT_ID",
      !clientSecret && "GOOGLE_CLIENT_SECRET",
      !refreshToken && "GOOGLE_REFRESH_TOKEN",
    ].filter(Boolean).join(", ");
    throw new Error(`Missing Google OAuth env vars: ${missing}`);
  }

  const client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    "https://portal.motosaic.com/auth/google/callback"
  );
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}

// Auth URL doesn't need a refresh token — creates a bare client for the consent flow
function getAuthOnlyClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    "https://portal.motosaic.com/auth/google/callback"
  );
}

export function getAuthUrl(): string {
  const client = getAuthOnlyClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/drive"],
  });
}

export async function exchangeCodeForTokens(code: string): Promise<string> {
  const client = getAuthOnlyClient();
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

// ─── Minerva Google Sheet sync ─────────────────────────────────────────────────────────────

const SHEET_TITLE = "Motosaic — Minerva Clients";
const TAB_NAME    = "Minerva";

// Column A is a hidden client ID for upsert matching. Cols B–U are displayed.
const HEADERS = [
  "Client ID",        // A  (hidden)
  "Name",             // B
  "Email",            // C
  "Phone",            // D
  "Status",           // E
  "Questionnaire",    // F
  "DL Front",         // G
  "DL Back",          // H
  "Current Insurance",// I
  "Updated Insurance",// J
  "Budget",           // K
  "Purchase Type",    // L
  "Body Styles",      // M
  "Passengers",       // N
  "Powertrain",       // O
  "Must-Have Features",// P
  "Nice-to-Have",     // Q
  "Trade-In",         // R
  "Timeframe",        // S
  "Drive Folder",     // T
  "Last Updated",     // U
];

function parseJsonArr(str?: string | null): string[] {
  try { return JSON.parse(str || "[]"); } catch { return []; }
}

function formatRow(client: Client, docTypes: string[]): string[] {
  const has = (type: string) => docTypes.includes(type) ? "✓" : "";
  const bodies = parseJsonArr(client.bodyStyles);
  const trade = client.hasTradeIn
    ? [client.tradeYear, client.tradeMake, client.tradeModel].filter(Boolean).join(" ") || "Yes"
    : "No";

  return [
    String(client.id),                                           // A: hidden ID
    `${client.firstName} ${client.lastName}`.trim(),             // B
    client.email ?? "",                                         // C
    client.phone ?? "",                                         // D
    client.status ?? "",                                        // E
    client.questionnaireComplete ? "✓ Complete" : "Pending",    // F
    has("dl_front"),                                             // G
    has("dl_back"),                                              // H
    has("current_insurance"),                                    // I
    has("updated_insurance"),                                    // J
    client.budget ?? "",                                        // K
    client.purchaseType ?? "",                                  // L
    bodies.join(", "),                                           // M
    client.passengerCount != null ? String(client.passengerCount) : "", // N
    client.powertrain ?? "",                                    // O
    client.mustHaveFeatures ?? "",                              // P
    client.niceToHaveFeatures ?? "",                            // Q
    trade,                                                       // R
    client.timeframe ?? "",                                     // S
    client.driveFolder ?? "",                                   // T
    new Date().toLocaleString("en-US", { timeZone: "America/New_York" }), // U
  ];
}

export async function syncMinervaSheet(
  getAllClients: () => Client[],
  getDocsByClient: (id: number) => Document[],
): Promise<string> {
  const auth  = getOAuthClient();
  const drive = google.drive({ version: "v3", auth });
  const sheets = google.sheets({ version: "v4", auth });

  // ── 1. Find or create the spreadsheet in the Motosaic Clients parent folder ──
  const parentId = await getOrCreateFolder(drive, PARENT_FOLDER_NAME);

  let spreadsheetId: string;
  const searchRes = await drive.files.list({
    q: `name='${SHEET_TITLE}' and mimeType='application/vnd.google-apps.spreadsheet' and '${parentId}' in parents and trashed=false`,
    fields: "files(id)",
    spaces: "drive",
  });

  if (searchRes.data.files && searchRes.data.files.length > 0) {
    spreadsheetId = searchRes.data.files[0].id!;
  } else {
    // Create new spreadsheet inside the parent folder
    const created = await drive.files.create({
      requestBody: {
        name: SHEET_TITLE,
        mimeType: "application/vnd.google-apps.spreadsheet",
        parents: [parentId],
      },
      fields: "id",
    });
    spreadsheetId = created.data.id!;

    // Make it publicly readable (anyone with link)
    await drive.permissions.create({
      fileId: spreadsheetId,
      requestBody: { type: "anyone", role: "reader" },
    });
  }

  // ── 2. Ensure the "Minerva" tab exists ──
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
  const existingSheets = spreadsheet.data.sheets ?? [];
  let sheetId: number;
  const tabMatch = existingSheets.find((s) => s.properties?.title === TAB_NAME);

  if (tabMatch) {
    sheetId = tabMatch.properties!.sheetId!;
  } else {
    // Rename the default Sheet1 to "Minerva" if it exists, else add new tab
    const sheet1 = existingSheets.find((s) => s.properties?.title === "Sheet1");
    if (sheet1) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{
            updateSheetProperties: {
              properties: { sheetId: sheet1.properties!.sheetId, title: TAB_NAME },
              fields: "title",
            },
          }],
        },
      });
      sheetId = sheet1.properties!.sheetId!;
    } else {
      const addRes = await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: TAB_NAME } } }],
        },
      });
      sheetId = addRes.data.replies![0].addSheet!.properties!.sheetId!;
    }
  }

  // ── 3. Read existing data to build ID→rowIndex map + check for header ──
  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${TAB_NAME}!A:A`,
  });
  const existingRows = existing.data.values ?? [];
  const hasHeader = existingRows[0]?.[0] === "Client ID";

  // If no header yet, write it to row 1 first
  if (!hasHeader) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${TAB_NAME}!A1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [HEADERS] },
    });
    // Treat existing rows as empty — header is now row 1
    existingRows.length = 1;
    existingRows[0] = HEADERS;
  }

  // Build clientId → 1-based row index (skipping header row 0)
  const existingIds: Record<string, number> = {};
  for (let i = 1; i < existingRows.length; i++) {
    const cellId = existingRows[i]?.[0];
    if (cellId) existingIds[cellId] = i + 1; // sheet rows are 1-based
  }

  // ── 4. Fetch assigned clients ──
  const clients = getAllClients().filter(
    (c) => c.assignedTo && c.assignedTo.startsWith("mike_")
  );

  // ── 5. Upsert rows ──
  for (const client of clients) {
    const docs = getDocsByClient(client.id);
    const docTypes = docs.map((d) => d.docType);
    const row = formatRow(client, docTypes);
    const clientIdStr = String(client.id);

    if (existingIds[clientIdStr]) {
      // Update existing row in-place
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${TAB_NAME}!A${existingIds[clientIdStr]}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [row] },
      });
    } else {
      // Append a new row after the last existing row
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${TAB_NAME}!A1`,
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: [row] },
      });
      // Track the newly appended row so the next client gets the right number
      const nextRowIndex = Object.keys(existingIds).length + 2; // header=1, data starts at 2
      existingIds[clientIdStr] = nextRowIndex;
    }
  }

  // ── 7. Style the sheet: hide col A, freeze row 1, bold header ──
  try {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          // Freeze header row
          { updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 1 } }, fields: "gridProperties.frozenRowCount" } },
          // Bold + color header row
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
              cell: {
                userEnteredFormat: {
                  textFormat: { bold: true, foregroundColor: { red: 0, green: 0.263, blue: 0.388 } },
                  backgroundColor: { red: 0.122, green: 0.765, blue: 0.937 },
                },
              },
              fields: "userEnteredFormat(textFormat,backgroundColor)",
            },
          },
          // Hide column A (Client ID)
          {
            updateDimensionProperties: {
              range: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: 1 },
              properties: { hiddenByUser: true },
              fields: "hiddenByUser",
            },
          },
          // Auto-resize all columns
          {
            autoResizeDimensions: {
              dimensions: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: HEADERS.length },
            },
          },
        ],
      },
    });
  } catch (err) {
    // Styling is non-critical — log and continue
    console.error("[sheet] Styling failed (non-fatal):", err);
  }

  // ── 8. Persist and return the URL ──
  const sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
  storeSheetUrl(sheetUrl);
  console.log(`[sheet] Minerva Sheet synced — ${clients.length} client(s) — ${sheetUrl}`);
  return sheetUrl;
}
