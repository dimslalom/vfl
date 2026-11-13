import { useState } from 'react';
import { Link } from 'react-router-dom';
import { crestConcepts } from '../engine/club/crestLab';
import { crestGeometry } from '../engine/club/crestGeometry';
import { LOGO_TONES } from '../engine/club/logo';
import { t } from '../lib/i18n';
import deepSvgResults from '../assets/crest-lab/deepsvg-results.svg';
import vyrnQelCrest from '../assets/crest-lab/vyrn-qel.png';
import styles from './CrestLab.module.css';

const AI_SAMPLE_NAME = 'Vyrn Qel';
const EXAMPLES = [AI_SAMPLE_NAME, 'Serigala Malam', 'Sayap Es', 'Asas de Gelo', 'Alas Heladas', '夜狼', 'صقور الليل', 'QNTM 07'];

function motifChoices() {
  return {
    auto: t('Automatic motifs'),
    wolf: t('Wolf'),
    moon: t('Moon'),
    ice: t('Ice'),
    wing: t('Wings'),
    flame: t('Flame'),
    storm: t('Storm'),
    wave: t('Wave'),
    orbit: t('Orbit'),
  };
}

function CrestArt({ design, palette }) {
  const { outline, accent, lettering, insetAccent } = crestGeometry(design);
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <path d={outline} fill={palette.main} fillRule="evenodd" />
      <path d={accent} fill={palette.second} fillRule="evenodd"
        transform={insetAccent ? 'translate(23 22) scale(.54)' : undefined} />
      {lettering && (
        <text x={lettering.x} y={lettering.y} dominantBaseline="central" textAnchor="middle" direction="ltr"
          fontSize={lettering.size} fontWeight="800" fill={palette.ground}>{design.monogram}</text>
      )}
    </svg>
  );
}

export default function CrestLab() {
  const [name, setName] = useState(EXAMPLES[0]);
  const [motif, setMotif] = useState('auto');
  const [batch, setBatch] = useState(0);
  const [tone, setTone] = useState(4);
  const [selected, setSelected] = useState(0);
  const concepts = crestConcepts(name, batch, motif);
  const palette = LOGO_TONES[tone];
  const labels = { emblem: t('Emblem'), shield: t('Shield'), monogram: t('Monogram'), orbit: t('Orbit'), abstract: t('Abstract') };
  const motifs = motifChoices();

  function changeName(next) {
    setName(next);
    setBatch(0);
    setSelected(0);
  }

  return (
    <main className={styles.stage}>
      <header className={styles.header}>
        <h1>{t('Crest lab')}</h1>
        <Link className={styles.control} to="/club">{t('Back')}</Link>
      </header>
      <section className={styles.aiSample} aria-labelledby="ai-crest-heading">
        <img className={styles.sampleArt} src={vyrnQelCrest} alt={t('Red and white dragon crest')} width="128" height="128" />
        <div className={styles.sampleDetails}>
          <h2 id="ai-crest-heading">{t('AI-generated sample')}</h2>
          <div className={styles.scoreboard}>
            <span>{t('Scoreboard preview')}</span>
            <div className={styles.scoreRow}>
              <img src={vyrnQelCrest} alt="" width="22" height="22" />
              <bdi>{AI_SAMPLE_NAME}</bdi>
            </div>
          </div>
        </div>
      </section>
      <section className={styles.experiments} aria-labelledby="experiments-heading">
        <h2 id="experiments-heading">{t('Model experiments')}</h2>
        <div className={styles.experiment}>
          <h3>DeepSVG</h3>
          <p>{t('32 generated vectors, with 22 px previews. Names seed the drawings.')}</p>
          <img className={styles.gallery} src={deepSvgResults} alt={t('DeepSVG generated crests for eight club names')} />
        </div>
        <div className={styles.experiment}>
          <h3>Pythia 14M</h3>
          <p>{t('A small text model was asked to write SVG paths. Most outputs were incomplete or malformed.')}</p>
          <pre dir="ltr">{'Vyrn Qel: M10 30 L66 26 L66 26 L66 26 L66 26...\nQNTM 07: M10 30 L64 28 L96 21 Z'}</pre>
        </div>
        <div className={styles.experiment}>
          <h3>IconShop</h3>
          <p>{t('Text-to-SVG model. The 493 MB weights exceed the phone budget. One Vyrn Qel test ran for 43 seconds on a Mac and produced no completed SVG.')}</p>
        </div>
      </section>
      <div className={styles.workbench}>
        <section className={styles.controls} aria-label={t('Crest settings')}>
          <label className={styles.field}>
            {t('Club name')}
            <input dir="auto" value={name} maxLength={80} onChange={event => changeName(event.target.value)} />
          </label>
          <div className={styles.group} role="group" aria-label={t('Example names')}>
            {EXAMPLES.map(example => (
              <button className={styles.control} type="button" key={example} dir="auto"
                aria-pressed={name === example} onClick={() => changeName(example)}>{example}</button>
            ))}
          </div>
          <fieldset className={styles.field}>
            <legend>{t('Motif')}</legend>
            <div className={styles.group}>
              {Object.entries(motifs).map(([key, label]) => (
                <button className={styles.control} type="button" key={key} aria-pressed={motif === key}
                  onClick={() => { setMotif(key); setSelected(0); setBatch(0); }}>{label}</button>
              ))}
            </div>
          </fieldset>
          <fieldset className={styles.field}>
            <legend>{t('Colour')}</legend>
            <div className={styles.group}>
              {LOGO_TONES.map((item, index) => (
                <button className={`${styles.control} ${styles.swatch}`} type="button" key={item.id}
                  aria-label={t(item.label)} title={t(item.label)} aria-pressed={index === tone}
                  onClick={() => setTone(index)}>
                  <span style={{ backgroundColor: item.main }} /><span style={{ backgroundColor: item.second }} />
                </button>
              ))}
            </div>
          </fieldset>
        </section>
        <section className={styles.results} aria-label={t('Crest concepts')}>
          <div className={styles.choices}>
            {concepts.map((design, index) => (
              <button className={`${styles.control} ${styles.choice}`} type="button" key={design.layout}
                aria-pressed={selected === index} onClick={() => setSelected(index)}>
                <CrestArt design={design} palette={palette} />
                <span>{design.motif && design.layout === 'emblem' ? motifs[design.motif] : labels[design.layout]}</span>
              </button>
            ))}
          </div>
          <div className={styles.footer}>
            <div className={styles.scoreboard}>
              <span>{t('Scoreboard preview')}</span>
              <div className={styles.scoreRow}>
                <CrestArt design={concepts[selected]} palette={palette} />
                <bdi>{name.trim() || t('Your club')}</bdi>
              </div>
            </div>
            <button className={`${styles.control} ${styles.primary}`} type="button"
              onClick={() => { setBatch(current => current + 1); setSelected(0); }}>{t('More concepts')}</button>
          </div>
        </section>
      </div>
    </main>
  );
}
