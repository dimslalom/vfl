# Club landing, onboarding and account entry: design notes

Phase 1 study for the `clubs-landing` branch. Read from `DESIGN.md`, `docs/club-rewards-plan.md`, `src/pages/Club.jsx`, `src/pages/Club.module.css`, `src/engine/club/`, `src/lib/clubSave.js`, `src/components/Landing.jsx`, `HowTo.jsx`, the i18n files and `worker/index.js`. Written 2026-11-04.

## 1. What the Club screens already decided

### It is a game screen, not a page
- Every Club screen is a fixed full-viewport `.stage` (`position: fixed; inset: 0`) with safe-area margins: a HUD on top, a `Ground` in the middle, one action bar (`.act`) at the bottom.
- The `Ground` is the next map's art, darkened with `--veil`. Everything on it is a `--plate`, `--plate-hi` or `--plate-inset` (the No Hand-Mixed Gray Rule).
- The ModeRail and StatusStrip of the other modes are not shown. The Club covers them (`z-index: 60`).

### Visual language
- **Shapes.** Containers are true right angles. Interactive chrome gets the notched clip-path cut. Club-specific shapes are the **lane-cut panel** (points top and bottom, from the board's lanes, with a `.roof` tab) and the **crest hexagon** (`.crest`).
- **Hierarchy on art.** The cards are the brightest thing, with no panel behind them. Tiles show a muted label over one ink number. Each area has one bold sentence-case heading and then muted body text. Mono uppercase is only for small structural labels ("Starting five", "Bench 0 / 2").
- **Colour.** `--accent` red is the main action and danger only (Play, Enter league, last contract year). `--win` green means now, good or selected. `--gold` is for skills, chips and sessions. Selected or solid states use an ink fill with bg text (`.tag[data-solid]`, `.small[data-on]`, `.roof[data-lit]`), which keeps the One Accent Rule.
- **Buttons.** `.primary` is the one big red action. `.ghost` and `.small` are outlined in `--line-bracket`. Equal choices get equal buttons, and colour alone marks the main one.
- **Depth.** Only physical objects (cards, packs, tapes, chips) cast `--shadow-rest` or `--shadow-lift`. Panels and text never cast a shadow.
- **Type.** Familjen Grotesk for everything and mono for readouts, with tabular numerals on the whole stage. Big moments ("Squad ready", "Sacked") use `.moment`: hero size, weight 900, uppercase, one colour.

### Tone
- Short, plain and in the second person: "Enter league", "Squad ready", "Tap again to delete this club", "Last year". It never celebrates itself and has no exclamation marks.
- Rewards are numbers or icons, never sentences (the Show-It Rule). A first visit never shows a page of zeroes (`Landing.jsx`).
- Destructive actions arm on the first tap and fire on the second (`ClubMenu`, `Damaged`), with no confirm modal.

### Motion
- Screens **land and settle**. `groundSettle` is .34s with a 4.5deg rotateX tilt, eased with `cubic-bezier(.22, 1, .36, 1)`. View transitions morph shared elements (`hud-title`, `primary-action`, `rival-crest`, card ids) instead of fading.
- Objects deal in a 70ms stagger (`.dealt`) and land with a short scale (`.moment`, `badgePop`).
- Every keyframe has a `prefers-reduced-motion` off switch, and Framer Motion runs under `reducedMotion="user"`.

### Deliberately avoided
These come from `DESIGN.md`, the owner's brief and what the code leaves out:
- Gradients, glows, soft shadows on panels, blur and `backdrop-filter`.
- Rounded containers and pills. (Round discs are allowed only as chips and session pips, because they are objects.)
- Side-tab accent borders, VS badges, boxes nested in boxes, dropdowns and selects.
- A second accent colour, and decorative hairlines.
- Hero marketing copy, feature grids, testimonials and icon-in-a-circle feature rows.
- Account gates. DESIGN.md: "playing without a login is a VFL strength."

## 2. What exists for accounts and saves

- **Club save** (`src/lib/clubSave.js`): one JSON blob in `localStorage` under `vfl-club-save`, at `v: 2` with a v1 upgrade. `loadClub` tells a missing save from a damaged one. Another tab's change is followed through the `storage` event.
- **Identity** (`leaderboardClient.getClientId`): a random per-device id, used only to mark your own row on the Daily leaderboard.
- **Worker** (`worker/index.js`): lobbies, with per-lobby session tokens for multiplayer seats; daily score posting; and the daily and overall leaderboards, backed by D1 `vfl-daily-scores`. There is **no account, login, cloud save or cookie auth**. The OpVAL account flow (commit `c38f7b1` describes it) stayed in the OpVAL repo when VFL split off.

So "login and account entry" has nothing to reuse except the device save. Building real accounts would mean a new backend, which the brief rules out without the owner's approval. See the open questions in the PR.

## 3. Gaps the new pages have to close

1. **No front door.** `/` redirects to `/club`, which drops a first-time player straight into the founding draft, with a club name field and a pack. Nothing says what the mode is.
2. **No teaching.** The rules sheet and `HowTo` belong to Gauntlet. The Club loop (draft, train, play the week, vault, transfer window, promotion and relegation, sacking) is never explained.
3. **Club isn't translated.** `Club.jsx` makes no `t()` calls, so all its copy is English only. The new pages will use `t()` with es and pt entries (`test/i18n.test.js` enforces this). Translating the rest of `Club.jsx` is a separate task.

## 4. How the new pages follow these rules

- **Same stage.** The landing and onboarding reuse `Club.module.css` primitives (`.stage`, `.hud`, `.plate`, `.ground`, `.tile`, `.primary`, `.ghost`, `.moment`, the lane-cut panel). They sit on map art under `--veil`, so going from landing to founding to hub reads as one place with no change of skin.
- **One sentence, one Play button** (UX principle 1). A returning player sees their own club (crest, name, tier, year, next rival) and **Continue**. A new player sees one line on what the mode is and **Create your club**. Other modes are one quiet link.
- **Teach with real pieces** (principle 3). Onboarding uses real `PlayerCard`s, a real pack still and a real tile, not illustrations. It is a short numbered sequence (principle 12, with a step count), can be skipped, and is shown once, with a seen flag like `rulesSeen`, then kept one tap away.
- **No gate.** Whatever account entry becomes, the first Play never waits on it.
- **Motion.** The same `groundSettle` landing and 70ms deal. No new curves.
- **Mobile.** The 759px breakpoint Club already uses. The action bar stays thumb-reachable, and nothing scrolls sideways at 375px.
- **Med-fi first.** Real routes and components with tokens only. No bespoke art (placeholder crests stay as `.crest` hexagons) and no final copy pass.

## 5. What was built (med-fi)

Owner decisions: accounts later (a plan only, in `docs/club-accounts-plan.md`); a skippable 3-step primer and first-week tips, with a settings screen to turn both off; the landing inside `/club`; Claude drafts the copy and the owner revises it.

- **Landing** (`src/components/club/ClubLanding.jsx`, direction A): every visit to `/club` opens here. A new player sees one sentence and **Create your club**. A returning player sees their club, their starting five, the next fixture and **Continue**. The quiet links are How it plays, Settings and Other modes.
- **Primer** (`ClubPrimer.jsx`): three steps (draft your five, play the week, climb or get sacked), each with a real piece. Skip is on every step. It runs once before the first founding draft and can be replayed from the landing, the club menu and settings.
- **First-week tips** (`ClubHint.jsx`, `src/lib/clubOnboarding.js`): one tip per screen (home, squad, train, vault, chips, league) during year 1 until the second series. Each tip shows once, and "Turn off tips" turns them all off.
- **Settings** (`ClubSettings.jsx`): switches for the primer and the tips, replay the primer, show tips again, language, and a plain line on where the save lives.
- **Directions lab** at `/lab/landing`: A Front door, B Season road, C Pack first, D Ladder, each for a new or a returning player.

### Recommendation: A, borrowing B's road for the primer

- **A** answers both visitors with one button and stays out of the way. That matters because every visit to `/club` now passes through it: a returning player is one tap from the hub, and the screen shows what they come back for (their five and the next rival).
- **B** teaches the loop best, but it is a lesson on a screen players see every visit. Its road works better as primer step 2, which already uses that shape.
- **C** has the best first impression (the object is the button), but it can't tell a returning player anything, and a new player doesn't learn what they're committing to.
- **D** sells the ambition, but the ladder is static for most of a year, so the returning view goes stale.

### Known med-fi gaps
- Tips sit under the HUD over the screen they explain; the polish pass should point each one at its element.
- The landing adds one tap for returning players. If that's too much, Continue could be skipped after a hub visit in the same session.
- Directions B to D are English only; translate whichever is picked.
- The rest of `Club.jsx` is still untranslated (it was before this branch).
