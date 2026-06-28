# Motosaic Portal — Project State

> **Purpose:** Living document tracking the current state of the Motosaic Portal codebase. Updated by Claude Code after each work session. Pasted into Claude chat conversations when strategy questions require current code context.

> **Update protocol:** At the end of each Claude Code session, ask Claude Code to update the relevant sections below. Do not let this file go stale — an outdated state doc is worse than no state doc.

---

## Last Updated

⏺ Motosaic Portal — Session Summary & Codebase Assessment

  Session date: 2026-05-18

  What we did this session

  1. Initialized git repo — ran git init, git add ., git commit -m "initial perplexity export". Result: 110 files
  committed on main (commit 12a190f).
  2. Read through the entire codebase without modification — all server, shared, client, config, and build files (the
  three biggest pages, IntakePage / AdminDashboard / ClientDetailPage, were delegated to an Explore subagent because
  they exceed single-read limits).
  3. Produced a full assessment (below) covering stack, structure, completeness, bugs, security, and runnability.

  What's still pending

  Nothing has been changed yet. The pending work falls into three buckets:

  Must-fix to run locally:
  - Replace hardcoded https://portal.motosaic.com API base in client/src/lib/queryClient.ts:3 and
  client/src/pages/UploadPage.tsx:88 (and one more in ClientDetailPage.tsx for file download) with either ""
  (same-origin) or a VITE_API_BASE env var.
  - Add client/public/favicon.png or remove the <link rel="icon"> from client/index.html.
  
  Must-fix before any real deploy:
  - Add real auth on all admin routes (DELETE /api/clients/:id, POST /api/admin/reseed, POST /api/admin/sync-sheet,
  PATCH /api/clients/:id/*), on file download endpoints (GET /api/files/:filename and /download), and on POST 
  /api/clients/:id/chat (currently a wide-open billable Anthropic proxy).
  - Remove or gate /api/debug/env (leaks first 8–12 chars of Google secrets).
  - Replace the client-side fake admin login (Admin / AdminMotosaic hardcoded in AdminDashboard.tsx) with a server-side
  gate.
  - Rotate the Supabase anon JWT out of source (server/routes.ts:439 and :481).
  - Escape names used in Drive query template literals (potential breakage / injection in getOrCreateFolder and
  existence checks in drive.ts).

  Cleanup (low priority):
  - Delete orphaned client/src/pages/ThankYouPage.tsx (not routed).
  - Remove unused deps: passport, passport-local, express-session, memorystore.
  - Fix the DST-naive 6am-ET cron in server/index.ts:117.
  - Fix createdAt / uploadedAt defaults in shared/schema.ts — they capture new Date().toISOString() at import time, not
  insert time.
  - Drop dead allowlist entries in script/build.ts (openai, axios, stripe, etc.).
  - Remove @assets alias in vite.config.ts — directory doesn't exist.
  - Reconcile drizzle.config.ts (./data.db) with runtime path (./motosaic.db) or commit to the raw ALTER TABLE migration
   strategy and delete Drizzle Kit usage.
  - Stop logging full response bodies (including chat replies + PII) in the Express request logger.
  - The PORTAL_API_SECRET check in POST /api/clients is broken — it only enforces when a header is present, so omitting
  the header bypasses it.

  ---
  Full codebase assessment
  
  1. What it is and the stack

  Motosaic Portal — a client portal for a car-buying concierge service. Clients log in (email + phone, no password),
  complete a multi-step questionnaire about vehicle preferences, and upload required documents (driver's license,
  insurance). An admin dashboard lets the operator (Mike Calcara) triage clients, build deals, sync everything to Google
   Drive, and chat with Claude AI about each client. Heavily branded (Motosaic colors, Industry font).

  Stack:
  - Frontend: React 18 + TypeScript + Vite 7, wouter for hash-based routing, TanStack Query for data, Tailwind CSS +
  shadcn/ui (the full Radix UI suite), Framer Motion. Hash routing (#/portal, #/admin/...) — chosen so it can run as a
  static export. 
  - Backend: Express 5 + TypeScript, served as a single bundled CJS file in prod via esbuild. tsx for dev.
  - Database: SQLite via better-sqlite3 + Drizzle ORM. Schema lives in shared/schema.ts. Auto-creates tables and runs
  ALTER TABLE ADD COLUMN migrations on boot.
  - Integrations: Google Drive + Sheets + Gmail (all via one OAuth refresh token), Supabase Edge Function
  (onkpufezwbrkuqbqfele.supabase.co) for an external "client-profile-query" intelligence service, Anthropic API for
  in-app chat.
  - Deploy target: Render (render.yaml), single web service with a 1 GB persistent disk at /data.
  
  passport, passport-local, express-session, memorystore are in package.json but never imported anywhere.

  2. File structure / how it connects

  server/
    index.ts        Express bootstrap, CORS, daily 6am ET sheet-sync cron
    routes.ts       All API routes (no router split)
    storage.ts      Drizzle wrapper + raw CREATE TABLE / ALTER TABLE bootstrap
    drive.ts        Google Drive + Sheets sync + PDF generation
    email.ts        Gmail-API send for "questionnaire complete" notification
    vite.ts         Dev-mode Vite middleware
    static.ts       Prod-mode static file serving
  shared/
    schema.ts       Drizzle table defs (clients, documents) — single source of truth
  client/src/
    App.tsx         wouter routes
    main.tsx        React mount
    lib/queryClient.ts   apiRequest() — all API calls funneled through here
    pages/
      LandingPage          /
      ClientPortalPage     /portal — login + progress hub
      IntakePage           /intake/:id — 5-step questionnaire, auto-saves every 1.5s
      UploadPage           /documents/:id — doc center with mobile camera capture
      AdminDashboard       /admin — kanban + client list
      ClientDetailPage     /admin/clients/:id — deal builder, intelligence panel, Claude chat
      ThankYouPage         (orphaned — file exists, not routed)
      not-found.tsx
    components/ui/  ~45 shadcn primitives
  script/build.ts   Vite client build + esbuild server bundle
  render.yaml       Single web service + 1 GB disk at /data

  Frontend → apiRequest() → Express → Drizzle/SQLite, with Drive/Sheets/Gmail/Anthropic/Supabase calls fanning out from
  routes.ts.

  3. What appears fully built

  - Client login + session (email+phone, auto-creates "shell" record on first login).
  - Questionnaire (5 steps in IntakePage: Personal, Budget, Vehicle, Trade-In, Priorities) with 1.5s debounced auto-save
   and a final "complete" step that triggers PDF gen + Drive sync + Gmail notification.
  - Document uploads with mobile camera capture, HEIC/HEIF tolerance, drop-zone on desktop, 20 MB cap, MIME filter.
  - Admin dashboard: client list, kanban by status, status/notes/assignment editing, deal-build form, reseed button,
  manual Drive + Sheet sync triggers.
  - Branded PDF questionnaire summary (PDFKit, server-side) — quite polished.
  - Google Drive sync: Motosaic Clients / Last, First / Documents folder structure, upserts the PDF and document files
  (replaces in-place on re-upload).
  - Google Sheets sync (Motosaic — Minerva Clients → Minerva tab) with header styling, frozen row, hidden ID column,
  daily 6am ET cron.
  - Gmail notification when a questionnaire completes (HTML email).
  - Claude AI chat panel on the client detail page, scoped to that client's data.
  - Intelligence panel that queries the Supabase edge function by email/name.

  4. Incomplete / stubbed / placeholder

  - client/src/pages/ThankYouPage.tsx exists but is not routed in App.tsx.
  - vite.config.ts has an @assets alias pointing to attached_assets/ — that directory does not exist.
  - script/build.ts allowlist references openai, axios, stripe, nodemailer, jsonwebtoken, xlsx, express-rate-limit,
  uuid, etc. — none are dependencies. Template leftovers.
  - passport, passport-local, express-session, memorystore are installed but unused.
  - drizzle.config.ts points at ./data.db; runtime uses process.env.DB_PATH || ./motosaic.db. Drizzle Kit migration
  workflow is essentially dead — actual migrations are the addColumnIfMissing loop in storage.ts.
  - The .light-portal CSS class is defined but I don't see it applied anywhere.
  - client/index.html links /favicon.png — file is not in client/public/.

  5. Bugs, security issues, broken pieces

  Critical for local dev:
  - Hardcoded production API base. client/src/lib/queryClient.ts:3 is const API_BASE = "https://portal.motosaic.com".
  Every apiRequest() call from the React app points at prod regardless of where it's running. UploadPage.tsx:88 and
  ClientDetailPage.tsx (file download) hardcode the same URL. A npm run dev will start the dev server, but the React app
   talks to production.
   
  Security — the big ones:
  - Admin "login" is client-side fake auth. AdminDashboard.tsx hardcodes "Admin" / "AdminMotosaic" and gates only the
  UI. The API has zero admin auth — anyone hitting DELETE /api/clients/:id, POST /api/admin/reseed, POST 
  /api/admin/sync-sheet, PATCH /api/clients/:id/* directly can do anything. 
  - GET /api/files/:filename and /download are unauthenticated. Anyone with a stored filename can pull documents
  (driver's licenses, insurance).
  - POST /api/clients/:id/chat is unauthenticated and proxies to Anthropic with your ANTHROPIC_API_KEY. Wide-open
  billable endpoint.
  - GET /api/debug/env is unauthenticated and leaks the first 8–12 chars of GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
  GOOGLE_REFRESH_TOKEN.
  - Hardcoded Supabase anon JWT in source (server/routes.ts:439 and :481). Anon keys are nominally public, but
  committing them prevents rotation without a code change.
  - Drive folder queries build search strings via template literals (q: \name='${name}' ...``). Client first/last names
  flow into these unescaped.
  - PORTAL_API_SECRET check in POST /api/clients only triggers when both the env var and an incoming header are set;
  omitting the header bypasses it.
  - CORS allows *.perplexity.ai and *.pplx.app with credentials: true. Probably intentional for a Perplexity-hosted
  frontend embed; worth confirming.

  Functional bugs / oddities:
  - Daily 6am ET cron uses fixed UTC-5 (server/index.ts:117) — the code comment admits no DST handling.
  - createdAt and uploadedAt defaults in shared/schema.ts use new Date().toISOString() at import time, not at insert
  time. Raw CREATE TABLE in storage.ts uses datetime('now') which is correct — so it works in practice for fresh DBs.
  - syncMinervaSheet only syncs clients where assignedTo starts with mike_ — silent filter.
  - Express request log (server/index.ts:62) JSON-stringifies the entire response body into the log, including Anthropic
   chat replies and client PII.
  - questionnaire-complete handler sends res.json(client) then does async Drive/email work — failures inside the IIFE
  are only logged.
  
  6. Will it actually run?

  As-is, no. npm install && npm run dev will start Express on port 5000 with Vite middleware. The server boots fine —
  SQLite auto-creates, missing Google env vars just disable Drive sync silently. But the frontend won't be able to talk
  to the backend, because the client points at https://portal.motosaic.com.
  
  To run locally:
  1. npm install
  2. In client/src/lib/queryClient.ts:3, change to const API_BASE = import.meta.env.VITE_API_BASE ?? "" (same-origin,
  since Express serves the SPA).
  3. Fix the hardcoded URL in client/src/pages/UploadPage.tsx:88 to use the same base.
  4. Fix the hardcoded file-download URL in client/src/pages/ClientDetailPage.tsx.
  5. Add client/public/favicon.png or drop the link from client/index.html.
  6. Optional env vars: PORT, DB_PATH, UPLOADS_DIR, GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN, ANTHROPIC_API_KEY,
  NOTIFY_EMAIL. None are strictly required to boot — missing Google config disables Drive/Sheets/Gmail with a console
  log; missing Anthropic key only breaks the admin chat.

  To make it safe to deploy (separate from running):
  - Real server-side auth on admin routes and file-download routes.
  - Remove or gate /api/debug/env. 
  - Rotate the Supabase anon JWT out of source.
  - Decide whether to keep passport/session or drop them.
  
  The core product appears genuinely complete and reasonably polished — questionnaire, uploads, Drive/Sheets sync, PDF
  generation, email notification, Claude chat, intelligence proxy are all wired end-to-end. The honest blocker for a
  fresh-clone run is the hardcoded production URL on the client. The honest blocker for production safety is the missing
   API auth.


*YYYY-MM-DD — brief note about what session produced this update*

---

## What This Project Is

Motosaic Portal — a client portal for the Motosaic vehicle concierge service. Clients log in (email + phone, no password), complete a questionnaire about their vehicle needs, and upload required documents. An admin dashboard lets Mike triage clients, build deals, sync to Google Drive/Sheets, and chat with Claude AI about each client.

**Business context Claude chat already knows:** Motosaic is a premium concierge tier; MotoMatch is a separate marketplace platform being designed; the portal is meant to support active clients post-signing. Pre-sale pipeline tracking (Zoom transcript dashboard) is a separate but related initiative.

---

## Tech Stack

- **Frontend:** React 18 + TypeScript + Vite 7, wouter (hash routing), TanStack Query, Tailwind + shadcn/ui, Framer Motion
- **Backend:** Express 5 + TypeScript, esbuild bundle for prod, tsx for dev
- **Database:** SQLite via better-sqlite3 + Drizzle ORM
- **Integrations:** Google Drive + Sheets + Gmail (single OAuth refresh token), Supabase Edge Function (client intelligence), Anthropic API (admin chat)
- **Deploy target:** Render, single web service with 1 GB persistent disk at `/data`

---

## File Structure (key files only)

```
server/
  index.ts        Express bootstrap, daily 6am ET cron
  routes.ts       All API routes
  storage.ts      Drizzle wrapper + bootstrap migrations
  drive.ts        Google Drive + Sheets sync + PDF gen
  email.ts        Gmail-API send
shared/
  schema.ts       Drizzle table defs — single source of truth
client/src/
  App.tsx         wouter routes
  lib/queryClient.ts   apiRequest() — all API calls funnel here
  pages/
    LandingPage           /
    ClientPortalPage      /portal
    IntakePage            /intake/:id — 5-step questionnaire
    UploadPage            /documents/:id — doc center
    AdminDashboard        /admin
    ClientDetailPage      /admin/clients/:id
    ThankYouPage          (currently orphaned)
  components/ui/  shadcn primitives
script/build.ts   Vite client build + esbuild server bundle
render.yaml       Render deploy config
```

---

## Current State by Feature

### Client-facing
- [x] Login (email + phone, auto-creates shell record)
- [x] Questionnaire — 5 steps, 1.5s debounced auto-save, PDF gen on complete
- [x] Document uploads — mobile camera capture, HEIC tolerance, 20 MB cap
- [ ] *(track new client-facing features here as they're added)*

### Admin-facing
- [x] Client list + kanban by status
- [x] Status/notes/assignment editing
- [x] Deal-build form
- [x] Manual Drive + Sheet sync triggers
- [x] Claude AI chat panel scoped to each client
- [x] Intelligence panel (Supabase edge function)
- [x] Real admin authentication *(server-side, password-only, 30-day SQLite session)*

### Integrations
- [x] Google Drive sync (Motosaic Clients / Last, First / Documents)
- [x] Google Sheets sync (Minerva tab, daily 6am ET cron)
- [x] Gmail notification on questionnaire complete
- [x] Branded PDF questionnaire summary (PDFKit)
- [x] Anthropic chat (admin only)
- [x] Supabase intelligence edge function

### Deck generator *(in progress — Phase 4)*
- [x] Schema: `deck_drafts`, `deck_messages`, `deck_attachments`, `deck_outputs` + storage methods
- [ ] House-style.md committed to `server/deck-generator/`
- [ ] Generate endpoint (assembles prompt + questionnaire + attachments + chat → Claude → JSON → Python subprocess → .pptx → Drive)
- [ ] Persistent chat endpoint scoped per draft
- [ ] Attachment upload + PDF/text extraction (pypdf path verified)
- [ ] `/decks` top-level frontend section: list, workspace, attachments pane, Generate button, past outputs list

---

## Known Issues / Open Bugs

### Critical (blocks shipping)
- ~~No real admin auth.~~ ✓ Fixed Phase 1 — server-side session, password-only.
- ~~Unauthenticated file downloads.~~ ✓ Fixed Phase 1 — `requireAdmin` on `/api/files/:filename` and `/download`.
- ~~Unauthenticated Claude chat endpoint.~~ ✓ Fixed Phase 1 — `requireAdmin`.
- ~~`/api/debug/env` leaks credential prefixes.~~ ✓ Removed entirely.

### High priority
- ~~Hardcoded production URL.~~ ✓ Fixed Phase 1 — all four sites use `VITE_API_BASE`.
- ~~CORS allows `*.perplexity.ai` and `*.pplx.app`.~~ ✓ Removed Phase 1.
- ~~Drive folder query injection risk.~~ ✓ Fixed Phase 2 — `escapeDriveQ` helper applied at all query sites.
- ~~`PORTAL_API_SECRET` fails-open bug.~~ ✓ Fixed Phase 2 — POST /api/clients now requires admin session OR matching secret.

### Medium priority
- ~~DST not handled in 6am ET cron.~~ ✓ Fixed Phase 2 — uses `Intl.DateTimeFormat` with America/New_York.
- **`createdAt`/`uploadedAt` Drizzle defaults** snapshot at import time, not insert time. Works for raw CREATE TABLE path; would break if Drizzle ever creates the column itself. *(Phase 3)*
- ~~Request log JSON-stringifies full response bodies.~~ ✓ Fixed Phase 2 — body logging removed.
- **`syncMinervaSheet` silently filters** to clients where `assignedTo` starts with `mike_`. *(Phase 3)*

### Low priority / cleanup
- `ThankYouPage.tsx` exists but isn't routed.
- `@assets` Vite alias points to nonexistent `attached_assets/`.
- `script/build.ts` references many dependencies that aren't installed (openai, axios, stripe, etc. — template debris).
- `passport`, `passport-local`, `express-session`, `memorystore` installed but unused.
- `drizzle.config.ts` points at `./data.db` but runtime uses `./motosaic.db` — migration tooling is dead.
- `.light-portal` CSS class defined but unused.
- `favicon.png` referenced in `client/index.html` but not present in `client/public/`.
- `UploadPage.tsx` documents query missing `enabled` flag — fetches with undefined id once.

---

## Environment Variables

Required for full functionality (none strictly required to boot):
- `PORT` — server port (default 5000)
- `DB_PATH` — SQLite file (default `./motosaic.db`)
- `UPLOADS_DIR` — uploaded files directory
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` — Drive/Sheets/Gmail
- `ANTHROPIC_API_KEY` — admin chat
- `NOTIFY_EMAIL` — recipient for questionnaire-complete notifications

To be added in Phase 1:
- `VITE_API_BASE` — client-side API base URL (empty for same-origin)
- `ADMIN_PASSWORD` — server-side admin auth
- `SESSION_SECRET` — express-session signing key

---

## Work Log

### Phase 1 — Foundation & Security *(complete — 2026-05-19)*
- [x] Replace hardcoded production URL with `VITE_API_BASE` env var
- [x] Add `.env.example` documenting all env vars
- [x] Implement real admin auth (single-user, `ADMIN_PASSWORD`, express-session + SQLite store)
- [x] Protect admin routes + mutation routes with `requireAdmin` middleware
- [x] Lock down file download endpoints (admin-only; clients never download their own docs from the portal)
- [x] Require admin auth on Claude chat endpoint
- [x] Remove `/api/debug/env`
- [x] Remove Perplexity CORS origins
- [x] Add lightweight client session (cookie set on email+phone login) — enforces "client can only delete their own uploads"
- [x] Fix `reusePort: true` macOS incompatibility in `server/index.ts` (unblocks local dev)

**New files:** `server/auth.ts` (session middleware, requireAdmin / requireClientOrAdmin, login/logout/status routes).

**New deps:** `better-sqlite3-session-store` (session persistence in the same SQLite DB).

**New env vars (set in Render):**
- `ADMIN_PASSWORD` — single admin login password.
- `SESSION_SECRET` — cookie signing key (`openssl rand -hex 32`). Server refuses to boot in prod without it.

**Smoke-tested:** login (good/bad pwd), status check, cookie-gated admin routes, logout cookie destruction, client login + session, file-download 401 without admin.

### Phase 2 — Hardening *(complete — 2026-05-19)*
- [x] Escape Drive query strings (`escapeDriveQ` helper in `server/drive.ts`, applied to all 4 `name='...'` queries)
- [x] Fix `PORTAL_API_SECRET` logic — POST /api/clients now requires admin session OR a valid header (no more fails-open)
- [x] Fix DST handling in cron — replaced UTC-5 hardcode with `Intl.DateTimeFormat`-based minute scan; correct across both EST and EDT
- [x] Redact request logs — body stringification removed; logger now writes only method/path/status/duration
- [x] Structured logging in questionnaire-complete IIFE — every failure path now logs with a tagged prefix that includes the client ID + name, so Render logs are scannable
- [x] Fix 2 pre-existing TS errors in `drive.ts` (Google API file-id null guard) — typecheck is now fully green

### Phase 3 — Polish *(planned)*
- [ ] Add favicon
- [ ] Decide on `ThankYouPage` (route or delete)
- [ ] Remove unused dependencies (passport, etc.)
- [ ] Clean up template debris in `script/build.ts`
- [ ] Fix `enabled` flag on UploadPage documents query
- [ ] Decide on Drizzle migration workflow (use it or remove it)

### Phase 4 — MotoMatch Deck Generator *(in progress — 2026-05-23)*

Replaces the Perplexity-based deck workflow with an in-portal Claude-driven generator. Architecture: top-level `/decks` section, per-draft chat + attachments, single-shot Generate that re-derives deck JSON from full chat history and pipes it into the existing `python-pptx` build script.

- [x] Schema: 4 tables (`deck_drafts`, `deck_messages`, `deck_attachments`, `deck_outputs`) + indexes + storage methods. Typecheck green.
- [x] `house-style.md` committed at `server/deck-generator/house-style.md` (v2 with read-aloud test + copywriter-phrase ban list; pressure-tested vs Daniels-MaryKay materials)
- [x] `build_motomatch_template.py` + 4 logo PNGs copied into `server/deck-generator/assets/logos/`
- [x] `render.py` wrapper: thin JSON-config → invoke-template adapter. Reassigns module-level CLIENT/VEHICLES/COMPARISON_ROWS, re-derives PHOTOS/TOTAL_VEHICLES, optionally patches out the comparison slide.
- [x] `requirements.txt` (python-pptx, Pillow, lxml, pypdf)
- [x] `render.yaml` `buildCommand` updated to `pip3 install --user -r server/deck-generator/requirements.txt && npm install && npm run build`
- [x] **End-to-end smoke test passes:** Daniels-MaryKay pressure-test JSON → render.py → 8-slide .pptx (180KB), all counters correct, all branding intact. Pipeline reproducible from JSON.
- [x] **Generate endpoint** (`POST /api/decks/:id/generate`) — single-shot, Opus model, system prompt = `house-style.md`, validates LLM JSON via zod, spawns `render.py`, persists `deck_outputs` with full `compiledJson` + `houseStyleSnapshot` + token counts. Errors surface as assistant messages in chat. Wired through `anthropic-quota.ts`. Logic lives in `server/deck-generator/generate.ts`.
- [x] **Draft CRUD** (`POST /api/decks`, `GET /api/decks`, `GET /api/decks/:id`)
- [x] **Persistent chat endpoint** (`GET /api/decks/:id/messages`, `POST /api/decks/:id/messages`) — distinct from the ad-hoc `/api/clients/:id/chat`
- [x] **Output download** (`GET /api/decks/:draftId/outputs/:outputId/file`)
- [x] **Attachment upload + text extraction** (`GET /POST /DELETE` `/api/decks/:id/attachments`) — PDFs go through `python3 -c "pypdf..."` inline, .txt/.md/.json/etc. read directly in Node. Extraction at upload time so Generate doesn't re-spawn python per attachment. Files stored under `${UPLOADS_DIR}/deck-attachments/`. List endpoint strips `contentText` to keep payloads small (returns `hasContentText` boolean instead).
- [x] **DELETE/PATCH draft endpoints** — `PATCH` updates title or status (active/archived). `DELETE` cascades messages/attachments/outputs and unlinks files from disk.
- [x] **Prompt tweaks v3** (in `house-style.md`): 3-row interpretation clarified (3-row OK when client selected both body styles), two more banned phrases (`earns its spot`, `if X is the headline`), explicit instruction that `client.date` comes from the `DECK DATE` section of the user payload (no longer guessed from training cutoff).
- [x] **Current-date injection** in `generate.ts` — `buildUserPayload` now prepends a `DECK DATE` section with the actual current month/year.
- [x] **Frontend `/decks` section** — list page (client filter + status filter + search), workspace page (vehicles list, chat, attachments, Generate, past outputs). Light-mode (`.light-portal`). Decks nav item in admin sidebar.
- [x] **Stateful vehicles list** (`deck_vehicles` table) — reorder/add/delete; "Suggest" parses plain-English vehicle text via Sonnet. Authoritative over Claude's selection when populated.
- [x] **Attachment text extraction** — fixed extension sniffing (use original filename, not multer hash).
- [x] **Python deps on Render — SOLVED.** Root cause: this service's build command is set in the **Render dashboard, not render.yaml**, so every `buildCommand` edit was ignored. Fix: server installs deps itself at startup via `python3 -m pip install --target=/data/python-deps` (persistent disk, survives deploys; only first boot pays the cost). See `server/deck-generator/python-bin.ts` → `ensurePythonDeps()`. **Verified working in prod 2026-06-28.**
- [x] Intake form hydration fixed (useEffect, not render-side setState) — saved answers now repopulate on review.
- [x] PDF summary + client detail page — render chip features (`{mustHave,niceToHave}`) by tier; parse exterior colors array.
- [ ] Drive sync for output `.pptx` (deferred — Phase 4.5)
- [ ] Photo sourcing pipeline (deferred — Phase 4.5; decks ship with placeholder photo boxes until then)

**⚠️ Operational note:** if anything Python-related breaks on a NEW Render service or after a disk wipe, the first boot re-runs the pip install to `/data/python-deps`. Check Logs → search `python-bin` for the install status line.
- [x] `server/deck-generator/photo-sourcing.md` committed — canonical sourcing instructions (ported from Mike's Perplexity-era playbook), first-class artifact same as house-style.md
- [ ] **Phase 4.5 — Photo sourcing pipeline.** Separate Claude call with Anthropic `web_search` tool enabled, runs *after* deck pruning (not during initial Generate). Per-vehicle output `{front_url, rear_url, interior_url}` → Node downloads + verifies (≥800px, >5KB) → falls back to placeholder per-slot on failure. UI: workspace shows 3 photo slots per vehicle with `empty | sourced | manual` status. "Source Photos" button runs against the current vehicle list; per-slot manual upload override always available.

### Future / On Hold
- [ ] Decide whether to extend this portal to handle pre-sale pipeline (Zoom transcript dashboard), or build separately
- [ ] Dealer contact management tool integration (see business notes)
- [ ] MotoMatch integration points (TBD)
- [ ] Multi-user auth (currently single shared admin password — `deck_drafts.created_by` is captured now so attribution is ready when Lexi onboards)

---

## Decisions Log

*(Record architectural/strategic decisions here as they're made, with date and rationale)*

- **YYYY-MM-DD:** *(example)* Chose to extend portal vs. build separate pipeline dashboard because [reasoning].
- **2026-05-23:** Built MotoMatch deck generator into the portal vs. standalone tool. Reused existing auth, SQLite + backup, Drive sync, Anthropic spend cap. Standalone would have duplicated ~70% of infra for no gain.
- **2026-05-23:** Deck workspace lives at top-level `/decks`, not as a per-client tab. Deck work is its own workflow; "show me all drafts in flight" is a useful view a per-client tab can't give. From each client's detail page, a small link goes to pre-filtered `/decks?client=...`.
- **2026-05-23:** Stateless re-derivation — every Generate re-reads the full chat history and derives the deck JSON from scratch. No `deck_state` table to keep in sync. Trade-off: long chats cost more tokens per Generate, and model may interpret meandering chats differently across versions. Mitigation: `compiledJson` saved on every output, so diff is observable.
- **2026-05-23:** `house-style.md` content (not just commit SHA) snapshotted into each `deck_outputs` row. Prevents mid-draft style edits from silently changing regenerated decks.
- **2026-05-23:** Questionnaire data is NOT snapshotted as a deck attachment — it's read live from `clients` on every Generate. Lets questionnaire edits flow through immediately.
- **2026-05-23:** Single shared admin password retained for now. `deck_drafts.created_by` captures operator attribution so Lexi's eventual onboarding doesn't require a backfill.

---

## How to Resume Work

If picking this up after time away:

1. Pull latest from git
2. Read this file top to bottom
3. Check the Work Log for what's in progress
4. `npm install` and `npm run dev` to verify the app still boots
5. Tell Claude Code: "Read PROJECT_STATE.md and pick up where the Work Log says we left off"
