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
    // El tono sube con el combo.
    audio.play(combo > 1 ? 'combo' : 'coin', 1 + (combo - 1) * 0.12);
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
  }
}
