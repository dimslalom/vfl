# Design brief: assets for the UX pass

Two assets are placeholders in the shipped code. Each placeholder has a dashed red frame so it cannot be mistaken for final art. The game works with them in place, but neither should go public as it is.

House rules for both: VFL's flat HUD look. Sharp corners, cut notches, no gradients, no glow, signal red `#ff4655` on near-black `#0d0f17`, ink `#ece8e1`, Familjen Grotesk. No Riot or VCT logos or trademarks, and no agent art.

## 1. Tier crests (three)

**What:** one crest each for the three league tiers: Challengers, Ascension, International.

**Where it shows:** top right of the share receipt on the Run Complete and Daily screens, at 48px. The crest shown is the best tier the run reached, so it is the visible reward for climbing.

**Needs to:**
- Read at 48px on `#0b0d14`. Drawn for that size, not shrunk from a poster.
- Make the three levels obvious at a glance, with International clearly the highest. A single shape that gains cuts or layers per tier works better than three unrelated marks.
- Use flat fills only, because the receipt is exported to PNG.

**Deliver:** three transparent SVGs on a 120 by 120 canvas with about 8px of safe margin. PNG at 480px is fine if a crest cannot stay vector.

**Replace these files, same names:**
- `public/placeholders/crest-challengers.svg`
- `public/placeholders/crest-ascension.svg`
- `public/placeholders/crest-international.svg`

Once final, they can move to `public/assets/brand`, which needs a one-line path change in `src/pages/PerfectRun.jsx`.

## 2. Link preview image

**What:** the image that appears when a Gauntlet or challenge link is pasted into Discord, X or WhatsApp.

**Why it matters:** challenge links are the main way the game spreads, so this image is what a friend sees before they ever click.

**Needs to:**
- Lead with the Gauntlet logotype.
- Show real player cards, the way the landing fan does, instead of abstract decoration.
- Keep all text inside the centre 1000 by 500, because some apps crop the edges.
- Stay legible as a 400px wide thumbnail.
- Be English only, with no year or date, since one image serves every language.

**Deliver:** 1200 by 630 PNG or WebP, under 300 KB. PNG or WebP matters here because some chat apps will not preview an SVG.

**Replace:** `public/placeholders/og-share.svg`. Then update the `og:image` line in `index.html` to the new file name and an absolute URL on vctfantasy.dimas.works.
