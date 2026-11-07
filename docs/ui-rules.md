# UI rules for agents

Read this before you change anything a player can see. It is written as rules, not advice: if a rule says "never", do not do it, and if you think a rule is wrong, stop and ask the user instead of working around it.

**Read in this order:**

1. `DESIGN.md` (repo root): the tokens. Colours, type sizes, spacing, shadows, corner shapes. This file never repeats a token value; it says which token to use.
2. This file: the grammar. How screens are built, which shared pieces to reuse, how copy is written, how to check your work.
3. `no-slop.md` in the `001 PROJECTS` folder that holds this project (three levels up from this file), if it exists on this machine: the user's list of "AI-looking" design tells. The ones that matter most are copied into section 1 below, so you are covered even without it.

**When they disagree,** the user's latest instruction wins, then this file, then `DESIGN.md`.

---

## 1. Hard rules (never break these)

Each rule is checkable. Run section 10 against your diff before you finish.

1. **No ` · ` in UI text.** Never join two facts with a typed middle dot ("Week 1 · Bo3"). Give each fact its own element and let layout separate them.
2. **No em dashes (—) anywhere:** not in UI copy, code comments, commit messages or replies to the user. Use a comma, colon or full stop.
3. **No run-on fact strings.** "12:00 Bo3 Group Stage" is three facts in one string. Each fact gets its own element and its own type style.
4. **Show, don't tell.** Don't add a sentence that explains what the UI already shows. If a state, mark, number or position already says it, the sentence is deleted. Instruction sentences ("Tap…", "Pick…", "Select…", "Choose…") are allowed only in first-week tips (`ClubHint`).
5. **Never say a fact twice on one screen.** If the rival is in the season road and in the match block, it must not also have a third label. If the pack count is in the header, a tile must not also show it.
6. **No gradients, glows or soft decorative shadows.** The only soft shadows are on physical objects (cards, packs, tapes, chips) via `--shadow-rest` and `--shadow-lift`. Panels and text never cast a shadow.
7. **No rounded rectangles.** Containers are right angles. Interactive plates use the notch (`clip-path` cut corners). Round shapes are only for things that are round in the game: chips, pips, the swap selection corners.
8. **No coloured left or side borders** on cards or rows to show status. Status goes in a chip, a fill or the text colour.
9. **No boxes inside boxes.** Split a panel with hairline rows (`LedgerRow`) or spacing, never a nested bordered box.
10. **No hand-mixed grays.** On map art, a surface is `--plate`, `--plate-hi` or `--plate-inset`. A new `color-mix()` of a surface token is a bug.
11. **No emoji, no glyph icons, no native `<select>`.** Use real game imagery (player cards, crests, pack and tape art) or a drawn SVG. To pick a player, show the player cards and let the user tap one.
12. **No literal font sizes or colours.** Use the `--fs-*` and colour tokens from `DESIGN.md`. If no token fits, the element is wrong; don't add a new size.
13. **No disabled button where a hidden one is clearer.** If an action can never happen in this state (for example, opening a pack you have zero of), remove the button rather than showing "None left".
14. **Fix, don't remove.** When the user says something looks wrong, change the property that is wrong (radius, spacing, alignment). Never delete the element unless they ask. If you think removing it is better, ask first.

---

## 2. Colour means one thing each

| Token | Means | Use it for | Never use it for |
|---|---|---|---|
| `--accent` (red) | the main action, or danger | Play, Take, Sign, Swap, the last contract year, fatigue that costs rating | decoration, headings, a second "important" thing on the same screen |
| `--win` (green) | now, good, selected | the current week, a won week, selection corners, attention pips, the active tab underline, a gained stat | a primary button |
| `--gold` | skills and rare chips | specialty icons, rare chip tiers | general emphasis |
| `--ink` | primary text | names, values | |
| `--muted` | secondary text | labels, inactive tabs, the club name crumb | anything the player must read to act |

**One accent per screen.** If two things both want red, one of them is wrong.

---

## 3. Type and copy

- **Two text levels per area:** one bold sentence-case heading, then muted body. Add nothing in between.
- **Mono uppercase is for small structural labels only:** "STARTING FIVE", "BENCH 0 / 2", "TRAINING TAPES". Never use it for names, sentences or buttons that aren't already in the uppercase button style.
- **Sentence case for everything else:** "Free agents", not "Free Agents"; "Rating change", not "Rating Change"; "Transfer window", not "Transfer Market".
- **Game data stored in capitals** (chip names such as "POCKET STRAT") is shown in title case in lists with `titleCase()` in `src/pages/Club.jsx`. Don't change the stored data; the match board uses it.
- **Numbers that change use `font-variant-numeric: tabular-nums`.**
- **A number gets its own slot.** "+7 OVR" sits on the card it describes, coloured green or red. It is never part of a sentence.
- **Every player-facing string goes through `t()`** from `src/lib/i18n.js`. Add the Spanish and Portuguese translations in `src/i18n/es.js` and `src/i18n/pt.js` in the same change. `npm test` fails when one is missing, or when a translation is left behind for a string you deleted.

---

## 4. Screen grammar

### 4.1 The Hub (`Home` in `src/pages/Club.jsx`)

The Hub is a CSS grid. Do not position anything on it with JavaScript measurements.

```
desktop                         phone (< 760px)
"road  road"                    "road"
"squad hero"                    "squad"
"tiles hero"                    "tiles"
"news  news"                    "news"
                                "hero"   <- Play sits last, in thumb reach
```

- **road:** the season calendar (`Road`). The current week is green.
- **squad:** the starting five. Only the IGL gets a label above its card. A contract bar appears only in a player's last year.
- **hero:** the next match (`Scout` in `src/components/club/HubFeed.jsx`): the rival, both powers with a split bar, their best three cards, their record, then Play. This is the one red thing on the Hub.
- **tiles:** Squad, Vault, Inventory, Train, League, in that order. Each tile shows a label and one value or object. If something there needs attention, the tile gets a green square pip (driven by `attention()` in `src/engine/club/attention.js`). A tile with nothing to do switches to an outline (`data-idle`).
- **news:** one line (`LatestMove`): the latest transfer, then faces for the ones before it.

### 4.2 Menu screens (Squad, Vault, Inventory, Train, League, transfer window)

Every menu screen uses the same frame. Build new menus on it; never write a new header.

```
[<] Club   Squad  Vault  Inventory  Train  League  |  sub-tabs           [stats] [packs tapes]
┌ inspector (260px) ┐  ┌ main ─────────────────────────────────────────────┐
│ TAG               │  │ ROW HEAD                                          │
│ [selected card]   │  │ items / cards                                     │
│ Name (green)      │  ├ bottom ───────────────────────────────────────────┤
│ Label ....... val │  │ ROW HEAD                                          │
│ Label ....... val │  │ squad / loadout                                   │
│ [ PRIMARY ACTION ]│  └───────────────────────────────────────────────────┘
```

- **Header:** `ScreenHeader`. It shows Back, the club name (muted), the five menus as tabs, the screen's own sub-tabs after a divider, then stat boxes and the pack counter.
  - Q and E step through the five menus.
  - The current tab is marked only by ink colour and a green underline. Never change its font size or weight: that shifts every tab after it.
  - The header is a fixed 48px tall whatever is in it, so switching menus never nudges the page. Don't add anything taller than 48px to it.
  - Without `go` (the transfer window), the screen title replaces the menu tabs.
- **Layout:** `ManagementScreen`. Its slots are `inspector`, `action` (the primary button, bottom left), `children` (main), `bottom`, `footer`, and `packed` (bench sits right under the starters).
- **Inspector:** the selected thing's tag, its card or art at `SPOTLIGHT_SCALE`, its name in green, then `LedgerRow`s. The card is hidden on phones. Squad, Train and the transfer window all show the card here. Keep it that way.
- **Primary action:** one red button in the `action` slot, labelled with a verb and the object ("Swap kAyle", "Use Flick tape", "Sign PTC").
- **Readouts in the inspector:** draw values; don't write them as sentences.
  - Contract years: `YearPips`.
  - Fatigue and growth: `Meter` (fatigue turns red past 60).
  - Use `PlayerReadout` for a player's fatigue and growth. Don't rebuild it.

### 4.3 Items (tapes, chips, evos)

- **One grid.** Inventory shows every item in one grid (`.itemGrid`); the sub-tabs filter it. Never split items into one row per type.
- **One item markup on every screen:** `ItemChoice` with `className={styles.inventoryItem}` and `data-item`, containing `.inventoryArt` (the art), then `<b>` (the name), then `<span>` (×count). Train uses exactly the same markup as Inventory.
- **One size per kind,** from shared helpers. Never write a new scale number for an item:
  - tapes: `tapeItemScale(size)`
  - chips and evos: `itemArtSize(size)`
  - selected card in the inspector: `SPOTLIGHT_SCALE`
- **Selection** is green corner brackets (`SelectionCorners`, which `ItemChoice` adds when `selected`). Don't add a border or a fill.
- **Swapping is two clicks everywhere.** The first click picks a thing up: it rises (`data-held`) and every place it can go bobs (`data-swap-target`). The second click swaps it with whatever is clicked; clicking the held thing again puts it down. Squad does this for players, Inventory for a reserve tactic and a loadout chip (an empty slot just takes it). Keep the explicit button (Swap, Equip, Unequip) beside it, so both ways work.

### 4.4 Lists of cards

- Cards are the brightest thing on screen: no panel or frame behind a card.
- A card row must fit its container without horizontal overflow at 1440×900. If it doesn't, scale the cards from the available width (see `squadScale` in `Window`); don't let the row scroll.
- Empty squad places use `BenchOpen`, at bench size.

### 4.5 First-time tips (`ClubHint`)

- **Write for someone who has never played.** Each tip is a plain heading, then what to do and why it matters, in one or two short sentences. Explain a game word the first time it appears ("your captain (IGL)"). Name buttons exactly as they are labelled on screen, including in the Spanish and Portuguese translations.
- **A tip points at the control it is about.** Give the control a `data-tip="name"` attribute and set `target: 'name'` on the tip in the `HINTS` map in `src/components/club/ClubHint.jsx`. Every frame, the tip places itself next to the control (above it, else below, else beside it), points its arrow at it and puts a green ring around it. With no target on screen, it docks at the bottom.
- **Tips are light paper slabs,** the same information material as the match tags. Never give a tip its own new look or a fixed corner position.
- **Each tip has one main button ("Got it") and a quiet "Turn off tips" link.** Don't add more.

### 4.6 The match screen (`src/components/BoardSeries.jsx`)

The match is a 3D table. Everything laid over it must look like a piece on that table, not a flat web button.

- **One popup for every picked piece.** A picked card and a picked chip both use `BoardTag`: a light slab that follows the piece every frame, tilts with the board, and points at it. Never add a second popup style, a bar across the top, or a modal for piece details. A new pickable piece gets an anchor method on `TableStage` (in the shape of `cardAnchor` and `chipAnchor`) and its content inside `BoardTag`.
- **Every control is a slab.** The map and score plate, Settings and Leave, the settings panel, the main button, the round result and the failure card all use the slab rules in `BoardSeries.module.css`:
  - a face colour
  - a two-step extruded edge (`--slab-edge`, then `--slab-base`)
  - `--shadow-rest`
  - the board tilt (`--slab-tilt`)
  - a press that sinks the slab onto its edge
- **Slab colours:**
  - light slabs (the tags) carry information
  - dark slabs are chrome
  - the one red slab is the main action
- **Never put a second tilt on a slab inside a tilted slab** (for example, the button inside the round result).
- **Position slabs with the `translate` property.** `transform` holds the tilt.
- **Button labels in the match stay short and fixed.** One label per action ("Lock in", "Go", "Next round"); don't build a label from state ("Rotate and go" / "Go without rotating").
- **Round playback speed is `ROUND_PLAYBACK` in `src/table3d/TableStage.js`** (below 1 is slower). Change that one number; never retime single steps to slow the round down.

### 4.7 The IGL mark

- The IGL is marked by `PlayerCard`'s `isIgl` prop: a green crown tucked behind the card's top peak, reading "IGL" straight across. Use the prop; never draw a separate IGL badge or label next to a card.
- A row that shows an IGL card needs about 28px of top padding (16px on phones) so the crown isn't clipped.

---

## 5. Consistency invariants

These are the things that broke before. Check them every time you touch a menu.

1. Switching between any two menus moves nothing that both screens share: the Back button, the tabs, the inspector's top edge, the first row heading.
2. The same object (a tape, a chip, an evo, a card) has the same size, font sizes and markup on every screen it appears on.
3. The same action has the same position on every screen: the primary action is always bottom left in the inspector.
4. The same fact uses the same words everywhere. The menu tile, tab and screen title all say "Inventory", and the Train tile and tab both say "Train".
5. Equal choices are equal buttons. Pass, Reroll and Take share one size; colour alone marks the main one.

---

## 6. Motion

- Animate `transform` and `opacity` only. Never animate `width`, `height`, `top`, `left`, `margin` or `padding`. For a bar that fills, scale it: `transform: scaleX(value)` with `transform-origin: left` (see `Meter`).
- Every animation has a `@media (prefers-reduced-motion: reduce)` fallback that shows the same state without moving.
- Use animation for state the player needs to see (for example, cards lifting when a swap is armed), not for decoration.

---

## 7. Game UI principles (EAFC-style)

These are the patterns this project borrows from EA FC's Ultimate Team menus. Apply them when you design something new.

- **One hero per screen.** The thing the player most likely wants next (the next match) is the biggest element and holds the only red button.
- **Currency lives in the header only.** Tiles and panels show what you can do, not the balance.
- **Tiles preview their content** (an object or a value) and carry a badge when something waits. Idle tiles step back.
- **Bumper navigation.** Sibling screens are tabs reachable with Q and E, without going back to the Hub.
- **Inspector plus stage.** Selecting something on the stage fills the left inspector; the action for it sits at the inspector's bottom.
- **Filters, not sections.** A collection is one grid with tabs that filter it.

---

## 8. Where things live

| Need | Use | File |
|---|---|---|
| A menu screen | `ManagementScreen` + `ScreenHeader` | `src/pages/Club.jsx` |
| The five menu tabs | `SECTIONS` (add a menu here, nowhere else) | `src/pages/Club.jsx` |
| Pack and tape counter | `PackCounter` (pass `value` for a pending total) | `src/pages/Club.jsx` |
| A labelled value row | `LedgerRow` | `src/pages/Club.jsx` |
| A bar readout | `Meter` | `src/pages/Club.jsx` |
| Contract years | `YearPips` | `src/pages/Club.jsx` |
| Fatigue and growth | `PlayerReadout` | `src/pages/Club.jsx` |
| A selectable item | `ItemChoice` + `.inventoryItem[data-item]` | `src/pages/Club.jsx` |
| A player card | `PlayerCard` | `shared/src/components/PlayerCard.jsx` |
| Pack or tape art | `PackArt`, `TapeCard` | `src/pages/Club.jsx` |
| Next-match hero, news line | `Scout`, `LatestMove` | `src/components/club/HubFeed.jsx` |
| What needs attention | `attention(state)` | `src/engine/club/attention.js` |
| First-week tip | `ClubHint` via `withHint` | `src/components/club/ClubHint.jsx` |
| Styles for all of the above | | `src/pages/Club.module.css` |

**Before you write a new component, search this table and `Club.jsx`.** Re-implementing a piece that already exists is the most common mistake.

---

## 9. Responsive

- Check two sizes every time: **1440×900** and **375×812**.
- The phone breakpoint in the club is `max-width: 759px`.
- No horizontal page scroll on a phone: `document.documentElement.scrollWidth` must equal the viewport width.
- The menu tab strip scrolls sideways on its own. Never call `scrollIntoView`; it also scrolls the fixed stage sideways. Set the strip's `scrollLeft` instead.

---

## 10. Before you say you're done

Run these checks and report the results honestly. If one fails, fix it or say it failed.

1. `npm test` passes, including the i18n test.
2. `npx eslint src/pages/Club.jsx src/components/club` is clean.
3. Copy check on your diff:
   ```bash
   git diff | grep -nE " · |—|\b(Tap|Pick|Select|Choose) " 
   ```
   Every hit must be removed or justified (instructions are fine only inside `ClubHint`).
4. Open the screen in the browser at 1440×900 and at 375×812 and look at it.
5. **Test with real content.** An empty save hides problems. If the screen shows items, give the preview save some: in the browser console on the dev server, edit `localStorage['vfl-club-save']` (add `trainingTapes`, `tacticReserve`, `hand`, `evoInventory`). Back it up first and restore it after. To reach the transfer window, play a season in the console with the engine's `finishSeries` from `/src/engine/club/season.js`.
6. **Switch between neighbouring menus and measure.** Record `getBoundingClientRect()` for the header, Back button, tabs and inspector on each screen; the numbers must match.
7. Run `graphify update .` after changing code.

---

## 11. Working with the user

- They review by screenshot. Assume they will compare two screens side by side; small inconsistencies (1px header shifts, a tape 10% bigger on one screen) are bugs to them.
- They want the smallest correct change. Don't redesign what they didn't mention.
- When you suggest changes, show a mid-fidelity mockup before building something large.
- They push to GitHub themselves. Don't commit or push unless asked.
