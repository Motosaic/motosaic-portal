import type { Express, Request, Response, NextFunction, RequestHandler } from "express";
import session from "express-session";
// better-sqlite3-session-store ships no .d.ts — declare it as `any` for the type-checker.
// @ts-ignore — runtime export is a factory function `(session) => Store`.
import betterSqlite3SessionStore from "better-sqlite3-session-store";
import { timingSafeEqual } from "crypto";
import { sqlite } from "./storage";
import { storage } from "./storage";
import { z } from "zod";

// ─── Session typing ─────────────────────────────────────────────────────────

declare module "express-session" {
  interface SessionData {
    admin?: boolean;
    clientId?: number;
  }
}

// ─── Session middleware ─────────────────────────────────────────────────────

const SqliteStore = betterSqlite3SessionStore(session);

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * ONE_DAY_MS;

export function buildSessionMiddleware(): RequestHandler {
  const isProd = process.env.NODE_ENV === "production";
  const secret =
    process.env.SESSION_SECRET ||
    (isProd
      ? (() => {
          // Fail loudly in prod — a missing secret means every restart invalidates all sessions
          // AND opens the door to predictable session IDs.
          throw new Error(
            "SESSION_SECRET env var is required in production. Generate one with: openssl rand -hex 32",
          );
        })()
      : "dev-only-insecure-secret-do-not-use-in-prod");

  return session({
    name: "motosaic.sid",
    secret,
    resave: false,
    saveUninitialized: false,
    rolling: true, // refresh expiry on each request
    store: new SqliteStore({
      client: sqlite as any, // session store typings expect a slightly different shape, but the runtime client is compatible
      expired: { clear: true, intervalMs: 15 * 60 * 1000 }, // sweep expired sessions every 15 min
    }),
    cookie: {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      maxAge: THIRTY_DAYS_MS,
    },
  });
}

// ─── Password check (timing-safe) ───────────────────────────────────────────

function passwordMatches(input: string, expected: string): boolean {
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// ─── Middleware: require admin session ──────────────────────────────────────

export const requireAdmin: RequestHandler = (req, res, next) => {
  if (req.session?.admin) return next();
  return res.status(401).json({ message: "Unauthorized" });
};

// ─── Middleware: require admin OR matching client session ───────────────────
// `resolveClientId` extracts the resource's owning clientId from the request.
// For routes like /api/clients/:id it's `req.params.id`. For /api/documents/:id
// we need to look it up from storage.

export function requireClientOrAdmin(
  resolveClientId: (req: Request) => number | null | Promise<number | null>,
): RequestHandler {
  return async (req, res, next) => {
    try {
      if (req.session?.admin) return next();
      const sessionClientId = req.session?.clientId;
      if (!sessionClientId) return res.status(401).json({ message: "Unauthorized" });
      const resourceClientId = await resolveClientId(req);
      if (resourceClientId !== null && sessionClientId === resourceClientId) return next();
      return res.status(403).json({ message: "Forbidden" });
    } catch (err) {
      return res.status(500).json({ message: "Auth check failed", error: String(err) });
    }
  };
}

// ─── Auth route registration ────────────────────────────────────────────────

export function registerAuthRoutes(app: Express): void {
  // ── Admin ────────────────────────────────────────────────────────────────

  app.post("/api/auth/admin/login", (req, res) => {
    const expected = process.env.ADMIN_PASSWORD;
    if (!expected) {
      return res.status(500).json({ message: "ADMIN_PASSWORD env var not configured" });
    }
    const parsed = z.object({ password: z.string() }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Missing password" });
    }
    if (!passwordMatches(parsed.data.password, expected)) {
      return res.status(401).json({ message: "Invalid password" });
    }
    req.session.admin = true;
    req.session.save((err) => {
      if (err) return res.status(500).json({ message: "Session save failed" });
      res.json({ authenticated: true });
    });
  });

  app.post("/api/auth/admin/logout", (req, res) => {
    if (!req.session) return res.json({ authenticated: false });
    req.session.admin = false;
    req.session.destroy(() => {
      res.clearCookie("motosaic.sid");
      res.json({ authenticated: false });
    });
  });

  app.get("/api/auth/admin/status", (req, res) => {
    res.json({ authenticated: Boolean(req.session?.admin) });
  });

  // ── Client (email + phone, no password) ──────────────────────────────────

  app.post("/api/auth/client/login", (req, res) => {
    const parsed = z
      .object({
        phone: z.string().min(7),
        email: z.string().min(3),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid login payload" });
    }
    const { phone, email, firstName, lastName } = parsed.data;

    let client = storage.findClientByEmailPhone(email, phone);
    if (!client) {
      client = storage.createClientShell(
        firstName?.trim() || "New",
        lastName?.trim() || "Client",
        phone,
        email,
      );
    }
    req.session.clientId = client.id;
    req.session.save((err) => {
      if (err) return res.status(500).json({ message: "Session save failed" });
      res.json({
        id: client!.id,
        firstName: client!.firstName,
        lastName: client!.lastName,
        email: client!.email ?? "",
        phone: client!.phone ?? "",
        questionnaireComplete: client!.questionnaireComplete,
        status: client!.status,
      });
    });
  });

  app.post("/api/auth/client/logout", (req, res) => {
    if (!req.session) return res.json({ authenticated: false });
    req.session.clientId = undefined;
    req.session.destroy(() => {
      res.clearCookie("motosaic.sid");
      res.json({ authenticated: false });
    });
  });

  app.get("/api/auth/client/status", (req, res) => {
    res.json({
      authenticated: Boolean(req.session?.clientId),
      clientId: req.session?.clientId ?? null,
    });
  });
}

// Re-export for callers that need a no-op next() in tests or wrappers
export type { NextFunction, Request, Response };
