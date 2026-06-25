/**
 * Extract plain text from uploaded deck attachments at upload time.
 *
 * PDFs go through a python3 + pypdf subprocess (pypdf is already in
 * requirements.txt — same env that runs render.py). Plain-text-ish files
 * are read directly in Node. Anything else returns null and we surface
 * "[no text extracted]" in the Generate payload.
 *
 * We extract once at upload time, not at Generate time, so:
 *   - Each Generate doesn't re-spawn python for every attachment
 *   - Extracted text is persisted alongside the file row (auditable)
 *   - PDF parsing errors surface immediately when the operator uploads,
 *     not deep inside the Generate flow.
 */

import fs from "fs";
import path from "path";
import { spawnPython } from "./python-bin";

const PDF_EXTRACT_PY = `
import sys, pypdf
r = pypdf.PdfReader(sys.argv[1])
parts = []
for i, page in enumerate(r.pages, 1):
    parts.append(f"\\n===== PAGE {i} =====\\n")
    parts.append(page.extract_text() or "")
sys.stdout.write("".join(parts))
`.trim();

/**
 * Returns extracted text, or null if extraction isn't supported or failed.
 * Never throws.
 *
 * Pass `originalName` whenever you have it (multer renames uploads to a
 * random hash on disk with no extension, so the on-disk path can't be
 * used for extension sniffing).
 */
export async function extractText(
  filePath: string,
  mimeType: string,
  originalName?: string
): Promise<string | null> {
  // Prefer the original filename's extension — multer's hashed on-disk
  // name has no extension at all, so falling back to filePath made every
  // .txt/.md upload look extension-less.
  const ext = (originalName ? path.extname(originalName) : path.extname(filePath)).toLowerCase();

  // PDFs: spawn python + pypdf
  if (mimeType === "application/pdf" || ext === ".pdf") {
    return extractPdfText(filePath);
  }

  // Plain-text-ish: read directly in Node
  const textExts = [
    ".txt",
    ".md",
    ".markdown",
    ".json",
    ".csv",
    ".tsv",
    ".log",
    ".rtf",
    ".html",
    ".xml",
  ];
  const textMimePrefixes = ["text/", "application/json"];
  const isText =
    textExts.includes(ext) ||
    textMimePrefixes.some((p) => mimeType.startsWith(p));

  if (isText) {
    try {
      return fs.readFileSync(filePath, "utf-8");
    } catch {
      return null;
    }
  }

  // .docx, images, etc. — defer to a future extraction pass
  return null;
}

function extractPdfText(filePath: string): Promise<string | null> {
  return new Promise((resolve) => {
    const proc = spawnPython(["-c", PDF_EXTRACT_PY, filePath], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    proc.on("close", (code) => {
      if (code === 0) {
        resolve(stdout || null);
      } else {
        console.error(
          `[deck-generator/extract] PDF extraction failed (code ${code}): ` +
            stderr.slice(0, 500)
        );
        resolve(null);
      }
    });
    proc.on("error", (err) => {
      console.error(
        `[deck-generator/extract] Failed to spawn python3: ${err.message}`
      );
      resolve(null);
    });
  });
}
