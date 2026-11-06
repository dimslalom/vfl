// The words around a chip, shared by the chip pick, the board and the codex:
// what it pays (the ladder), what it does for your squad (the brief), and the
// "How chips work" sheet. Every number comes from chipData, which reads the
// board engine, so nothing here can drift from what a chip really pays.

import { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { t } from '../lib/i18n';
import { CODES, ROLES, SKILLS, chipInfo, chipPlan } from './chipData';
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

/** What goes on the lane, then what it pays. */
export function ChipLadder({ chipKey, size = 'm' }) {
  const { face } = useChipStyle();
  const info = chipInfo(chipKey);
  return (
    <ol className={styles.ladder} data-size={size}>
      {info.ladder.map(step => (
        <li key={step.icons.join() + (step.mult ?? step.label)}>
          <span className={styles.tokens}>{step.icons.map((name, i) => <Token key={name + i} name={name} face={face} />)}</span>
          <b className={styles.mult}>{step.label ?? `×${step.mult}`}</b>
        </li>
      ))}
    </ol>
  );
}

/**
 * The chip in a sentence, then what it does for this squad. `detail` adds when
 * it is good and what it risks, for the moment a chip is being chosen.
 */
export function ChipBrief({ chipKey, roster, detail = false, effect = true }) {
  const copy = chipCopy(chipInfo(chipKey).key);
  const plan = roster?.length ? chipPlan(chipKey, roster) : null;
  return (
    <div className={styles.brief}>
      {effect && <p className={styles.effect}>{copy.effect}</p>}
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

/**
 * A "?" beside a chip that opens its full write-up (what it does, when it is good,
 * what it risks) as a native popover, so the chip itself stays short and never resizes.
 */
export function ChipNoteButton({ chipKey, className = '' }) {
  const id = useId();
  const info = chipInfo(chipKey);
  const copy = chipCopy(info.key);
  return (
    <>
      <button type="button" className={`${styles.q} ${styles.noteButton} ${className}`} popoverTarget={id} aria-label={`${info.name}: ${t('details')}`}>?</button>
      <div id={id} popover="auto" className={styles.note}>
        <header className={styles.guideHead}>
          <h2>{info.name}</h2>
          <button type="button" className={styles.close} popoverTarget={id} popoverTargetAction="hide" aria-label={t('Close')}>×</button>
        </header>
        <p className={styles.effect}>{copy.effect}</p>
        <dl className={styles.detail}>
          <div><dt>{t('Good when')}</dt><dd>{copy.when}</dd></div>
          <div><dt>{t('Watch out')}</dt><dd>{copy.risk}</dd></div>
        </dl>
      </div>
    </>
  );
}

/** Every code a chip can print, with its name: one legend everywhere. */
export function ChipLegend() {
  return (
    <ul className={styles.legend}>
      {[...ROLES, ...SKILLS, 'igl', 'any', 'trio', 'chain', 'slash', 'lock'].map(name => (
        <li key={name}>
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
  // Portalled: the chip tag is transformed, which would trap a fixed veil inside it.
  return createPortal(
    <div className={styles.veil} onClick={event => { event.stopPropagation(); onClose(); }}>
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
        <h3 className={styles.kicker}>{t('What the codes mean')}</h3>
        <ChipLegend />
        <h3 className={styles.kicker}>{t('Playing them well')}</h3>
        <ul className={styles.tips}>{chipTips().map(tip => <li key={tip}>{tip}</li>)}</ul>
      </section>
    </div>,
    document.body,
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
