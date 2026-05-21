/**
 * Sentry re-export.
 *
 * The actual Sentry.init() call lives in server/instrument.ts and runs as a
 * side-effect during module load — that file MUST be imported before express
 * so auto-instrumentation works.
 *
 * This module just re-exports `@sentry/node` for the rest of the app to use
 * (e.g. setupExpressErrorHandler, captureException, captureMessage).
 */

export * as Sentry from "@sentry/node";
