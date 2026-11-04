# Club cleanup plan

Club is the main game mode. `/run` (the Gauntlet, `PerfectRun.jsx`) and the original index page (`Landing`, the Gauntlet mode menu rendered inside `/run`) are retired. Only those two were confirmed for removal.

## Routes

| Route | Now |
| --- | --- |
| `/run` | redirects to `/club` (page deleted) |
| `/prematch`, `/match`, `/pack` | redirect to `/club` (previously redirected to `/run`) |
| `/` | unchanged, redirects to `/club` |

## Deleted, and why

`src/pages/PerfectRun.jsx` was the only importer of every file below. A reachability scan from `src/main.jsx` and `worker/index.js`, with PerfectRun cut out, found nothing else that reaches them.

- `src/pages/PerfectRun.jsx`: the `/run` page.
- `src/components/Landing.jsx`: original index page.
- `src/components/Desk.jsx`, `DeskPanels.jsx`, `Impact.jsx`, `MatchBackdrop.jsx`, `PhaseTransition.jsx`, `RunHud.jsx`, `ScoreLines.jsx`, `SigningSequence.jsx`, `TacticReturn.jsx` plus their CSS modules: run UI.
- `src/data/backdrops.js`: used by the run UI only.
- `src/engine/endless/academy.js`, `field.js`, `squadPreview.js`, `src/engine/roundEvents.js`: run engine pieces with no other importer.
- `src/lib/`: `challenge`, `chemLabels`, `deskMoves`, `endlessRunSave`, `flight`, `flightPath`, `format`, `leaderboardClient`, `matchCascade`, `perfectRunSaves`, `rulesSeen`, `scoreBreakdown`, `useSkippableTimeline`.
- Tests: `endless`, `endlessBalance`, `endlessLadder`, `endlessSave`, `endlessSquad`, `flightPath`, `roundEvents`, `seriesResolveParity` removed. `uxLogic` trimmed to the Daily limits and `lobbyTurn`; `interactionDesign` trimmed to the card jitter test.
- i18n: 211 stale keys removed from each of `es.js` and `pt.js`.
- `ModeRail`: Gauntlet entry and icon removed.
- `package.json`: script file lists no longer name deleted files.

## Kept on purpose

- Club, `clubSave`, `engine/club`, PlayerCard, pack, chip and table 3D, i18n, auth and save.
- Labs: ArenaLab, ChipLab, FxLab, PackLab, TableLab.
- `Multiplayer` and `/lobby/:code`, `Collection` (`/cards`), `Legal`, `BoardPrototype`: not confirmed for removal.
- `src/pages/PerfectRun.module.css`: `Multiplayer.jsx` still imports it. It now holds many dead selectors; trim it when Multiplayer is decided.
- `dailyRules.js`, `engine/endless/bonds.js` and the rest of `engine/endless`: the Worker or Multiplayer import them.
- Worker leaderboard, daily and challenge endpoints: untouched (no Worker or D1 changes). They have no client left now that `leaderboardClient` is gone.
- `Match.jsx`, `PreMatch.jsx`, `PackOpening.jsx`: already unrouted and unimported before this change, so dead, but not in the confirmed list. Safe to delete if the owner agrees.
- `docs/animation-audit/*` still mentions deleted files (historical audit).

## Open questions for the owner

1. Multiplayer, Daily/challenge Worker endpoints, bingo/fantasy leftovers, Legal: remove or keep?
2. Club's "Other modes" button now goes to `/multiplayer` (it went to `/run`). Replace once the landing page work lands.
3. The Legal page still says "Gauntlet".

## Update: Multiplayer and unrouted pages removed (owner approved)

- `/multiplayer` and `/lobby/:code` redirect to `/club`. Deleted `Multiplayer.jsx`, its CSS, `PerfectRun.module.css`, `hub.module.css`, and the lobby/squad/pack/receipt components and libs only it used (`LobbySeriesPrep`, `OverviewRow`, `PackRip`, `RunReceipt`, `SquadBar`, `SquadSheet`, `CardReveal`, `bracketFlight`, `lobbyTurn`, `multiplayerClient`, `scrollPhysics`, `shareImage`, `squadSheetPreview`, `useDeadline`, `useScrollLean`) and their tests.
- Deleted the already unrouted `Match`, `PreMatch` and `PackOpening` pages.
- Club's "Other modes" buttons and the rail's Multiplayer entry are removed.
- Left: `worker/index.js` and `src/engine/multiplayer.js` (the Worker imports it; removing the lobby Durable Object needs a Wrangler migration, so it is out of scope here), plus their tests.
- Also left (pre-existing orphans, not touched): `DeckBuilder`, `MapCanvas`.
