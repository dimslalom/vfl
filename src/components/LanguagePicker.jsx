import { LANGS, setLang, t } from '../lib/i18n';
import useLang from '../lib/useLang';
import styles from './LanguagePicker.module.css';

export default function LanguagePicker() {
  const lang = useLang();
  return (
    <div className={styles.picker} role="group" aria-label={t('Language')}>
      {LANGS.map(item => (
        <button
          key={item.key}
          type="button"
          className={styles.option}
          aria-pressed={lang === item.key}
          aria-label={item.name}
          onClick={() => setLang(item.key)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
