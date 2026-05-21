import { initSentry, Sentry } from "./sentry";
// Init Sentry as early as possible so it can capture errors from later imports.
// No-op if SENTRY_DSN is unset.
initSentry();

import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes, triggerSheetSync } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import cors from "cors";
import { buildSessionMiddleware } from "./auth";
import { scheduleBackupCron } from "./backup";
import { sqlite } from "./storage";

const app = express();
const httpServer = createServer(app);

// Render terminates TLS at the edge; trust the proxy so secure cookies work.
app.set("trust proxy", 1);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

// CORS: same-origin from the Motosaic-served SPA, plus localhost for dev.
app.use(cors({
  origin: [
    /localhost/,
    /motosaic\.com$/,
  ],
  credentials: true,
}));

app.use(express.urlencoded({ extended: false }));

// Session middleware — must come after cors / body parsers, before routes.
app.use(buildSessionMiddleware());

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

// Request logger — method + path + status + duration only.
// We DON'T log response bodies: they contain PII (driver's license names, addresses,
// phone numbers) and full Claude chat replies. If you need body inspection during
// debugging, attach a temporary logger to the specific route.
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  res.on("finish", () => {
    if (path.startsWith("/api")) {
      const duration = Date.now() - start;
      log(`${req.method} ${path} ${res.statusCode} in ${duration}ms`);
    }
  });
  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  // Sentry error capture — must come AFTER routes, BEFORE the custom error handler.
  // No-op if SENTRY_DSN isn't set, so safe to leave wired up unconditionally.
  Sentry.setupExpressErrorHandler(app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  // `reusePort` is a Linux SO_REUSEPORT feature; macOS rejects it with ENOTSUP.
  // We don't run multi-process on the same port, so it's safe to skip everywhere.
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
    },
    () => {
      log(`serving on port ${port}`);
    },
  );

  // ─── Graceful shutdown ──────────────────────────────────────────────────
  // Render sends SIGTERM during deploys + autoscaling. Without a handler, the
  // process gets killed mid-request, which can corrupt SQLite writes or drop
  // in-flight Drive uploads. Drain in-flight connections, then close the DB.
  let shuttingDown = false;
  async function shutdown(signal: NodeJS.Signals) {
    if (shuttingDown) return;
    shuttingDown = true;
    log(`received ${signal}, draining…`, "shutdown");

    // Stop accepting new connections; let in-flight ones finish.
    const drainTimeout = setTimeout(() => {
      log("drain timeout exceeded (10s) — forcing exit", "shutdown");
      try { sqlite.close(); } catch { /* ignore */ }
      process.exit(1);
    }, 10_000);

    httpServer.close(() => {
      clearTimeout(drainTimeout);
      try {
        sqlite.close();
        log("SQLite closed cleanly", "shutdown");
      } catch (err) {
        log(`SQLite close error: ${String(err)}`, "shutdown");
      }
      process.exit(0);
    });
  }
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // ─── Daily 6am ET Minerva Sheet sync ─────────────────────────────────────
  // Computes the next instant when wall-clock time in America/New_York reads
  // exactly 06:00. Correct across both EST↔EDT transitions and across midnight.
  function msUntilNextSixAmET(now: Date = new Date()): { ms: number; targetIso: string } {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const isSixAmET = (t: number): boolean => {
      const parts = fmt.formatToParts(new Date(t));
      const hour = parts.find((p) => p.type === "hour")?.value;
      const minute = parts.find((p) => p.type === "minute")?.value;
      return hour === "06" && minute === "00";
    };
    // Search forward minute-by-minute up to 26 hours (enough to cover any DST
    // "spring forward" jump where 02:00 ET doesn't exist).
    const start = now.getTime();
    const startMinute = start - (start % 60000);
    for (let m = 1; m < 26 * 60; m++) {
      const candidate = startMinute + m * 60_000;
      if (isSixAmET(candidate)) {
        return { ms: candidate - start, targetIso: new Date(candidate).toISOString() };
      }
    }
    // Fallback: 24h from now (should never hit).
    const fallback = start + 24 * 3600_000;
    return { ms: fallback - start, targetIso: new Date(fallback).toISOString() };
  }

  function scheduleDailySheetSync() {
    const { ms, targetIso } = msUntilNextSixAmET();
    log(`[sheet] Daily sync scheduled in ${Math.round(ms / 60000)} min (at ${targetIso})`, "cron");
    setTimeout(() => {
      log("[sheet] Running daily Minerva Sheet sync", "cron");
      triggerSheetSync();
      scheduleDailySheetSync();
    }, ms);
  }
  scheduleDailySheetSync();

  // ─── Daily SQLite backup to Google Drive ─────────────────────────────────
  // Runs at 3 AM ET (before the 6 AM sheet sync). 14-day retention.
  // Also kicks a catch-up backup ~30s after boot if today's hasn't run.
  scheduleBackupCron();
})();
