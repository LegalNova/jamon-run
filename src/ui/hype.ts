/**
 * HUD de "dopamina": monedas con combo, ruleta de la suerte (global y personal),
 * carrera de caballos y medallas. Vive en la escena del HUD.
 */
import Phaser from 'phaser';
import { HYPE } from '../../shared/balance';
import { audio } from '../core/audio';
import { FONT, fontText } from '../gfx/font';
import { panel, text, UI } from './widgets';

export const GLOBAL_LABELS: Record<string, string> = {
  turbo: 'TURBO',
  lluvia: 'LLUVIA DE MONEDAS',
  cabezones: 'CABEZONES',
  cambiazo: 'CAMBIAZO',
  escudos: 'ESCUDOS GRATIS',
  doble: 'MONEDAS X2',
};

export const PRIZE_LABELS: Record<string, string> = {
  botas: 'BOTAS TURBO',
  escudo: 'ESCUDO',
  monedas: '+50 MONEDAS',
  dash: 'DASH INFINITO',
  invisible: 'INVISIBLE',
  jackpot: '¡JACKPOT!',
};

const WHEEL_COLORS = [0xe43b44, 0xfeae34, 0x63c74d, 0x2f88e8, 0xb55088, 0xfee761];

/** Icono de cada casilla de la ruleta. */
const GLOBAL_ICONS: Record<string, string> = {
  turbo: 'icon_bolt',
  lluvia: 'item_coin',
  cabezones: 'p_star',
  cambiazo: 'icon_dash',
  escudos: 'item_shield',
  doble: 'item_gold',
};
const PRIZE_ICONS: Record<string, string> = {
  botas: 'item_boot',
  escudo: 'item_shield',
  monedas: 'item_coin',
  dash: 'icon_dash',
  invisible: 'ghost',
  jackpot: 'item_gold',
};

export class HypeOverlay {
  private coinText: Phaser.GameObjects.BitmapText;
  private comboText: Phaser.GameObjects.BitmapText;
  private coinIcon: Phaser.GameObjects.Image;
  private shown = 0;
  private target = 0;
  private wheels: Phaser.GameObjects.Container[] = [];
  private race: Phaser.GameObjects.Container | null = null;
  private raceT = -1;
  private raceHorses: { spr: Phaser.GameObjects.Sprite; T: number; bump: number; ph: number }[] = [];
  private raceW = 0;
  private gallopT = 0;
  private confetti: Phaser.GameObjects.Particles.ParticleEmitter;
  private toasts: Phaser.GameObjects.Container[] = [];

  constructor(private s: Phaser.Scene, private W: number, private H: number, x: number, y: number) {
    const g = s.add.graphics();
    panel(g, x, y, 62, 14, UI.panelDark);
    this.coinIcon = s.add.image(x + 8, y + 7, 'item_coin');
    this.coinText = text(s, x + 58, y + 7, '0', { origin: [1, 0.5], color: 0xffd23f });
    this.comboText = text(s, x + 66, y + 7, '', { origin: [0, 0.5], color: 0xfee761 });
    this.confetti = s.add
      .particles(0, 0, 'p_confetti', {
        lifespan: 1600,
        speed: { min: 80, max: 200 },
        angle: { min: 220, max: 320 },
        gravityY: 200,
        rotate: { min: 0, max: 360 },
        tint: [0xe43b44, 0xfee761, 0x63c74d, 0x2f88e8, 0xff7ab8, 0xffffff],
        emitting: false,
      })
      .setDepth(200);
  }

  /** Monedas ganadas por ti. */
  addCoins(n: number, combo: number): void {
    this.target += n;
    audio.play(combo > 1 ? 'combo' : 'coin');
    this.s.tweens.killTweensOf(this.coinIcon);
    this.coinIcon.setScale(1.8);
    this.s.tweens.add({ targets: this.coinIcon, scale: 1, duration: 260, ease: 'Back.easeOut' });
    const f = this.s.add.bitmapText(this.coinText.x - 10, this.coinText.y + 6, FONT, `+${n}`).setTint(0xffd23f).setOrigin(0.5, 0).setDepth(150);
    this.s.tweens.add({ targets: f, y: f.y + 12, alpha: 0, duration: 900, onComplete: () => f.destroy() });
    if (combo > 1) {
      this.s.tweens.killTweensOf(this.comboText);
      this.comboText.setText(fontText(`COMBO X${combo}!`)).setAlpha(1).setScale(2).setTint(combo >= 4 ? 0xff7ab8 : 0xfee761);
      this.s.tweens.add({ targets: this.comboText, scale: 1, duration: 220, ease: 'Back.easeOut' });
      this.s.tweens.add({ targets: this.comboText, alpha: 0, delay: 1500, duration: 400 });
      if (combo >= 3) this.confetti.emitParticleAt(this.coinText.x, this.coinText.y, 8 + combo * 3);
    }
  }

  get coins(): number {
    return this.target;
  }

  /** Ruleta: gira y para en el resultado `r` justo cuando la simulación lo aplica. */
  roulette(kind: 'global' | 'me', r: number, title: string): void {
    const keys: readonly string[] = kind === 'global' ? HYPE.globalWheel : HYPE.personalWheel;
    const labels = keys.map((k) => (kind === 'global' ? GLOBAL_LABELS[k] : PRIZE_LABELS[k]));
    const icons = keys.map((k) => (kind === 'global' ? GLOBAL_ICONS[k] : PRIZE_ICONS[k]));
    const R = kind === 'global' ? 40 : 28;
    const cx = kind === 'global' ? this.W / 2 : 62;
    const cy = kind === 'global' ? this.H / 2 + 34 : this.H - 118;
    const c = this.s.add.container(cx, cy).setDepth(120);
    const back = this.s.add.graphics();
    back.fillStyle(0x0d0b14, 0.7).fillCircle(0, 0, R + 16);
    back.lineStyle(2, 0xfee761, 1).strokeCircle(0, 0, R + 3);
    c.add(back);
    const wheel = this.s.add.container(0, 0);
    const g = this.s.add.graphics();
    const n = labels.length;
    const seg = (Math.PI * 2) / n;
    for (let i = 0; i < n; i++) {
      const a0 = -Math.PI / 2 + i * seg;
      g.fillStyle(WHEEL_COLORS[i % WHEEL_COLORS.length], 1);
      g.slice(0, 0, R, a0, a0 + seg, false);
      g.fillPath();
      g.lineStyle(1, 0x1a1424, 1);
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(Math.cos(a0) * R, Math.sin(a0) * R);
      g.strokePath();
    }
    g.fillStyle(0x1a1424, 1).fillCircle(0, 0, 5);
    g.fillStyle(0xfee761, 1).fillCircle(0, 0, 3);
    wheel.add(g);
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i + 0.5) * seg;
      const ic = this.s.add.image(Math.cos(a) * R * 0.64, Math.sin(a) * R * 0.64, icons[i]);
      if (icons[i] === 'ghost') ic.setFrame('g0').setScale(0.7);
      if (icons[i] === 'p_star') ic.setTint(0xffffff);
      wheel.add(ic);
    }
    c.add(wheel);
    // flecha
    const arrow = this.s.add.graphics();
    arrow.fillStyle(0xffffff, 1).fillTriangle(-5, -R - 9, 5, -R - 9, 0, -R + 2);
    arrow.lineStyle(1, 0x1a1424, 1).strokeTriangle(-5, -R - 9, 5, -R - 9, 0, -R + 2);
    c.add(arrow);
    c.add(text(this.s, 0, -R - 16, title, { color: 0xfee761 }));
    // Rótulo que va cambiando mientras gira (como una tragaperras).
    const resBack = this.s.add.graphics();
    resBack.fillStyle(0x0d0b14, 0.85).fillRect(-46, R + 4, 92, 12);
    c.add(resBack);
    const res = text(this.s, 0, R + 10, '', { color: 0xffffff });
    c.add(res);
    c.setScale(0.2);
    this.s.tweens.add({ targets: c, scale: 1, duration: 260, ease: 'Back.easeOut' });

    const jitter = (Math.random() - 0.5) * seg * 0.6;
    const end = Math.PI * 2 * 5 - (r + 0.5) * seg + jitter;
    let lastSeg = -1;
    const dur = HYPE.spinDelay * 1000 - 150;
    this.s.tweens.add({
      targets: wheel,
      rotation: end,
      duration: dur,
      ease: 'Cubic.easeOut',
      onUpdate: () => {
        const k = Math.floor(((wheel.rotation % (Math.PI * 2)) + Math.PI * 2) / seg);
        if (k !== lastSeg) {
          lastSeg = k;
          audio.play('spinTick');
          // casilla que está bajo la flecha ahora mismo
          const a = Phaser.Math.Angle.Normalize(-wheel.rotation);
          const under = Math.floor(a / seg) % n;
          res.setText(fontText(labels[under])).setTint(WHEEL_COLORS[under % WHEEL_COLORS.length]);
        }
      },
      onComplete: () => {
        res.setText(fontText(labels[r])).setTint(0xfee761).setScale(2);
        this.s.tweens.add({ targets: res, scale: 1, duration: 260, ease: 'Back.easeOut' });
        audio.play(kind === 'me' && r === labels.length - 1 ? 'jackpot' : 'fanfare');
        this.confetti.emitParticleAt(cx, cy - R, kind === 'global' ? 40 : 24);
        this.s.tweens.add({
          targets: c,
          alpha: 0,
          delay: 1300,
          duration: 300,
          onComplete: () => {
            c.destroy();
            this.wheels = this.wheels.filter((w) => w !== c);
          },
        });
      },
    });
    this.wheels.push(c);
  }

  /** Empieza la carrera de caballos (el ganador ya está decidido por la simulación). */
  startRace(w: number, myHorse: number): void {
    this.race?.destroy();
    const Wd = 230;
    const Hd = 60;
    const x0 = this.W / 2 - Wd / 2;
    const y0 = 44;
    const c = this.s.add.container(0, 0).setDepth(110);
    const g = this.s.add.graphics();
    panel(g, x0, y0, Wd, Hd, UI.panelDark);
    for (let i = 0; i < 4; i++) {
      g.fillStyle(i % 2 ? 0x2a6b3a : 0x2f7a42, 1).fillRect(x0 + 2, y0 + 11 + i * 12, Wd - 4, 12);
      if (i === myHorse) g.lineStyle(1, 0xfee761, 1).strokeRect(x0 + 2.5, y0 + 11.5 + i * 12, Wd - 5, 11);
    }
    // meta a cuadros
    for (let j = 0; j < 12; j++) {
      g.fillStyle(j % 2 ? 0xffffff : 0x1a1424, 1).fillRect(x0 + Wd - 18, y0 + 11 + j * 4, 2, 2);
      g.fillStyle(j % 2 ? 0x1a1424 : 0xffffff, 1).fillRect(x0 + Wd - 16, y0 + 11 + j * 4, 2, 2);
    }
    c.add(g);
    c.add(text(this.s, this.W / 2, y0 + 6, '¡CARRERA DE CABALLOS!', { color: 0xfee761 }));
    this.raceHorses = [];
    const T = HYPE.raceSeconds - 0.8;
    const leaderFake = (w + 1 + Math.floor(Math.random() * 3)) % 4;
    for (let i = 0; i < 4; i++) {
      const spr = this.s.add.sprite(x0 + 12, y0 + 17 + i * 12, `horse_${i}`).setOrigin(0.5, 0.5).play(`horse_${i}_run`);
      spr.anims.timeScale = 0.8 + Math.random() * 0.4;
      c.add(spr);
      const name = text(this.s, x0 + 24, y0 + 17 + i * 12, HYPE.horses[i] + (i === myHorse ? ' (TU)' : ''), { origin: [0, 0.5], color: i === myHorse ? 0xfee761 : 0xffffff });
      name.setAlpha(0.75);
      c.add(name);
      this.raceHorses.push({ spr, T: i === w ? T : T * (1.06 + Math.random() * 0.12), bump: i === leaderFake ? 0.12 : i === w ? -0.05 : (Math.random() - 0.5) * 0.08, ph: Math.random() * 6 });
    }
    this.raceW = Wd;
    this.race = c;
    this.raceT = 0;
    audio.play('fanfare');
  }

  endRace(w: number, mine: boolean): void {
    if (!this.race) return;
    this.raceT = -1;
    const c = this.race;
    const label = text(this.s, this.W / 2, 44 + 60 + 8, `¡GANA ${HYPE.horses[w]}!${mine ? ` +${HYPE.coins.horse}` : ''}`, { color: mine ? 0xfee761 : 0xffffff, scale: 2 });
    c.add(label);
    if (mine) this.confetti.emitParticleAt(this.W / 2, 60, 50);
    audio.play(mine ? 'jackpot' : 'fanfare');
    this.s.tweens.add({ targets: c, alpha: 0, delay: 2600, duration: 400, onComplete: () => c.destroy() });
    this.race = null;
  }

  medal(name: string): void {
    audio.play('medal');
    const y = 70 + this.toasts.length * 16;
    const c = this.s.add.container(this.W + 100, y).setDepth(130);
    const g = this.s.add.graphics();
    panel(g, -96, -7, 96, 14, UI.panelDark);
    c.add(g);
    c.add(this.s.add.image(-88, 0, 'p_star').setTint(0xffd23f));
    c.add(text(this.s, -80, 0, `MEDALLA: ${name}`, { origin: [0, 0.5], color: 0xffd23f }));
    this.toasts.push(c);
    this.s.tweens.add({ targets: c, x: this.W - 4, duration: 260, ease: 'Back.easeOut' });
    this.s.tweens.add({
      targets: c,
      x: this.W + 100,
      delay: 2800,
      duration: 260,
      onComplete: () => {
        c.destroy();
        this.toasts = this.toasts.filter((t) => t !== c);
      },
    });
  }

  burst(x: number, y: number, n = 30): void {
    this.confetti.emitParticleAt(x, y, n);
  }

  update(dt: number): void {
    // contador que sube rodando
    if (this.shown < this.target) {
      this.shown = Math.min(this.target, this.shown + Math.max(1, Math.ceil((this.target - this.shown) * dt * 8)));
      this.coinText.setText(String(this.shown));
    }
    if (this.raceT >= 0 && this.race) {
      this.raceT += dt;
      const x0 = this.W / 2 - this.raceW / 2 + 12;
      const len = this.raceW - 34;
      for (const h of this.raceHorses) {
        const base = Math.min(1, this.raceT / h.T);
        const p = Math.min(1, Math.max(0, base + h.bump * Math.sin(Math.PI * Math.min(1, this.raceT / h.T)) + Math.sin(this.raceT * 3 + h.ph) * 0.01));
        h.spr.x = x0 + p * len;
      }
      this.gallopT -= dt;
      if (this.gallopT <= 0) {
        this.gallopT = 0.22;
        audio.play('gallop');
      }
    }
  }
}
