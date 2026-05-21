/**
 * Sentry initialization for the Express server.
 *
 * Loaded EARLY in server/index.ts (before other imports that might throw),
 * gated entirely on the SENTRY_DSN env var. No DSN → no-op, zero overhead.
 *
 * To enable:
 *   1. Sign up at https://sentry.io (free tier covers ~5k events/month)
 *   2. Create a Node.js project, copy the DSN
 *   3. Add SENTRY_DSN=<your-dsn> as a Render env var
 *   4. Redeploy
 */

import * as Sentry from "@sentry/node";

let initialized = false;

export function initSentry(): boolean {
  if (initialized) return true;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return false;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || "development",
    // Conservative trace sample rate — covers the free tier ceiling.
    tracesSampleRate: 0.0,
    // Don't capture sensitive PII from request bodies. The client portal handles
    // driver's-license uploads and other regulated data; Sentry breadcrumbs and
    // errors should never include the payloads.
    sendDefaultPii: false,
    beforeSend(event) {
      // Strip request bodies just in case.
      if (event.request?.data) delete event.request.data;
      return event;
    },
  });

  initialized = true;
  console.log("[sentry] Initialized");
  return true;
}

export { Sentry };
