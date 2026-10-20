import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../config/balance';
import { keyName, settings } from '../config/settings';
import { audio } from '../core/audio';
import { input } from '../core/input';
import { ensureCharTexture, Team } from '../gfx/characters';
import { TEAM_COLORS } from '../gfx/palette';
import { profile } from '../config/profile';
import { BiomeId, getMap } from '../world/maps';
import { text, UI } from '../ui/widgets';
import { Backdrop, fadeIn, fadeTo } from './common';

const SEGMENTS = 8;
const SEG = (Math.PI * 2) / SEGMENTS;
const R = 64;

export class RoleRevealScene extends Phaser.Scene {
  private mapId: BiomeId = 'forest';
  private role: Team = 'chaser';
  private wheel!: Phaser.GameObjects.Container;
  private group!: Phaser.GameObjects.Container;
  private spin!: Phaser.Tweens.Tween;
  private lastSeg = 0;
  private phase: 'spin' | 'reveal' | 'ready' = 'spin';
  private backdrop!: Backdrop;
  private prompt?: Phaser.GameObjects.BitmapText;
  private t = 0;
  private winSeg = 0;
  private highlight!: Phaser.GameObjects.Graphics;

  constructor() {
    super('RoleReveal');
  }

  init(data: { mapId?: BiomeId }): void {
    this.mapId = data.mapId ?? 'forest';
    this.role = Math.random() < 0.5 ? 'chaser' : 'escapist';
    this.phase = 'spin';
    this.t = 0;
    this.prompt = undefined;
  }

  create(): void {
    fadeIn(this);
    this.backdrop = new Backdrop(this, false, 0.2);
    text(this, VIEW_W / 2, 16, '¿QUÉ BANDO TE TOCA?', { scale: 2, color: UI.focusLight });
    text(this, VIEW_W / 2, 34, `MAPA: ${getMap(this.mapId).name}`, { color: UI.muted });

    this.group = this.add.container(VIEW_W / 2, 146);
    this.wheel = this.add.container(0, 0);
    this.group.add(this.wheel);
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.4).fillCircle(3, 4, R + 4);
    g.fillStyle(0x0d0b14, 1).fillCircle(0, 0, R + 4);
    for (let i = 0; i < SEGMENTS; i++) {
      const chaser = i % 2 === 0;
      g.fillStyle(chaser ? TEAM_COLORS.chaser.main : TEAM_COLORS.escapist.main, 1);
      g.slice(0, 0, R, i * SEG, (i + 1) * SEG, false);
      g.fillPath();
      g.fillStyle(chaser ? TEAM_COLORS.chaser.dark : TEAM_COLORS.escapist.dark, 1);
      g.slice(0, 0, R * 0.42, i * SEG, (i + 1) * SEG, false);
      g.fillPath();
    }
    g.lineStyle(1, 0x0d0b14, 1);
    for (let i = 0; i < SEGMENTS; i++) {
      g.lineBetween(0, 0, Math.cos(i * SEG) * R, Math.sin(i * SEG) * R);
    }
    g.fillStyle(0xfeae34, 1);
    for (let i = 0; i < SEGMENTS; i++) g.fillRect(Math.round(Math.cos(i * SEG) * (R + 1)) - 1, Math.round(Math.sin(i * SEG) * (R + 1)) - 1, 3, 3);
    this.highlight = this.add.graphics();
    this.wheel.add([g, this.highlight]);
    for (let i = 0; i < SEGMENTS; i++) {
      const a = (i + 0.5) * SEG;
      const chaser = i % 2 === 0;
      const icon = this.add.image(Math.cos(a) * R * 0.7, Math.sin(a) * R * 0.7, chaser ? 'ham' : 'item_boot');
      icon.setRotation(a + Math.PI / 2);
      this.wheel.add(icon);
    }
    const hub = this.add.graphics();
    hub.fillStyle(0x0d0b14, 1).fillCircle(0, 0, 10);
    hub.fillStyle(0xfeae34, 1).fillCircle(0, 0, 8);
    hub.fillStyle(0xfee761, 1).fillCircle(-2, -2, 3);
    this.wheel.add(hub);

    // puntero fijo arriba (se mueve con la rueda, pero no gira)
    const ptr = this.add.graphics();
    ptr.fillStyle(0x0d0b14, 1).fillTriangle(-8, -R - 12, 8, -R - 12, 0, -R + 4);
    ptr.fillStyle(0xfee761, 1).fillTriangle(-6, -R - 11, 6, -R - 11, 0, -R + 1);
    this.group.add(ptr);

    // segmento ganador
    const options = [...Array(SEGMENTS).keys()].filter((i) => (i % 2 === 0) === (this.role === 'chaser'));
    this.winSeg = options[Math.floor(Math.random() * options.length)];
    const jitter = (Math.random() - 0.5) * SEG * 0.6;
    const final = -Math.PI / 2 - (this.winSeg + 0.5) * SEG + jitter + Math.PI * 2 * 6;
    this.wheel.rotation = 0;
    this.lastSeg = this.segUnderPointer();
    this.spin = this.tweens.add({
      targets: this.wheel,
      rotation: final,
      duration: 3600,
      ease: 'Cubic.easeOut',
      onComplete: () => this.reveal(),
    });
    text(this, VIEW_W / 2, VIEW_H - 12, 'ENTER: SALTAR · ESC: VOLVER', { color: UI.muted });
  }

  private segUnderPointer(): number {
    const a = Phaser.Math.Angle.Wrap(-Math.PI / 2 - this.wheel.rotation);
    return Math.floor(Phaser.Math.Angle.Normalize(a) / SEG);
  }

  private reveal(): void {
    if (this.phase !== 'spin') return;
    this.phase = 'reveal';
    audio.play('reveal');
    this.cameras.main.flash(200, 255, 255, 255);
    const chaser = this.role === 'chaser';
    const color = chaser ? TEAM_COLORS.chaser.light : TEAM_COLORS.escapist.light;

    this.highlight.clear();
    this.highlight.lineStyle(2, 0xffffff, 1);
    this.highlight.beginPath();
    this.highlight.slice(0, 0, R, this.winSeg * SEG, (this.winSeg + 1) * SEG, false);
    this.highlight.strokePath();

    this.tweens.add({ targets: this.group, x: 112, scale: 0.75, duration: 500, ease: 'Cubic.easeInOut' });

    const cx = 320;
    const title = text(this, cx, 50, chaser ? '¡EQUIPO AZUL!' : '¡EQUIPO ROJO!', { scale: 2, color });
    text(this, cx, 66, chaser ? 'ERES PERSEGUIDOR' : 'ERES ESCAPISTA', { color });
    title.setScale(0);
    this.tweens.add({ targets: title, scale: 2, duration: 300, ease: 'Back.easeOut' });

    const key = ensureCharTexture(this, this.role, profile.look);
    const spr = this.add.sprite(cx, 138, key, 'down_idle0').setScale(3).setOrigin(0.5, 1);
    spr.play(`${key}_down_run`);
    if (chaser) {
      const ham = this.add.image(cx + 15, 123, 'ham').setScale(3).setOrigin(2 / 15, 4.5 / 9).setRotation(-1.2);
      this.tweens.add({ targets: ham, rotation: 0.6, yoyo: true, repeat: -1, duration: 260, ease: 'Sine.easeInOut', repeatDelay: 400 });
    }
    const goal = chaser
      ? ['PILLA A TODOS LOS ROJOS', 'ANTES DE QUE ACABE EL TIEMPO.']
      : ['SOBREVIVE HASTA QUE ACABE', 'EL TIEMPO. ¡QUE NO TE PILLEN!'];
    goal.forEach((l, i) => text(this, cx, 148 + i * 11, l, { color: UI.text }));
    const b = settings.bindings;
    const lines = chaser
      ? [`${keyName(b.action)}: JAMONAZO`, `${keyName(b.special)}: LANZAR JAMÓN`, `${keyName(b.sprint)}: SPRINT`]
      : [`${keyName(b.action)}: DASH (ESQUIVA)`, `${keyName(b.special)}: BOMBA DE HUMO`, `${keyName(b.sprint)}: SPRINT`];
    lines.forEach((l, i) => text(this, cx, 174 + i * 10, l, { color: UI.focusLight }));
    text(this, cx, 210, `${settings.chasers} AZULES VS ${settings.escapists} ROJOS`, { color: UI.muted });

    this.time.delayedCall(450, () => {
      this.phase = 'ready';
      this.prompt = text(this, cx, 230, 'ENTER / ESPACIO: ¡A JUGAR!', { color: 0xffffff });
    });
  }

  update(_t: number, delta: number): void {
    const dt = delta / 1000;
    this.t += dt;
    this.backdrop.update(dt);
    if (this.phase === 'spin') {
      const s = this.segUnderPointer();
      if (s !== this.lastSeg) {
        this.lastSeg = s;
        audio.play('tick');
      }
    }
    if (this.prompt) this.prompt.setVisible(Math.floor(this.t * 2.5) % 2 === 0);
    if (input.back()) {
      audio.play('back');
      fadeTo(this, 'MapSelect');
      return;
    }
    if (input.confirm()) {
      if (this.phase === 'spin') {
        this.spin.seek(3590);
      } else if (this.phase === 'ready') {
        audio.play('click');
        fadeTo(this, 'Game', { mapId: this.mapId, role: this.role });
      }
    }
  }
}
