# Chip strategy notes

Status: analysis for the `clubs-chips` med-fi pass. Written 2026-11-04. Sections 1 to 4 describe the chips as they were; section 6 is what the owner approved and what the board now plays.

Sources read: `src/engine/endless/seriesCards.js` (`TACTICS`, `tacticActivation`), `src/engine/board/board.js` (`laneScore`, `tacticMult`, `resolveBoard`), `src/components/BoardSeries.jsx`, `src/table3d/TableStage.js`, `src/engine/club/season.js` (`rollChipOffer`, training), `src/chip3d/chipData.js`.

## 1. What a chip actually does in Club

Club plays every map on the 3-lane board, so the board rules are the only ones that matter here.

- **One chip per map.** Before you lock in, you may drop one chip from your hand on one lane. It cannot move after lock-in. Players can still rotate (1 move, 2 with a Mastermind IGL).
- **It multiplies that lane.** Lane total = player stats + Roles (+20) + Trick (+20) + Team (+15) / Nation (+8) pairs, then `× chip`, then the enemy's Aura (-15 each).
- **The multiplier is clamped to ×1.5 to ×3, in half steps** (`tacticMult`). So *any* chip on *any* lane is at least ×1.5. A chip's condition only decides whether you get more than that.
- **It reads only the players on that lane** (at most 3). The map rule bonus is passed in as 0.
- **Win the map and it comes back; lose it and it burns.** Hand max 7. Each map the IGL tops the hand up to 2 with chips that fit your squad and the map.
- **The opponent plays one too**, picked by `npcTactic` and placed by `bestPlacement`.
- **No counters on the board.** Chips carry a `tag` (tempo / read / structure) and Endless uses it for a +0.8 clash bonus, but `resolveBoard` never reads it. In Club, nothing counters anything.

## 2. Every chip, measured

I enumerated every lane the board allows (1 to 3 players, 4 roles, with or without Flick/Flex/Mastermind: 968 lanes) and ran each chip through the real `tacticMult`.

| Chip | Tier | What really triggers it | Pays |
| --- | --- | --- | --- |
| Pocket Strat | common | nothing | always ×1.5 |
| Hit the Site | common | Duelists on the lane | 1 DLT ×1.5, 2 ×2, 3 ×2.5 |
| Utility Layers | common | a Controller and an Initiator together | ×2.5, else ×1.5 |
| Retake Protocol | common | a Sentinel and a Controller together | ×2.5, else ×1.5 |
| Contact Play | uncommon | Flick players (+0.45 each), Initiators (+0.15) | ×1.5 to ×3 |
| Flood the Gap | uncommon | Flex players (+0.6 each) | 1 Flex ×2, 2 ×2.5, 3 ×3 |
| Deep Default | uncommon | all 4 roles on one lane | **always ×1.5: a lane holds 3, so it can never fire** |
| Second Call | rare | Mastermind players (+1.2 each) | 1 ×2.5, 2 ×3 |
| No Respect | rare | Flick players (+0.8 each) | 1 ×2, 2 ×3 |
| Lock the Map | rare | the map rule bonus | **always ×1.5: the board passes a map bonus of 0** |

Then I simulated 360 boards (6 drafted squads × 5 league rivals × 12 maps, both sides playing well) and counted wins per chip:

| Chip | Win rate |
| --- | --- |
| no chip | 35.0% |
| Pocket, Deep Default, Lock the Map, Contact, Second Call, No Respect | 42.8% (all identical) |
| Flood the Gap | 50.0% |
| Retake Protocol | 54.7% |
| Hit the Site | 58.9% |
| Utility Layers | 66.7% |

## 3. What this means for a player

**The real strategy space today is small but real:**

1. **Put it on your swing lane, not your best lane.** You need 2 of 3 lanes. Multiplying a lane you win anyway adds nothing. Multiplying a lane you lose by a lot rarely saves it. The lane where you are a little behind or a little ahead is where ×1.5 to ×2.5 changes the result.
2. **Build the lane for the chip.** Pair chips (Layers, Retake) are the strongest commons because two specific roles on one lane is easy and pays ×2.5. That also tends to fire the +20 Roles rule if the map asks for those roles.
3. **Don't rotate the chip's players away.** The chip stays where you put it. Moving your Controller off a Layers lane during the rotate drops it to ×1.5.
4. **Skill chips are a training plan.** Flick, Flex and Mastermind are rare at the draft (11, 9 and 4 cards out of 989 non-icon cards), so Contact, Flood, Second Call and No Respect pay only ×1.5 until you teach the skill (3 sessions). Once you do they are the best chips in the game: one Flick player alone on a lane gets their best stat *and* No Respect's ×2.
5. **The bench matters through chips.** A bench player with the missing role or skill is a multiplier you can't reach otherwise (as `club-rewards-plan.md` section 3 says). That only holds for the chips that work.
6. **Losing burns the chip,** so a strong rare is a risk on a map you expect to lose. The IGL refill means you never go below 2.

**What is broken or unclear:**

- **Deep Default and Lock the Map are dead on the board.** They always pay the floor. Lock the Map is a *rare* that equals the common Pocket Strat. The old chip ladder even promised Deep Default ×2.5 for 4 roles, which cannot happen. (Fixed in this pass: the ladder is now computed from the board engine, so it shows ×1.5 and says why.)
- **Rarity does not track power.** The best chip in the simulation is a common (Layers). The three rares are floor-level for a fresh squad.
- **The ×1.5 floor makes most choices invisible.** Six of ten chips play exactly the same for a new club. A new player sees ten symbols and only four of them matter.
- **Tags look like counters but do nothing in Club.** If the UI ever shows tempo / read / structure, it would be promising rock-paper-scissors that the board doesn't play.
- **Hit the Site's first step is fake.** One Duelist pays ×1.5, the same as zero.
- **The face icons don't say what pays.** Pocket shows IGL + Map and Lock the Map shows Lock + Map, but neither reads either.

**My verdict:** as designed, chips are not strategically interesting for the first year of a club. There is one real decision (which lane, and keep the right two roles there), and it is hidden behind ten symbols, four of which mean "×1.5 no matter what".

## 4. Proposals (not built; owner to decide)

Numbers are starting points for a playtest, not tuned.

1. **Fix the dead chips for the board.**
   - Deep Default: "3 different roles on the lane" ×2.5 (a lane holds 3, so this is a full mixed lane).
   - Lock the Map: "if this lane's map rule fires (the +20 Roles), ×2.5". That is what "MAP RULE ×2" was meant to say, and it rewards reading the lane's role rule.
   - Pocket Strat: keep it as the honest ×1.5 "safe" chip, but make it IGL-refill only, never a reward pick.
2. **Make rarity mean something.** Rares should beat the best common when their condition is met *and* be reachable without a rare skill. For example: No Respect also counts a player alone on a lane, not only Flick.
3. **Lower the floor to ×1.25 (or ×1).** Then a chip's condition matters, and "this chip doesn't fit this lane" is a real decision instead of a free ×1.5.
4. **Either bring counters to the board or drop the tags.** Option A: if your chip's tag counters the opponent's, your chip lane gets +20. Option B: remove tags from Club UI and data comments so nothing promises counters.
5. **Show the opponent's chip lane after lock-in.** Then the rotate has a chip-aware answer ("they doubled MID, so concede MID and take A and B").

## 5. What this pass does in the product (no engine changes)

- Each chip shows its name, a one-line effect, and what it pays, computed from the board engine.
- At the moment of choosing (Club chip pick) and placing (the board), a hint reads your real squad: "With your five: up to ×2.5, put supamen and nvrfear on one lane", or "Pays ×1.5 for you: needs a Flick player" for a chip you can't trigger yet.
- Dead chips say so plainly ("Always ×1.5").
- A compact "How chips work" sheet, reachable from the chip pick, the board and the chip codex.
- Two alternatives each for the chip face / legend and the in-game hint, so the owner can pick.

## 6. Board rules now (owner-approved, 2026-11-04)

All in `src/engine/board/board.js` (`tacticMult`, `sideScores`, numbers in `CHIP_TUNING`). Endless is untouched: it still reads `TACTICS` through `tacticActivation`.

| Chip | Tier | Board rule |
| --- | --- | --- |
| Pocket Strat | common | ×2 on the IGL's lane when that lane's role rule (+20 Roles) fires, else ×1.5 |
| Deep Default | uncommon | ×2.5 with three different roles on its lane, else ×1.5 |
| Second Call | rare | ×2 on its lane and a ×1.5 chain to the lane on its left (from the left lane: the middle). Each Mastermind on its lane adds ×0.5 to both |
| No Respect | rare | No multiplier. The enemy's best player on its lane scores 0. A Flick player on its lane also gives it ×1.5 (skill gate as balance) |
| Lock the Map | rare | Cancels the enemy chip wherever it is (it pays ×1). No multiplier of its own |

The other chips are unchanged. Every chip can now do more than the ×1.5 floor.

Win rate over the same 360 boards (fresh squads, no trained skills; the NPC plays its own chip):

| Chip | Before | Now |
| --- | --- | --- |
| no chip | 35% | 34% |
| Pocket Strat | 43% | 72% |
| Deep Default | 43% | 70% |
| Second Call | 43% | 71% |
| No Respect | 43% | 49% (higher once a Flick player is on its lane) |
| Lock the Map | 43% | 69% |
| Utility Layers | 67% | 68% |

Tested and rejected:
- No Respect with ×1.5 plus half the star: 75%, too strong, as the owner suspected.
- Lock the Map with ×1.5 plus the cancel: 79%, it dominated everything.
- Pocket Strat only when the IGL plays a lane alone: 43%, back to useless.

Still open: Pocket Strat (a common) is now among the strongest chips. The lever is `CHIP_TUNING.pocket` or a stricter condition.

Scoring effects (`src/table3d/chipFx.js`):
- **Every player card:** attacks the bar as its number lands (pull back, lunge, impact ring).
- **A multiplier chip:** hops, spins and rings.
- **Second Call:** lightning arcs from the chip to the lane it chains to.
- **No Respect:** its chip fires, then a slash cuts the enemy's best card, which stays dimmed and has its number struck through.
- **Lock the Map:** a lock flies from the lock chip, slams the cancelled chip and shatters it.

The enemy's chip now shows on its lane when scoring starts. A chip on a lane floats over the middle of the score bar, above the multiplier block it adds, and prints what it actually pays.
