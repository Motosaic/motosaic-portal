#!/usr/bin/env bash
# End-to-end smoke test for the deck generator.
#
# Assumes:
#   - The dev server is running at $BASE (default http://localhost:3000)
#   - ADMIN_PASSWORD env var is set to the admin password the server expects
#   - ANTHROPIC_API_KEY is set on the *server*, not here
#   - sqlite3 CLI is available locally (ships with macOS)
#
# Run from the repo root:
#   ADMIN_PASSWORD='...' bash script/smoke-test-decks.sh
#
# Produces a .pptx in ~/Downloads and opens it.

set -euo pipefail

BASE="${BASE:-http://localhost:3000}"
DB_PATH="${DB_PATH:-./motosaic.db}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:?Set ADMIN_PASSWORD env var}"
COOKIES=$(mktemp -t motosaic-smoke-cookies)
trap 'rm -f "$COOKIES"' EXIT

echo "→ Checking server reachability at $BASE..."
curl -sS -f "$BASE/healthz" >/dev/null || {
  echo "✗ Server not reachable at $BASE. Start it with: npm run dev"
  exit 1
}

echo "→ Checking DB exists at $DB_PATH..."
test -f "$DB_PATH" || {
  echo "✗ No DB at $DB_PATH. Server should create it on first boot."
  exit 1
}

# ─── Seed Mary Kay Daniels client (idempotent: only inserts if not already present) ──
echo "→ Seeding Mary Kay Daniels (idempotent)..."
EXISTING_ID=$(sqlite3 "$DB_PATH" "SELECT id FROM clients WHERE first_name='Mary Kay' AND last_name='Daniels' LIMIT 1;")
if [[ -n "$EXISTING_ID" ]]; then
  CLIENT_ID="$EXISTING_ID"
  echo "  Already exists, id=$CLIENT_ID"
else
  sqlite3 "$DB_PATH" <<SQL
INSERT INTO clients (
  first_name, last_name, email, phone,
  city, state, zip,
  purchase_type, budget, down_payment, credit_score, timeframe,
  body_styles, preferred_makes, exterior_colors, interior_colors,
  must_have_features, additional_notes,
  annual_mileage, dog_space, third_row_usage,
  costco_membership, powertrain,
  priority_rankings,
  questionnaire_complete, status
) VALUES (
  'Mary Kay', 'Daniels', 'setabus@aol.com', '19155495976',
  'College Station', 'Texas', '77845',
  'Cash', '\$80,000 – \$100,000', '\$80,000 to \$100,000', 'Above 730', '0-3 Months',
  '["SUV (2-row)","SUV (3-row)"]', '["Lexus","Mercedes","BMW","Lincoln","Cadillac"]', 'Red, Green, Silver', '["Tan","Grey / White"]',
  'Ventilated (cooled) seats, Heated seats, Multi-zone climate control, Blind-spot monitoring, 360° / surround-view camera',
  'Currently drives 2020 Lexus GX 460 (~42K mi). Wants to keep the GX ride height — Mary is short, finds crossovers feel too low. Open to air suspension. Local dealers: Mercedes, BMW, Cadillac (5-10 min). Lexus dealer is in north Houston, ~1 hr drive. Toyota local — can service Lexus there. Two row SUV preferred but 3-row OK (no third row needed for kids). No 4WD needed. Two small dogs only in car for vet visits. Comfort-focused; does not care if sporty. No black or white exterior.',
  '10,000 or less', 'yes', 'occasional',
  'standard', 'gas',
  '[{"category":"Interior Comfort & Luxury","rank":5},{"category":"Safety","rank":5},{"category":"Exterior Style","rank":4},{"category":"Engine Power / Speed","rank":4},{"category":"Efficiency","rank":4},{"category":"Technology","rank":4},{"category":"Maintenance / Cost of Ownership","rank":3},{"category":"Space / Storage","rank":3},{"category":"Resale Value","rank":3},{"category":"Warranty Coverage","rank":3},{"category":"Third Row Space","rank":2},{"category":"Sporty Drive / Handling","rank":1}]',
  1, 'in_progress'
);
SQL
  CLIENT_ID=$(sqlite3 "$DB_PATH" "SELECT id FROM clients WHERE first_name='Mary Kay' AND last_name='Daniels' LIMIT 1;")
  echo "  Created client id=$CLIENT_ID"
fi

# ─── Login as admin ────────────────────────────────────────────────────────────
echo "→ Logging in as admin..."
LOGIN_RES=$(curl -sS -c "$COOKIES" -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d "$(python3 -c "import json,os; print(json.dumps({'password': os.environ['ADMIN_PASSWORD']}))")")
echo "  $LOGIN_RES"
if ! echo "$LOGIN_RES" | grep -q 'authenticated":true'; then
  echo "✗ Login failed. Verify ADMIN_PASSWORD matches server-side env."
  exit 1
fi

# ─── Create a draft ───────────────────────────────────────────────────────────
echo "→ Creating draft for client $CLIENT_ID..."
DRAFT_RES=$(curl -sS -b "$COOKIES" -X POST "$BASE/api/decks" \
  -H "Content-Type: application/json" \
  -d "{\"clientId\":$CLIENT_ID}")
echo "  $DRAFT_RES"
DRAFT_ID=$(echo "$DRAFT_RES" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "  Draft id=$DRAFT_ID"

# ─── Upload the call transcript as an attachment ──────────────────────────────
TRANSCRIPT="$HOME/Downloads/Tyler Daniels and Michael Calcara_transcript.txt"
if [[ -f "$TRANSCRIPT" ]]; then
  echo "→ Uploading transcript attachment..."
  ATT_RES=$(curl -sS -b "$COOKIES" -X POST "$BASE/api/decks/$DRAFT_ID/attachments" \
    -F "file=@$TRANSCRIPT")
  echo "  $ATT_RES"
else
  echo "  (skipping attachment — transcript not found at $TRANSCRIPT)"
fi

# ─── Post the initial user message ────────────────────────────────────────────
echo "→ Posting initial user message..."
curl -sS -b "$COOKIES" -X POST "$BASE/api/decks/$DRAFT_ID/messages" \
  -H "Content-Type: application/json" \
  -d '{"content":"Generate the initial deck draft for Mary Kay. Default to an inclusive list (6-7 vehicles) so we can prune."}' >/dev/null
echo "  ok"

# ─── Generate (this is the slow step — may take 30-60s) ───────────────────────
echo "→ Calling Generate (this may take 30-90 seconds)..."
GEN_RES=$(curl -sS -b "$COOKIES" -X POST "$BASE/api/decks/$DRAFT_ID/generate" --max-time 180)
echo "$GEN_RES" | python3 -m json.tool 2>/dev/null || echo "$GEN_RES"

# Extract the output id and version
OUTPUT_ID=$(echo "$GEN_RES" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('output',{}).get('id',''))" 2>/dev/null || echo "")
VERSION=$(echo "$GEN_RES" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('output',{}).get('version',''))" 2>/dev/null || echo "")

if [[ -z "$OUTPUT_ID" ]]; then
  echo "✗ Generate did not produce an output. Inspect the response above."
  exit 1
fi

# ─── Download the .pptx ──────────────────────────────────────────────────────
OUT_FILE="$HOME/Downloads/smoketest-draft$DRAFT_ID-v$VERSION.pptx"
echo "→ Downloading .pptx to $OUT_FILE..."
curl -sS -b "$COOKIES" "$BASE/api/decks/$DRAFT_ID/outputs/$OUTPUT_ID/file" -o "$OUT_FILE"
ls -la "$OUT_FILE"

echo ""
echo "✓ Smoke test complete."
echo "  Draft:  $DRAFT_ID"
echo "  Output: $OUTPUT_ID (v$VERSION)"
echo "  File:   $OUT_FILE"

# ─── Validation summary — pulls key fields out of the compiledJson ────────────
echo ""
echo "─── Validation ──"
echo "$GEN_RES" | python3 <<'PY'
import sys, json
gen = json.loads(sys.stdin.read())
compiled = json.loads(gen["output"]["compiledJson"])
client = compiled["client"]
vehicles = compiled["vehicles"]

print(f"  date:          {client['date']}")
print(f"  budget:        {client['budget']}")
print(f"  vehicle count: {len(vehicles)}")
print(f"  vehicles:")
for v in vehicles:
    print(f"    - {v['year_make_model']} ({v['msrp']})")
print()
print("  3-row misread check (looking for '3rd row' in considerations):")
hits = []
for v in vehicles:
    for c in v["considerations"]:
        cl = c.lower()
        if "3rd row" in cl or "third row" in cl:
            hits.append((v["key"], c))
if hits:
    for key, txt in hits:
        print(f"    ⚠ {key}: \"{txt}\"")
else:
    print("    ✓ none — fix worked")
print()
print(f"  token usage:   {gen['output']['tokensInput']} in / {gen['output']['tokensOutput']} out")
PY

# Open the .pptx in the default app
open "$OUT_FILE" 2>/dev/null || true
