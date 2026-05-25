# How to Source Vehicle Photos for a MotoMatch Deck

> **Repo role:** Canonical instructions for the photo-sourcing pipeline. This is the system prompt for the dedicated Claude sourcing call (separate from the deck-generation call that uses `house-style.md`). Like `house-style.md`, the full content is snapshotted into every successful sourcing run for replay/audit. Originally authored by Mike for the Perplexity-based workflow; ported verbatim to the portal.

> **Pipeline shape:** sourcing runs *after* deck draft pruning, not as part of initial Generate. The user iterates the vehicle list in chat, then clicks "Source Photos," which kicks off a Claude call with the Anthropic `web_search` tool enabled. Claude returns a JSON map `{ vehicle_key: { front_url, rear_url, interior_url } }`. The Node server downloads, verifies dimensions (≥800px, >5KB), and falls back to the script's placeholder boxes per-slot when sourcing fails for any angle.

---

## The Core Challenge

Finding the right 3 photos per vehicle is the most time-consuming part of the deck build. The difficulty is that you need specific angles (front 3/4, rear 3/4, interior straight-on), specific quality (no watermarks, no dealer logos, minimum 800px), and ideally a dark exterior color — and most of those constraints conflict with what's easiest to find on the open web. Here's exactly how to do it efficiently.

## The 3 Photos You Need Per Vehicle

| Slot | What You're Looking For |
|---|---|
| Front 3/4 | Vehicle facing forward-right, slight angle. Clean background — studio, outdoor, or press setting. No people, no dealer signage. |
| Rear 3/4 | Vehicle facing rear-left, same aesthetic. Rear shot is critical for confirming gas vs. EV (look for exhaust pipes). |
| Interior | Straight-on center stack / dashboard. Camera is looking directly at the infotainment screen and controls — NOT a side 3/4 angle from the driver's seat. This is the hardest one to find correctly framed. |

## Source Priority (Always Try in This Order)

### 1. Manufacturer Press / Media Sites — Try This First

These are the gold standard. High resolution, no watermarks, correct model, professional lighting. Every major brand has one:

- BMW: bmwusanews.com or media.bmwgroup.com
- Mercedes: media.mbusa.com or mbusa.com press section
- Audi: media.audiusa.com
- Porsche: newsroom.porsche.com/en_US
- Lexus: pressroom.lexus.com
- Honda: hondanews.com
- Toyota: pressroom.toyota.com
- Volvo: media.volvocars.com
- GMC/Chevy/Cadillac: media.gm.com
- Lincoln: media.ford.com
- Jeep/Ram: media.stellantis.com

The press sites organize by model year and trim. Navigate to the correct model, find the photo gallery or media downloads section, and look for the press release photo package. These usually come as high-res JPEGs (often 4000–8640px wide) with no watermarks whatsoever.

**Important:** On press sites, verify you're in the right subfolder. Porsche's newsroom, for example, has separate folders for Cayenne, Cayenne-S, Cayenne-S-E-Hybrid, and Cayenne-4S-E-Hybrid. Always confirm you're in the gas model folder — the rear photo will show exhaust pipes if it's a combustion engine.

### 2. Car and Driver Photo Gallery

`caranddriver.com/[make]/[model]` — navigate to the Photos tab on any review page. C&D has excellent editorial photography, usually 1200×675 or larger, no watermarks. Good for front and rear exterior shots. Their interior shots are often the right straight-on angle.

### 3. Edmunds Photo Gallery

`edmunds.com/[make]/[model]/[year]/review/` — similar to C&D. Good quality, reliable angles. Worth checking if C&D doesn't have the interior framing you need.

### 4. Motor Trend

motortrend.com — backup option. Quality is good but their photos sometimes have subtle Motor Trend watermarks in corners. Inspect before downloading.

### 5. CarBuzz / CarGurus / Other Auto Sites

Last resort. Quality is inconsistent, some photos have overlaid logos or dealer badges, and resolution can be borderline. Only use if manufacturer press and the top 3 editorial sites have failed you.

## How to Actually Download the Photos

Once you find a usable image URL, download it with curl:

```bash
curl -L -o assets/photos/bmw_x5_front.jpg "https://[image-url]"
```

The `-L` flag follows redirects, which press sites often use. After downloading, always verify the dimensions:

```python
from PIL import Image
img = Image.open('assets/photos/bmw_x5_front.jpg')
print(img.size)  # must be at least 800px wide
```

If the file downloads but is tiny (under 5KB), the URL was blocked or redirected to a placeholder — try a different URL.

## Color Preference and When to Compromise

**Ideal:** Dark exterior — black, charcoal, graphite, dark grey, navy. These photograph well and look sharp in the deck's high-contrast layout.

**Reality:** Press sites organize by color, and the dark colorway photos aren't always the ones with the best angles. The priority order is:

1. Correct angle + correct model
2. Dark exterior if available among good-angle options
3. Any clean color if dark isn't available

**Never sacrifice angle or model accuracy for color.** A white GLE 450 with the right angles is better than a black GLE 450 shot from a weird perspective.

## The Hardest Part: Interior Shots

This is where most sourcing attempts go wrong. What you want is the driver looking straight at the dashboard — the infotainment screen centered, the steering wheel visible, the full center stack in frame. What you'll often find instead is:

- A 3/4 angle from slightly outside the car (shows door panel, partial dash)
- An overhead shot looking down at the center console
- A shot from the rear seat looking forward

**Where to find good interior shots:**

- Car and Driver's interior gallery photos tend to be the right angle
- Manufacturer press sites often include a specific "cockpit" or "interior" photo in their press packages
- Search specifically for "[model year] [model] interior dashboard" on Google Images and filter by large size — then trace back to the source URL

**What to avoid:** Any interior shot where you can see the door panel prominently on the left side. That's a 3/4 angle and it will look awkward in the slot.

## Verifying Gas vs. Electric / Hybrid

This caught us once with the Porsche Cayenne — the photos sourced were from the Cayenne Electric, which shares the exact same body as the gas model but has no exhaust pipes and carries an "E" suffix on the badge.

**How to verify:**

- Look at the rear photo — gas models have visible exhaust pipe cutouts in the bumper. EVs have a smooth, blank bumper where the pipes would be.
- Check the badge/badging in the photo — "Cayenne E-Hybrid", "Cayenne 4S E-Hybrid", or any "e" suffix = not pure gas
- Check the press site folder name — Porsche, Mercedes, BMW all use separate directories for EV and hybrid variants
- Check the license plate if visible — some European press plates use "E" suffix for electric vehicles (e.g. S-CA 341E = electric)

## Naming Convention

Every photo must be saved with this exact naming pattern or the build script won't find it:

```
[vehicle_key]_front.jpg
[vehicle_key]_rear.jpg
[vehicle_key]_interior.jpg
```

The `vehicle_key` must exactly match the `"key"` field in the VEHICLES data block in the build script. Examples:

```
bmw_x5_front.jpg
bmw_x5_rear.jpg
bmw_x5_interior.jpg

porsche_cayenne_front.jpg
porsche_cayenne_rear.jpg
porsche_cayenne_interior.jpg
```

All photos go in `assets/photos/`.

## What Happens If You Can't Find a Photo

The `add_image_safe()` function in the build script handles missing photos gracefully — it places a Nardo-colored placeholder box with the filename printed inside it. The deck still builds and runs. So if you're stuck on one angle, skip it, build the deck, and note which slot needs to be swapped. The dealer can right-click → Change Picture in PowerPoint to replace any slot without rebuilding.

## Quick Reference Checklist Per Vehicle

- Front 3/4 sourced — vehicle facing forward-right, clean background, ≥800px
- Rear 3/4 sourced — rear-left angle, exhaust pipes visible (if gas), ≥800px
- Interior sourced — straight-on center stack, NOT a side 3/4 angle, ≥800px
- All 3 are landscape orientation (wider than tall)
- No watermarks on any photo
- No dealer logos or overlay text
- Gas/EV confirmed on rear shot
- Files saved as `[key]_front.jpg`, `[key]_rear.jpg`, `[key]_interior.jpg`
- All in `assets/photos/`

That's the full picture. The manufacturer press sites solve 80% of cases cleanly — the remaining 20% is hunting for interior shots with the right framing. When in doubt on an interior, Car and Driver's gallery is usually the most reliable fallback.
