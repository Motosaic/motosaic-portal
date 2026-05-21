/**
 * Daily SQLite backup to Google Drive
 *
 * Why this exists (beyond the existing Drive sync):
 *   The Drive sync mirrors uploaded documents + a rendered questionnaire PDF +
 *   a 21-column Minerva Sheet. It does NOT capture admin notes, deal-build
 *   data, assigned-to, or many other DB fields. A real point-in-time copy of
 *   motosaic.db closes that gap and enables one-step restore.
 *
 * Where backups live:
 *   Drive folder "Motosaic Backups" (sibling of "Motosaic Clients"), named
 *   motosaic-<ISO timestamp>.db. Retention: anything older than 14 days is
 *   pruned after each successful upload.
 *
 * Status:
 *   The latest backup metadata is persisted to /data/backup-status.json so
 *   the admin dashboard can show "last backup X minutes ago" without a Drive
 *   round-trip on every load.
 */

import { google } from "googleapis";
import fs from "fs";
import path from "path";
import os from "os";
import { sqlite } from "./storage";
import { getOAuthClient } from "./drive";

const BACKUP_FOLDER_NAME = "Motosaic Backups";
const RETENTION_DAYS = 14;
const STATUS_FILE = process.env.BACKUP_STATUS_FILE || "/data/backup-status.json";

export interface BackupStatus {
  lastBackupAt: string | null;       // ISO timestamp of last successful backup
  lastBackupSize: number | null;     // bytes
  lastBackupDriveId: string | null;  // Drive file ID (for direct link)
  lastBackupFileName: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  // Captured at boot — lets the admin UI know if backups can run at all
  configured: boolean;
}

const EMPTY_STATUS: BackupStatus = {
  lastBackupAt: null,
  lastBackupSize: null,
  lastBackupDriveId: null,
  lastBackupFileName: null,
  lastError: null,
  lastErrorAt: null,
  configured: false,
};

function isBackupConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REFRESH_TOKEN,
  );
}

function readStatus(): BackupStatus {
  try {
    if (fs.existsSync(STATUS_FILE)) {
      const raw = JSON.parse(fs.readFileSync(STATUS_FILE, "utf-8"));
      return { ...EMPTY_STATUS, ...raw, configured: isBackupConfigured() };
    }
  } catch (err) {
    console.error("[backup] Failed to read status file:", err);
  }
  return { ...EMPTY_STATUS, configured: isBackupConfigured() };
}

function writeStatus(patch: Partial<BackupStatus>): void {
  try {
    const current = readStatus();
    const next = { ...current, ...patch };
    const dir = path.dirname(STATUS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(STATUS_FILE, JSON.stringify(next, null, 2), "utf-8");
  } catch (err) {
    console.error("[backup] Failed to persist status:", err);
  }
}

export function getBackupStatus(): BackupStatus {
  return readStatus();
}

// ─── Drive helpers (scoped to the backup folder) ───────────────────────────

async function getOrCreateBackupFolder(drive: any): Promise<string> {
  const q = `name='Motosaic Backups' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const res = await drive.files.list({ q, fields: "files(id, name)", spaces: "drive" });
  if (res.data.files && res.data.files.length > 0) return res.data.files[0].id;
  const created = await drive.files.create({
    requestBody: { name: BACKUP_FOLDER_NAME, mimeType: "application/vnd.google-apps.folder" },
    fields: "id",
  });
  return created.data.id;
}

async function uploadFile(drive: any, folderId: string, localPath: string, remoteName: string): Promise<string> {
  const res = await drive.files.create({
    requestBody: { name: remoteName, parents: [folderId] },
    media: { mimeType: "application/x-sqlite3", body: fs.createReadStream(localPath) },
    fields: "id",
  });
  return res.data.id;
}

async function pruneOldBackups(drive: any, folderId: string, retentionDays: number): Promise<number> {
  const cutoff = Date.now() - retentionDays * 24 * 3600 * 1000;
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed=false and name contains 'motosaic-'`,
    fields: "files(id, name, createdTime)",
    pageSize: 200,
    spaces: "drive",
  });
  const files: { id: string; name: string; createdTime: string }[] = res.data.files || [];
  let deleted = 0;
  for (const f of files) {
    if (!f.createdTime) continue;
    const ts = Date.parse(f.createdTime);
    if (Number.isFinite(ts) && ts < cutoff) {
      try {
        await drive.files.delete({ fileId: f.id });
        deleted++;
      } catch (err) {
        console.error(`[backup] Failed to delete old backup ${f.name}:`, err);
      }
    }
  }
  return deleted;
}

// ─── Snapshot ──────────────────────────────────────────────────────────────

async function snapshotDb(destPath: string): Promise<void> {
  // better-sqlite3's .backup() makes a consistent online copy — safe even
  // while other writes are in flight.
  await sqlite.backup(destPath);
}

function buildBackupName(now: Date = new Date()): string {
  // ISO-ish, sortable, no colons (Drive is fine with them but easier to read)
  const iso = now.toISOString().replace(/:/g, "").replace(/\.\d+Z$/, "Z");
  return `motosaic-${iso}.db`;
}

// ─── Public: run a backup now ──────────────────────────────────────────────

export async function backupNow(): Promise<BackupStatus> {
  if (!isBackupConfigured()) {
    const err = "Google OAuth not configured — set GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN";
    console.error(`[backup] ${err}`);
    writeStatus({ lastError: err, lastErrorAt: new Date().toISOString() });
    return readStatus();
  }

  const startedAt = Date.now();
  const tempPath = path.join(os.tmpdir(), `motosaic-backup-${startedAt}.db`);
  const remoteName = buildBackupName();

  try {
    // 1. Snapshot SQLite locally
    await snapshotDb(tempPath);
    const stat = fs.statSync(tempPath);

    // 2. Upload to Drive
    const auth = getOAuthClient();
    const drive = google.drive({ version: "v3", auth });
    const folderId = await getOrCreateBackupFolder(drive);
    const fileId = await uploadFile(drive, folderId, tempPath, remoteName);

    // 3. Prune old backups (best-effort; failures don't fail the backup)
    let pruned = 0;
    try {
      pruned = await pruneOldBackups(drive, folderId, RETENTION_DAYS);
    } catch (err) {
      console.error("[backup] Prune step failed (not fatal):", err);
    }

    const finishedAt = new Date().toISOString();
    writeStatus({
      lastBackupAt: finishedAt,
      lastBackupSize: stat.size,
      lastBackupDriveId: fileId,
      lastBackupFileName: remoteName,
      lastError: null,
      lastErrorAt: null,
    });

    console.log(
      `[backup] ${remoteName} (${(stat.size / 1024).toFixed(1)} KB) uploaded in ${Date.now() - startedAt}ms; pruned ${pruned} old backup(s)`,
    );
    return readStatus();
  } catch (err: any) {
    const msg = String(err?.message || err);
    console.error("[backup] FAILED:", msg);
    writeStatus({ lastError: msg, lastErrorAt: new Date().toISOString() });
    throw err;
  } finally {
    // Clean up temp file
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    } catch { /* ignore */ }
  }
}

// ─── Cron: daily at 3 AM ET (DST-aware) + startup catch-up ────────────────

function msUntilNextThreeAmET(now: Date = new Date()): { ms: number; targetIso: string } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const isThreeAmET = (t: number): boolean => {
    const parts = fmt.formatToParts(new Date(t));
    const hour = parts.find((p) => p.type === "hour")?.value;
    const minute = parts.find((p) => p.type === "minute")?.value;
    return hour === "03" && minute === "00";
  };
  const start = now.getTime();
  const startMinute = start - (start % 60000);
  for (let m = 1; m < 26 * 60; m++) {
    const candidate = startMinute + m * 60_000;
    if (isThreeAmET(candidate)) {
      return { ms: candidate - start, targetIso: new Date(candidate).toISOString() };
    }
  }
  const fallback = start + 24 * 3600_000;
  return { ms: fallback - start, targetIso: new Date(fallback).toISOString() };
}

function todayKeyET(d: Date = new Date()): string {
  // YYYY-MM-DD in ET — used to dedupe "did we already back up today?"
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(d);
}

export function scheduleBackupCron(): void {
  if (!isBackupConfigured()) {
    console.log("[backup] Skipping cron — Google OAuth not configured.");
    writeStatus({}); // ensures status file reflects current configured state
    return;
  }
  writeStatus({}); // mark configured=true

  // Catch-up: if we haven't backed up today (ET), kick one off shortly after boot
  // so first-time deploys aren't waiting until 3 AM to get coverage.
  const status = readStatus();
  const today = todayKeyET();
  const lastDay = status.lastBackupAt ? todayKeyET(new Date(status.lastBackupAt)) : null;
  if (lastDay !== today) {
    // Small delay so it doesn't fight with other boot activity
    setTimeout(() => {
      backupNow().catch((err) => console.error("[backup] startup catch-up failed:", err));
    }, 30_000);
  }

  // Daily 3 AM ET
  const tick = () => {
    const { ms, targetIso } = msUntilNextThreeAmET();
    console.log(`[backup] Next daily backup in ${Math.round(ms / 60000)} min (at ${targetIso})`);
    setTimeout(() => {
      backupNow()
        .catch((err) => console.error("[backup] scheduled run failed:", err))
        .finally(() => tick());
    }, ms);
  };
  tick();
}
