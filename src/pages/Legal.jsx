import { Link } from 'react-router-dom';
import ModeRail from '../components/ModeRail';
import { t } from '../lib/i18n';
import styles from './Legal.module.css';

export default function Legal() {
  return (
    <main className={styles.page}>
      <ModeRail />
      <article className={styles.body}>
        <h1>{t('Legal')}</h1>
        <p lang="en">
          Gauntlet was created under Riot Games&apos; &quot;Legal Jibber Jabber&quot; policy using assets
          owned by Riot Games. Riot Games does not endorse or sponsor this project.
        </p>
        <p>{t('This is a non-commercial fan project. Team names, logos and player names belong to their respective owners.')}</p>
        <p>{t('Player ratings are approximations tuned for game balance, not official VCT statistics.')}</p>
        <p>
          {t('Roster data comes from')} <a href="https://www.vlr.gg" rel="noreferrer">vlr.gg</a>.
        </p>
        <p>
          {t('Map art by Riot Games environment artists')}{' '}
          <a href="https://www.artstation.com/tobiaskoepp" rel="noreferrer">Tobias Koepp</a>,{' '}
          <a href="https://www.artstation.com/sirdigitalbacon" rel="noreferrer">Kevin Brunt</a>,{' '}
          {t('and official VALORANT wallpapers.')}
        </p>
        <p>
          {t('Interface icons by')}{' '}
          Lorc, Delapouite {t('and')} sbed {t('from')}{' '}
          <a href="https://game-icons.net" rel="noreferrer">game-icons.net</a>,{' '}
          {t('under')} <a href="https://creativecommons.org/licenses/by/3.0/" rel="noreferrer">CC BY 3.0</a>.
        </p>
        <p>{t('Signing in is optional. If you sign in with Discord, VFL keeps your Discord ID, username and avatar, a sign-in cookie, and your saved club. It never sees your email or password. You can delete your account and everything on it from Club settings.')}</p>
        <p>{t('Without signing in, your club stays on this device.')}</p>
        <Link className={styles.back} to="/club">{t('Back to the game')}</Link>
      </article>
    </main>
  );
}
