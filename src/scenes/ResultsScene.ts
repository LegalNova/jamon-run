import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../config/balance';
import { audio } from '../core/audio';
import { input } from '../core/input';
import { FONT, fontText } from '../gfx/font';
import { Button, Menu, panel, text, UI } from '../ui/widgets';
import { TEAM_COLORS } from '../gfx/palette';
import { Backdrop, fadeIn, fadeTo } from './common';
import { net } from '../net/NetClient';
import type { ResultEntry, ResultsData } from './GameScene';

function mmss(s: number): string {
  const t = Math.floor(s);
  return `${Math.floor(t / 60)}:${(t % 60).toString().padStart(2, '0')}`;
}

export class ResultsScene extends Phaser.Scene {
  private data_!: ResultsData;
  private menu!: Menu;
  private backdrop!: Backdrop;

  constructor() {
    super('Results');
  }

  init(data: ResultsData): void {
    this.data_ = data;
  }

  create(): void {
    fadeIn(this);
    this.backdrop = new Backdrop(this, false, 0.15);
    const d = this.data_;
    const player = d.entries.find((e) => e.isPlayer)!;
    const won = d.winner === player.team;
    const winColor = TEAM_COLORS[d.winner].light;

    const banner = text(this, VIEW_W / 2, 18, d.winner === 'chaser' ? '¡GANA EL EQUIPO AZUL!' : '¡GANA EL EQUIPO ROJO!', {
      scale: 2,
      color: winColor,
    });
    banner.setScale(0);
    this.tweens.add({ targets: banner, scale: 2, duration: 350, ease: 'Back.easeOut' });
    text(this, VIEW_W / 2, 36, won ? '¡VICTORIA! TU EQUIPO HA GANADO' : 'DERROTA... ¡A LA PRÓXIMA!', { color: won ? UI.focusLight : UI.muted });

    if (won) this.confetti();

    // panel del jugador
    const g = this.add.graphics();
    panel(g, 10, 48, 170, 168);
    text(this, 95, 58, 'TUS ESTADÍSTICAS', { color: UI.focusLight });
    text(this, 95, 70, `${TEAM_COLORS[player.team].role} ${TEAM_COLORS[player.team].team}`, { color: TEAM_COLORS[player.team].light });
    const s = player.stats;
    const rows: [string, string][] =
      player.team === 'chaser'
        ? [
            ['GOLPES DADOS', String(s.hits)],
            ['DAÑO TOTAL', String(s.damage)],
            ['ELIMINACIONES', String(s.eliminations)],
            ['JAMONES ACERTADOS', String(s.throwsHit)],
            ['OBJETOS COGIDOS', String(s.items)],
            ['TIEMPO DE PARTIDA', mmss(d.timePlayed)],
          ]
        : [
            ['TIEMPO SOBREVIVIDO', mmss(s.timeSurvived)],
            ['GOLPES RECIBIDOS', String(s.hitsTaken)],
            ['ESQUIVAS (DASH)', String(s.dodges)],
            ['RESCATES', String(s.rescues ?? 0)],
            ['OBJETOS COGIDOS', String(s.items)],
            ['ESTADO FINAL', player.alive ? 'VIVO' : 'ELIMINADO'],
          ];
    rows.forEach(([k, v], i) => {
      const y = 88 + i * 18;
      text(this, 18, y, k, { origin: [0, 0.5], color: UI.text });
      text(this, 172, y, v, { origin: [1, 0.5], color: UI.focusLight });
      g.fillStyle(0xffffff, 0.06).fillRect(16, y + 7, 158, 1);
    });

    // tabla general
    panel(g, 190, 48, 280, 168);
    text(this, 330, 58, 'TODOS LOS JUGADORES', { color: UI.focusLight });
    const mvp = this.pickMvp(d.entries, d.winner);
    const list = [...d.entries].sort((a, b) => (a.team === b.team ? 0 : a.team === 'chaser' ? -1 : 1));
    // Con muchos jugadores (online, hasta 20) la tabla pasa a dos columnas más compactas.
    const twoCols = list.length > 12;
    const perCol = twoCols ? Math.ceil(list.length / 2) : list.length;
    const rowH = twoCols ? 12 : Math.min(11, Math.floor(140 / list.length));
    list.forEach((e, i) => {
      const colIdx = Math.floor(i / perCol);
      const x0 = twoCols ? 196 + colIdx * 138 : 198;
      const x1 = twoCols ? x0 + 132 : 464;
      const y = 72 + (i % perCol) * rowH;
      const col = TEAM_COLORS[e.team].light;
      g.fillStyle(col, 1).fillRect(x0, y - 2, 4, 4);
      const name = (e === mvp ? '★ ' : '') + e.name;
      this.add.bitmapText(x0 + 7, y, FONT, fontText(twoCols ? name.slice(0, 11) : name)).setOrigin(0, 0.5).setTint(e.isPlayer ? 0xfee761 : UI.text);
      const stat = twoCols
        ? e.team === 'chaser'
          ? `${e.stats.eliminations}P ${e.stats.hits}G`
          : e.alive
            ? `VIVO R${e.stats.rescues ?? 0}`
            : mmss(e.stats.timeSurvived)
        : e.team === 'chaser'
          ? `PILLADOS ${e.stats.eliminations} · GOLPES ${e.stats.hits}`
          : `${e.alive ? 'VIVO' : 'FUERA'} · ${mmss(e.stats.timeSurvived)} · RESC ${e.stats.rescues ?? 0}`;
      this.add.bitmapText(x1, y, FONT, fontText(stat)).setOrigin(1, 0.5).setTint(e.alive || e.team === 'chaser' ? UI.text : UI.muted);
    });
    if (twoCols) text(this, 330, 196, 'P = PILLADOS · G = GOLPES · R = RESCATES', { color: UI.muted });
    if (mvp) text(this, 330, 208, `MVP: ${mvp.name}`, { color: 0xfee761 });

    this.menu = new Menu(true);
    if (d.online) {
      this.menu.add(new Button(this, VIEW_W / 2 - 64, VIEW_H - 22, 'VOLVER A LA SALA', () => fadeTo(this, 'Lobby'), 120, 18, UI.green));
      this.menu.add(new Button(this, VIEW_W / 2 + 64, VIEW_H - 22, 'SALIR', () => {
        net.leave();
        fadeTo(this, 'Menu');
      }, 100, 18));
    } else {
      this.menu.add(new Button(this, VIEW_W / 2 - 60, VIEW_H - 22, 'REVANCHA', () => fadeTo(this, 'RoleReveal', { mapId: d.mapId }), 100, 18));
      this.menu.add(new Button(this, VIEW_W / 2 + 60, VIEW_H - 22, 'MENÚ', () => fadeTo(this, 'Menu'), 100, 18));
    }
    this.time.delayedCall(1200, () => audio.playMusic('menu'));
  }

  private pickMvp(entries: ResultEntry[], winner: string): ResultEntry | null {
    const team = entries.filter((e) => e.team === winner);
    if (!team.length) return null;
    const score = (e: ResultEntry) =>
      e.team === 'chaser'
        ? e.stats.eliminations * 100 + e.stats.hits * 10
        : (e.alive ? 1000 : 0) + e.stats.timeSurvived + (e.stats.rescues ?? 0) * 60 + e.stats.dodges * 5 + e.stats.items * 3;
    return team.reduce((a, b) => (score(b) > score(a) ? b : a));
  }

  private confetti(): void {
    this.add
      .particles(0, -8, 'p_px', {
        x: { min: 0, max: VIEW_W },
        lifespan: 3500,
        speedY: { min: 30, max: 70 },
        speedX: { min: -20, max: 20 },
        rotate: { min: 0, max: 360 },
        tint: [0xfee761, 0xe43b44, 0x7cc8ff, 0x63c74d, 0xffffff],
        frequency: 40,
        duration: 3500,
      })
      .setDepth(50);
  }

  update(_t: number, delta: number): void {
    this.backdrop.update(delta / 1000);
    if (input.back()) {
      audio.play('back');
      fadeTo(this, this.data_.online ? 'Lobby' : 'Menu');
      return;
    }
    this.menu.update();
  }
}
