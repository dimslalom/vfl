import 'pixi.js/unsafe-eval';
import { Application, Assets, Container, Graphics, Sprite, Text, TextStyle } from 'pixi.js';
import gsap from 'gsap';
import {
  BOARD_SKILLS, LANE_CAP, LANES, bestPlacement, bestRotate, hasSkill, isLegalPlacement, isLegalRotation, laneFormula,
  laneScore, resolveBoard, rotateMoves, tacticMult,
} from '../engine/board/board.js';
import { CHIP_TIERS, chipInfo } from '../chip3d/chipData.js';
import { ICON_PATHS } from '../chip3d/chipIcons.js';
import { mulberry32 } from '../../shared/src/engine/perfectRun.js';
import { STAT_KEYS, STAT_LABELS, STAT_LABELS_FULL } from '../../shared/src/data/statFields.js';
import { playUiSound } from '../lib/uiSound.js';
import { assetPath, cardTextColor, thumbnailSrc } from '../../shared/src/lib/utils.js';

const COLOR = {
  bg: 0x0d0f17, surface: 0x161b29, surfaceHi: 0x1e2435, line: 0x2b3145, ink: 0xece8e1, muted: 0x8a8f9e,
  accent: 0xff4655, opponent: 0x00d2ff, win: 0x00c8a0, gold: 0xd8b34c,
  // On the board you are green and the enemy red, everywhere: fills, cards, chips.
  you: 0x00c8a0, youInk: 0x032019, foe: 0xff4655, foeInk: 0xffffff, slot: 0x161b29,
};
const sideColor = side => (side === 'you' ? COLOR.you : COLOR.foe);
const CARD_W = 400;
const CARD_H = 580;
const CARD_HEX = [0, 40, CARD_W / 2, 0, CARD_W, 40, CARD_W, CARD_H - 40, CARD_W / 2, CARD_H, 0, CARD_H - 40];
const FONT = 'Familjen Grotesk, system-ui, sans-serif';
const display = (size, fill = COLOR.ink, weight = '700') => new TextStyle({ fontFamily: FONT, fontSize: size, fontWeight: weight, fill });
const mono = (size, fill = COLOR.muted) => new TextStyle({ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: size, fontWeight: '700', fill, letterSpacing: 1.2 });

function cutRect(g, w, h, cut) {
  return g.poly([0, 0, w - cut, 0, w, cut, w, h, cut, h, 0, h - cut]);
}

const cardArt = card => [
  assetPath(`/assets/card-bg/${card.palette}-bg.png`),
  assetPath(`/assets/stat-bg/${card.palette}-stat-bg.png`),
  assetPath(thumbnailSrc(card) ?? card.photo),
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

    // The counted stat is a dark strip from under the name to the card's edge,
    // cut by the card's own outline so it follows the angled bottom.
    this.stats = {};
    const strips = new Container();
    const hex = new Graphics().poly(CARD_HEX).fill(0xffffff);
    strips.mask = hex;
    this.face.addChild(strips, hex);
    STAT_KEYS.forEach((key, index) => {
      const x = 56 + index * 72;
      const plate = new Graphics().rect(x - 37, 462, 74, CARD_H - 462).fill(COLOR.bg);
      plate.visible = false;
      strips.addChild(plate);
      const label = new Text({ text: STAT_LABELS[key], style: display(20, ink, '600') });
      label.anchor.set(0.5, 0);
      label.position.set(x, CARD_H - 104);
      const value = new Text({ text: String(card.stats[key]), style: display(38, ink) });
      value.anchor.set(0.5, 0);
      value.position.set(x, CARD_H - 76);
      this.face.addChild(label, value);
      this.stats[key] = { plate, label, value, ink };
    });

    // Labels on the card are cut by its outline too, the way the counted stat
    // is, so nothing ever pokes past the angled top edge.
    const labels = new Container();
    const labelHex = new Graphics().poly(CARD_HEX).fill(0xffffff);
    labels.mask = labelHex;
    this.face.addChild(labels, labelHex);

    // The IGL band runs along the top edge and bends with it, a constant 42 deep,
    // which is as deep as it goes before reaching the rating below. The type is
    // set small so it has air above and below inside the point.
    if (igl) {
      const tag = new Graphics().poly([0, 40, CARD_W / 2, 0, CARD_W, 40, CARD_W, 82, CARD_W / 2, 42, 0, 82]).fill(sideColor(side));
      const label = new Text({ text: 'IGL', style: mono(22, side === 'you' ? COLOR.youInk : COLOR.foeInk) });
      label.anchor.set(0.5, 0.5);
      label.position.set(CARD_W / 2, 25);
      labels.addChild(tag, label);
    }

    // Skills read from the same corner as the rest of the card's identity.
    Object.keys(BOARD_SKILLS).filter(key => hasSkill(card, key)).slice(0, 2).forEach((key, index) => {
      const chip = new Graphics().rect(10, 196 + index * 46, 150, 38).fill(0x10131d);
      const label = new Text({ text: BOARD_SKILLS[key].label.toUpperCase(), style: mono(20, COLOR.gold) });
      label.anchor.set(0, 0.5);
      label.position.set(20, 215 + index * 46);
      this.face.addChild(chip, label);
    });

    this.badge = new Container();
    const badgeFill = new Graphics().rect(-92, -62, 184, 124).fill(sideColor(side));
    this.badgeValue = new Text({ text: '', style: display(104, side === 'you' ? COLOR.youInk : COLOR.foeInk) });
    this.badgeValue.anchor.set(0.5);
    this.badge.addChild(badgeFill, this.badgeValue);
    this.badge.position.set(CARD_W - 92, 62);
    this.badge.visible = false;
    labels.addChild(this.badge);

    this.back = new Container();
    const backPlate = cutRect(new Graphics(), CARD_W, CARD_H, 30).fill(COLOR.surfaceHi).stroke({ color: COLOR.foe, width: 6 });
    const mark = new Text({ text: '?', style: display(160, COLOR.foe) });
    mark.anchor.set(0.5);
    mark.position.set(CARD_W / 2, CARD_H / 2);
    this.back.addChild(backPlate, mark);
    // The selection stroke follows the card's own outline, the same white the
    // chips use, so a picked card and a picked chip read the same way.
    this.ring = new Graphics().poly(CARD_HEX).stroke({ color: 0xffffff, width: 16, join: 'miter' });
    this.ring.visible = false;
    this.addChild(this.face, this.back, this.ring);
    this.setHidden(hiddenFace);
  }

  setSelected(on) {
    this.ring.visible = on;
  }

  setHidden(hidden) {
    this.hiddenFace = hidden;
    this.face.visible = !hidden;
    this.back.visible = hidden;
  }

  // Lights the stat this lane scores: a dark strip with the number in gold, the
  // same gold as the lane's stat tab, so the eye links the two.
  showStat(stat) {
    this.statOn = stat;
    for (const [key, parts] of Object.entries(this.stats)) {
      const on = key === stat;
      parts.plate.visible = on;
      parts.label.style.fill = on ? COLOR.gold : parts.ink;
      parts.value.style.fill = on ? COLOR.gold : parts.ink;
      parts.value.style.fontSize = on ? 48 : 38;
      parts.value.y = on ? CARD_H - 80 : CARD_H - 76;
    }
    this.badge.visible = false;
  }

  // The number that counts, for the score to point at as it adds it.
  statValue() {
    return this.statOn ? this.stats[this.statOn].value : null;
  }
}

// A tactic is a poker chip. In hand its face shows what it rewards as icons;
// on a lane the face shows what it multiplies by there.
const CHIP = 64;
class TacticView extends Container {
  constructor(instance) {
    super();
    this.instance = instance;
    this.w = CHIP;
    this.h = CHIP;
    this.pivot.set(CHIP / 2, CHIP / 2);
    const info = chipInfo(instance.key);
    const tone = CHIP_TIERS[info.tier];
    const r = CHIP / 2;
    const body = new Graphics().circle(r, r, r).fill(tone.body);
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      const spot = new Graphics().rect(-4, -r, 8, 10).fill(tone.spot);
      spot.position.set(r, r);
      spot.rotation = a;
      body.addChild(spot);
    }
    const face = new Graphics().circle(r, r, r * 0.64).fill(tone.face);
    const n = info.icons.length;
    const size = n === 1 ? 24 : n === 2 ? 17 : 11;
    this.icons = new Container();
    info.icons.forEach((name, i) => {
      const svg = `<svg viewBox="0 0 24 24"><g fill="none" stroke="${tone.ink}" stroke-width="2.6" stroke-linecap="square">`
        + ICON_PATHS[name].map(d => `<path d="${d}"/>`).join('') + '</g></svg>';
      const icon = new Graphics().svg(svg);
      icon.scale.set(size / 24);
      const cols = n === 4 ? 2 : n;
      const col = i % cols;
      const row = Math.floor(i / cols);
      const rows = Math.ceil(n / cols);
      icon.position.set(r + (col - (cols - 1) / 2) * (size + 1) - size / 2, r + (row - (rows - 1) / 2) * (size + 1) - size / 2);
      this.icons.addChild(icon);
    });
    this.mult = new Text({ text: '', style: display(17, tone.ink, '800'), resolution: 3 });
    this.mult.anchor.set(0.5);
    this.mult.position.set(r, r);
    this.name = new Text({ text: info.name, style: mono(8, COLOR.muted), resolution: 3 });
    this.name.anchor.set(0.5, 0);
    this.name.position.set(r, CHIP + 6);
    this.addChild(body, face, this.icons, this.mult, this.name);
  }

  // null in hand; the multiplier text once it sits on a lane.
  setPlaced(mult) {
    const placed = mult != null;
    this.mult.text = placed ? mult : '';
    this.icons.visible = !placed || !mult;
    this.name.visible = !placed && !this.compact;   // a phone has no room for the name
  }
}

export default class BoardStage {
  /**
   * chips3d: the tactic chips are drawn by a 3D layer over the board, so the
   * flat chips stay hidden and onChipSpot(index, spot) reports where each placed
   * chip should rest (null when it is in hand).
   */
  constructor(host, { onState, reducedMotion, chips3d = false, onChipSpot }) {
    this.host = host;
    this.onState = onState;
    this.reducedMotion = reducedMotion;
    this.chips3d = chips3d;
    this.onChipSpot = onChipSpot;
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
    this.stopAnimations();
    try { this.app.destroy(true, { children: true }); } catch { /* init never finished */ }
  }

  // ── setup ────────────────────────────────────────────────────────────────

  // Anything still animating must stop before its object is destroyed, or the
  // tween wakes up on a dead Pixi node and throws on every tick from then on.
  stopAnimations() {
    this.timeline?.kill();
    this.flips?.kill();
    const stop = (node) => {
      gsap.killTweensOf(node);
      if (node.scale) gsap.killTweensOf(node.scale);
      node.children?.forEach(stop);
    };
    if (this.root) stop(this.root);
  }

  async deal(game) {
    const fromRound = Boolean(this.layers) && !this.reducedMotion;
    this.stopAnimations();
    const paths = [...game.you, ...game.them].flatMap(cardArt);
    const artPath = assetPath(game.maps[0].image);
    const [textures] = await Promise.all([
      Assets.load([...new Set(paths), artPath]),
      fromRound ? this.flyOutLeft() : Promise.resolve(),
    ]);
    if (!this.alive) return;
    this.game = game;
    this.artMask = null;
    this.root.x = 0;
    this.root.alpha = 1;
    this.root.removeChildren().forEach(child => child.destroy({ children: true }));
    this.phase = 'place';
    this.slots = game.you.map(() => null);
    this.tacticLane = {};
    this.selected = null;
    this.lockedSlots = null;
    const rng = mulberry32(game.seed + 1);
    const opponentTactic = game.opponentTactic;
    this.oppPlan = bestPlacement({ roster: game.them, maps: game.maps, tactic: opponentTactic, rng });
    this.oppShown = [];
    this.textures = textures;
    this.layers = { art: new Container(), lanes: new Container(), cards: new Container() };
    this.root.addChild(this.layers.art, this.layers.lanes, this.layers.cards);
    this.art = new Sprite(textures[artPath]);
    this.art.alpha = 1;
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
      view.visible = !this.chips3d;
      view.eventMode = this.chips3d ? 'none' : 'static';
      view.cursor = 'grab';
      view.on('pointerdown', event => this.dragStart(event, view, null));
      this.layers.cards.addChild(view);
      return view;
    });
    this.relayout(true);
    this.dealIn(fromRound);
    this.emit();
  }

  flyOutLeft() {
    if (!this.layers || this.reducedMotion) return Promise.resolve();
    return new Promise((resolve) => {
      const shift = -(this.app.screen.width || 900) * 0.95;
      const tl = gsap.timeline({ onComplete: resolve });
      tl.to(this.layers.art, { x: shift, alpha: 0, duration: 0.25, ease: 'power2.in' }, 0);
      this.laneViews?.forEach((view, i) => {
        tl.to(view, { x: view.x + shift, alpha: 0, duration: 0.25, ease: 'power2.in' }, i * 0.035);
      });
      tl.to(this.layers.cards, { x: shift, alpha: 0, duration: 0.25, ease: 'power2.in' }, 0.03);
    });
  }

  makeLane(map, lane) {
    const view = new Container();
    view.bg = new Graphics();
    view.band = new Graphics();
    view.title = new Text({ text: map.name.toUpperCase(), style: display(26), resolution: 2 });
    view.callout = new Text({ text: (map.label ?? '').toUpperCase(), style: new TextStyle({ ...mono(11, 0xc8ccd6), letterSpacing: 3 }), resolution: 2 });
    view.callout.anchor.set(0.5, 0);
    view.statPlate = new Graphics();
    view.statText = new Text({ text: STAT_LABELS_FULL[map.stat].toUpperCase(), style: new TextStyle({ ...mono(12, 0x211b06), letterSpacing: 2 }), resolution: 2 });
    view.segs = new Container();
    view.rule = new Text({ text: map.roles.map(role => role.slice(0, 3).toUpperCase()).join(' + '), style: mono(10, COLOR.ink), resolution: 2 });
    view.rule.anchor.set(1, 0.5);
    view.theirTotal = new Text({ text: '?', style: display(32, COLOR.foe), resolution: 2 });
    view.theirTotal.anchor.set(1, 0.5);
    view.myTotal = new Text({ text: '0', style: display(32, COLOR.youInk), resolution: 2 });
    view.myTotal.anchor.set(0, 0.5);
    view.theirFormula = new Text({ text: '', style: mono(11, COLOR.ink), resolution: 2 });
    view.theirFormula.anchor.set(0.5, 0.5);
    view.myFormula = new Text({ text: '', style: mono(11, COLOR.ink), resolution: 2 });
    view.myFormula.anchor.set(0.5, 0.5);
    view.stamp = new Text({ text: '', style: mono(13, COLOR.win), resolution: 2 });
    view.stamp.anchor.set(1, 0.5);
    view.theirFormula.visible = false;
    view.myFormula.visible = false;
    view.mySteps = [];
    view.theirSteps = [];
    view.addChild(view.bg, view.band, view.segs, view.title, view.callout, view.statPlate, view.statText, view.rule, view.theirTotal, view.myTotal, view.theirFormula, view.myFormula, view.stamp);
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
    const margin = narrow ? 6 : W < 1000 ? 20 : 40;
    const gap = narrow ? 6 : 20;
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
    const laneW = (Math.min(W, 1400) - margin * 2 - gap * 2) / 3;
    const startX = (W - (laneW * 3 + gap * 2)) / 2;
    const header = narrow ? 44 : 96;
    const band = narrow ? 40 : 50;
    const pad = narrow ? 6 : 16;
    const sumLine = narrow ? 4 : 30;
    return { W, H, narrow, margin, gap, topBar, bench, handCard, handH, handY, benchH, lanesTop, lanesBottom, laneW, startX, header, band, pad, sumLine, bottomBar };
  }

  // One column, top to bottom: header, their cards, their sum, the score band,
  // your sum, your cards. Everything inside sits clear of the column's edge.
  laneRows(r) {
    const m = this.metrics();
    const rowH = (r.h - m.header - m.band - m.sumLine * 2 - m.pad) / 2;
    const bandTop = m.header + rowH + m.sumLine;
    return { rowH, bandTop, myRow: bandTop + m.band + m.sumLine };
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
    const { rowH, myRow } = this.laneRows(r);
    const rowTop = r.y + (side === 'them' ? m.header : myRow);
    if (m.narrow) {
      const cardW = Math.min(r.w - 12, (rowH - 4 - (LANE_CAP - 1) * 24) * (CARD_W / CARD_H));
      const cardH = cardW * (CARD_H / CARD_W);
      return { x: r.x + r.w / 2, y: rowTop + 2 + cardH / 2 + order * 24, scale: cardW / CARD_W, depth: order };
    }
    const cardGap = 10;
    const cardW = Math.min((r.w - m.pad * 2 - cardGap * (LANE_CAP - 1)) / LANE_CAP, (rowH - 8) * (CARD_W / CARD_H));
    const step = cardW + cardGap;
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

  tacticTarget(index, laneOverride) {
    const m = this.metrics();
    const lane = laneOverride ?? this.tacticLane[index];
    if (lane != null) {
      const r = this.laneRect(lane);
      if (m.narrow) return { x: r.x + r.w * 0.62, y: r.y + this.laneRows(r).bandTop + m.band / 2, scale: 0.45 };
      // On its own segment under the bar once that exists; on the bar until then.
      const at = this.laneViews[lane].chipAt;
      if (at) return { x: r.x + at.x, y: r.y + at.y, scale: 0.5 };
      return { x: r.x + r.w - m.pad - 40, y: r.y + this.laneRows(r).bandTop + m.band / 2, scale: 0.6 };
    }
    const count = this.tacticViews.length;
    return m.narrow
      ? { x: m.W / 2 + (index - (count - 1) / 2) * (m.W / count), y: m.lanesBottom + 22, scale: Math.min(0.6, (m.W / count - 8) / CHIP) }
      : { x: m.W - m.margin - 50, y: m.handY + (index - (count - 1) / 2) * Math.min(88, 220 / Math.max(1, count - 1)), scale: 1 };
  }

  // ── 3D chips ─────────────────────────────────────────────────────────────

  // Where the 3D stack sits (beside the hand) and where it opens (over the
  // lanes), in board pixels, with the chip size in pixels.
  chipAnchors() {
    const m = this.metrics();
    return {
      closed: m.narrow
        ? { x: m.W - 34, y: m.lanesBottom + 22, size: 40 }
        : { x: m.W - m.margin - 50, y: m.handY, size: 64 },
      // Opened, they fan out where they sat, a little bigger, spreading left
      // into the room the hand leaves them, never over the lanes.
      open: m.narrow
        ? { x: m.W - 60, y: m.lanesBottom + 18, size: 44, width: 110 }
        : { x: m.W - m.margin - 90, y: m.handY - 6, size: 72, width: 200 },
    };
  }

  // Where a chip played to this lane rests, the same spot the flat chip used.
  chipSpot(lane) {
    const { x, y, scale } = this.tacticTarget(-1, lane);
    return { id: lane, x, y, size: CHIP * scale };
  }

  // A chip dropped from the 3D layer: one tactic per board, as with the flat chips.
  setTacticLane(index, lane) {
    if (this.phase !== 'place') return;
    if (lane == null) delete this.tacticLane[index];
    else this.tacticLane = { [index]: lane };
    this.place();
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
    // One map seen through three windows: the columns are the mask.
    this.artMask.clear();
    this.laneViews.forEach((_, lane) => {
      const r = this.laneRect(lane);
      this.artMask.rect(r.x, r.y, r.w, r.h).fill(0xffffff);
    });
    this.art.mask = this.artMask;
    this.laneViews.forEach((view, lane) => {
      const r = this.laneRect(lane);
      view.position.set(r.x, r.y);
      view.hitArea = { contains: (x, y) => x >= 0 && y >= 0 && x <= r.w && y <= r.h };
      this.paintLane(view, r, false);
      const { rowH, bandTop, myRow } = this.laneRows(r);
      const { pad } = m;
      view.statText.style.fontSize = m.narrow ? 8 : 12;
      view.rule.style.fontSize = m.narrow ? 7 : 10;
      if (m.narrow) {
        view.title.style.fontSize = 18;
        view.title.anchor.set(0, 0);
        view.title.position.set(pad, 2);
        view.callout.visible = false;
        const chipX = pad;
        const chipY = 26;
        view.statText.anchor.set(0, 0);
        view.statText.position.set(chipX + 6, chipY + 3);
        view.statPlate.clear().rect(chipX, chipY, view.statText.width + 12, view.statText.height + 6).fill(COLOR.gold);
        view.rule.visible = false;
      } else {
        // Centred like a table marking: the lane, its callout, then the stat it scores
        // on a gold tab whose point echoes the card's angled edge.
        view.title.style.fontSize = 28;
        view.title.anchor.set(0.5, 0);
        view.title.position.set(r.w / 2, 8);
        view.callout.visible = true;
        view.callout.position.set(r.w / 2, 40);
        const tabW = view.statText.width + 28;
        const tabH = 28;
        const x0 = r.w / 2 - tabW / 2;
        const y0 = 58;
        view.statText.anchor.set(0.5, 0);
        view.statText.position.set(r.w / 2, y0 + 6);
        view.statPlate.clear()
          .poly([x0, y0, x0 + tabW, y0, x0 + tabW, y0 + tabH * 0.76, r.w / 2, y0 + tabH, x0, y0 + tabH * 0.76])
          .fill(COLOR.gold);
        view.rule.visible = r.w > 300;
        view.rule.position.set(r.w - pad, 20);
      }
      view.stamp.position.set(r.w - pad, m.narrow ? 12 : 44);
      const inset = m.narrow ? 6 : 14;
      const middle = bandTop + m.band / 2;
      const fontSize = m.narrow ? 20 : 32;
      view.theirTotal.style.fontSize = fontSize;
      view.myTotal.style.fontSize = fontSize;
      view.myTotal.position.set(pad + inset, middle);
      view.theirTotal.position.set(r.w - pad - inset, middle);
      view.theirFormula.position.set(r.w / 2, m.header + rowH + m.sumLine / 2);
      view.myFormula.position.set(r.w / 2, myRow - m.sumLine / 2);
    });
    this.place(instant);
  }

  paintLane(view, r, hot) {
    const m = this.metrics();
    const { bandTop } = this.laneRows(r);
    const alpha = view.won === 'you' ? 0.28 : view.won === 'them' ? 0.76 : 0.62;
    view.bg.clear().rect(0, 0, r.w, r.h).fill({ color: COLOR.bg, alpha });
    if (view.won === 'you') {
      view.bg.rect(2, 2, r.w - 4, r.h - 4).stroke({ color: COLOR.win, width: 3, alpha: 0.95 });
      view.bg.rect(6, 6, r.w - 12, r.h - 12).stroke({ color: COLOR.win, width: 1, alpha: 0.45 });
    } else if (view.won === 'them') {
      view.bg.rect(0, 0, r.w, r.h).fill({ color: 0x4a1820, alpha: 0.18 });
      const cx = r.w * 0.48;
      const cy = bandTop + m.band * 0.5;
      const rays = [
        [0, 0], [r.w * 0.52, 0], [r.w, r.h * 0.18], [r.w, r.h * 0.62],
        [r.w * 0.85, r.h], [r.w * 0.35, r.h], [0, r.h * 0.82], [0, r.h * 0.36],
      ];
      rays.forEach(([tx, ty], i) => {
        const mx = (cx + tx) * 0.5 + ((i % 2 ? 1 : -1) * 14);
        const my = (cy + ty) * 0.5 + ((i % 3 ? -1 : 1) * 12);
        view.bg.moveTo(cx + 1.5, cy + 1.5).lineTo(mx + 1.5, my + 1.5).lineTo(tx + 1.5, ty + 1.5).stroke({ color: 0x080a12, width: 2.5, alpha: 0.75 });
        view.bg.moveTo(cx, cy).lineTo(mx, my).lineTo(tx, ty).stroke({ color: 0xf5d8dc, width: 1.2, alpha: 0.75 });
      });
    } else if (hot) {
      view.bg.rect(1, 1, r.w - 2, r.h - 2).stroke({ color: COLOR.ink, width: 2 });
    }
    this.paintBar(view, r, bandTop, m);
  }

  // A tug of war: your green from the left, their red from the right, each in
  // proportion to its total. The line where they meet is the margin.
  paintBar(view, r, bandTop = this.laneRows(r).bandTop, m = this.metrics()) {
    const x0 = m.pad;
    const w = r.w - m.pad * 2;
    const mine = Number(view.myTotal.text) || 0;
    const theirs = /^\d+$/.test(view.theirTotal.text) ? Number(view.theirTotal.text) : null;
    const share = theirs == null ? (mine > 0 ? 0.8 : 0.5) : mine + theirs > 0 ? mine / (mine + theirs) : 0.5;
    const split = x0 + w * share;
    view.band.clear().rect(x0, bandTop, w, m.band).fill(COLOR.slot);
    if (mine > 0) view.band.rect(x0, bandTop, w * share, m.band).fill(COLOR.you);
    if (theirs) view.band.rect(split, bandTop, x0 + w - split, m.band).fill(COLOR.foe);
    if (theirs != null && mine > 0) view.band.rect(split - 1, bandTop - 6, 2, m.band + 12).fill(COLOR.ink);
    view.myTotal.style.fill = mine > 0 ? COLOR.youInk : COLOR.muted;
    view.theirTotal.style.fill = theirs ? COLOR.foeInk : COLOR.foe;
    this.paintSegs(view, { x0, w, split, bandTop, mine, theirs }, m);
  }

  // The bar built from the players: under your fill, one segment per card with
  // its face and the number it adds, then any bonus, then the chip's share.
  // Their revealed cards line up over theirs. The segments end where the fill ends.
  paintSegs(view, bar, m) {
    view.segs.removeChildren().forEach(child => child.destroy({ children: true }));
    view.chipAt = null;
    if (m.narrow) return;
    const h = m.sumLine - 6;
    const row = (side, steps, fromX, width, y) => {
      if (!steps.length || width <= 0) return;
      const players = steps.filter(step => step.key === 'player');
      const bonus = steps.filter(step => step.op === '+' && step.key !== 'player').reduce((sum, step) => sum + step.value, 0);
      const base = players.reduce((sum, step) => sum + step.value, 0) + bonus;
      const tactic = steps.find(step => step.key === 'tactic');
      const extra = tactic ? Math.max(0, tactic.total - base) : 0;
      const units = base + extra;
      if (units <= 0) return;
      const roster = side === 'you' ? this.game.you : this.game.them;
      const items = [
        ...players.map(step => ({ value: step.value, text: String(step.value), card: roster.find(card => card.player === step.label) })),
        ...(bonus ? [{ value: bonus, text: `+${bonus}`, solid: true }] : []),
        ...(extra ? [{ value: extra, text: `×${tactic.value}`, outline: true }] : []),
      ];
      const color = sideColor(side);
      let x = fromX;
      for (const item of items) {
        const sw = (width * item.value) / units;
        const g = new Graphics();
        if (item.outline) g.rect(x + 2, y + 1, sw - 3, h - 2).stroke({ color, width: 2, alpha: 0.7 });
        else g.rect(x + 1, y, sw - 2, h).fill(item.solid ? { color } : { color, alpha: 0.3 });
        view.segs.addChild(g);
        const label = new Text({ text: item.text, style: display(13, item.solid ? (side === 'you' ? COLOR.youInk : COLOR.foeInk) : COLOR.ink, '800'), resolution: 2 });
        label.anchor.set(0.5, 0.5);
        let cx = x + sw / 2;
        const photo = item.card && this.textures?.[cardArt(item.card)[2]];
        if (photo && sw > 46) {
          const face = new Sprite(photo);
          face.setSize(h - 4, h - 4);
          face.position.set(x + 5, y + 2);
          view.segs.addChild(face);
          cx += (h - 2) / 2;
        }
        label.position.set(cx, y + h / 2);
        label.visible = label.width < sw - 4;
        // Your chip rests on the share it adds, so its own segment carries no label.
        if (item.outline && side === 'you') {
          view.chipAt = { x: x + sw / 2, y: y + h / 2 };
          label.visible = false;
        }
        view.segs.addChild(label);
        x += sw;
      }
    };
    row('you', view.mySteps, bar.x0, bar.mine > 0 ? bar.split - bar.x0 : 0, bar.bandTop + m.band + 3);
    row('them', view.theirSteps, bar.split, bar.theirs ? bar.x0 + bar.w - bar.split : 0, bar.bandTop - m.sumLine + 3);
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
      view.setSelected(view === this.selected);
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
    const narrow = this.metrics().narrow;
    this.tacticViews.forEach((view, index) => {
      view.compact = narrow;
      if (narrow) view.name.visible = false;
      if (view !== this.dragging?.view) this.move(view, this.tacticTarget(index), instant);
    });
    this.refreshTotals();
  }

  dealIn(fromRound = false) {
    if (this.reducedMotion) return;
    if (fromRound) {
      const shift = (this.app.screen.width || 900) * 0.95;
      this.layers.art.x = shift;
      this.layers.art.alpha = 0;
      gsap.to(this.layers.art, { x: 0, alpha: 1, duration: 0.36, ease: 'power3.out' });
      this.laneViews.forEach((view, i) => {
        const targetX = view.x;
        view.x = targetX + shift;
        view.alpha = 0;
        gsap.to(view, { x: targetX, alpha: 1, duration: 0.36, delay: i * 0.045, ease: 'power3.out' });
      });
      this.theirs.forEach((view, i) => {
        const targetX = view.x;
        view.x = targetX + shift;
        view.alpha = 0;
        gsap.to(view, { x: targetX, alpha: 1, duration: 0.36, delay: 0.06 + i * 0.03, ease: 'power3.out' });
      });
      [...this.mine, ...this.tacticViews].forEach((view, index) => {
        const target = { y: view.y };
        view.alpha = 0;
        view.y = target.y + 30;
        gsap.to(view, { alpha: 1, y: target.y, duration: 0.32, delay: 0.14 + index * 0.035, ease: 'power3.out' });
      });
      return;
    }
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
    // Once the enemy is revealed their auras count, so show the real board.
    const revealed = this.phase === 'rotate' && this.scoreBoard();
    this.laneViews.forEach((view, lane) => {
      const cards = this.game.you.filter((_, i) => this.slots[i] === lane);
      const score = revealed
        ? revealed.lanes[lane].mine
        : laneScore(cards, this.game.maps[lane], tactic?.lane === lane ? tactic.card : null);
      view.myTotal.text = String(score.total);
      view.myFormula.text = laneFormula(score.steps);
      view.mySteps = score.steps;
    });
    this.tacticViews.forEach((view, index) => {
      const lane = this.tacticLane[index];
      if (lane == null) { view.setPlaced(null); return; }
      const cards = this.game.you.filter((_, i) => this.slots[i] === lane);
      view.setPlaced(cards.length ? `×${tacticMult(this.game.tactics[index], cards)}` : '');
    });
    if (this.phase !== 'place') this.paintOpponentTotals();
    this.laneViews.forEach((view, lane) => this.paintBar(view, this.laneRect(lane)));
    // The bar just moved the chip's segment, so the chip follows it.
    this.tacticViews.forEach((view, index) => {
      if (view !== this.dragging?.view) this.move(view, this.tacticTarget(index), false);
      if (this.chips3d) this.onChipSpot?.(index, this.tacticLane[index] == null ? null : this.chipSpot(this.tacticLane[index]));
    });
    this.emit();
  }

  scoreBoard() {
    const { maps, you, them } = this.game;
    return resolveBoard({
      maps,
      you: { roster: you, slots: this.slots, tactic: this.yourTactic() },
      them: { roster: them, slots: this.oppPlan.slots, tactic: this.oppPlan.tactic },
    });
  }

  paintOpponentTotals() {
    if (!isLegalPlacement(this.slots)) return;
    const board = this.scoreBoard();
    this.laneViews.forEach((view, lane) => {
      const score = board.lanes[lane].theirs;
      view.theirTotal.text = String(score.total);
      view.theirFormula.text = laneFormula(score.steps);
      view.theirSteps = score.steps;
    });
  }

  emit() {
    this.onState?.({
      phase: this.phase,
      legal: isLegalPlacement(this.slots.filter(slot => slot != null)),
      placed: this.slots.filter(slot => slot != null).length,
      rotated: Boolean(this.lockedSlots?.some((slot, index) => slot !== this.slots[index])),
      moves: this.game ? rotateMoves(this.game.you) : 1,
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
    playUiSound(view instanceof TacticView ? 'chip_lift' : 'lift');
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
      // A tap picks a card (white stroke); a second tap on it lets it go.
      this.selected = this.selected === drag.view ? null : drag.view;
      playUiSound('select');
      this.pulse(drag.view);
      this.place();
      return;
    }
    if (this.selected === drag.view) this.selected = null;
    if (lane != null) {
      this.dropOn(drag.view, lane);
      playUiSound(drag.view instanceof TacticView ? 'chip_drop' : 'drop');
    } else if (this.phase === 'place' && drag.view instanceof CardView) {
      this.slots[this.mine.indexOf(drag.view)] = null;
      playUiSound('drop');
    } else if (this.phase === 'place') {
      delete this.tacticLane[this.tacticViews.indexOf(drag.view)];
      playUiSound('chip_drop');
    }
    this.place();
  }

  tapLane(lane) {
    if (!this.selected) return;
    const isChip = this.selected instanceof TacticView;
    this.dropOn(this.selected, lane);
    playUiSound(isChip ? 'chip_drop' : 'drop');
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
      const next = [...this.slots];
      next[index] = lane;
      if (isLegalRotation(this.lockedSlots, next, this.game.you)) this.slots = next;
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
    playUiSound('lock_in');
    const hidden = this.theirs.filter(view => view.hiddenFace);
    const flips = gsap.timeline({ onComplete: () => { this.phase = 'rotate'; playUiSound('rotate_ready'); this.place(); } });
    this.flips = flips;
    this.place();
    if (this.reducedMotion) hidden.forEach(view => view.setHidden(false));
    else hidden.forEach((view, i) => {
      flips.to(view.scale, { x: 0, duration: 0.14, ease: 'power2.in', onStart: () => playUiSound('flip', i), onComplete: () => view.setHidden(false) }, 0.28 + i * 0.1);
      flips.to(view.scale, { x: view.scale.y || 0.6, duration: 0.18, ease: 'back.out(2)' }, 0.42 + i * 0.1);
    });
    flips.call(() => this.place());
    this.emit();
  }

  resolve() {
    if (this.phase !== 'rotate') return;
    this.phase = 'resolve';
    playUiSound('lock_in');
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
      view.mySteps = [];
      view.theirSteps = [];
    });
    this.laneViews.forEach((view, lane) => this.paintBar(view, this.laneRect(lane)));
    this.emit();
    this.timeline = gsap.timeline({
      delay: 0.35,
      onComplete: () => {
        this.phase = 'done';
        this.result = { ...result, tactic: tactic?.card ?? null, tactics: tactic ? [tactic] : [], slots: this.slots };
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
          view[side === 'you' ? 'mySteps' : 'theirSteps'] = steps.slice(0, index + 1);
          this.paintBar(view, this.laneRect(lane));
          if (step.key === 'player') {
            const roster = side === 'you' ? this.mine : this.theirs;
            const card = roster.find(item => item.card.player === step.label);
            const value = card?.statValue();
            if (value) gsap.fromTo(value.scale, { x: 1.5, y: 1.5 }, { x: 1, y: 1, duration: 0.22, ease: 'power3.out' });
            playUiSound(side === 'you' ? 'score' : 'score_opp', index + lane * 2);
          } else if (step.key === 'tactic') {
            playUiSound('tactic_mult', step.value);
          } else if (step.key === 'trick') {
            playUiSound('skill_one_trick');
          } else if (step.key === 'aura') {
            playUiSound('skill_aura');
          } else {
            playUiSound('combo', index);
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
      view.stamp.text = '';
      playUiSound(won ? 'lane_win' : 'lane_loss', lane);
    }, null, '+=0.2');
    tl.to({}, { duration: 0.3 });
  }

  skip() {
    if (this.phase === 'resolve' && this.timeline) this.timeline.progress(1);
  }
}
