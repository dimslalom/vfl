// The words around a chip, shared by the chip pick, the board and the codex:
// what it pays (the ladder), what it does for your squad (the brief), and the
// "How chips work" sheet. Every number comes from chipData, which reads the
// board engine, so nothing here can drift from what a chip really pays.

import { useEffect, useState } from 'react';
import { t } from '../lib/i18n';
import { CHIP_FLOOR, CODES, ROLES, SKILLS, chipInfo, chipPlan } from './chipData';
import { chipCopy, chipRules, chipTips, planLine } from './chipCopy';
import { ICON_LABELS, ICON_PATHS } from './chipIcons';
import { useChipStyle } from './chipStyle';
import styles from './ChipHelp.module.css';

export function ChipIcon({ name, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" role="img" aria-label={t(ICON_LABELS[name])}>
      {ICON_PATHS[name].map(d => <path key={d} d={d} />)}
    </svg>
  );
}

// One lane requirement, in the face style the owner picked: an icon or a code.
export function Token({ name, face }) {
  return face === 'glyph'
    ? <span className={styles.token}><ChipIcon name={name} size={16} /></span>
    : <span className={styles.token} data-code>{CODES[name]}</span>;
}

/** What goes on the lane, then what it pays; "Any lane ×1.5" for a floor-only chip. */
export function ChipLadder({ chipKey, size = 'm' }) {
  const { face } = useChipStyle();
  const info = chipInfo(chipKey);
  const rows = info.ladder.length ? info.ladder : [{ icons: ['any'], mult: CHIP_FLOOR }];
  return (
    <ol className={styles.ladder} data-size={size}>
      {rows.map(step => (
        <li key={step.icons.join() + step.mult}>
          <span className={styles.tokens}>{step.icons.map((name, i) => <Token key={name + i} name={name} face={face} />)}</span>
          <b className={styles.mult}>×{step.mult}</b>
        </li>
      ))}
    </ol>
  );
}

/**
 * The chip in a sentence, then what it does for this squad. `detail` adds when
 * it is good and what it risks, for the moment a chip is being chosen.
 */
export function ChipBrief({ chipKey, roster, detail = false }) {
  const copy = chipCopy(chipInfo(chipKey).key);
  const plan = roster?.length ? chipPlan(chipKey, roster) : null;
  return (
    <div className={styles.brief}>
      <p className={styles.effect}>{copy.effect}</p>
      {plan && <p className={styles.plan} data-fits={plan.fits || undefined}>{planLine(plan)}</p>}
      {detail && (
        <dl className={styles.detail}>
          <div><dt>{t('Good when')}</dt><dd>{copy.when}</dd></div>
          <div><dt>{t('Watch out')}</dt><dd>{copy.risk}</dd></div>
        </dl>
      )}
    </div>
  );
}

/** Every symbol a chip can print, with its code and name: one legend everywhere. */
export function ChipLegend() {
  return (
    <ul className={styles.legend}>
      {[...ROLES, ...SKILLS, 'any'].map(name => (
        <li key={name}>
          <ChipIcon name={name} size={18} />
          <b>{CODES[name]}</b>
          <span>{t(ICON_LABELS[name])}</span>
        </li>
      ))}
    </ul>
  );
}

export function ChipGuide({ onClose }) {
  useEffect(() => {
    const key = event => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  return (
    <div className={styles.veil} onClick={onClose}>
      <section className={styles.guide} role="dialog" aria-modal="true" aria-label={t('How chips work')} onClick={event => event.stopPropagation()}>
        <header className={styles.guideHead}>
          <h2>{t('How chips work')}</h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label={t('Close')}>×</button>
        </header>
        <ol className={styles.rules}>
          {chipRules().map((rule, index) => (
            <li key={rule.title}><b>{index + 1}</b><div><h3>{rule.title}</h3><p>{rule.text}</p></div></li>
          ))}
        </ol>
        <h3 className={styles.kicker}>{t('What the symbols mean')}</h3>
        <ChipLegend />
        <h3 className={styles.kicker}>{t('Playing them well')}</h3>
        <ul className={styles.tips}>{chipTips().map(tip => <li key={tip}>{tip}</li>)}</ul>
      </section>
    </div>
  );
}

/** A text button that opens the guide; it keeps its own open state. */
export function ChipGuideButton({ className = '', label }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={`${styles.guideButton} ${className}`} onClick={(event) => { event.stopPropagation(); setOpen(true); }}>
        <span aria-hidden="true" className={styles.q}>?</span>{label ?? t('How chips work')}
      </button>
      {open && <ChipGuide onClose={() => setOpen(false)} />}
    </>
  );
}

/**
 * Hint B for the board: one line across the top while placing. With a chip
 * picked it says what that chip does for your five; with none, what a chip is for.
 */
export function ChipCoach({ chipKey, roster }) {
  if (!chipKey) {
    return (
      <div className={styles.coach} role="status">
        <span className={styles.coachText}>{t('Drop one chip on a lane: it multiplies that lane. Best on the lane you could win or lose.')}</span>
        <ChipGuideButton label={t('Chips')} />
      </div>
    );
  }
  const info = chipInfo(chipKey);
  const copy = chipCopy(info.key);
  const plan = chipPlan(chipKey, roster ?? []);
  return (
    <div className={styles.coach} role="status" data-tier={info.tier}>
      <b className={styles.coachName}>{info.name}</b>
      <span className={styles.coachText}>{copy.effect}</span>
      <span className={styles.coachPlan} data-fits={plan.fits || undefined}>{planLine(plan)}</span>
      <ChipGuideButton label={t('Chips')} />
    </div>
  );
}
