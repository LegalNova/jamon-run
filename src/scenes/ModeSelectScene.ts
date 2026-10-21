import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../config/balance';
import { wallet } from '../config/profile';
import { audio } from '../core/audio';
import { input } from '../core/input';
import { levelFor } from '../../shared/balance';
import { MODE_LIST, ModeInfo } from '../../shared/modes/rules';
import { FONT, fontText } from '../gfx/font';
import { Button, Focusable, Menu, text, UI } from '../ui/widgets';
import { Backdrop, fadeIn, fadeTo } from './common';

export const MODE_COLORS: Record<string, number> = { pilla: 0xfeae34, infeccion: 0x9cff5a, bomba: 0xff5a5a, escondite: 0x7cc8ff };

/** Parte un texto en líneas de como mucho `max` caracteres. */
export function wrapWords(s: string, max: number): string[] {
  const out: string[] = [];
  let cur = '';
  for (const w of s.split(' ')) {
    if (cur && (cur + ' ' + w).length > max) {
      out.push(cur);
      cur = w;
    } else cur = cur ? cur + ' ' + w : w;
  }
  if (cur) out.push(cur);
  return out;
}

const CW = 108;
const CH = 178;

/** Tarjeta grande y animada de un modo de juego. */
export class ModeCard extends Phaser.GameObjects.Container implements Focusable {
  private g: Phaser.GameObjects.Graphics;
  private icon: Phaser.GameObjects.Image;
  private focused = false;
  enabled = true;
  menu?: Menu;
  private baseY: number;
  private t = Math.random() * 5;
  private sparks: Phaser.GameObjects.Particles.ParticleEmitter;
  private badge: Phaser.GameObjects.BitmapText | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number, readonly info: ModeInfo, private onPick: () => void, extra?: string) {
    super(scene, x, y);
    this.baseY = y;
    this.g = scene.add.graphics();
    this.add(this.g);
    const accent = MODE_COLORS[info.id];
    this.sparks = scene.add.particles(0, 0, 'p_star', {
      lifespan: 500,
      speed: { min: 10, max: 40 },
      scale: { start: 0.8, end: 0 },
      tint: [accent, 0xffffff],
      emitting: false,
    });
    this.add(this.sparks);
    this.icon = scene.add.image(0, -CH / 2 + 38, `mode_${info.id}`).setScale(2);
    const words = info.name.split(' ');
    const n1 = scene.add.bitmapText(0, -CH / 2 + 76, FONT, fontText(words[0])).setOrigin(0.5).setScale(words[0].length > 8 ? 1 : 2).setTint(accent);
    const n2 = scene.add.bitmapText(0, -CH / 2 + 90, FONT, fontText(words.slice(1).join(' '))).setOrigin(0.5).setScale(words.slice(1).join(' ').length > 8 ? 1 : 2).setTint(accent);
    // descripción partida en líneas que quepan en la tarjeta
    const lines = wrapWords(info.tagline, 19).slice(0, 3);
    const desc = lines.map((l, i) => scene.add.bitmapText(0, -CH / 2 + 110 + i * 10, FONT, fontText(l)).setOrigin(0.5).setTint(UI.text));
    const pl = scene.add.bitmapText(0, CH / 2 - 22, FONT, fontText(`${info.players} JUGADORES`)).setOrigin(0.5).setTint(UI.muted);
    this.add([this.icon, n1, n2, ...desc, pl]);
    if (extra) {
      this.badge = scene.add.bitmapText(0, CH / 2 - 10, FONT, fontText(extra)).setOrigin(0.5).setTint(UI.focusLight);
      this.add(this.badge);
    }
    if (info.night) this.add(scene.add.bitmapText(CW / 2 - 6, -CH / 2 + 8, FONT, fontText('NOCHE')).setOrigin(1, 0.5).setTint(0x8b9bb4));
    if (info.id !== 'pilla') this.add(scene.add.bitmapText(-CW / 2 + 6, -CH / 2 + 8, FONT, fontText('NUEVO')).setOrigin(0, 0.5).setTint(0xff7ab8));
    this.setSize(CW, CH);
    this.setInteractive({ useHandCursor: true });
    this.on('pointerover', () => this.menu?.focusItem(this));
    this.on('pointerup', () => this.activate());
    this.redraw();
    scene.add.existing(this);
  }

  setBadge(s: string): void {
    this.badge?.setText(fontText(s));
  }

  setFocused(f: boolean, silent = false): void {
    if (f && !this.focused && !silent) audio.play('hover');
    this.focused = f;
    if (f) this.sparks.emitParticleAt(0, -CH / 2 + 38, 10);
    this.redraw();
  }

  activate(): void {
    audio.play('click');
    this.sparks.emitParticleAt(0, -CH / 2 + 38, 24);
    this.scene.tweens.add({ targets: this, scale: 1.08, yoyo: true, duration: 90 });
    this.onPick();
  }

  tick(dt: number): void {
    this.t += dt;
    const target = this.focused ? this.baseY - 6 + Math.round(Math.sin(this.t * 4) * 1.5) : this.baseY;
    this.y += (target - this.y) * Math.min(1, dt * 14);
    // Cada icono se anima a su manera.
    const id = this.info.id;
    const k = this.focused ? 1 : 0.4;
    if (id === 'pilla') this.icon.setRotation(Math.sin(this.t * 6) * 0.25 * k);
    else if (id === 'infeccion') this.icon.setScale(2 + Math.sin(this.t * 5) * 0.15 * k).setRotation(this.t * 0.6 * k);
    else if (id === 'bomba') this.icon.setScale(2 + Math.max(0, Math.sin(this.t * 9)) * 0.2 * k).setX(Math.sin(this.t * 40) * k);
    else this.icon.setY(-CH / 2 + 38 + Math.abs(Math.sin(this.t * 3)) * -4 * k).setScale(2 + (Math.sin(this.t * 3) > 0.95 ? 0.2 : 0));
    if (this.focused && Math.random() < dt * 6) this.sparks.emitParticleAt((Math.random() - 0.5) * 40, -CH / 2 + 38 + (Math.random() - 0.5) * 30, 1);
  }

  private redraw(): void {
    const g = this.g;
    const accent = MODE_COLORS[this.info.id];
    g.clear();
    g.fillStyle(0x000000, 0.4).fillRect(-CW / 2 + 3, -CH / 2 + 4, CW, CH);
    g.fillStyle(this.focused ? accent : 0x0d0b14, 1).fillRect(-CW / 2, -CH / 2, CW, CH);
    g.fillStyle(this.focused ? UI.panelLight : UI.panel, 1).fillRect(-CW / 2 + 2, -CH / 2 + 2, CW - 4, CH - 4);
    g.fillStyle(accent, 0.18).fillRect(-CW / 2 + 2, -CH / 2 + 2, CW - 4, 64);
    g.fillStyle(accent, 1).fillRect(-CW / 2 + 2, -CH / 2 + 2, CW - 4, 2);
  }
}

/** "Elige modo": 4 tarjetas grandes. Offline lleva al tutorial y luego a elegir mapa. */
export class ModeSelectScene extends Phaser.Scene {
  private menu!: Menu;
  private cards: ModeCard[] = [];
  private backdrop!: Backdrop;

  constructor() {
    super('ModeSelect');
  }

  create(): void {
    fadeIn(this);
    this.backdrop = new Backdrop(this, false);
    text(this, VIEW_W / 2, 10, 'ELIGE MODO', { scale: 2, color: UI.focusLight });
    const lv = levelFor(wallet.xp);
    text(this, VIEW_W / 2, 24, `NIVEL ${lv.level} · ${wallet.coins} MONEDAS`, { color: 0xffd23f });
    this.menu = new Menu(true);
    this.cards = MODE_LIST.map((info, i) => {
      const rec = wallet.records[info.id];
      const extra = rec ? `RÉCORD ${rec.best} · ${rec.wins}/${rec.games} V` : '¡PRUÉBALO!';
      const card = new ModeCard(this, VIEW_W / 2 + (i - 1.5) * (CW + 8), 130, info, () => {
        this.time.delayedCall(140, () => fadeTo(this, 'Tutorial', { mode: info.id }));
      }, extra);
      this.menu.add(card);
      return card;
    });
    this.menu.add(new Button(this, VIEW_W / 2, VIEW_H - 12, 'VOLVER', () => fadeTo(this, 'Menu'), 80, 13));
  }

  update(_t: number, delta: number): void {
    const dt = delta / 1000;
    this.backdrop.update(dt);
    for (const c of this.cards) c.tick(dt);
    if (input.back()) {
      audio.play('back');
      fadeTo(this, 'Menu');
      return;
    }
    const n = this.cards.length;
    if (input.nav('down')) this.menu.setIndex(n);
    else if (input.nav('up') && this.menu.index === n) this.menu.setIndex(0);
    this.menu.update();
  }
}
