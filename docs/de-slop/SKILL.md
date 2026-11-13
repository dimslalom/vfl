---
name: de-slop
description: Audit and fix UI that reads as AI-made. Use before shipping any screen, when a design is called "too AI", generic, cluttered or inconsistent, or when asked to de-slop, clean up or tighten a UI. Covers copy, hierarchy, colour, surfaces, type, layout, consistency, motion, states and overlays, with a check for each rule.
---

# De-slop

AI-made UI is rarely wrong in one place. It is a pile of small defaults: every
surface boxed, every fact explained, every element given a little glow, the
same idea drawn three ways. This skill removes the defaults. It doesn't
impose a style: apply it inside whatever design system the project has, and
where the project has none, write one down first (step 1).

Pairs with a generic tells checklist (purple gradients, Inter everywhere,
stock imagery). That list catches the obvious. This one catches what is left
after it.

## How to run it

1. **Find the system.** Read the project's design doc and tokens. If there
   is none, write five lines before touching anything: the one accent colour,
   the surface steps, the type families and sizes, the corner language, the
   spacing scale. Every fix below is "use the system", and it needs one.
2. **Audit.** Walk each section below against the screen. For each hit, note
   the element, the rule and the fix. Use the checks, not taste.
3. **Fix the property, not the element.** If something looks wrong, change
   the radius, spacing, colour or position that is wrong. Never delete an
   element the owner didn't ask you to delete; if removal seems better, ask.
4. **Verify.** Run the checks at the end, at desktop and phone width, with
   real content.

---

## 1. Copy

- **Show, don't tell.** If a state, mark, number or position already says it,
  delete the sentence. *Check:* cover the text; can you still tell what's
  going on? Then the text goes.
- **A readout is never a sentence.** Progress is pips, a comparison is a bar
  with a number at each end, a delta sits on the thing it changed, coloured.
  "You have 3 of 5 slots filled" is three pips.
- **One fact per element.** No run-on fact strings ("12:00 Bo3 Group Stage")
  and no joining characters ("Week 1 · Bo3", "A / B / C" used as layout).
  Each fact gets its own slot and its own type style.
- **Say it once.** Label, sublabel, helper text and tooltip saying the same
  thing is four elements doing one job. The same fact twice on one screen
  (in a header and in a tile) is a bug.
- **Same thing, same word, everywhere.** The tab, the tile and the screen
  title use one name. Synonyms read as different things.
- **Instructions belong in onboarding only.** "Tap...", "Pick...",
  "Select..." in standing UI means the UI isn't saying it. Teach once, in a
  first-run tip pointed at the control, then get out of the way.
- **Buttons are verb + object, fixed.** "Sign Ana", "Use tape". Don't build a
  label from state ("Rotate and go" / "Go without rotating"): one label per
  action, so the button never changes width or meaning.
- **Sentence case** for headings, buttons and labels ("Free agents", not
  "Free Agents"). Uppercase is a signal, so spend it on one job (see 4).
- **No em dashes, no aphorisms, no triads.** "Call it. Track it. Win it." is
  the clearest AI cadence there is.

## 2. Hierarchy and colour

- **One accent, one job.** The accent marks the single primary or active
  thing on the screen. If two elements want it, one is wrong. *Check:*
  count accent-coloured elements per screen; the answer is one.
- **One hero per screen.** The thing the user most likely wants next is the
  biggest element and holds the only primary button.
- **Every colour means one thing.** Write the table: colour, meaning, used
  for, never used for. A "success" green that is also a decorative stripe
  means nothing.
- **Status colours are not accents.** Win/good, opponent, rare: each is a
  signal confined to its job, never a second brand colour.
- **On-fill text is chosen, not assumed.** Light fills (gold, yellow, mint)
  need dark text; check contrast instead of defaulting to white.
- **Two text levels per area.** One bold heading, then muted body. Nothing
  in between, no sub-sub-headings.

## 3. Surfaces, depth and shape

- **No boxes in boxes.** Split a panel with spacing or hairline rows, never
  a nested bordered card. *Check:* trace any element up to the page; more
  than one bordered or filled ancestor is a nest.
- **A hairline must do structural work** (a strip edge, a table rule, a
  connector that carries data). Decorative dividers go.
- **A small, named set of surfaces.** Ground, surface, raised, inset. A new
  hand-mixed gray (`color-mix`, a one-off hex) is a bug: that is how a
  project ends up with sixteen slightly different grays.
- **No glow.** No blurred shadow, radial gradient or drop-shadow for
  ambience. If depth is needed, pick one model (flat layering, hard offset,
  or physical objects only) and allow named exceptions, each with a reason.
  An exception is never reused as a panel decoration.
- **One soft shadow, if any:** for true overlays that must separate from the
  whole page. Panels and text never cast one.
- **Corners by role, not taste.** Decide which things get which corner
  (containers square, controls cut or rounded) and never mix inside a role.
  Nested rounded corners must be concentric: inner radius = outer radius
  minus the gap.
- **Round only for round things.** Circles and pills where the object is
  round (a chip, a pip, an avatar), not as a default control shape.
- **Behind the hero object, nothing.** If the product has a signature
  object (a card, a photo, a chart), it's the brightest thing, with no frame
  or panel behind it.

## 4. Type

- **Each family carries a meaning.** For example, sans for prose and
  values, mono uppercase for structural labels only ("BENCH 0 / 2"). Names,
  sentences and body copy are never uppercase, or the signal flattens.
- **A closed size ramp.** Every size has a named job, steps at least 1.25x
  apart. If something needs a size between two steps, the element is wrong,
  not the ramp. The smallest step is for the densest chips only, never for
  fitting more in at desktop width.
- **Tabular numerals** on every number that can change, so digits don't
  jitter as they update.
- **A number gets its own slot** with its own style, not inline in a
  sentence.

## 5. Layout and consistency

- **One spacing scale** (4pt or 8pt). No arbitrary gaps. Rhythm comes from
  choosing different steps, not from new values.
- **Nothing shared moves.** Switching between sibling screens must not move
  the back button, tabs, header height or first heading by a pixel. *Check:*
  record `getBoundingClientRect()` for shared chrome on each screen; the
  numbers match. Never mark the active tab by changing its size or weight:
  that shifts every tab after it.
- **Same object, same size and markup** on every screen it appears on. Sizes
  come from one shared helper, never a new scale number per screen.
- **Same action, same place.** The primary action has one home (say, bottom
  left of the inspector) on every screen. Only its label changes.
- **Equal choices are equal buttons.** Parallel options share one size;
  colour alone marks the main one.
- **Filters, not sections.** A collection is one grid with tabs that filter
  it, not one row per type.
- **Search before building.** Re-implementing a component that exists a few
  files over is the most common slop. Keep a "where things live" table.
- **Mode switches swap slots, not layouts.** Keep both faces rendered in the
  shared slots with the inactive one hidden and inert, so switching moves
  nothing else.

## 6. Motion

- **Motion shows state** the user needs to see (something lifted, opened,
  scored). If it's only decoration, delete it.
- **Animate `transform` and `opacity` only.** A filling bar scales; it never
  animates width.
- **Every animation has a reduced-motion version** that shows the same end
  state without moving.
- **Physics for physical objects only.** Springs and tilt on the one object
  that is a thing (a card), never on buttons and panels.
- **Tune with one constant.** Playback speed is one number; never retime
  single steps to fix pacing.

## 7. States and interaction

- **Every control has hover, press, focus and disabled** from one global
  base, so a new button is correct before anyone styles it. Touch has no
  hover: press feedback is the only feedback a finger gets.
- **Busy is not disabled.** Waiting on the network sets `aria-busy` and
  ignores repeat presses; disabled means "can't". Guard the handler, not
  just the style.
- **Hide what can never happen.** A button for an impossible action ("Open
  pack" with zero packs) goes away instead of showing "None left".
- **Size floors:** 44px for primary controls, 28px only inside an
  already-large target. Text fields 16px or larger on touch screens, or iOS
  zooms the page.
- **Every drag that changes state has a keyboard path.**
- **Loading, empty and error states each offer a way forward**, never a dead
  end.
- **Preview uses the real calculation.** A number shown before a choice
  comes from the same function as the result, so they can't disagree.

## 8. Overlays

- **One modal primitive** with shared focus, Esc, outside press and focus
  return. Never hand-roll Esc listeners per component; stacked layers then
  close together.
- **Esc closes only the top layer.** A page-level "Esc = back" checks
  whether an overlay already took the key.
- **One popup style per kind.** Piece details always use the same popup;
  never add a second style, a top banner or a modal for the same job.
- **Tips point at their control** and dock somewhere sensible when it's
  gone. One main button and a quiet "turn off" link, nothing more.

## 9. Borrowing

- **Take the behaviour, not the visuals.** When copying a pattern from
  another product, keep what it does and redraw it in this system. If the
  idea only works with the other product's look, it doesn't come across.

---

## Checks before you call it done

Report each honestly. A failed check gets fixed or named, never skipped.

1. **Copy grep** on the diff. Every hit is removed or justified:
   ```bash
   git diff -U0 | grep -nE " · |—|\b(Tap|Pick|Select|Choose|Click) "
   ```
2. **Accent count:** one primary or active accent element per screen.
3. **Stray values:** no new hex colours, pixel gaps or font sizes outside the
   tokens:
   ```bash
   git diff -U0 | grep -nE "^\+.*(#[0-9a-fA-F]{3,8}\b|[0-9]+px|color-mix)"
   ```
4. **Nesting:** no bordered or filled box inside another.
5. **Two widths:** look at 1440x900 and 375x812. At phone width,
   `document.documentElement.scrollWidth` equals the viewport width.
6. **Real content:** fill the screen with realistic data (long names, many
   items, empty lists). Empty states hide most problems.
7. **Sibling screens:** switch between neighbours and compare the shared
   chrome's rects; nothing moves.
8. **Reduced motion:** turn it on; every state is still visible.
9. **Keyboard:** Tab through it. Focus is visible, overlays trap and return
   focus, Esc closes one layer.
