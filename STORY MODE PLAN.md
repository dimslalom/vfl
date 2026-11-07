# Story mode plan

Status: built across all six phases.

## 1. Goal

A second squad on the landing page, the Story squad. Same gameplay as Club mode (cards, board, evo chips, fatigue, six-club league, transfer window), but results, transfers and poaching change the story. New story content can ship later and apply to existing Story saves.

## 2. Research findings

Sources are named from search summaries. Search returned redirect links, not direct URLs, so check each before quoting it.

| Source | Takeaway |
|---|---|
| Greg Kasavin, Supergiant Games, *Pyre* (Game Developer write-ups, GDC) | Fail forward. Losing a match never ends the game. The story absorbs the loss and rivals and allies remember it. |
| Emily Short (emshort.blog), Failbetter Games (*Fallen London*), Jon Ingold | Quality-based narrative and storylets. Small story units with prerequisites and effects, chosen from game state. Avoids branching trees that break. |
| Henrik Fahraeus, "Emergent Stories in Crusader Kings II" (GDC) | Systems plus memory make drama. The game recalls past events and brings them back at the right time. |
| Peter Garcin, "Narrative Generators: Sports Games and Story Engines" (GDC) | Sports sims generate stories. The writer's job is to surface what the simulation already produced. |
| Worldwalker Games, *Wildermyth* (GDC) | Hand-written vignettes cast onto procedural characters give personal legacy stories. |
| *King of Dragon Pass*, *Six Ages* (cited by Short and Failbetter) | Storylet decks work in management sims. |
| r/footballmanagergames threads on emergent stories, transfers, board overrides | The best stories are rivalries from poaching, a board selling your star, and revenge signings. Complaint: the game stores the drama but rarely tells it back. Media and press text feels amnesiac. |
| r/EASportsFC and r/FifaCareers threads on *The Journey* | Railroading and "illusion of choice" were the main criticisms. Forced injuries, loans and cosmetic dialogue made performance feel meaningless. Repetitive unskippable cutscenes get skipped. |
| *Esports Godfather*, *Teamfight Manager* (Reddit, Steam) | Esports tropes that land: role friction, veteran burnout, rookies, meta shifts, tier promotion pressure. |

### Rules taken from the research

1. Fail forward. A loss or relegation changes the chapter, never ends the save.
2. Story reacts to results. No scripted outcome that ignores how the player did.
3. Storylets with prerequisites and effects, not a branching tree.
4. Memory. Remember who left, where they went, and who beat you.
5. Short, skippable scenes. Cutscenes only at milestones.
6. Choices must change something real (packs, reputation, fatigue, rosters).

## 3. Squad switcher (landing page)

Built in [ClubLanding.jsx](src/components/club/ClubLanding.jsx) and [ClubEntry.module.css](src/components/club/ClubEntry.module.css).

- Two plates above the headline: Club squad (active, ink text, green underline) and Story squad (muted, greyed, "Coming soon", not focusable, does nothing).
- Translations added in `src/i18n/es.js` and `src/i18n/pt.js`.

### To finish when Story ships

- Make Story squad selectable. Selecting it swaps the landing content to the story save (cards, chapter, Play or Resume).
- Left and right arrow keys and swipe on phones.
- Save slots in [clubSave.js](src/lib/clubSave.js): keep `vfl-club-save` as the club slot, add `vfl-story-save`. Export `loadClubSlot`, `saveClubSlot`, `clearClubSlot`. Existing saves load unchanged as the club slot.
- Show a "new storyline" pip on the Story plate when unseen content is queued (use the existing green `club.pip`).
- Cloud sync ([ClubSyncChoice](src/pages/Club.jsx)) must handle two slots.

## 4. Story structure

### Origin campaign (years 1 to 3)

Three acts that match the three tiers.

- Act I, Challengers: a scrappy roster, rival org Apex Protocol. Climax is the promotion series.
- Act II, Ascension: other orgs scout your breakout players, poach offers arrive. Rival org Vanguard Esports.
- Act III, Champions: face former teammates who left earlier.

At the end of year 3 (or the Champions final) the game writes an Era Chronicle from four axes.

| Axis | Tracks | Outcomes |
|---|---|---|
| Competitive result | Titles, final tier, playoff record | Champions, contenders, fighting relegation |
| Club identity | Homegrown loyalty vs mercenary signings | Local heroes vs corporate machine |
| Transfer legacy | Original starters kept vs sold | Golden generation intact vs scattered |
| Locker room | Trust vs pressure choices | Player-first haven vs cutthroat powerhouse |

Example endings: The Cinderella Dynasty, The Mercenary Empire, The Cult Underdog.

### Unending dynasty eras (year 4 onward)

No hard stop. Each season the director picks an era from the state.

| Era | Trigger | Focus |
|---|---|---|
| Dynasty | Champions, or two top-two finishes | Expectations, buyout bids, ego clashes |
| Rebuild | Two or more starters expiring or declining | Veteran vs trialist, passing a trait on |
| Nemesis | Ex-star poached by a league rival | Rivalry matches, tunnel confrontations |
| Redemption | Relegation | Board ultimatum, rebuild trust, earn promotion back |

### Story memory (`storyLedger`)

- Ex-players: card id, seasons with you, departure reason (sold, poach accepted, contract ended), current org.
- Rivalries: win/loss record per org. Three straight losses to one org marks it a bogey team.
- Hall of fame: players with 3+ seasons or a title are recorded permanently and can be referenced in later scenes.
- Stored as flat ids and years, so saves stay small.

## 5. How results and transfers drive the story

| Event | Story effect |
|---|---|
| Sweep win | Hype storylet, small ego risk on the star |
| 1 to 2 loss | Recovery scene, choose VOD review (XP) or morale talk (trust) |
| Missed promotion | Act adapts to "gritty rebuild", never a restart |
| Poach offer | Hold (reputation cost) or let go (packs). Letting go records an ex-player and a destination org. |
| Facing an ex-player | Rivalry match, tunnel scene, bonus reputation for a win |
| Benched veteran 3+ weeks | Ultimatum scene |
| Evo chip breakthrough on a low-rated card | Rookie interview, market value rises |

The engine already has the hooks. `rollPoachOffer`, `holdCost` and `releaseFee` are in [market.js](src/engine/endless/market.js). `windowOffers` and `closeTheWindow` handle the transfer window in [season.js](src/engine/club/season.js). `finishSeries` handles results.

## 6. Dialogue and cutscenes

Three tiers, kept short.

1. **Milestone cutscenes.** Opening, act transitions, promotion, finals, relegation. 2D animatic frames over map art, under 10 seconds, always skippable.
2. **Dialogue vignettes.** Pre-match briefing, poach ultimatum, post-match press, ex-player grudge. Two or three replies, each with a real effect: supportive (trust, recovery), demanding (XP, pressure), defiant (reputation, hype).
3. **In-match banter.** One-line callouts above player cards at overtime, an ex-player ace, a chip breakthrough. Never pauses play.

Dialogue UI follows [docs/ui-rules.md](docs/ui-rules.md): bottom plate over the active stage, existing card art and club crests as portraits, tokens only, no nested boxes, one red action. Keyboard 1 to 3 for replies, Enter to advance. All strings through `t()` with Spanish and Portuguese.

Example, poach confrontation:

- Leo (rating 84, one contract year) says Apex Protocol offered him a starting spot.
- Reply 1: match their offer. Costs reputation, Leo gains mentality.
- Reply 2: let him go. Gain 3 packs, Leo becomes a Nemesis in Act II.

## 7. Live updates: story packs

New storylines ship as one file and apply to existing Story squads on next open.

```
src/engine/story/
  storyDirector.js     finds storylines that can start for this save
  storyMemory.js       completed ids, ledger, flags
  storylines/
    originCampaign.js
    crisisFinancial.js
    crisisScandal.js
    tourInvitational.js
```

### Storyline format

```js
export const financialCrisisStoryline = {
  id: 'crisis_financial_2026',
  version: 1,
  canTrigger: (club, memory) =>
    !memory.completed.includes('crisis_financial_2026') && club.year >= 2,
  cast: (club, cards) => ({
    talisman: highestRated(club, cards),
    rival: topRival(club),
    debt: Math.max(3, Math.round(packValue(club) * 0.5)),
  }),
  beats: [ /* speaker, text key, choices with effects */ ],
};
```

### Rules for writing a story pack

- Never hardcode card ids or names. Write for roles ("the talisman", "the high earner", "the academy hope") and cast the real squad into them.
- Scale stakes to tier. A debt is 2 packs in Challengers, 6 in Champions.
- Trigger at a natural breakpoint (app open for macro events, otherwise next match week or transfer window), never mid-series.
- Guard every pack with `canTrigger` and a completed id so it fires once.
- Old saves never break. A pack that does not apply is skipped.

### Example: sponsor pulls out

Board needs packs before Week 4 or a contracted starter must go.

1. Fire sale: sell the talisman to the top rival for packs. The talisman becomes a nemesis.
2. Cut overhead: keep everyone, +1 fatigue for the next three matches.
3. Crowdfund: spend reputation (needs the minimum), no roster loss.

Rich clubs are not forced into option 1. Broke clubs feel the squeeze.

## 8. Phases

1. **Switcher (done).** Selectable Club squad and Story squad plates with keyboard and touch switching.
2. **Slots and selection (done).** Separate `vfl-club-save` and `vfl-story-save` slots in [clubSave.js](src/lib/clubSave.js).
3. **Story engine (done).** Director, memory, storylet evaluation, and hooks in [storyDirector.js](src/engine/story/storyDirector.js) and [storyMemory.js](src/engine/story/storyMemory.js).
4. **Act I (done).** Opening cutscene, briefings, poach dilemmas, debriefs, and dialogue UI in [StoryViews.jsx](src/components/club/StoryViews.jsx).
5. **Acts II and III, chronicle, dynasty eras (done).** Full campaign acts, four-axis Era Chronicle, and unending Dynasty Eras in [originCampaign.js](src/engine/story/storylines/originCampaign.js).
6. **Live packs (done).** Financial crisis ([crisisFinancial.js](src/engine/story/storylines/crisisFinancial.js)), leaked VOD scandal ([crisisScandal.js](src/engine/story/storylines/crisisScandal.js)), and mid-season showmatch ([tourInvitational.js](src/engine/story/storylines/tourInvitational.js)).

Each phase: `npm test`, `npx eslint` on touched files, check 1440x900 and 375x812, add es and pt strings.

## 9. Risks and open questions

- Writing volume. Mitigate with role-casting and short vignettes.
- Railroading. Never force a result. Stories react, they do not decide.
- Cutscene fatigue. Milestones only, always skippable.
- Does the Story squad share packs or reputation with the Club squad? Recommended: fully separate saves.
- Should story choices cost real-money-free resources only (packs, reputation, fatigue)? Recommended: yes.
- Version handling for storylines edited after players started them (`version` field, migrate or finish on the old version).

## 10. Illustrated reels (built)

Story beats with rendered art play as a reel instead of the portrait dialogue. Portraits stay in dialogue scenes.

- A scene opts in with `reel: [{ art, cam, speaker, line }]` and an `art` on each choice. `StoryDialogue` in [StoryViews.jsx](src/components/club/StoryViews.jsx) hands those to `StoryReel`; scenes without `reel` are unchanged.
- Art is pre-rendered by Blender: `tools/blender/human.py -- out.png <scene>` (MPFB people, modelled sets), then `tools/blender/frames.py` applies the duotone and writes `public/assets/story/<scene>.webp`.
- Scenes are cast by role, so the art is generic silhouettes; names, rivals and numbers live in the captions and choices.
- Scenes so far: arena, board, corridor, sell, cut, crowd (used by the financial crisis pack). A new location is one new `scene_*` function.
- Next: opening and act-transition reels, per-rival colour variants.

## 11. Story text rework (built)

- **In-match barks** ([barks.js](src/engine/story/barks.js)): one line, no clicking, fades after about 4s. Rules from `buildBoardComms` are matched against board facts (round start or end, decider, facing elimination, levelled, sweep); the highest-scoring match wins, then cools down for 12 picks. Nemesis and bogey-team lines outrank everything. No match means silence.
- **Portrait dialogue**: one speaker portrait, their line, replies as title plus gain and cost signals. Confirm plays your line as its own beat before the choice applies.
- **HUD**: Trust and Pressure have meters with a notch where they start to matter, and the header previews the picked choice's change before you commit.
- **Milestone cutscenes** are reels: art per frame in `MILESTONE_ART` (originCampaign.js), scenes cafe, locker, walk, stage, press, trophy, lift, empty.
- **Results**: the post-match line is a pull quote and only appears for story memory (evo breakthrough, nemesis, a broken losing streak).
- **Era Chronicle**: a magazine-cover layout over the season's last image, each axis with one fact from the save.
