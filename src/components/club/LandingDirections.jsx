import PlayerCard from '../../../shared/src/components/PlayerCard';
import { assetPath } from '../../../shared/src/lib/utils';
import { TIER_META } from '../../engine/endless/ladder';
import club from '../../pages/Club.module.css';
import styles from './ClubEntry.module.css';
import lab from './LandingDirections.module.css';
import { DEFAULT_MAP, SHOWCASE, clubSummary } from './clubSummary';

// Alternative landing directions for /lab/landing. Med-fi and English only:
// whichever is picked gets translated then. Direction A is ClubLanding itself.

function Shell({ title, map = DEFAULT_MAP, children, foot }) {
  return (
    <div className={club.stage}>
      <header className={club.hud}>
        <div className={club.plate}>
          <span className={club.crest} aria-hidden="true" />
          <div className={club.titleBlock}><b>{title}</b></div>
        </div>
      </header>
      <main className={club.ground} style={{ '--map': `url(${assetPath(map)})` }}>{children}</main>
      <footer className={styles.foot}>{foot}</footer>
    </div>
  );
}

const Links = () => (
  <nav className={styles.links} aria-label="More">
    <button type="button" className={styles.link}>How it plays</button>
    <button type="button" className={styles.link}>Settings</button>
    <button type="button" className={styles.link}>Other modes</button>
  </nav>
);

// ── B. Season road ──────────────────────────────────────────────────────────
// The year itself is the hero: five weeks, playoffs, the window, then up or
// down. It teaches the loop on the landing, so the primer can be shorter.
export function RoadLanding({ state }) {
  const summary = clubSummary(state);
  const week = state && state.phase === 'league' ? state.week : -1;
  const results = state?.results ?? [];
  const cells = [
    ...[1, 2, 3, 4, 5].map(n => ({ key: `w${n}`, top: `Week ${n}`, main: n - 1 < results.length ? (results[n - 1].won ? 'Won' : 'Lost') : 'Bo3', won: results[n - 1]?.won, lost: results[n - 1] && !results[n - 1].won, now: n - 1 === week })),
    { key: 'po', top: 'Playoffs', main: 'Top 4' },
    { key: 'win', top: 'Window', main: 'Sign' },
    { key: 'next', top: 'Year end', main: 'Up / down' },
  ];
  return (
    <Shell
      title={summary ? summary.name : 'Clubs'}
      foot={(
        <>
          <Links />
          <div className={styles.go}>
            <p className={styles.note}>{summary?.match ? `${summary.match.stage} · ${summary.match.rival}` : 'No login. Saved on this device.'}</p>
            <button type="button" className={club.primary}>{summary ? 'Continue' : 'Create your club'}</button>
          </div>
        </>
      )}
    >
      <div className={`${styles.intro} ${lab.roadIntro}`}>
        <span className={styles.kicker}>{summary ? `Year ${summary.year} · ${summary.tier}` : 'One year in Clubs'}</span>
        <h1 className={styles.headline}>{summary ? 'Your year' : 'Eight stops a year'}</h1>
      </div>
      <ol className={lab.road}>
        {cells.map(cell => (
          <li key={cell.key} data-now={cell.now || undefined} data-won={cell.won || undefined} data-lost={cell.lost || undefined}>
            <small>{cell.top}</small><b>{cell.main}</b>
          </li>
        ))}
      </ol>
      <p className={styles.lead}>Play a best-of-3 each week. Train and open packs between matches. Make the final to go up a tier.</p>
    </Shell>
  );
}

// ── C. Pack first ───────────────────────────────────────────────────────────
// The founding pack is the button. Almost no words: the object says "open me".
// A returning player gets their five, face up, and Continue.
export function PackLanding({ state }) {
  const summary = clubSummary(state);
  return (
    <Shell
      title={summary ? summary.name : 'Clubs'}
      foot={(
        <>
          <Links />
          <div className={styles.go}>
            <p className={styles.note}>{summary ? `${summary.tier} · Year ${summary.year}` : 'Five packs. Keep one player from each.'}</p>
            {summary && <button type="button" className={club.primary}>Continue</button>}
          </div>
        </>
      )}
    >
      <div className={lab.packHero}>
        {summary ? (
          <div className={lab.packFive}>
            <div className={styles.cardRow}>
              {summary.starters.map(card => <PlayerCard key={card.id} card={card} displayScale={0.34} tilt={false} canDrag={false} />)}
            </div>
          </div>
        ) : (
          <button type="button" className={lab.packButton} aria-label="Open your first pack and create your club">
            <img src={assetPath('/assets/pack3d/pack-icon.webp')} alt="" draggable={false} />
            <span>Tap to create your club</span>
          </button>
        )}
      </div>
    </Shell>
  );
}

// ── D. Ladder ───────────────────────────────────────────────────────────────
// The ambition is the hero: three tiers, International at the top, and your club
// on its rung. Leads with where you could go rather than what you do each week.
export function LadderLanding({ state }) {
  const summary = clubSummary(state);
  const here = summary ? summary.tierIndex : 0;
  return (
    <Shell
      title={summary ? summary.name : 'Clubs'}
      foot={(
        <>
          <Links />
          <div className={styles.go}>
            <p className={styles.note}>No login. Saved on this device.</p>
            <button type="button" className={club.primary}>{summary ? 'Continue' : 'Create your club'}</button>
          </div>
        </>
      )}
    >
      <div className={lab.ladderSplit}>
        <div className={`${styles.intro} ${lab.ladderCopy}`}>
          <span className={styles.kicker}>{summary ? `Year ${summary.year}` : 'Club mode'}</span>
          <h1 className={styles.headline}>{summary ? `${summary.tier}` : 'From Challengers to International'}</h1>
          <p className={styles.lead}>Each year, reach the final to climb. Finish last and you drop. Finish last twice at the bottom and you're sacked.</p>
        </div>
        <ol className={lab.rungs}>
          {[...TIER_META].map((tier, index) => ({ tier, index })).reverse().map(({ tier, index }) => (
            <li key={tier.key} data-here={index === here || undefined} data-above={index > here || undefined}>
              <b>{tier.label}</b>
              {index === here && (
                <span className={lab.rungClub}>
                  {(summary ? summary.starters : SHOWCASE).slice(0, 3).map(card => <PlayerCard key={card.id} card={card} displayScale={0.12} tilt={false} canDrag={false} />)}
                  <small>{summary ? 'You' : 'You start here'}</small>
                </span>
              )}
            </li>
          ))}
        </ol>
      </div>
    </Shell>
  );
}
