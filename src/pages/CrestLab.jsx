import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { crestConcepts } from '../engine/club/crestLab';
import { crestGeometry } from '../engine/club/crestGeometry';
import { CREST_SHAPES, CREST_STYLES, assembleCrest, pickCrest } from '../engine/club/crestKit';
import { loadCrestLexicon, loadCrestPaths } from '../lib/crestParts';
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

function hitLabel(hit) {
  if (hit.how === 'near') return t('Close to {word}', { word: hit.via });
  return { exact: t('Exact word'), stem: t('Word stem'), compound: t('Joined words'), implied: t('Implied'), hash: t('Hashed pick') }[hit.how];
}

function styleNames() {
  return { esports: t('Esports'), minimal: t('Minimal'), brutalist: t('Brutalist'), heraldic: t('Heraldic'), line: t('Line'), riso: t('Riso print') };
}

function shapeNames() {
  return {
    shield: t('Shield'), hex: t('Hexagon'), notch: t('Notched'), pennant: t('Pennant'), octagon: t('Octagon'),
    circle: t('Circle'), square: t('Square'), diamond: t('Diamond'), none: t('No shape'),
  };
}

function Svg({ markup, className }) {
  return <span className={className} dangerouslySetInnerHTML={{ __html: markup }} />;
}

function PartsCrest() {
  const [name, setName] = useState(EXAMPLES[1]);
  const [reroll, setReroll] = useState(0);
  const [tone, setTone] = useState(null);
  const [style, setStyle] = useState('esports');
  const [shape, setShape] = useState(null);
  const [frame, setFrame] = useState('filled');
  const [lexicon, setLexicon] = useState(null);
  const [failed, setFailed] = useState(false);
  const [paths, setPaths] = useState({});

  useEffect(() => {
    loadCrestLexicon().then(setLexicon, () => setFailed(true));
  }, []);

  const recipe = lexicon ? pickCrest(name, lexicon, { reroll, tone: tone ?? undefined, style, shape: shape ?? undefined, frame }) : null;
  const marks = recipe?.marks.join('\n') ?? '';

  useEffect(() => {
    if (!marks) return undefined;
    let live = true;
    loadCrestPaths(marks.split('\n')).then(loaded => {
      if (live) setPaths(current => ({ ...current, ...loaded }));
    });
    return () => { live = false; };
  }, [marks]);

  function changeName(next) {
    setName(next);
    setReroll(0);
  }

  const ready = recipe && recipe.marks.every(id => id in paths);
  const names = styleNames();
  const shapes = shapeNames();
  const autoShape = lexicon ? pickCrest(name, lexicon, { reroll }).shell : null;
  const preview = changes => (ready ? <Svg markup={assembleCrest({ ...recipe, ...changes }, paths)} /> : <span />);
  return (
    <section className={styles.parts} aria-labelledby="parts-heading">
      <h2 id="parts-heading">{t('Assembled from parts')}</h2>
      <div className={styles.workbench}>
        <div className={styles.controls}>
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
            <legend>{t('Style')}</legend>
            <div className={styles.styles}>
              {CREST_STYLES.map(key => (
                <button className={`${styles.control} ${styles.styleChoice}`} type="button" key={key}
                  aria-pressed={style === key} onClick={() => setStyle(key)}>
                  {preview({ style: key })}
                  <span>{names[key]}</span>
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className={styles.field}>
            <legend>{t('Shape')}</legend>
            <div className={styles.shapes}>
              {[null, ...CREST_SHAPES].map(key => (
                <button className={`${styles.control} ${styles.styleChoice}`} type="button" key={key ?? 'auto'}
                  aria-pressed={shape === key} onClick={() => setShape(key)}>
                  {preview({ shell: key ?? autoShape })}
                  <span>{key ? shapes[key] : t('Automatic')}</span>
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className={styles.field}>
            <legend>{t('Fill')}</legend>
            <div className={styles.shapes}>
              {['filled', 'outline'].map(key => (
                <button className={`${styles.control} ${styles.styleChoice}`} type="button" key={key}
                  aria-pressed={frame === key} disabled={recipe?.shell === 'none'} onClick={() => setFrame(key)}>
                  {preview({ frame: key })}
                  <span>{key === 'filled' ? t('Filled') : t('Outline')}</span>
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className={styles.field}>
            <legend>{t('Colour')}</legend>
            <div className={styles.group}>
              <button className={styles.control} type="button" aria-pressed={tone === null}
                onClick={() => setTone(null)}>{t('Automatic')}</button>
              {LOGO_TONES.map((item, index) => (
                <button className={`${styles.control} ${styles.swatch}`} type="button" key={item.id}
                  aria-label={t(item.label)} title={t(item.label)} aria-pressed={index === tone}
                  onClick={() => setTone(index)}>
                  <span style={{ backgroundColor: item.main }} /><span style={{ backgroundColor: item.second }} />
                </button>
              ))}
            </div>
          </fieldset>
        </div>
        <div className={styles.results}>
          {failed && <p className={styles.note}>{t('Parts did not load')}</p>}
          <div className={styles.partsStage}>
            {ready ? <Svg className={styles.bigCrest} markup={assembleCrest(recipe, paths)} /> : <span className={styles.bigCrest} />}
            {recipe && (
              <dl className={styles.hits}>
                {recipe.hits.map((hit, index) => (
                  <div key={index}>
                    <dt><bdi>{hit.word}</bdi></dt>
                    <dd>{hitLabel(hit)}</dd>
                    <dd dir="ltr">{hit.icon}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
          <div className={styles.footer}>
            <div className={styles.scoreboard}>
              <span>{t('Scoreboard preview')}</span>
              <div className={styles.scoreRow}>
                {ready ? <Svg className={styles.mini} markup={assembleCrest(recipe, paths, { small: true })} /> : <span className={styles.mini} />}
                <bdi>{name.trim() || t('Your club')}</bdi>
              </div>
            </div>
            <button className={`${styles.control} ${styles.primary}`} type="button" disabled={!recipe}
              onClick={() => setReroll(current => current + 1)}>{t('Another crest')}</button>
          </div>
        </div>
      </div>
    </section>
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
      <PartsCrest />
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
