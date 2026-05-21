/**
 * Sentry side-effect initialization.
 *
 * MUST be imported BEFORE any other module (especially express) so Sentry can
 * auto-instrument them at require time. Side-effect import only — no exports.
 *
 *   // server/index.ts
 *   import "./instrument";   // ← first
 *   import express from "express";
 *
 * No-op if SENTRY_DSN is unset.
 */

import * as Sentry from "@sentry/node";

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || "development",
    // Disable performance tracing — keeps us well under Sentry's free-tier
    // event quota and avoids per-request overhead. Re-enable later if needed.
    tracesSampleRate: 0.0,
    // Don't capture PII. Driver's license uploads, addresses, phone numbers,
    // etc. should never end up in Sentry's storage.
    sendDefaultPii: false,
    beforeSend(event) {
      if (event.request?.data) delete event.request.data;
      return event;
    },
  });
  console.log("[sentry] Initialized");
}
