import 'pixi.js/unsafe-eval';
import { Application, Assets, Container, Graphics, Sprite, Text, TextStyle } from 'pixi.js';
import gsap from 'gsap';
import {
  LANE_CAP, LANES, bestPlacement, bestRotate, isLegalPlacement, laneFormula, laneScore, resolveBoard, tacticMult,
} from '../engine/board/board.js';
import { TACTICS } from '../engine/endless/seriesCards.js';
import { mulberry32 } from '../../shared/src/engine/perfectRun.js';
import { STAT_KEYS, STAT_LABELS, STAT_LABELS_FULL } from '../../shared/src/data/statFields.js';
import { assetPath, cardTextColor } from '../../shared/src/lib/utils.js';

const COLOR = {
  bg: 0x0d0f17, surface: 0x161b29, surfaceHi: 0x1e2435, line: 0x2b3145, ink: 0xece8e1, muted: 0x8a8f9e,
  accent: 0xff4655, opponent: 0x00d2ff, win: 0x00c8a0, gold: 0xd8b34c,
};
const CARD_W = 400;
const CARD_H = 580;
const FONT = 'Familjen Grotesk, system-ui, sans-serif';
const display = (size, fill = COLOR.ink, weight = '700') => new TextStyle({ fontFamily: FONT, fontSize: size, fontWeight: weight, fill });
const mono = (size, fill = COLOR.muted) => new TextStyle({ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: size, fontWeight: '700', fill, letterSpacing: 1.2 });

function cutRect(g, w, h, cut) {
  return g.poly([0, 0, w - cut, 0, w, cut, w, h, cut, h, 0, h - cut]);
}

const cardArt = card => [
  assetPath(`/assets/card-bg/${card.palette}-bg.png`),
  assetPath(`/assets/stat-bg/${card.palette}-stat-bg.png`),
  assetPath(card.photo),
];

// The real PlayerCard, layer for layer, drawn at its native 400 by 580 so the
// whole card is one GPU object to move. The badge is the number that counts on
// the lane under it, because the stat row is too small to read from there.
class CardView extends Container {
  constructor(card, textures, { igl = false, side, hiddenFace = false }) {
    super();
    this.card = card;
    this.pivot.set(CARD_W / 2, CARD_H / 2);
    this.face = new Container();
    const [bgPath, statPath, photoPath] = cardArt(card);
    const ink = cardTextColor(card.palette);
    const bg = new Sprite(textures[bgPath]);
    bg.setSize(CARD_W, CARD_H);
    const photo = new Sprite(textures[photoPath]);
    photo.setSize(CARD_W, 412);
    const statBg = new Sprite(textures[statPath]);
    statBg.setSize(CARD_W, CARD_H);
    const rating = new Text({ text: String(card.rating), style: display(68, ink) });
    rating.anchor.set(0.5, 0);
    rating.position.set(68, 58);
    const role = new Text({ text: card.role.slice(0, 3).toUpperCase(), style: display(28, ink, '600') });
    role.anchor.set(0.5, 0);
    role.position.set(68, 130);
    const name = new Text({ text: card.player, style: display(46, ink) });
    name.anchor.set(0.5, 1);
    name.position.set(CARD_W / 2, CARD_H - 118);
    this.face.addChild(bg, photo, statBg, rating, role, name);

    this.stats = {};
    STAT_KEYS.forEach((key, index) => {
      const x = 56 + index * 72;
      const plate = new Graphics().rect(x - 36, CARD_H - 112, 72, 96).fill(side === 'you' ? COLOR.accent : COLOR.opponent);
      plate.visible = false;
      const label = new Text({ text: STAT_LABELS[key], style: display(20, ink, '600') });
      label.anchor.set(0.5, 0);
      label.position.set(x, CARD_H - 104);
      const value = new Text({ text: String(card.stats[key]), style: display(38, ink) });
      value.anchor.set(0.5, 0);
      value.position.set(x, CARD_H - 76);
      this.face.addChild(plate, label, value);
      this.stats[key] = { plate, label, value, ink };
    });

    if (igl) {
      const tag = new Graphics().rect(0, 0, CARD_W, 44).fill(COLOR.accent);
      const label = new Text({ text: 'IGL', style: mono(28, 0xffffff) });
      label.anchor.set(0, 0.5);
      label.position.set(20, 22);
      this.face.addChild(tag, label);
    }

    this.badge = new Container();
    const badgeFill = new Graphics().rect(-92, -62, 184, 124).fill(side === 'you' ? COLOR.accent : COLOR.opponent);
    this.badgeValue = new Text({ text: '', style: display(104, side === 'you' ? 0xffffff : COLOR.bg) });
    this.badgeValue.anchor.set(0.5);
    this.badge.addChild(badgeFill, this.badgeValue);
    this.badge.position.set(CARD_W - 92, 62);
    this.badge.visible = false;
    this.face.addChild(this.badge);

    this.back = new Container();
    const backPlate = cutRect(new Graphics(), CARD_W, CARD_H, 30).fill(COLOR.surfaceHi).stroke({ color: COLOR.opponent, width: 6 });
    const mark = new Text({ text: '?', style: display(160, COLOR.opponent) });
    mark.anchor.set(0.5);
    mark.position.set(CARD_W / 2, CARD_H / 2);
    this.back.addChild(backPlate, mark);
    this.addChild(this.face, this.back);
    this.setHidden(hiddenFace);
  }

  setHidden(hidden) {
    this.hiddenFace = hidden;
    this.face.visible = !hidden;
    this.back.visible = hidden;
  }

  // Lights the stat this lane scores, on the card and in the badge.
  showStat(stat) {
    for (const [key, parts] of Object.entries(this.stats)) {
      const on = key === stat;
      parts.plate.visible = on;
      parts.label.style.fill = on ? 0xffffff : parts.ink;
      parts.value.style.fill = on ? 0xffffff : parts.ink;
    }
    this.badge.visible = Boolean(stat);
    if (stat) this.badgeValue.text = String(this.card.stats[stat]);
  }
}

class TacticView extends Container {
  constructor(instance) {
    super();
    this.instance = instance;
    const w = 150;
    const h = 56;
    this.w = w;
    this.h = h;
    this.pivot.set(w / 2, h / 2);
    this.plate = cutRect(new Graphics(), w, h, 8).fill(COLOR.surfaceHi).stroke({ color: COLOR.gold, width: 2 });
    const name = new Text({ text: TACTICS[instance.key].name, style: mono(10, COLOR.ink), resolution: 3 });
    name.position.set(9, 9);
    this.mult = new Text({ text: 'Drag to a lane', style: display(15, COLOR.gold), resolution: 3 });
    this.mult.position.set(9, 27);
    this.addChild(this.plate, name, this.mult);
  }
}

export default class BoardStage {
  constructor(host, { onState, reducedMotion }) {
    this.host = host;
    this.onState = onState;
    this.reducedMotion = reducedMotion;
    this.app = new Application();
    this.game = null;
    this.alive = true;
  }

  async init() {
    // The site's security policy forbids blob workers, which Pixi uses for images.
    Assets.setPreferences({ preferWorkers: false });
    await this.app.init({
      resizeTo: this.host, background: COLOR.bg, antialias: true, preference: 'webgl',
      resolution: Math.min(window.devicePixelRatio || 1, 2), autoDensity: true,
    });
    if (!this.alive) return false;
    await document.fonts?.load('700 24px "Familjen Grotesk"').catch(() => null);
    this.host.appendChild(this.app.canvas);
    this.root = new Container();
    this.app.stage.addChild(this.root);
    this.app.stage.eventMode = 'static';
    this.app.stage.on('globalpointermove', event => this.dragMove(event));
    this.app.stage.on('pointerup', event => this.dragEnd(event));
    this.app.stage.on('pointerupoutside', event => this.dragEnd(event));
    this.app.renderer.on('resize', () => this.relayout());
    if (import.meta.env.DEV) window.__board = { stage: this, gsap };
    return true;
  }

  rendererName() {
    return this.app.renderer?.name ?? 'unknown';
  }

  destroy() {
    this.alive = false;
    gsap.killTweensOf(this);
    this.timeline?.kill();
    try { this.app.destroy(true, { children: true }); } catch { /* init never finished */ }
  }

  // ── setup ────────────────────────────────────────────────────────────────

  async deal(game) {
    this.game = game;
    this.timeline?.kill();
    this.artMask = null;
    this.root.removeChildren().forEach(child => child.destroy({ children: true }));
    this.phase = 'place';
    this.slots = game.you.map(() => null);
    this.tacticLane = {};
    this.selected = null;
    this.rotated = null;
    const rng = mulberry32(game.seed + 1);
    const opponentTactic = game.opponentTactic;
    this.oppPlan = bestPlacement({ roster: game.them, maps: game.maps, tactic: opponentTactic, rng });
    this.oppShown = [0, 1];
    const paths = [...game.you, ...game.them].flatMap(cardArt);
    const artPath = assetPath(game.maps[0].image);
    const textures = await Assets.load([...new Set(paths), artPath]);
    if (!this.alive) return;
    this.layers = { art: new Container(), lanes: new Container(), cards: new Container() };
    this.root.addChild(this.layers.art, this.layers.lanes, this.layers.cards);
    this.art = new Sprite(textures[artPath]);
    this.art.alpha = 0.55;
    this.layers.art.addChild(this.art);
    this.laneViews = game.maps.map((map, lane) => this.makeLane(map, lane));
    this.mine = game.you.map((card, index) => {
      const view = new CardView(card, textures, { igl: index === 0, side: 'you' });
      view.eventMode = 'static';
      view.cursor = 'grab';
      view.on('pointerdown', event => this.dragStart(event, view, index));
      this.layers.cards.addChild(view);
      return view;
    });
    this.theirs = game.them.map((card, index) => {
      const view = new CardView(card, textures, { igl: index === 0, side: 'them', hiddenFace: !this.oppShown.includes(index) });
      this.layers.cards.addChild(view);
      return view;
    });
    this.tacticViews = game.tactics.map((instance) => {
      const view = new TacticView(instance);
      view.eventMode = 'static';
      view.cursor = 'grab';
      view.on('pointerdown', event => this.dragStart(event, view, null));
      this.layers.cards.addChild(view);
      return view;
    });
    this.relayout(true);
    this.dealIn();
    this.emit();
  }

  makeLane(map, lane) {
    const view = new Container();
    view.bg = new Graphics();
    view.title = new Text({ text: map.name.toUpperCase(), style: display(26), resolution: 2 });
    view.statPlate = new Graphics();
    view.statText = new Text({ text: STAT_LABELS_FULL[map.stat].toUpperCase(), style: mono(12, COLOR.bg), resolution: 2 });
    view.rule = new Text({ text: map.roles.map(role => role.slice(0, 3).toUpperCase()).join(' + '), style: mono(10, COLOR.ink), resolution: 2 });
    view.rule.anchor.set(1, 0.5);
    view.divider = new Graphics();
    view.theirTotal = new Text({ text: '?', style: display(30, COLOR.opponent), resolution: 2 });
    view.theirTotal.anchor.set(1, 0.5);
    view.myTotal = new Text({ text: '0', style: display(38, COLOR.accent), resolution: 2 });
    view.myTotal.anchor.set(1, 0.5);
    view.theirFormula = new Text({ text: '', style: mono(11, COLOR.ink), resolution: 2 });
    view.theirFormula.anchor.set(0, 0.5);
    view.myFormula = new Text({ text: '', style: mono(11, COLOR.ink), resolution: 2 });
    view.myFormula.anchor.set(0, 0.5);
    view.stamp = new Text({ text: '', style: mono(13, COLOR.win), resolution: 2 });
    view.stamp.anchor.set(1, 0.5);
    view.addChild(view.bg, view.title, view.statPlate, view.statText, view.rule, view.divider, view.theirTotal, view.myTotal, view.theirFormula, view.myFormula, view.stamp);
    view.lane = lane;
    view.eventMode = 'static';
    view.on('pointertap', () => this.tapLane(lane));
    this.layers.lanes.addChild(view);
    return view;
  }

  // ── layout ───────────────────────────────────────────────────────────────

  metrics() {
    const W = this.app.screen.width;
    const H = this.app.screen.height;
    const narrow = W < 700;
    const margin = narrow ? 6 : 20;
    const gap = narrow ? 4 : 12;
    const topBar = narrow ? 24 : 46;
    const handCard = Math.min((W - margin * 2 - 24 - (narrow ? 0 : 180)) / 5, narrow ? 72 : 112, H * 0.13);
    const handH = handCard * (CARD_H / CARD_W);
    const bench = narrow ? 30 : 42;
    const benchH = bench * (CARD_H / CARD_W);
    const bottomBar = 66;
    const handY = H - bottomBar - handH / 2;
    const lanesTop = topBar + benchH + 8;
    const tacticsH = narrow ? 44 : 0;
    const lanesBottom = H - bottomBar - handH - tacticsH - 10;
    const laneW = (Math.min(W, 1240) - margin * 2 - gap * 2) / 3;
    const startX = (W - (laneW * 3 + gap * 2)) / 2;
    const header = narrow ? 44 : 38;
    const band = narrow ? 58 : 84;
    return { W, H, narrow, margin, gap, topBar, bench, handCard, handH, handY, benchH, lanesTop, lanesBottom, laneW, startX, header, band, bottomBar };
  }

  laneRect(lane) {
    const m = this.metrics();
    return { x: m.startX + lane * (m.laneW + m.gap), y: m.lanesTop, w: m.laneW, h: m.lanesBottom - m.lanesTop };
  }

  // Cards sit side by side and never overlap. A phone lane is too narrow for
  // that, so there they cascade down with each card's badge still in view.
  slotPosition(lane, side, order, count) {
    const m = this.metrics();
    const r = this.laneRect(lane);
    const rowH = (r.h - m.header - m.band) / 2;
    const rowTop = side === 'them' ? r.y + m.header : r.y + m.header + rowH + m.band;
    if (m.narrow) {
      const cardW = Math.min(r.w - 12, (rowH - 4 - (LANE_CAP - 1) * 24) * (CARD_W / CARD_H));
      const cardH = cardW * (CARD_H / CARD_W);
      return { x: r.x + r.w / 2, y: rowTop + 2 + cardH / 2 + order * 24, scale: cardW / CARD_W, depth: order };
    }
    const cardW = Math.min((r.w - 24) / LANE_CAP, (rowH - 8) * (CARD_W / CARD_H));
    const step = cardW + 6;
    return {
      x: r.x + r.w / 2 + (order - (count - 1) / 2) * step,
      y: rowTop + rowH / 2,
      scale: cardW / CARD_W,
    };
  }

  targetFor(index) {
    const m = this.metrics();
    const lane = this.slots[index];
    if (lane == null) {
      const open = this.slots.map((slot, i) => (slot == null ? i : -1)).filter(i => i >= 0);
      const order = open.indexOf(index);
      const step = m.handCard + 6;
      const totalWidth = open.length * step - 6;
      return {
        x: m.W / 2 - totalWidth / 2 + step * order + m.handCard / 2 - (m.narrow ? 0 : 84),
        y: m.handY, scale: m.handCard / CARD_W,
      };
    }
    const here = this.slots.map((slot, i) => (slot === lane ? i : -1)).filter(i => i >= 0);
    return this.slotPosition(lane, 'you', here.indexOf(index), here.length);
  }

  oppTarget(index) {
    const m = this.metrics();
    const revealed = this.phase !== 'place' || this.oppShown.includes(index);
    if (revealed) {
      const lane = this.oppPlan.slots[index];
      const here = this.oppPlan.slots
        .map((slot, i) => (slot === lane && (this.phase !== 'place' || this.oppShown.includes(i)) ? i : -1))
        .filter(i => i >= 0);
      return this.slotPosition(lane, 'them', here.indexOf(index), here.length);
    }
    const hidden = this.game.them.map((_, i) => i).filter(i => !this.oppShown.includes(i));
    const order = hidden.indexOf(index);
    return { x: m.W / 2 + (order - (hidden.length - 1) / 2) * (m.bench + 6), y: m.topBar + m.benchH / 2 + 2, scale: m.bench / CARD_W };
  }

  tacticTarget(index) {
    const m = this.metrics();
    const lane = this.tacticLane[index];
    if (lane != null) {
      const r = this.laneRect(lane);
      const scale = m.narrow ? 0.4 : 0.66;
      if (m.narrow) return { x: r.x + r.w - 150 * scale / 2 - 4, y: r.y + 14, scale };
      return { x: r.x + r.w - 150 * scale / 2 - 8, y: r.y + m.header + (r.h - m.header - m.band) / 2 + m.band * 0.74, scale };
    }
    const count = this.tacticViews.length;
    return m.narrow
      ? { x: m.W / 2 + (index - (count - 1) / 2) * (m.W / count), y: m.lanesBottom + 24, scale: Math.min(1, (m.W / count - 8) / 150) }
      : { x: m.W - m.margin - 80, y: m.handY + (index - (count - 1) / 2) * 60, scale: 1 };
  }

  relayout(instant = false) {
    if (!this.game) return;
    const m = this.metrics();
    const first = this.laneRect(0);
    const span = m.laneW * 3 + m.gap * 2;
    const cover = Math.max(span / this.art.texture.width, first.h / this.art.texture.height);
    this.art.scale.set(cover);
    this.art.position.set(first.x + (span - this.art.width) / 2, first.y + (first.h - this.art.height) / 2);
    if (!this.artMask) {
      this.artMask = new Graphics();
      this.layers.art.addChild(this.artMask);
    }
    this.artMask.clear().rect(first.x, first.y, span, first.h).fill(0xffffff);
    this.art.mask = this.artMask;
    this.laneViews.forEach((view, lane) => {
      const r = this.laneRect(lane);
      view.position.set(r.x, r.y);
      view.hitArea = { contains: (x, y) => x >= 0 && y >= 0 && x <= r.w && y <= r.h };
      this.paintLane(view, r, false);
      const rowH = (r.h - m.header - m.band) / 2;
      const bandTop = m.header + rowH;
      const pad = m.narrow ? 6 : 12;
      view.title.style.fontSize = m.narrow ? 18 : 26;
      view.title.position.set(pad, m.narrow ? 2 : 4);
      view.statText.style.fontSize = m.narrow ? 8 : 12;
      const chipX = m.narrow ? pad : pad + view.title.width + 10;
      const chipY = m.narrow ? 26 : 11;
      view.statText.position.set(chipX + 6, chipY + 3);
      view.statPlate.clear().rect(chipX, chipY, view.statText.width + 12, view.statText.height + 6).fill(COLOR.gold);
      view.rule.style.fontSize = m.narrow ? 7 : 10;
      view.rule.visible = !m.narrow;
      view.rule.position.set(r.w - pad, m.header / 2);
      view.stamp.position.set(r.w - pad, m.narrow ? 12 : m.header / 2);
      view.divider.clear().rect(0, bandTop + m.band / 2, r.w, 1).fill(COLOR.line);
      const numberRight = m.narrow ? r.w / 2 + 16 : Math.min(84, r.w * 0.26);
      const fontTop = m.narrow ? 20 : 30;
      view.theirTotal.style.fontSize = fontTop;
      view.myTotal.style.fontSize = m.narrow ? 24 : 38;
      view.theirTotal.position.set(numberRight, bandTop + m.band * 0.26);
      view.myTotal.position.set(numberRight, bandTop + m.band * 0.74);
      view.theirFormula.visible = !m.narrow;
      view.myFormula.visible = !m.narrow;
      view.theirFormula.position.set(numberRight + 10, bandTop + m.band * 0.26);
      view.myFormula.position.set(numberRight + 10, bandTop + m.band * 0.74);
    });
    this.place(instant);
  }

  paintLane(view, r, hot, won = view.won) {
    const fill = won === 'you' ? COLOR.win : COLOR.bg;
    view.bg.clear().rect(0, 0, r.w, r.h).fill({ color: fill, alpha: won === 'you' ? 0.18 : 0.62 });
    if (hot) view.bg.rect(0, 0, r.w, r.h).stroke({ color: COLOR.ink, width: 2 });
  }

  move(view, target, instant) {
    gsap.killTweensOf(view);
    gsap.killTweensOf(view.scale);
    // Moving a card mid-deal cancels its fade-in, so finish that here.
    view.alpha = 1;
    if (instant || this.reducedMotion) {
      view.position.set(target.x, target.y);
      view.scale.set(target.scale);
      return;
    }
    gsap.to(view, { x: target.x, y: target.y, duration: 0.34, ease: 'power3.out' });
    gsap.to(view.scale, { x: target.scale, y: target.scale, duration: 0.34, ease: 'power3.out' });
  }

  place(instant = false) {
    this.mine.forEach((view, index) => {
      if (view === this.dragging?.view) return;
      const lane = this.slots[index];
      view.showStat(lane == null ? null : this.game.maps[lane].stat);
      this.move(view, this.targetFor(index), instant);
    });
    this.theirs.forEach((view, index) => {
      const shown = this.phase !== 'place' || this.oppShown.includes(index);
      view.showStat(shown ? this.game.maps[this.oppPlan.slots[index]].stat : null);
      this.move(view, this.oppTarget(index), instant);
    });
    this.tacticViews.forEach((view, index) => { if (view !== this.dragging?.view) this.move(view, this.tacticTarget(index), instant); });
    this.refreshTotals();
  }

  dealIn() {
    if (this.reducedMotion) return;
    [...this.mine, ...this.theirs, ...this.tacticViews].forEach((view, index) => {
      const target = { y: view.y };
      view.alpha = 0;
      view.y = target.y + 30;
      gsap.to(view, { alpha: 1, y: target.y, duration: 0.3, delay: index * 0.035, ease: 'power3.out' });
    });
  }

  // ── numbers ──────────────────────────────────────────────────────────────

  yourTactic() {
    const entry = Object.entries(this.tacticLane)[0];
    return entry ? { lane: entry[1], card: this.game.tactics[entry[0]] } : null;
  }

  refreshTotals() {
    if (this.phase === 'resolve' || this.phase === 'done') return;
    const tactic = this.yourTactic();
    this.laneViews.forEach((view, lane) => {
      const cards = this.game.you.filter((_, i) => this.slots[i] === lane);
      const score = laneScore(cards, this.game.maps[lane], tactic?.lane === lane ? tactic.card : null);
      view.myTotal.text = String(score.total);
      view.myFormula.text = laneFormula(score.steps);
    });
    this.tacticViews.forEach((view, index) => {
      const lane = this.tacticLane[index];
      if (lane == null) { view.mult.text = 'Drag to a lane'; return; }
      const cards = this.game.you.filter((_, i) => this.slots[i] === lane);
      view.mult.text = cards.length ? `×${tacticMult(this.game.tactics[index], cards)} here` : 'Empty lane';
    });
    if (this.phase !== 'place') this.paintOpponentTotals();
    this.emit();
  }

  paintOpponentTotals() {
    this.laneViews.forEach((view, lane) => {
      const cards = this.game.them.filter((_, i) => this.oppPlan.slots[i] === lane);
      const tactic = this.oppPlan.tactic?.lane === lane ? this.oppPlan.tactic.card : null;
      const score = laneScore(cards, this.game.maps[lane], tactic);
      view.theirTotal.text = String(score.total);
      view.theirFormula.text = laneFormula(score.steps);
    });
  }

  emit() {
    this.onState?.({
      phase: this.phase,
      legal: isLegalPlacement(this.slots.filter(slot => slot != null)),
      placed: this.slots.filter(slot => slot != null).length,
      rotated: this.rotated != null,
      result: this.result ?? null,
    });
  }

  // ── input ────────────────────────────────────────────────────────────────

  canMove(view) {
    if (this.phase === 'place') return true;
    return this.phase === 'rotate' && view instanceof CardView;
  }

  dragStart(event, view, index) {
    if (!this.canMove(view)) return;
    event.stopPropagation();
    gsap.killTweensOf(view);
    gsap.killTweensOf(view.scale);
    view.alpha = 1;
    const local = event.global;
    this.dragging = { view, index, moved: false, startX: local.x, startY: local.y, offsetX: view.x - local.x, offsetY: view.y - local.y };
    this.layers.cards.addChild(view);
    gsap.to(view.scale, { x: view.scale.x * 1.08, y: view.scale.y * 1.08, duration: 0.12 });
  }

  dragMove(event) {
    const drag = this.dragging;
    if (!drag) return;
    const { x, y } = event.global;
    if (Math.hypot(x - drag.startX, y - drag.startY) > 6) drag.moved = true;
    drag.view.position.set(x + drag.offsetX, y + drag.offsetY);
    const hover = this.laneAt(x, y);
    this.laneViews.forEach((view, lane) => this.paintLane(view, this.laneRect(lane), lane === hover));
    if (drag.view instanceof CardView) drag.view.showStat(hover == null ? null : this.game.maps[hover].stat);
  }

  laneAt(x, y) {
    for (let lane = 0; lane < LANES; lane += 1) {
      const r = this.laneRect(lane);
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return lane;
    }
    return null;
  }

  dragEnd(event) {
    const drag = this.dragging;
    if (!drag) return;
    this.dragging = null;
    const { x, y } = event.global;
    const lane = this.laneAt(x, y);
    this.laneViews.forEach((view, l) => this.paintLane(view, this.laneRect(l), false));
    if (!drag.moved) {
      this.selected = drag.view;
      this.pulse(drag.view);
      this.place();
      return;
    }
    if (lane != null) this.dropOn(drag.view, lane);
    else if (this.phase === 'place' && drag.view instanceof CardView) this.slots[this.mine.indexOf(drag.view)] = null;
    else if (this.phase === 'place') delete this.tacticLane[this.tacticViews.indexOf(drag.view)];
    this.place();
  }

  tapLane(lane) {
    if (!this.selected) return;
    this.dropOn(this.selected, lane);
    this.selected = null;
    this.place();
  }

  pulse(view) {
    if (this.reducedMotion) return;
    gsap.fromTo(view, { rotation: -0.03 }, { rotation: 0, duration: 0.25, ease: 'back.out(3)' });
  }

  dropOn(view, lane) {
    if (view instanceof TacticView) {
      const index = this.tacticViews.indexOf(view);
      this.tacticLane = { [index]: lane };
      return;
    }
    const index = this.mine.indexOf(view);
    if (this.phase === 'rotate') {
      const next = [...this.lockedSlots];
      next[index] = lane;
      if (!isLegalPlacement(next)) return;
      this.slots = next;
      this.rotated = next.some((slot, i) => slot !== this.lockedSlots[i]) ? index : null;
      return;
    }
    if (this.slots[index] !== lane && this.slots.filter(slot => slot === lane).length >= LANE_CAP) return;
    this.slots[index] = lane;
  }

  // ── flow ─────────────────────────────────────────────────────────────────

  lockIn() {
    if (this.phase !== 'place' || !isLegalPlacement(this.slots)) return;
    this.phase = 'reveal';
    this.lockedSlots = [...this.slots];
    this.selected = null;
    const hidden = this.theirs.filter(view => view.hiddenFace);
    const flips = gsap.timeline({ onComplete: () => { this.phase = 'rotate'; this.rotated = null; this.emit(); } });
    this.place();
    if (this.reducedMotion) hidden.forEach(view => view.setHidden(false));
    else hidden.forEach((view, i) => {
      flips.to(view.scale, { x: 0, duration: 0.14, ease: 'power2.in', onComplete: () => view.setHidden(false) }, 0.28 + i * 0.1);
      flips.to(view.scale, { x: view.scale.y || 0.6, duration: 0.18, ease: 'back.out(2)' }, 0.42 + i * 0.1);
    });
    flips.call(() => this.place());
    this.emit();
  }

  resolve() {
    if (this.phase !== 'rotate') return;
    this.phase = 'resolve';
    const { maps, you, them } = this.game;
    const tactic = this.yourTactic();
    const mine = { roster: you, slots: this.lockedSlots, tactic };
    const theirs = { roster: them, slots: this.oppPlan.slots, tactic: this.oppPlan.tactic };
    // Both IGLs answer the same revealed board, so neither sees the other's move.
    const oppSlots = bestRotate({ you: theirs, them: mine, maps });
    this.oppPlan = { ...this.oppPlan, slots: oppSlots };
    const result = resolveBoard({ maps, you: { ...mine, slots: this.slots }, them: { ...theirs, slots: oppSlots } });
    this.place();
    this.laneViews.forEach((view) => {
      view.myTotal.text = '0';
      view.theirTotal.text = '0';
      view.myFormula.text = '';
      view.theirFormula.text = '';
    });
    this.emit();
    this.timeline = gsap.timeline({
      delay: 0.35,
      onComplete: () => {
        this.phase = 'done';
        this.result = { ...result, tacticUid: tactic?.card.uid ?? null };
        this.emit();
        this.result = null;
      },
    });
    this.timeline.timeScale(this.reducedMotion ? 20 : 1);
    result.lanes.forEach((laneResult, lane) => this.playLane(laneResult, lane));
    if (result.youWon + result.themWon) this.timeline.to(this.root, { duration: 0.2 });
  }

  playLane(laneResult, lane) {
    const view = this.laneViews[lane];
    const tl = this.timeline;
    const scoreSide = (steps, side) => {
      const label = side === 'you' ? view.myTotal : view.theirTotal;
      const formula = side === 'you' ? view.myFormula : view.theirFormula;
      steps.forEach((step, index) => {
        tl.call(() => {
          label.text = String(step.total);
          formula.text = laneFormula(steps.slice(0, index + 1));
          if (step.key === 'player') {
            const roster = side === 'you' ? this.mine : this.theirs;
            const card = roster.find(item => item.card.player === step.label);
            if (card) gsap.fromTo(card.badge.scale, { x: 1.5, y: 1.5 }, { x: 1, y: 1, duration: 0.22, ease: 'power3.out' });
          }
          gsap.fromTo(label.scale, { x: 1.4, y: 1.4 }, { x: 1, y: 1, duration: 0.2, ease: 'power3.out' });
        }, null, step.key === 'player' ? '+=0.13' : '+=0.24');
      });
    };
    scoreSide(laneResult.theirs.steps, 'them');
    scoreSide(laneResult.mine.steps, 'you');
    tl.call(() => {
      const won = laneResult.winner === 'you';
      view.won = laneResult.winner;
      this.paintLane(view, this.laneRect(lane), false);
      view.rule.visible = false;
      view.stamp.text = laneResult.winner ? (won ? 'WON' : 'LOST') : 'TIE';
      view.stamp.style.fill = won ? COLOR.win : COLOR.muted;
      gsap.fromTo(view.stamp.scale, { x: 2.2, y: 2.2 }, { x: 1, y: 1, duration: 0.24, ease: 'power4.out' });
    }, null, '+=0.2');
    tl.to({}, { duration: 0.3 });
  }

  skip() {
    if (this.phase === 'resolve' && this.timeline) this.timeline.progress(1);
  }
}
