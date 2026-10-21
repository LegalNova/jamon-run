import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../config/balance';
import { account } from '../net/account';
import { audio } from '../core/audio';
import { input } from '../core/input';
import { levelFor } from '../../shared/balance';
import { MODE_LIST } from '../../shared/modes/rules';
import type { ModeId } from '../../shared/sim/types';
import { fontText } from '../gfx/font';
import { Button, Menu, panel, text, UI } from '../ui/widgets';
import { Backdrop, fadeIn, fadeTo } from './common';
import { MODE_COLORS } from './ModeSelectScene';

type Board = Partial<Record<ModeId, { name: string; coins: number }[]>>;

/** Estadísticas propias por modo y ranking mundial (las mejores partidas online). */
export class RecordsScene extends Phaser.Scene {
  private menu!: Menu;
  private backdrop!: Backdrop;
  private boardText: Phaser.GameObjects.BitmapText[] = [];

  constructor() {
    super('Records');
  }

  create(): void {
    fadeIn(this);
    this.backdrop = new Backdrop(this, false, 0.2);
    this.boardText = [];
    text(this, VIEW_W / 2, 12, 'RÉCORDS', { scale: 2, color: UI.focusLight });
    const p = account.profile;
    const lv = levelFor(p?.xp ?? 0);
    text(this, VIEW_W / 2, 28, `NIVEL ${lv.level} · ${p?.lonchas ?? 0} LONCHAS · ${Object.values(p?.medals ?? {}).reduce((a, b) => a + b, 0)} MEDALLAS`, { color: 0xffd23f });
    const g = this.add.graphics();
    panel(g, 8, 38, 226, 196);
    panel(g, 246, 38, 226, 196);
    text(this, 121, 47, 'TUS PARTIDAS', { color: UI.focusLight });
    text(this, 359, 47, 'RANKING MUNDIAL (ONLINE)', { color: UI.focusLight });
    MODE_LIST.forEach((m, i) => {
      const y = 62 + i * 42;
      const r = p?.records[m.id];
      this.add.image(22, y + 8, `mode_${m.id}`).setScale(0.6);
      text(this, 36, y, m.name, { origin: [0, 0.5], color: MODE_COLORS[m.id] });
      text(this, 36, y + 11, r ? `${r.games} PARTIDAS · ${r.wins} VICTORIAS` : 'SIN JUGAR TODAVÍA', { origin: [0, 0.5], color: UI.text });
      text(this, 36, y + 22, r ? `RÉCORD ${r.best} · TOTAL ${r.coins} MONEDAS` : '¡PRUÉBALO!', { origin: [0, 0.5], color: UI.muted });
      text(this, 254, y, m.name, { origin: [0, 0.5], color: MODE_COLORS[m.id] });
      this.boardText.push(text(this, 254, y + 11, 'CARGANDO...', { origin: [0, 0.5], color: UI.muted }));
      this.boardText.push(text(this, 254, y + 22, '', { origin: [0, 0.5], color: UI.muted }));
    });
    this.menu = new Menu(true);
    this.menu.add(new Button(this, VIEW_W / 2, VIEW_H - 14, 'VOLVER', () => fadeTo(this, 'Menu'), 90, 15));
    void this.loadBoard();
  }

  private async loadBoard(): Promise<void> {
    let board: Board | null = null;
    try {
      const res = await fetch('./api/rank');
      if (res.ok) board = (await res.json()) as Board;
    } catch {
      board = null;
    }
    if (!this.scene.isActive()) return;
    MODE_LIST.forEach((m, i) => {
      const list = board?.[m.id] ?? [];
      const a = this.boardText[i * 2];
      const b = this.boardText[i * 2 + 1];
      if (!board) {
        a.setText(fontText('SIN CONEXIÓN CON EL SERVIDOR'));
        return;
      }
      if (!list.length) {
        a.setText(fontText('NADIE TODAVÍA. ¡SÉ EL PRIMERO!'));
        return;
      }
      const fmt = (k: number) => (list[k] ? `${k + 1}. ${list[k].name} ${list[k].coins}` : '');
      a.setText(fontText(`${fmt(0)}  ${fmt(1)}`.trim())).setTint(0xffd23f);
      b.setText(fontText(`${fmt(2)}  ${fmt(3)}`.trim())).setTint(UI.text);
    });
  }

  update(_t: number, delta: number): void {
    this.backdrop.update(delta / 1000);
    if (input.back()) {
      audio.play('back');
      fadeTo(this, 'Menu');
      return;
    }
    this.menu.update();
  }
}
