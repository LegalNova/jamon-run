import Phaser from 'phaser';
import { cosItem, MISSIONS, Notice } from '../../shared/economy';
import { audio } from '../core/audio';
import { FONT, fontText } from '../gfx/font';
import { account } from '../net/account';
import { panel, text, UI } from '../ui/widgets';
import { viewSize } from './common';

interface Toast {
  c: Phaser.GameObjects.Container;
  life: number;
  y: number;
}

/**
 * Capa que va siempre encima: saldo de lonchas (arriba a la derecha, con contador animado),
 * notificaciones que entran por un lado y la celebración al subir de nivel.
 */
export class ToastScene extends Phaser.Scene {
  private W = 480;
  private H = 270;
  private badge!: Phaser.GameObjects.Container;
  private badgeText!: Phaser.GameObjects.BitmapText;
  private badgeIcon!: Phaser.GameObjects.Image;
  private shown = -1;
  private toasts: Toast[] = [];
  private queue: { text: string; color: number; icon: string }[] = [];
  private confetti!: Phaser.GameObjects.Particles.ParticleEmitter;
  private t = 0;
  private gap = 0;

  constructor() {
    super('Toast');
  }

  create(): void {
    this.layout();
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.layout(), this);
    this.confetti = this.add
      .particles(0, 0, 'p_confetti', {
        lifespan: 1800,
        speed: { min: 80, max: 220 },
        angle: { min: 200, max: 340 },
        gravityY: 220,
        rotate: { min: 0, max: 360 },
        tint: [0xe43b44, 0xfee761, 0x63c74d, 0x2f88e8, 0xff7ab8, 0xffffff],
        emitting: false,
      })
      .setDepth(50);
    account.onChange(() => this.refreshBadge());
    account.onNotice((n) => this.onNotice(n));
    this.game.events.on('toast', (s: string, color = UI.text, icon = 'icon_loncha') => this.push(s, color, icon));
    this.game.events.on('confetti', (x: number, y: number, n: number) => this.confetti.emitParticleAt(x, y, n));
    void account.load();
  }

  private layout(): void {
    const { Z, W, H } = viewSize(this);
    this.W = W;
    this.H = H;
    this.cameras.main.setZoom(Z).setOrigin(0, 0).setScroll(0, 0);
    this.badge?.destroy();
    const c = this.add.container(W - 4, 4).setDepth(40);
    const g = this.add.graphics();
    panel(g, -70, 0, 70, 16, UI.panelDark);
    this.badgeIcon = this.add.image(-60, 8, 'icon_loncha');
    this.badgeText = this.add.bitmapText(-6, 8, FONT, '...').setOrigin(1, 0.5).setTint(0xffd23f);
    c.add([g, this.badgeIcon, this.badgeText]);
    this.badge = c;
    this.shown = -1;
    this.refreshBadge();
  }

  private refreshBadge(): void {
    if (this.shown < 0 && account.profile) {
      this.shown = account.lonchas;
      this.badgeText.setText(String(this.shown));
    }
  }

  /** Notificación pequeña que entra por la derecha. */
  push(s: string, color = UI.text, icon = 'icon_loncha'): void {
    this.queue.push({ text: s, color, icon });
  }

  private onNotice(n: Notice): void {
    switch (n.k) {
      case 'lonchas':
        this.push(`+${n.n} LONCHAS · ${n.why}`, 0xffd23f);
        break;
      case 'xp':
        if (n.n > 0) this.push(`+${n.n} EXP`, 0x7cc8ff, 'p_star');
        break;
      case 'mission': {
        const m = MISSIONS.find((x) => x.id === n.id);
        audio.play('medal');
        this.push(`¡MISIÓN! ${m?.text ?? ''} · RECÓGELA`, 0x63c74d, 'icon_mission');
        break;
      }
      case 'streak':
        this.push(`¡RACHA DE ${n.n}! LONCHAS X${n.mult}`, 0xfeae34, 'p_flame');
        break;
      case 'rescue':
        this.push(`LONCHAS DE RESCATE +${n.n}`, 0x63c74d, 'icon_gift');
        break;
      case 'level':
        this.levelUp(n.level, n.item ? cosItem(n.item)?.name : n.bonus ? `+${n.bonus} LONCHAS` : undefined);
        break;
    }
  }

  /** ¡Subes de nivel! Confeti, sonido y regalo. */
  private levelUp(level: number, gift?: string): void {
    audio.play('levelup');
    const c = this.add.container(this.W / 2, this.H / 2 - 20).setDepth(60);
    const g = this.add.graphics();
    panel(g, -110, -26, 220, 52, UI.panelDark, 0x7cc8ff);
    const t1 = text(this, 0, -12, `¡NIVEL ${level}!`, { scale: 2, color: 0x7cc8ff });
    const t2 = text(this, 0, 10, gift ? `REGALO: ${gift}` : '¡SIGUE ASÍ!', { color: 0xffd23f });
    c.add([g, t1, t2]);
    c.setScale(0);
    this.tweens.add({ targets: c, scale: 1, duration: 300, ease: 'Back.easeOut' });
    this.tweens.add({ targets: c, alpha: 0, delay: 2600, duration: 400, onComplete: () => c.destroy() });
    for (let k = 0; k < 4; k++) this.time.delayedCall(k * 220, () => this.confetti.emitParticleAt(this.W / 2 + (Math.random() - 0.5) * 200, this.H / 2 - 40, 40));
  }

  update(_t: number, delta: number): void {
    const dt = delta / 1000;
    this.t += dt;
    // El saldo no se enseña en plena partida (allí está el HUD).
    const inGame = this.scene.isActive('Game');
    this.badge.setVisible(!inGame && !!account.profile);
    // Contador que sube (o baja) rodando.
    const target = account.lonchas;
    if (account.profile && this.shown >= 0 && this.shown !== target) {
      const diff = target - this.shown;
      const step = Math.sign(diff) * Math.max(1, Math.ceil(Math.abs(diff) * dt * 6));
      this.shown = Math.abs(step) >= Math.abs(diff) ? target : this.shown + step;
      this.badgeText.setText(String(this.shown));
      if (Math.floor(this.t * 20) % 2 === 0) audio.play(diff > 0 ? 'coin' : 'spinTick');
      this.badgeIcon.setScale(1.3);
    } else this.badgeIcon.setScale(Math.max(1, this.badgeIcon.scale - dt * 3));

    // Cola de notificaciones: entran de una en una, como mucho 4 a la vez.
    this.gap -= dt;
    if (this.queue.length && this.gap <= 0 && this.toasts.length < 4) {
      const q = this.queue.shift()!;
      this.gap = 0.25;
      const y = 24 + this.toasts.length * 17;
      const c = this.add.container(this.W + 160, y).setDepth(45);
      const label = this.add.bitmapText(-8, 0, FONT, fontText(q.text)).setOrigin(1, 0.5).setTint(q.color);
      const w = label.width + 26;
      const g = this.add.graphics();
      panel(g, -w, -7, w, 14, UI.panelDark);
      c.add([g, this.add.image(-w + 9, 0, q.icon), label]);
      this.tweens.add({ targets: c, x: this.W - 4, duration: 220, ease: 'Back.easeOut' });
      this.toasts.push({ c, life: 2.8, y });
    }
    for (const t of this.toasts) {
      t.life -= dt;
      if (t.life <= 0 && t.c.getData('out') !== true) {
        t.c.setData('out', true);
        this.tweens.add({ targets: t.c, x: this.W + 200, duration: 200, ease: 'Quad.easeIn', onComplete: () => t.c.destroy() });
      }
    }
    this.toasts = this.toasts.filter((t) => t.life > -0.3);
    this.toasts.forEach((t, i) => {
      t.y += (24 + i * 17 - t.y) * Math.min(1, dt * 10);
      t.c.y = t.y;
    });
  }
}
