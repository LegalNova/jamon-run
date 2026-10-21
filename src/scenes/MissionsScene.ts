import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../config/balance';
import { audio } from '../core/audio';
import { input } from '../core/input';
import { levelFor } from '../../shared/balance';
import { ECONOMY, MISSIONS, today } from '../../shared/economy';
import { account } from '../net/account';
import { Button, Menu, panel, text, UI } from '../ui/widgets';
import { Backdrop, fadeIn, fadeTo } from './common';

/** Regalo diario, misiones del día con su barra de progreso y nivel. */
export class MissionsScene extends Phaser.Scene {
  private menu!: Menu;
  private backdrop!: Backdrop;
  private g!: Phaser.GameObjects.Graphics;
  private barG!: Phaser.GameObjects.Graphics;
  private dyn: Phaser.GameObjects.GameObject[] = [];
  private bars: { x: number; y: number; w: number; from: number; to: number; t: number; color: number }[] = [];
  private confetti!: Phaser.GameObjects.Particles.ParticleEmitter;
  private busy = false;

  constructor() {
    super('Missions');
  }

  create(): void {
    fadeIn(this);
    this.backdrop = new Backdrop(this, false, 0.25);
    text(this, VIEW_W / 2, 12, 'MISIONES', { scale: 2, color: UI.focusLight });
    this.g = this.add.graphics();
    this.barG = this.add.graphics();
    this.confetti = this.add
      .particles(0, 0, 'p_confetti', { lifespan: 1400, speed: { min: 60, max: 180 }, angle: { min: 210, max: 330 }, gravityY: 200, rotate: { min: 0, max: 360 }, tint: [0xe43b44, 0xfee761, 0x63c74d, 0x2f88e8, 0xff7ab8], emitting: false })
      .setDepth(20);
    this.build();
    const off = account.onChange(() => {
      if (!this.busy) this.build();
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, off);
    void account.load();
  }

  private build(): void {
    for (const o of this.dyn) o.destroy();
    this.dyn = [];
    this.bars = [];
    const g = this.g;
    g.clear();
    const p = account.profile;
    const keep = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.dyn.push(o);
      return o;
    };
    const prevIndex = this.menu?.index ?? 0;
    this.menu = new Menu();
    if (!p) {
      keep(text(this, VIEW_W / 2, VIEW_H / 2, account.offline ? 'SIN CONEXIÓN CON EL SERVIDOR' : 'CARGANDO...', { color: UI.muted }));
      this.menu.add(keep(new Button(this, VIEW_W / 2, VIEW_H - 16, 'VOLVER', () => fadeTo(this, 'Menu'), 90, 14)));
      return;
    }
    // nivel
    const L = levelFor(p.xp);
    panel(g, 8, 30, 464, 30, UI.panelDark);
    keep(text(this, 16, 38, `NIVEL ${L.level}`, { origin: [0, 0.5], scale: 2, color: 0x7cc8ff }));
    keep(text(this, 464, 38, `${L.cur}/${L.next} EXP`, { origin: [1, 0.5], color: 0x7cc8ff }));
    this.bars.push({ x: 16, y: 50, w: 448, from: 0, to: L.cur / L.next, t: 0, color: 0x7cc8ff });
    // regalo diario
    const claimed = p.daily.last === today();
    panel(g, 8, 66, 464, 40);
    keep(this.add.image(26, 86, 'icon_gift').setScale(2));
    const nextStreak = claimed ? p.daily.streak : p.daily.last === today(Date.now() - 86_400_000) ? Math.min(ECONOMY.daily.maxStreak, p.daily.streak + 1) : 1;
    const amount = ECONOMY.daily.base + (nextStreak - 1) * ECONOMY.daily.perStreakDay;
    keep(text(this, 44, 78, 'REGALO DIARIO', { origin: [0, 0.5], color: UI.focusLight }));
    keep(text(this, 44, 92, claimed ? `YA LO HAS COGIDO HOY · RACHA ${p.daily.streak} DÍAS` : `+${amount} LONCHAS · RACHA ${nextStreak} DÍAS`, { origin: [0, 0.5], color: UI.text }));
    const gift = this.menu.add(keep(new Button(this, 410, 86, claimed ? 'MAÑANA MÁS' : '¡RECOGER!', () => void this.claimDaily(), 100, 18, claimed ? undefined : UI.green)));
    gift.setEnabled(!claimed);
    // misiones
    keep(text(this, 16, 116, 'MISIONES DE HOY', { origin: [0, 0.5], color: UI.focusLight }));
    keep(text(this, 464, 116, 'SE RENUEVAN CADA DÍA', { origin: [1, 0.5], color: UI.muted }));
    p.missions.list.forEach((m, i) => {
      const def = MISSIONS.find((d) => d.id === m.id);
      if (!def) return;
      const y = 126 + i * 36;
      panel(g, 8, y, 464, 32, m.claimed ? UI.panelDark : UI.panel);
      keep(this.add.image(24, y + 16, 'icon_mission'));
      keep(text(this, 38, y + 9, def.text, { origin: [0, 0.5], color: m.claimed ? UI.muted : UI.text }));
      keep(text(this, 300, y + 9, `${Math.floor(m.progress)}/${def.goal}`, { origin: [1, 0.5], color: m.done ? UI.green : UI.muted }));
      this.bars.push({ x: 38, y: y + 20, w: 262, from: 0, to: m.progress / def.goal, t: 0, color: m.done ? 0x63c74d : 0xfeae34 });
      const label = m.claimed ? 'HECHA' : m.done ? `+${def.reward}` : `${def.reward}`;
      const b = this.menu.add(keep(new Button(this, 400, y + 16, label, () => void this.claim(m.id, 400, y + 16), 110, 18, m.done && !m.claimed ? UI.green : undefined)));
      b.setEnabled(m.done && !m.claimed);
    });
    this.menu.add(keep(new Button(this, VIEW_W / 2, VIEW_H - 14, 'VOLVER', () => fadeTo(this, 'Menu'), 90, 14)));
    this.menu.setIndex(Math.min(prevIndex, 10), true);
  }

  private async claimDaily(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    const r = await account.daily();
    this.busy = false;
    if (r?.ok) {
      audio.play('jackpot');
      this.confetti.emitParticleAt(410, 86, 50);
      this.cameras.main.shake(150, 0.005);
      this.game.events.emit('toast', `REGALO DIARIO +${r.amount} LONCHAS`, 0xffd23f, 'icon_gift');
    } else audio.play('denied');
    this.build();
  }

  private async claim(id: string, x: number, y: number): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    const n = await account.claim(id);
    this.busy = false;
    if (n > 0) {
      audio.play('fanfare');
      this.confetti.emitParticleAt(x, y, 40);
      this.cameras.main.shake(120, 0.004);
      this.game.events.emit('toast', `MISIÓN COMPLETADA +${n} LONCHAS`, UI.green, 'icon_mission');
    } else audio.play('denied');
    this.build();
  }

  update(_t: number, delta: number): void {
    const dt = delta / 1000;
    this.backdrop.update(dt);
    // barras que se llenan con animación
    const g = this.barG;
    g.clear();
    for (const b of this.bars) {
      b.t = Math.min(1, b.t + dt * 1.5);
      const k = b.from + (b.to - b.from) * (1 - Math.pow(1 - b.t, 3));
      g.fillStyle(0x0d0b14, 1).fillRect(b.x - 1, b.y - 1, b.w + 2, 6);
      g.fillStyle(0x2a2140, 1).fillRect(b.x, b.y, b.w, 4);
      g.fillStyle(b.color, 1).fillRect(b.x, b.y, Math.round(b.w * Math.min(1, k)), 4);
      g.fillStyle(0xffffff, 0.3).fillRect(b.x, b.y, Math.round(b.w * Math.min(1, k)), 1);
    }
    if (input.back()) {
      audio.play('back');
      fadeTo(this, 'Menu');
      return;
    }
    this.menu.update();
  }
}
