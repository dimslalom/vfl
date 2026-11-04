# Club reward system: plan

Status: engine built (`src/engine/club/economy.js`, `rewards.js`, `season.js`), tested in `test/clubRewards.test.js`. UI is a greyscale mid-fi awaiting review; the live Club screen only reads pack value and bench slots so far. Written 2026-11-04.

## 1. What the club pays out today

Read from `src/engine/club/season.js` and `src/pages/Club.jsx`.

| Source | Pays | Notes |
| --- | --- | --- |
| Series win | +1 pack | `afterSeries` |
| Year end | +3 packs, +2 more for a title | `YEAR_PACKS`, `TITLE_PACKS` |
| Series played | 10 + 2 per lane won (+10 MVP) XP, prospects x2 | 150 XP = 1 development point |
| Training | 1 session per week | stat +2 (cap 8), skill = 3 sessions, or rest |

Packs are the only currency. They buy renewals and signings (cost 1 to 5 by rating) and refund on release. By my estimate that is 6 to 8 packs a year, which is about one star signing or a few renewals.

Three gaps:

1. **One kind of pack.** Silver, Gold and Icons exist as art and data (`packTypes.js`, `contains`) but the club economy never uses them. Icons are only reachable by reputation (`maxSignableRating`).
2. **Chips have no club source.** `state.hand` is just the last series' cards. There is nothing that earns or stocks chips.
3. **The bench does nothing** (see section 3).

## 2. What the research says

Sources are mostly community guides and forums. I found no developer postmortems and no FIFA Ultimate Team economy data, so treat these as direction, not proof.

- **Keep a deterministic path next to the random one.** Marvel Snap's Token Shop shows one card you don't own and refreshes every 8 hours, as the targeted counterpart to random caches ([naavik](https://naavik.co/digest/marvel-snap-card-acquisition-spotlight-caches/), [guide](https://danielfriedman.substack.com/p/a-comprehensive-guide-to-the-marvel)). Our transfer window is already this. The random side is what is missing.
- **Pity timers cap the worst dry streak.** The gacha literature treats a pity counter as a fixed ratio laid over a variable one, and recommends showing the counter ([DiGRA](https://dl.digra.org/index.php/dl/article/download/2731/2717/2777), [mechanics playbook](https://mechanics-playbook-next.pages.dev/mechanics/variable-reward/)). Retention figures in these sources are unsupported.
- **A fallback that is too stingy backfires.** Pokemon TCG Pocket's Pack Points drew complaints for being restrictive, and long animations drew complaints about time ([OneEsports](https://www.oneesports.gg/gaming/pokemon-tcg-pocket-pity-system-explained/), [Dexerto](https://dexerto.com/gaming/pokemon-tcg-pocket-players-are-fed-up-with-a-time-consuming-feature-3026888)). Every pack tear needs a skip.
- **Conversion caps and sinks stop min-maxing.** Marvel Snap caps daily credit buying and keeps adding sinks ([snap.fan](https://snap.fan/news/why-is-marvel-snap-so-expensive/)). We have no monetisation, so we don't need its scarcity, but we do need sinks so packs don't pile up.
- **Packs as the reward for challenges.** FUT's Squad Building Challenges pay packs, consume the items you submit, and ignore substitutes ([EA help](https://help.ea.com/en/articles/ea-sports-fc/squad-building-challenges/)). That matches our loop of packs in, players out.
- **Daily quests are Hearthstone's main gold source** ([Hearthstone Top Decks](https://www.hearthstonetopdecks.com/how-bad-is-hearthstones-monetization-now-and-what-will-happen-next/)). Our weekly fixture plays that role, so no separate quest layer is needed.

## 3. The bench question

**Does switching players give an advantage today? No.**

- Benched players recover 30 fatigue per series; starters gain 18 (`tickFatigue`).
- Fatigue only costs rating above 60, at 0.04 per point. A starter who plays four series in a row loses about 0.5 rating.
- Fatigue resets to 0 at year end, and the Rest training option clears it too.
- Bench players earn no XP, and club power counts only the first five.

So the only bench value is holding a contract. The research does not rescue this: Football Manager guides use the bench for fatigue rotation and match sharpness, and FUT ignores it. No card game I found gives a bench real value, so ours has to come from our own mechanics.

**Where our bench can matter:** chips pay by role icon (`chipData.js`: Duelist, Initiator, Controller, Sentinel, plus flick, flex, mastermind specialties). Deep Default needs all four roles. A bench player with the missing role is a multiplier you cannot reach otherwise. That is the real reason to switch, and it needs no extra system.

## 4. The plan: one rule

**Each tool gets its own reward currency, and every reward is a pick, not a payout.** Wins earn packs, MVPs earn training, clean play earns chips, milestones earn slots. Nothing is stated in a sentence; each reward shows as a number or icon on the receipt.

### Packs

| Pack | Pool (`contains`) | Signing value | Comes from |
| --- | --- | --- | --- |
| Silver | any | 1 | each series win; 3 per year |
| Gold | gold only | 3 | reaching the playoffs; finalist; pity (below) |
| Icons | icon only | 5 | titles 2, 4, 6...; prestige; pity |
| Event | its own card set | by event | event win or milestone (later) |

- **Open or spend.** A pack can be spent in the market at its value, or torn open for a draft-style pick of 1 from 3 (reuse `draftPack` and `Pack3DTear`). Opening is the random path; the market stays the deterministic one.
- **Pity, shown as a counter.** After 6 silver packs opened with no gold, the next has a guaranteed gold. After 3 titles without an icon, the next title pack is an Icons pack. Counters reset when the rarity lands.
- **Icons come every second title,** a fixed schedule instead of a pity counter (a counter would never trigger). The vault shows the title count to the next one.
- **Icons stay gated.** `maxSignableRating` still applies to signing. An Icons pack is a pick of 3 from the pool the club's reputation can reach, so a tier-0 club can't land a legend by luck.
- **Duplicates don't exist** (each card is unique per club), so a pick you skip refunds into training XP instead of being lost.
- Event packs are one new `PACK_TYPES` entry plus a card-set filter. Nothing else changes.

### Training

- Keep 1 session a week as the floor.
- **A clean sweep earns a second session** the following week (cap 2). Every series has an MVP, so MVP alone would pay out every week.
- **Skill tape** (from passing on a pack, max 3): completes one of the 3 skill sessions. This is Marvel Snap's boosters idea: progress in a different shape.
- Stat cap stays at 8. The stat step stays at 2.

### Skill chips

Chips already exist as the tactic hand: up to 7, two dealt free each map, played on a lane, handed back on a won map and burned on a lost one. So rewards add to that hand instead of a new binder.

- **Win a series, pick 1 of 3 chips** into the hand. A semifinal win guarantees one uncommon or better, a final win guarantees a rare.
- If the hand is full, you drop one held chip to take the new one, or pass.
- **Reroll for 1 pack.** Each reroll is a fresh roll.

### Bench

- **Bench slots as a reward.** The squad stays at 7 (5 + 2). An 8th slot unlocks at tier 2 (International) and a 9th at the second title.
- **Bench XP at 40%** of a starter's gain. Prospects grow twice as fast, so a young player on the bench is a real investment.
- **No swaps during a series.** The lineup is locked when the series starts. The bench earns its value before the match: you choose who starts based on fatigue and the roles your chips need.
- **Make fatigue count.** Raise the penalty from 0.04 to roughly 0.1 per point so a fourth straight series is felt. Tune after playtesting.

### Sinks, so packs don't pile up

Renewals and signings (existing), a second training session bought for 1 pack, a chip reroll for 1 pack, and bench-slot unlocks past the second.

## 5. Build order

1. **Pack tiers and pity.** Extend the `packs` number in the save to a per-type count (needs a `v: 2` migration in `clubSave.js`), pay Gold at playoffs, open flow with skip.
2. **Chip rewards.** Hand-pick UI after a series, a 3-chip binder.
3. **Training extras.** MVP session, skill tape, buyable second session.
4. **Bench.** Bench XP first (one line in `growSquad`), then the fatigue penalty, then slots.
5. **Event packs.** Later, once 1 is stable.

Steps 1 and 4 touch `season.js`; run each through a quick income simulation before shipping.

## 6. Open questions

- **Decided:** packs are both spendable in the market and openable for a pick of 1 from 3.
- **Decided:** no swaps during a series; the lineup is locked at the start.
