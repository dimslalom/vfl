---
trigger: always_on
---

# UI design rules (always on)

Before you change anything a player can see, read `docs/ui-rules.md` (the grammar and checklist) and `DESIGN.md` (the tokens). Follow them exactly. If you think a rule is wrong, ask the user instead of breaking it.

These are the rules agents break most often. They apply to every UI change:

1. **No ` · ` between facts, and no em dashes (—)** anywhere: UI, comments, commits or replies.
2. **Show, don't tell.** Don't add a sentence that explains what the UI already shows. Only first-week tips (`ClubHint`) may give instructions.
3. **Say each fact once per screen.**
4. **No gradients, glows, rounded rectangles, coloured side borders, nested boxes, emoji or native `<select>`.**
5. **Tokens only.** Use `--fs-*` and colour tokens from `DESIGN.md`; never write a literal font size or colour.
6. **Reuse the club pieces in `src/pages/Club.jsx`:** `ManagementScreen`, `ScreenHeader`, `ItemChoice`, `LedgerRow`, `Meter`, `YearPips`, `PlayerReadout`, `PackCounter`. Use the shared sizes `tapeItemScale`, `itemArtSize` and `SPOTLIGHT_SCALE`; never write a new scale number for an item.
7. **Consistency across screens is a hard requirement.** Switching menus must not move the header, tabs or inspector by even 1px, and the same object must render at the same size on every screen.
8. **Red (`--accent`) is the one main action or danger. Green (`--win`) is now, good or selected.** Use one accent per screen.
9. **Every player-facing string goes through `t()`,** with Spanish and Portuguese added in `src/i18n/`.
10. **Fix, don't remove.** When the user reports a flaw, change the wrong property; never delete the element unasked.
11. **Before finishing:** run `npm test` and lint, check the screen at 1440×900 and 375×812, test with a save that has real items, and run the checklist in `docs/ui-rules.md` section 10.
