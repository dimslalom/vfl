import { useState } from 'react';
import { assetPath } from '../../../shared/src/lib/utils';
import { signInHref } from '../../lib/account';
import { t } from '../../lib/i18n';
import { resetHints } from '../../lib/clubOnboarding';
import LanguagePicker from '../LanguagePicker';
import MusicControls from '../MusicControls';
import AmbientControls from '../AmbientControls';
import club from '../../pages/Club.module.css';
import styles from './ClubEntry.module.css';
import { DEFAULT_MAP } from './clubSummary';

function Toggle({ on, label, onChange }) {
  return (
    <button type="button" className={`${club.small} ${styles.toggle}`} data-on={on || undefined} aria-pressed={on} aria-label={label} onClick={() => onChange(!on)}>
      {on ? t('On') : t('Off')}
    </button>
  );
}

// The account rows, shown only when the account service answers. Deleting arms
// on the first tap and fires on the second, like abandoning a club.
function AccountRows({ account, onSignOut, onDeleteAccount }) {
  const [armed, setArmed] = useState(false);
  if (account?.status === 'signedOut') {
    return (
      <>
        <li className={styles.groupHead}>{t('Account')}</li>
        <li>
          <span><b>{t('Discord')}</b><small>{t('Optional. Saves your club to your account so it follows you to any device.')}</small></span>
          <a className={styles.signin} href={signInHref('/club')}>{t('Sign in')}</a>
        </li>
      </>
    );
  }
  if (account?.status !== 'signedIn') return null;
  return (
    <>
      <li className={styles.groupHead}>{t('Account')}</li>
      <li>
        <span className={styles.account}>
          {account.user.avatar && <img src={account.user.avatar} alt="" />}
          <span><b>{account.user.name}</b><small>{t('Signed in with Discord. Your club saves to your account.')}</small></span>
        </span>
        <button type="button" className={club.small} onClick={onSignOut}>{t('Sign out')}</button>
      </li>
      <li>
        <span><b>{t('Delete account')}</b><small>{t('Deletes your account and the club saved on it. This device keeps its copy.')}</small></span>
        <button type="button" className={club.small} data-armed={armed || undefined} onBlur={() => setArmed(false)} onClick={() => (armed ? onDeleteAccount() : setArmed(true))}>
          {armed ? t('Tap again to delete') : t('Delete')}
        </button>
      </li>
    </>
  );
}

// Club settings: account, onboarding switches, language, and a plain line on
// where the save lives. Rows are flat plates in one list, no boxes inside boxes.
export default function ClubSettings({ prefs, onChange, onBack, onPrimer, account, onSignOut, onDeleteAccount }) {
  const [reset, setReset] = useState(false);
  return (
    <div className={club.stage}>
      <header className={club.hud}>
        <div className={club.plate}>
          <button type="button" className={club.iconButton} aria-label={t('Back')} onClick={onBack}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
          </button>
          <div className={club.titleBlock}><b>{t('Settings')}</b></div>
        </div>
      </header>

      <main className={club.ground} style={{ '--map': `url(${assetPath(DEFAULT_MAP)})` }}>
        <ul className={styles.settings}>
          <AccountRows account={account} onSignOut={onSignOut} onDeleteAccount={onDeleteAccount} />
          <li className={styles.groupHead}>{t('Learning the game')}</li>
          <li>
            <span><b>{t('Primer before a new club')}</b><small>{t('Three short steps before the founding draft.')}</small></span>
            <Toggle on={prefs.primer} label={t('Primer before a new club')} onChange={primer => onChange({ ...prefs, primer })} />
          </li>
          <li>
            <span><b>{t('First-week tips')}</b><small>{t('One tip per screen during your first week.')}</small></span>
            <Toggle on={prefs.hints} label={t('First-week tips')} onChange={hints => onChange({ ...prefs, hints })} />
          </li>
          <li>
            <span><b>{t('How it plays')}</b><small>{t('Run the three-step primer now.')}</small></span>
            <button type="button" className={club.small} onClick={onPrimer}>{t('Play')}</button>
          </li>
          <li>
            <span><b>{t('Show tips again')}</b><small>{t('Brings back every tip and the primer.')}</small></span>
            <button type="button" className={club.small} disabled={reset} onClick={() => { onChange(resetHints(prefs)); setReset(true); }}>{reset ? t('Done') : t('Reset')}</button>
          </li>
          <li className={styles.groupHead}>{t('This device')}</li>
          <MusicControls as="li" />
          <AmbientControls as="li" />
          <li>
            <span><b>{t('Language')}</b></span>
            <LanguagePicker />
          </li>
          <li>
            <span><b>{t('Your save')}</b><small>{account?.status === 'signedIn'
              ? t('Your club is saved in this browser and on your account.')
              : t('Your club is saved in this browser only. Clearing site data deletes it.')}</small></span>
          </li>
          <li className={styles.groupHead}>{t('Credits')}</li>
          <li>
            <span>
              <b>{t('Music')}</b>
              <small>
                {t('“Video Game” by')}{' '}
                <a href="https://pixabay.com/users/atlasaudio-54514918/?utm_source=link-attribution&utm_medium=referral&utm_campaign=music&utm_content=617620" target="_blank" rel="noreferrer">AtlasAudio</a>
                {' '}{t('from')}{' '}
                <a href="https://pixabay.com/?utm_source=link-attribution&utm_medium=referral&utm_campaign=music&utm_content=617620" target="_blank" rel="noreferrer">Pixabay</a>
              </small>
            </span>
          </li>
          <li>
            <span>
              <b>{t('Map art')}</b>
              <small>
                {t('Riot Games environment artists')}{' '}
                <a href="https://www.artstation.com/tobiaskoepp" target="_blank" rel="noreferrer">Tobias Koepp</a>,{' '}
                <a href="https://www.artstation.com/sirdigitalbacon" target="_blank" rel="noreferrer">Kevin Brunt</a>,{' '}
                {t('and official VALORANT wallpapers.')}
              </small>
            </span>
          </li>
          <li>
            <span>
              <b>{t('Player data')}</b>
              <small>
                {t('Rosters from')} <a href="https://www.vlr.gg" target="_blank" rel="noreferrer">vlr.gg</a>.{' '}
                {t('Team names, logos and player names belong to their owners.')}
              </small>
            </span>
          </li>
        </ul>
      </main>
    </div>
  );
}
