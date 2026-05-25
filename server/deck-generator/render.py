"""
Render a MotoMatch deck from a JSON config file.

This is a thin wrapper around build_motomatch_template.py. The template is the
source of truth for brand layout and never gets edited per-deck. This wrapper
imports it, overrides the module-level data blocks with values from the JSON
config produced by the Node Generate endpoint, and calls build_deck().

Usage:
    python3 render.py <config.json>

Config schema (produced by the Node Generate endpoint after calling Claude):
{
  "client":   {...},
  "vehicles": [...],
  "comparison_rows": [[label, [vals], best_idx], ...],
  "include_comparison_slide": true,
  "output_path": "/abs/path/to/Daniels_MaryKay_v1.pptx",
  "assets_dir": "/abs/path/to/server/deck-generator/assets"
}

The wrapper prints the absolute output path on success. Exit code 0 = success;
non-zero with stderr message = failure.
"""

import json
import os
import sys


def main() -> None:
    if len(sys.argv) < 2:
        print("usage: render.py <config.json>", file=sys.stderr)
        sys.exit(2)

    config_path = sys.argv[1]
    with open(config_path) as f:
        cfg = json.load(f)

    # Import the template from the same directory as this wrapper.
    here = os.path.dirname(os.path.abspath(__file__))
    sys.path.insert(0, here)
    import build_motomatch_template as tmpl  # type: ignore

    # ─── Override data blocks ───────────────────────────────────────────────
    tmpl.CLIENT = cfg["client"]
    tmpl.VEHICLES = cfg["vehicles"]
    tmpl.COMPARISON_ROWS = cfg.get("comparison_rows", [])
    tmpl.OUTPUT_PATH = cfg["output_path"]

    # ─── Override asset paths ───────────────────────────────────────────────
    # The template hardcodes ASSETS = "/home/user/workspace/assets". For
    # production use, we point at the repo-bundled assets dir.
    if "assets_dir" in cfg:
        tmpl.ASSETS = cfg["assets_dir"]
        tmpl.LOGO_TITLE = f"{tmpl.ASSETS}/logos/slide1_img1.png"
        tmpl.LOGO_FOOTER = f"{tmpl.ASSETS}/logos/slide1_img6.png"
        tmpl.LOGO_SMALL = f"{tmpl.ASSETS}/logos/slide2_img1.png"
        tmpl.LOGO_FOOTER2 = f"{tmpl.ASSETS}/logos/slide2_img2.png"

    # ─── Re-derive computed constants ───────────────────────────────────────
    # These are computed at template import-time from the original (placeholder)
    # VEHICLES literal. After we reassign VEHICLES above, they're stale.
    tmpl.TOTAL_VEHICLES = len(tmpl.VEHICLES)
    tmpl.PHOTOS = {
        v["key"]: [
            f"{tmpl.ASSETS}/photos/{v['key']}_front.jpg",
            f"{tmpl.ASSETS}/photos/{v['key']}_rear.jpg",
            f"{tmpl.ASSETS}/photos/{v['key']}_interior.jpg",
        ]
        for v in tmpl.VEHICLES
    }

    # ─── Optional: skip the comparison slide ────────────────────────────────
    # The template always builds it. Patch to a no-op if the config says skip.
    if not cfg.get("include_comparison_slide", True):
        tmpl.build_comparison_slide = lambda prs: None  # type: ignore

    # ─── Build ──────────────────────────────────────────────────────────────
    out_path = tmpl.build_deck()
    print(out_path)


if __name__ == "__main__":
    main()
