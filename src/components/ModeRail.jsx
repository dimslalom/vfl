import { Suspense, lazy, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { m } from 'motion/react';
import GameIcon from './GameIcon';
import { DUR, EASE } from '../../shared/src/lib/motion';
import { t } from '../lib/i18n';
import BrandLogo from './BrandLogo';
import LanguagePicker from './LanguagePicker';
import Sheet from './Sheet';
import styles from './ModeRail.module.css';

// The Broadcast-frame's left edge: a slim icon rail that replaces the top text
// nav on data-forward screens (Library, Multiplayer). Card Table screens (the
// Gauntlet home) keep their own centered chrome, per the wireframe system.

// Loaded when opened: the guide draws real cards, and the rail is on every page.
const HowTo = lazy(() => import('./HowTo'));

const ICON = {
  library: <GameIcon name="library" size={20} />,
  club: <GameIcon name="club" size={20} />,
};

const RAIL = [
  { to: '/club', key: 'club', label: 'Club' },
  { to: '/cards', key: 'library', label: 'Player Library' },
];

export default function ModeRail() {
  const [helpOpen, setHelpOpen] = useState(false);
  return (
    <nav className={styles.rail} aria-label={t('Modes')}>
      <BrandLogo className={styles.mark} />
      <div className={styles.items}>
        {RAIL.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            // The label lives in a span that is visually hidden at the
            // narrowest widths, so the link needs its own accessible name -
            // without it the mobile nav is three unnamed glyphs.
            aria-label={t(item.label)}
            className={({ isActive }) => [styles.item, isActive ? styles.active : ''].join(' ')}
          >
            {/* The tile itself (this anchor) keeps its notched clip-path and
                tap-target size completely static - only the glyph inside
                presses/lifts, so the HUD frame never distorts. An anchor has
                no built-in press feedback the way index.css's global
                `button:active` rule provides for every <button> - this is
                the one place in the app that needs its own. */}
            <m.span
              className={styles.press}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              transition={{ duration: DUR.micro, ease: EASE.out }}
            >
              {ICON[item.key]}
            </m.span>
            <span className={styles.tip} aria-hidden="true">{t(item.label)}</span>
          </NavLink>
        ))}
      </div>
      <button type="button" className={styles.help} aria-label={t('How to play')} onClick={() => setHelpOpen(true)}>
        <GameIcon name="help" size={20} />
        <span className={styles.tip} aria-hidden="true">{t('How to play')}</span>
      </button>
      <Sheet open={helpOpen} onClose={() => setHelpOpen(false)} title={t('How to play')}>
        <Suspense fallback={<p role="status">{t('Loading…')}</p>}><HowTo /></Suspense>
        <div className={styles.helpFoot}>
          <LanguagePicker />
          <Link to="/legal" onClick={() => setHelpOpen(false)}>{t('Legal')}</Link>
        </div>
      </Sheet>
    </nav>
  );
}
