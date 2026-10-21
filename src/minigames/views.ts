/**
 * Vistas de los minijuegos del Parón. Solo dibujan el estado (que decide el servidor online)
 * y dan respuesta inmediata a tus teclas (sonido, texto, temblor).
 */
import Phaser from 'phaser';
import { MG } from '../../shared/balance';
import type { MgId, MgKey } from '../../shared/minigames';
import { BEAT } from '../../shared/minigames/ritmo';
import { cutGrade, knifeAt } from '../../shared/minigames/corta';
import { slabAt } from '../../shared/minigames/torre';
import { pullAt } from '../../shared/minigames/tira';
import { slotsAt } from '../../shared/minigames/trilero';
import { BET_NAMES, BETS, pocketColor, WHEEL } from '../../shared/minigames/ruleta';
import type { Look } from '../../shared/look';
import type { Team } from '../../shared/sim/types';
import { audio } from '../core/audio';
import { pop, shake } from '../core/feel';
import { ensureCharTexture } from '../gfx/characters';
import { FONT, FONT_PLAIN, fontText } from '../gfx/font';
import { panel, text, UI } from '../ui/widgets';

export interface MgPlayerInfo {
  name: string;
  look: Look;
  team: Team;
}

export interface ViewHost {
  scene: Phaser.Scene;
  root: Phaser.GameObjects.Container;
  myId: number;
  info(id: number): MgPlayerInfo | undefined;
  /** Tiempo del minijuego (suave). */
  t(): number;
}

type St = Record<string, unknown>;
type Ps<T> = Record<string, T>;

export abstract class MgView {
  protected s: Phaser.Scene;
  protected c: Phaser.GameObjects.Container;
  constructor(protected h: ViewHost) {
    this.s = h.scene;
    this.c = h.scene.add.container(0, 0);
    h.root.add(this.c);
  }
  protected add<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.c.add(o);
    return o;
  }
  protected txt(x: number, y: number, s: string, color: number = UI.text, scale = 1, origin: [number, number] = [0.5, 0.5]): Phaser.GameObjects.BitmapText {
    return this.add(text(this.s, x, y, s, { color, scale, origin }));
  }
  protected me<T>(st: St): T | undefined {
    return (st.ps as Ps<T> | undefined)?.[this.h.myId];
  }
  /** Ranking rápido (arriba a la derecha) de otros jugadores. */
  protected board(x: number, y: number, rows: [string, string][], t: Phaser.GameObjects.BitmapText[]): void {
    rows.slice(0, 5).forEach((r, i) => {
      if (!t[i]) t[i] = this.txt(x, y + i * 9, '', UI.muted, 1, [1, 0.5]);
      t[i].setText(fontText(`${r[0]} ${r[1]}`));
    });
  }
  abstract update(st: St, dt: number): void;
  /** Respuesta inmediata a tu tecla (antes de que conteste el servidor). */
  onKey(_k: MgKey, _st: St): void {}
  destroy(): void {
    this.c.destroy();
  }
}

// =================================================================== RULETA

class RuletaView extends MgView {
  private wheel: Phaser.GameObjects.Container;
  private ball: Phaser.GameObjects.Arc;
  private boxes: { g: Phaser.GameObjects.Graphics; chips: Phaser.GameObjects.BitmapText; x: number; y: number; w: number; hgt: number }[] = [];
  private chipsText: Phaser.GameObjects.BitmapText;
  private bubble: Phaser.GameObjects.BitmapText;
  private hist: Phaser.GameObjects.Graphics;
  private histT: Phaser.GameObjects.BitmapText[] = [];
  private result: Phaser.GameObjects.BitmapText;
  private board_: Phaser.GameObjects.BitmapText[] = [];
  private spinStart = -1;
  private r0 = 0;
  private target = 0;
  private lastBounce = 0;
  private shown = false;
  private R = 58;

  constructor(h: ViewHost) {
    super(h);
    const R = this.R;
    const cx = -118;
    const cy = 6;
    const g0 = this.add(this.s.add.graphics());
    g0.fillStyle(0x3b2414, 1).fillCircle(cx, cy, R + 8);
    g0.fillStyle(0x7a4a24, 1).fillCircle(cx, cy, R + 5);
    this.wheel = this.add(this.s.add.container(cx, cy));
    const g = this.s.add.graphics();
    const seg = (Math.PI * 2) / WHEEL.length;
    WHEEL.forEach((p, i) => {
      const a0 = -Math.PI / 2 + i * seg;
      const col = pocketColor(p) === 'verde' ? 0x2f9e5a : pocketColor(p) === 'rojo' ? 0xc8283a : 0x1d1a24;
      g.fillStyle(col, 1).slice(0, 0, R, a0, a0 + seg, false).fillPath();
    });
    g.lineStyle(1, 0xc79a1c, 0.8).strokeCircle(0, 0, R);
    g.fillStyle(0x5a3418, 1).fillCircle(0, 0, R * 0.6);
    g.fillStyle(0xc79a1c, 1).fillCircle(0, 0, 6);
    g.lineStyle(1, 0xffd23f, 1);
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2;
      g.lineBetween(0, 0, Math.cos(a) * R * 0.5, Math.sin(a) * R * 0.5);
    }
    this.wheel.add(g);
    WHEEL.forEach((p, i) => {
      const a = -Math.PI / 2 + (i + 0.5) * seg;
      const t = this.s.add.bitmapText(Math.cos(a) * R * 0.8, Math.sin(a) * R * 0.8, FONT, p).setOrigin(0.5).setScale(0.5).setRotation(a + Math.PI / 2);
      this.wheel.add(t);
    });
    const ptr = this.add(this.s.add.graphics());
    ptr.fillStyle(0xffd23f, 1).fillTriangle(cx - 4, cy - R - 10, cx + 4, cy - R - 10, cx, cy - R - 2);
    this.ball = this.add(this.s.add.circle(cx, cy - R - 3, 2.5, 0xffffff));
    // croupier
    const ck = ensureCharTexture(this.s, null, { name: '', color: 9, skin: 2, hair: 3, hairColor: 0, hat: 0, glasses: 0, extra: 2 });
    this.add(this.s.add.sprite(cx - 70, cy - 66, ck, 'down_idle0').setScale(2).play(`${ck}_down_idle`));
    this.bubble = this.add(this.s.add.bitmapText(cx - 50, cy - 82, FONT_PLAIN, '').setOrigin(0, 0.5).setTint(0x1a1424));
    const bb = this.s.add.graphics();
    this.c.addAt(bb, this.c.getIndex(this.bubble));
    this.bubble.setData('bg', bb);
    // tapete
    const tp = this.add(this.s.add.graphics());
    panel(tp, -8, -86, 222, 158, 0x1f6b3a, 0xc79a1c);
    this.txt(103, -78, 'TAPETE · ← → ELIGE · ESPACIO APUESTA', 0xfee761);
    BETS.forEach((b, i) => {
      const x = 2 + (i % 2) * 105;
      const y = -66 + Math.floor(i / 2) * 30;
      const bg = this.add(this.s.add.graphics());
      this.boxes.push({ g: bg, chips: this.txt(x + 96, y + 19, '', 0xffd23f, 1, [1, 0.5]), x, y, w: 100, hgt: 26 });
      void b;
    });
    this.chipsText = this.txt(103, 64, '', 0xffd23f, 2);
    this.hist = this.add(this.s.add.graphics());
    this.result = this.txt(-118, 84, '', 0xffffff, 2);
  }

  private say(s: string): void {
    this.bubble.setText(fontText(s));
    const bg = this.bubble.getData('bg') as Phaser.GameObjects.Graphics;
    bg.clear();
    if (!s) return;
    const w = this.bubble.width + 6;
    bg.fillStyle(0xffffff, 1).fillRect(this.bubble.x - 3, this.bubble.y - 6, w, 12);
    bg.fillTriangle(this.bubble.x - 3, this.bubble.y + 2, this.bubble.x - 8, this.bubble.y + 5, this.bubble.x + 2, this.bubble.y + 6);
  }

  update(st: St, dt: number): void {
    const R = MG.ruleta;
    const t = this.h.t();
    const me = this.me<{ c: number; b: Record<string, number>; s: number; n: number; w: number }>(st);
    const seg = (Math.PI * 2) / WHEEL.length;
    const pk = st.pk as string;
    // apuestas
    BETS.forEach((b, i) => {
      const box = this.boxes[i];
      const sel = me?.s === i && t < R.bet;
      const fill = b === 'rojo' ? 0xc8283a : b === 'negro' ? 0x1d1a24 : b === 'verde' ? 0x2f9e5a : b === 'numero' ? 0x7a5a14 : 0x2a7a48;
      const win = st.res && pk && this.wins(b, pk, me?.n ?? 0);
      box.g.clear();
      box.g.fillStyle(sel ? (Math.floor(t * 6) % 2 ? 0xffffff : 0xfee761) : win ? 0xfee761 : 0x0d0b14, 1).fillRect(box.x - 1, box.y - 1, box.w + 2, box.hgt + 2);
      box.g.fillStyle(fill, 1).fillRect(box.x, box.y, box.w, box.hgt);
      const amount = me?.b[b] ?? 0;
      // fichas apiladas
      for (let k = 0; k < Math.min(6, amount / R.chip); k++) {
        box.g.fillStyle(0x0d0b14, 1).fillCircle(box.x + 10 + k * 3, box.y + 17 - k * 2, 5);
        box.g.fillStyle(k % 2 ? 0xe43b44 : 0x2f88e8, 1).fillCircle(box.x + 10 + k * 3, box.y + 16 - k * 2, 4);
        box.g.fillStyle(0xffffff, 1).fillRect(box.x + 9 + k * 3, box.y + 15 - k * 2, 2, 1);
      }
      box.chips.setText(amount ? String(amount) : '');
      if (!box.g.getData('label')) {
        const label = b === 'numero' ? `TU NÚMERO ${me?.n ?? '?'}` : BET_NAMES[b];
        box.g.setData('label', this.txt(box.x + 4, box.y + 6, `${label} · ${R.pay[b]}:1`, 0xffffff, 1, [0, 0.5]));
      }
    });
    this.chipsText.setText(fontText(`FICHAS: ${me?.c ?? 0}`));
    // rueda
    if (t < R.bet) {
      this.wheel.rotation = t * 0.5;
      this.ball.setPosition(this.wheel.x + Math.cos(-t * 2) * (this.R + 3), this.wheel.y + Math.sin(-t * 2) * (this.R + 3));
      this.say(t < R.bet - 3 ? '¡HAGAN JUEGO!' : '¡ÚLTIMAS APUESTAS!');
    } else if (pk) {
      if (this.spinStart < 0) {
        this.spinStart = R.bet;
        this.r0 = R.bet * 0.5;
        const i = WHEEL.indexOf(pk);
        // La rueda para justo en el número que ha salido (sin trucos de "casi").
        let target = -(i + 0.5) * seg;
        while (target < this.r0 + Math.PI * 6) target += Math.PI * 2;
        this.target = target;
        audio.play('whoosh');
      }
      const u = Math.min(1, (t - R.bet) / R.spin);
      const e = 1 - Math.pow(1 - u, 3);
      this.wheel.rotation = this.r0 + (this.target - this.r0) * e;
      // la bola gira al revés, baja y rebota hasta caer en su casilla
      const ballA = -Math.PI / 2 - (1 - e) * Math.PI * 12;
      const drop = u < 0.65 ? this.R + 3 : this.R * 0.8 + Math.abs(Math.sin(u * 40)) * (1 - u) * 12;
      this.ball.setPosition(this.wheel.x + Math.cos(ballA) * drop, this.wheel.y + Math.sin(ballA) * drop);
      if (u > 0.65 && u < 1 && t - this.lastBounce > 0.08 + u * 0.15) {
        this.lastBounce = t;
        audio.play('ball');
      }
      this.say(u < 1 ? 'NO VA MÁS' : `¡EL ${pk} ${pocketColor(pk).toUpperCase()}!`);
      if (st.res && !this.shown) {
        this.shown = true;
        const w = me?.w ?? 0;
        if (w > 0) {
          this.result.setText(fontText(`¡GANAS +${w} FICHAS!`)).setTint(0xfee761);
          audio.play('jackpot');
          shake(this.s, 0.006, 200);
          this.s.game.events.emit('mgConfetti', 60);
        } else {
          this.result.setText(fontText('ESTA VEZ NO...')).setTint(UI.muted);
          audio.play('lose');
        }
        pop(this.s, this.result, 1.4);
      }
    }
    // historial de los últimos 10
    const hist = (st.h as string[]) ?? [];
    this.hist.clear();
    hist.slice(0, 10).forEach((p, i) => {
      const x = -176 + i * 12;
      const col = pocketColor(p) === 'verde' ? 0x2f9e5a : pocketColor(p) === 'rojo' ? 0xc8283a : 0x1d1a24;
      this.hist.fillStyle(0x0d0b14, 1).fillRect(x - 1, 95, 12, 10);
      this.hist.fillStyle(col, 1).fillRect(x, 96, 10, 8);
      if (!this.histT[i]) this.histT[i] = this.txt(x + 5, 100, '', 0xffffff, 0.5);
      this.histT[i].setText(p);
    });
    // los que más fichas llevan
    const ps = st.ps as Ps<{ c: number }>;
    const rows = Object.entries(ps)
      .sort((a, b) => b[1].c - a[1].c)
      .map(([id, p]) => [this.h.info(Number(id))?.name ?? '?', String(p.c)] as [string, string]);
    this.board(214, 80, rows.slice(0, 3), this.board_);
    void dt;
  }

  private wins(b: string, pk: string, lucky: number): boolean {
    const green = pk === '0' || pk === '00';
    const n = Number(pk);
    const red = pocketColor(pk) === 'rojo';
    return b === 'rojo' ? red : b === 'negro' ? !green && !red : b === 'verde' ? green : green ? false : b === 'par' ? n % 2 === 0 : b === 'impar' ? n % 2 === 1 : b === 'bajo' ? n <= 18 : b === 'alto' ? n >= 19 : n === lucky;
  }

  onKey(k: MgKey): void {
    if (this.h.t() >= MG.ruleta.bet) return;
    audio.play(k === 'a' ? 'thump' : k === 'b' ? 'back' : 'hover');
  }
}

// =================================================================== CABALLOS

const COMMENTS = ['¡SALEN!', '¡VA EN CABEZA {H}!', '¡ADELANTA {H}!', '¡QUÉ IGUALADO!', '¡RECTA FINAL!'];

class CaballosView extends MgView {
  private horses: Phaser.GameObjects.Sprite[] = [];
  private labels: Phaser.GameObjects.BitmapText[] = [];
  private sel: Phaser.GameObjects.Graphics;
  private comment: Phaser.GameObjects.BitmapText;
  private prompt: Phaser.GameObjects.BitmapText;
  private x: number[] = [];
  private leader = -1;
  private done = false;
  private track: Phaser.GameObjects.Container;

  constructor(h: ViewHost) {
    super(h);
    this.track = this.add(this.s.add.container(0, 0));
    const g = this.s.add.graphics();
    this.track.add(g);
    const N = MG.caballos.horses.length;
    for (let i = 0; i < N; i++) {
      const y = -66 + i * 24;
      g.fillStyle(i % 2 ? 0x8a5a3a : 0x9a6a44, 1).fillRect(-128, y - 11, 338, 22);
      g.fillStyle(0xffffff, 0.08).fillRect(-128, y - 11, 338, 1);
    }
    for (let j = 0; j < 36; j++) {
      g.fillStyle(j % 2 ? 0xffffff : 0x1a1424, 1).fillRect(190, -77 + j * 4, 3, 4);
      g.fillStyle(j % 2 ? 0x1a1424 : 0xffffff, 1).fillRect(193, -77 + j * 4, 3, 4);
    }
    this.sel = this.s.add.graphics();
    this.track.add(this.sel);
    for (let i = 0; i < N; i++) {
      const y = -66 + i * 24;
      const spr = this.s.add.sprite(-116, y, `horse_${i}`, 'f0').play(`horse_${i}_run`);
      spr.anims.pause();
      this.track.add(spr);
      this.horses.push(spr);
      this.x.push(-116);
      const lab = this.s.add.bitmapText(-212, y, FONT, '').setOrigin(0, 0.5);
      this.track.add(lab);
      this.labels.push(lab);
    }
    this.comment = this.txt(0, -92, '', 0xfee761, 1);
    this.prompt = this.txt(0, 86, '', 0xffffff, 1);
  }

  update(st: St, dt: number): void {
    const C = MG.caballos;
    const t = this.h.t();
    const pos = st.pos as number[];
    const odds = st.odds as number[];
    const w = st.w as number;
    const me = this.me<{ s: number; l: boolean }>(st);
    const ps = st.ps as Ps<{ s: number; l: boolean }>;
    const count = new Array(pos.length).fill(0);
    for (const p of Object.values(ps)) if (p.l) count[p.s]++;
    pos.forEach((p, i) => {
      this.labels[i].setText(fontText(`${C.horses[i].split(' ')[0]} X${odds[i]}${count[i] ? ` ·${count[i]}` : ''}`)).setTint(me?.s === i ? 0xfee761 : 0xffffff);
      const tx = -116 + Math.min(1.02, p) * 306;
      this.x[i] += (tx - this.x[i]) * Math.min(1, dt * 10);
      this.horses[i].x = this.x[i];
    });
    this.sel.clear();
    if (me) {
      const y = -66 + me.s * 24;
      const on = me.l || Math.floor(t * 6) % 2 === 0;
      this.sel.lineStyle(2, me.l ? 0x63c74d : 0xfee761, on ? 1 : 0.4).strokeRect(-214, y - 11, 426, 22);
    }
    if (t < C.pick) {
      this.comment.setText(fontText(`ELIGE TU CABALLO GANADOR · ${Math.ceil(C.pick - t)}`));
      this.prompt.setText(fontText(me?.l ? `¡TU CABALLO: ${C.horses[me.s]}! PAGA X${odds[me.s]}` : '← → ELEGIR · ESPACIO CONFIRMAR'));
      return;
    }
    for (const s of this.horses) if (s.anims.isPaused && w < 0) s.anims.resume();
    if (w < 0) {
      const lead = pos.indexOf(Math.max(...pos));
      const sorted = [...pos].sort((a, b) => b - a);
      let c = COMMENTS[0];
      if (t > C.pick + 1) c = lead !== this.leader && this.leader >= 0 ? COMMENTS[2] : COMMENTS[1];
      if (sorted[0] - sorted[1] < 0.02 && t > C.pick + 2) c = COMMENTS[3];
      if (sorted[0] > 0.8) c = COMMENTS[4];
      if (lead !== this.leader) audio.play('gallop');
      this.leader = lead;
      this.comment.setText(fontText(c.replace('{H}', C.horses[lead])));
      this.prompt.setText(fontText(me?.l ? '¡MACHACA ESPACIO PARA ANIMAR A TU CABALLO!' : 'NO ELEGISTE CABALLO... ¡A MIRAR!')).setTint(Math.floor(t * 8) % 2 ? 0xffffff : 0xfee761);
    } else if (!this.done) {
      this.done = true;
      for (const s of this.horses) s.anims.pause();
      const mine = me?.l && me.s === w;
      this.comment.setText(fontText(`¡GANA ${C.horses[w]}!`)).setTint(0xfee761).setScale(2);
      this.prompt.setText(fontText(mine ? `¡HAS ACERTADO! +${C.stake * odds[w]} LONCHAS` : me?.l ? 'TU CABALLO NO GANÓ...' : '')).setTint(mine ? 0x63c74d : UI.muted);
      audio.play(mine ? 'jackpot' : 'fanfare');
      if (mine) this.s.game.events.emit('mgConfetti', 80);
      if (st.ph) {
        // ¡Foto finish! Zoom y cámara lenta.
        this.txt(150, -92, '¡FOTO FINISH!', 0xff7ab8);
        this.s.tweens.add({ targets: this.track, scale: 1.6, x: -190 * 0.6, y: 0, duration: 400, yoyo: true, hold: 900, ease: 'Sine.easeInOut' });
        this.s.tweens.timeScale = 0.5;
        this.s.time.delayedCall(500, () => (this.s.tweens.timeScale = 1));
      }
      shake(this.s, 0.006, 200);
    }
  }

  onKey(k: MgKey): void {
    if (this.h.t() < MG.caballos.pick) audio.play(k === 'a' ? 'click' : 'hover');
    else if (k === 'a') {
      audio.play('thump');
      this.s.game.events.emit('mgConfetti', 2);
    }
  }
}

// =================================================================== CORTA EL JAMÓN

class CortaView extends MgView {
  private knife: Phaser.GameObjects.Image;
  private grades: Phaser.GameObjects.BitmapText[] = [];
  private big: Phaser.GameObjects.BitmapText;
  private board_: Phaser.GameObjects.BitmapText[] = [];

  constructor(h: ViewHost) {
    super(h);
    const g = this.add(this.s.add.graphics());
    panel(g, -200, 30, 400, 14, 0x7a4a24, 0x3b2414);
    // El jamón acaba justo en la marca: cuanto más cerca cortes, más fina la loncha.
    this.add(this.s.add.image(-14, 6, 'ham').setScale(7));
    // marca del corte perfecto
    g.fillStyle(0xfee761, 1).fillRect(39, -40, 2, 70);
    g.fillStyle(0xfee761, 1).fillTriangle(34, -44, 46, -44, 40, -38);
    this.knife = this.add(this.s.add.image(40, -20, 'knife').setScale(2).setOrigin(0.5, 0.2));
    for (let i = 0; i < MG.corta.cuts; i++) this.grades.push(this.txt(-160 + i * 80, 66, '·', UI.muted));
    this.big = this.txt(40, -64, '', 0xffffff, 2);
    this.txt(0, 86, 'PULSA ESPACIO CUANDO EL CUCHILLO PASE POR LA MARCA', UI.muted);
  }

  private knifeX(st: St): number {
    const me = this.me<{ n: number; t0: number }>(st);
    if (!me || me.n >= MG.corta.cuts) return 40;
    return -60 + knifeAt(this.h.t(), me.n, me.t0) * 200;
  }

  update(st: St): void {
    const me = this.me<{ n: number; t0: number; a: number[] }>(st);
    this.knife.x = this.knifeX(st);
    this.knife.setAlpha(me && me.n >= MG.corta.cuts ? 0.3 : 1);
    if (me) {
      me.a.forEach((a, i) => {
        const g = cutGrade(a);
        this.grades[i].setText(fontText(`${g} ${Math.round(a * 100)}`)).setTint(g === 'PERFECTO' ? 0xfee761 : g === 'GENIAL' ? 0x63c74d : g === 'BIEN' ? 0xffffff : 0xff5a5a);
      });
    }
    const ps = st.ps as Ps<{ a: number[] }>;
    const rows = Object.entries(ps)
      .map(([id, p]) => [this.h.info(Number(id))?.name ?? '?', Math.round(p.a.reduce((x, y) => x + y, 0) * 100)] as [string, number])
      .sort((a, b) => b[1] - a[1])
      .map(([n, s]) => [n, String(s)] as [string, string]);
    this.board(214, -84, rows, this.board_);
  }

  onKey(k: MgKey, st: St): void {
    if (k !== 'a') return;
    const me = this.me<{ n: number; t0: number }>(st);
    if (!me || me.n >= MG.corta.cuts) return;
    // Respuesta inmediata: sonido, loncha que cae con física y nota.
    const pos = knifeAt(this.h.t(), me.n, me.t0);
    const acc = Math.max(0, 1 - Math.abs(pos - 0.5) * 2.4);
    const g = cutGrade(acc);
    audio.play('slice');
    if (g === 'PERFECTO') audio.play('combo');
    shake(this.s, g === 'GORDA' ? 0.004 : 0.008, 120);
    this.big.setText(fontText(g)).setTint(g === 'PERFECTO' ? 0xfee761 : g === 'GENIAL' ? 0x63c74d : g === 'BIEN' ? 0xffffff : 0xff5a5a).setAlpha(1);
    pop(this.s, this.big, 1.6, 200);
    this.s.tweens.add({ targets: this.big, alpha: 0, delay: 500, duration: 300 });
    const sl = this.add(this.s.add.image(this.knife.x, 0, 'p_slice').setScale(2 + (1 - acc) * 4, 3));
    this.s.tweens.add({ targets: sl, y: 40, x: sl.x + 20 + Math.random() * 30, angle: 200, duration: 600, ease: 'Quad.easeIn', onComplete: () => this.s.tweens.add({ targets: sl, alpha: 0, duration: 400, onComplete: () => sl.destroy() }) });
    if (g === 'PERFECTO') this.s.game.events.emit('mgConfetti', 20);
  }
}

// =================================================================== TORRE DE LONCHAS

class TorreView extends MgView {
  private g: Phaser.GameObjects.Graphics;
  private stack: Phaser.GameObjects.Container;
  private hText: Phaser.GameObjects.BitmapText;
  private others: Phaser.GameObjects.Graphics;
  private camY = 0;
  private pieces: Phaser.GameObjects.Rectangle[] = [];

  constructor(h: ViewHost) {
    super(h);
    this.stack = this.add(this.s.add.container(-40, 0));
    this.g = this.s.add.graphics();
    this.stack.add(this.g);
    this.hText = this.txt(-40, -92, '', 0xfee761, 2);
    this.others = this.add(this.s.add.graphics());
    this.txt(140, -92, 'LOS DEMÁS', UI.muted);
  }

  update(st: St, dt: number): void {
    const me = this.me<{ h: number; t0: number; o: boolean; st: number[][]; x: number; w: number }>(st);
    const g = this.g;
    g.clear();
    if (!me) return;
    const U = 70;
    const SH = 9;
    const base = 90;
    // la cámara sigue a la torre
    const want = Math.max(0, me.h * SH - 110);
    this.camY += (want - this.camY) * Math.min(1, dt * 6);
    this.stack.y = this.camY;
    g.fillStyle(0x7a4a24, 1).fillRect(-90, base, 180, 8);
    const first = me.h + 1 - me.st.length;
    me.st.forEach(([x, w], i) => {
      const lvl = first + i;
      const y = base - (lvl + 1) * SH;
      g.fillStyle(0x0d0b14, 1).fillRect(x * U - (w * U) / 2 - 1, y - 1, w * U + 2, SH);
      g.fillStyle(lvl % 2 ? 0xc2414b : 0xe46a72, 1).fillRect(x * U - (w * U) / 2, y, w * U, SH - 2);
      g.fillStyle(0xf6dcc0, 1).fillRect(x * U - (w * U) / 2, y + SH - 4, w * U, 1);
    });
    if (!me.o && this.h.t() < MG.torre.duration) {
      const x = slabAt(this.h.t(), me.h, me.t0);
      const y = base - (me.h + 2) * SH;
      g.fillStyle(0xffffff, 1).fillRect(x * U - (me.w * U) / 2 - 1, y - 1, me.w * U + 2, SH);
      g.fillStyle(0xff9aa2, 1).fillRect(x * U - (me.w * U) / 2, y, me.w * U, SH - 2);
    }
    this.hText.setText(fontText(me.o ? `¡SE CAYÓ! ${me.h} PISOS` : `${me.h} PISOS`));
    audio.setTempo(1 + Math.min(0.6, me.h * 0.03));
    // las torres de los demás (en pequeño)
    const ps = Object.entries(st.ps as Ps<{ h: number; o: boolean }>).filter(([id]) => Number(id) !== this.h.myId).slice(0, 12);
    const o = this.others;
    o.clear();
    ps.forEach(([, p], i) => {
      const x = 96 + i * 9;
      const hh = Math.min(150, p.h * 4);
      o.fillStyle(p.o ? 0x5a6988 : 0xe46a72, 1).fillRect(x, 80 - hh, 6, hh);
    });
  }

  onKey(k: MgKey, st: St): void {
    if (k !== 'a') return;
    const me = this.me<{ h: number; t0: number; o: boolean; x: number; w: number }>(st);
    if (!me || me.o) return;
    audio.play('thump');
    const x = slabAt(this.h.t(), me.h, me.t0);
    const off = x - me.x;
    if (Math.abs(off) < MG.torre.perfect) {
      audio.play('combo');
      this.s.game.events.emit('mgConfetti', 12);
      shake(this.s, 0.004, 80);
      return;
    }
    // el trozo que sobresale se cae
    const U = 70;
    const cut = Math.min(me.w, Math.abs(off));
    const px = -40 + (off > 0 ? x * U + (me.w * U) / 2 - (cut * U) / 2 : x * U - (me.w * U) / 2 + (cut * U) / 2);
    const py = 90 - (me.h + 2) * 9 + this.stack.y;
    const r = this.add(this.s.add.rectangle(px, py, cut * U, 7, 0xff9aa2));
    this.pieces.push(r);
    this.s.tweens.add({ targets: r, y: py + 140, angle: off > 0 ? 90 : -90, alpha: 0, duration: 800, ease: 'Quad.easeIn', onComplete: () => r.destroy() });
    shake(this.s, 0.003, 60);
  }

  destroy(): void {
    audio.setTempo(1);
    super.destroy();
  }
}

// =================================================================== TIRA Y AFLOJA

class TiraView extends MgView {
  private g: Phaser.GameObjects.Graphics;
  private beat: Phaser.GameObjects.Arc;
  private fb: Phaser.GameObjects.BitmapText;
  private teams: Phaser.GameObjects.Sprite[][] = [[], []];
  private lastBeat = -1;
  private ropeX = 0;
  private built = false;

  constructor(h: ViewHost) {
    super(h);
    this.g = this.add(this.s.add.graphics());
    this.add(this.s.add.circle(0, -64, 14).setStrokeStyle(2, 0xfee761));
    this.beat = this.add(this.s.add.circle(0, -64, 8, 0xfee761));
    this.fb = this.txt(0, -88, 'PULSA AL RITMO', 0xffffff, 1);
    this.txt(-150, 70, 'AZULES', 0x7cc8ff, 2);
    this.txt(150, 70, 'ROJOS', 0xff7a6e, 2);
  }

  private build(st: St): void {
    this.built = true;
    const ps = st.ps as Ps<{ s: number }>;
    const bySide: number[][] = [[], []];
    for (const [id, p] of Object.entries(ps)) bySide[p.s].push(Number(id));
    bySide.forEach((ids, s) => {
      ids.slice(0, 5).forEach((id, k) => {
        const info = this.h.info(id);
        const key = ensureCharTexture(this.s, info?.team ?? null, info?.look ?? { name: '', color: 0, skin: 0, hair: 0, hairColor: 0, hat: 0, glasses: 0, extra: 0 });
        const x = s === 0 ? -60 - k * 22 : 60 + k * 22;
        const spr = this.add(this.s.add.sprite(x, 30, key, 'side_atk').setScale(2).setOrigin(0.5, 1).setFlipX(s === 1));
        if (id === this.h.myId) this.txt(x, -8, 'TÚ', 0xfee761);
        this.teams[s].push(spr);
      });
    });
  }

  update(st: St, dt: number): void {
    if (!this.built) this.build(st);
    const t = this.h.t();
    const rope = st.rope as number;
    this.ropeX += (rope * 140 - this.ropeX) * Math.min(1, dt * 8);
    const g = this.g;
    g.clear();
    // cuerda que vibra
    g.lineStyle(3, 0xc79a1c, 1);
    g.beginPath();
    for (let x = -200; x <= 200; x += 8) g.lineTo(x + this.ropeX, 14 + Math.sin(t * 30 + x) * 1.2);
    g.strokePath();
    g.fillStyle(0xe43b44, 1).fillRect(this.ropeX - 3, 6, 6, 16);
    g.fillStyle(0xffffff, 0.4).fillRect(-1, -20, 2, 60);
    g.fillStyle(0x7cc8ff, 0.5).fillRect(-140 - 1, -20, 2, 60);
    g.fillStyle(0xff7a6e, 0.5).fillRect(140 - 1, -20, 2, 60);
    for (const [s, arr] of this.teams.entries()) arr.forEach((spr, k) => {
      spr.x = (s === 0 ? -60 - k * 22 : 60 + k * 22) + this.ropeX;
      spr.angle = (s === 0 ? -1 : 1) * (8 + Math.sin(t * 12 + k) * 4);
    });
    // indicador de ritmo
    const ph = t / MG.tira.beat;
    const near = Math.abs(ph - Math.round(ph));
    this.beat.setScale(1 + Math.max(0, 0.6 - near * 4));
    this.beat.setFillStyle(near * MG.tira.beat <= MG.tira.window ? 0x63c74d : 0xfee761);
    const b = Math.round(ph);
    if (b !== this.lastBeat && near < 0.1) {
      this.lastBeat = b;
      audio.play('drum');
    }
    if (Math.random() < dt * 0.6) audio.play('cheer');
  }

  onKey(k: MgKey): void {
    if (k !== 'a') return;
    const p = pullAt(this.h.t());
    this.fb.setText(fontText(p === 3 ? '¡PERFECTO!' : p === 1 ? 'BIEN' : 'FUERA DE RITMO')).setTint(p === 3 ? 0x63c74d : p === 1 ? 0xffffff : 0xff5a5a);
    pop(this.s, this.fb, 1.4);
    if (p) shake(this.s, p === 3 ? 0.005 : 0.002, 70);
    audio.play(p === 3 ? 'combo' : p === 1 ? 'thump' : 'denied');
  }
}

// =================================================================== TRILERO

class TrileroView extends MgView {
  private cups: Phaser.GameObjects.Image[] = [];
  private gold: Phaser.GameObjects.Image;
  private cursor: Phaser.GameObjects.Graphics;
  private info: Phaser.GameObjects.BitmapText;
  private knownHam = new Map<number, number>();
  private lastRound = -1;
  private board_: Phaser.GameObjects.BitmapText[] = [];
  private lastSwaps = 0;

  constructor(h: ViewHost) {
    super(h);
    const g = this.add(this.s.add.graphics());
    panel(g, -200, 26, 400, 12, 0x1f6b3a, 0x0d0b14);
    this.gold = this.add(this.s.add.image(0, 24, 'icon_loncha').setTint(0xffd23f).setScale(1.5));
    this.cursor = this.add(this.s.add.graphics());
    this.info = this.txt(0, -88, '', 0xfee761);
  }

  update(st: St): void {
    const T = MG.trilero;
    const t = this.h.t();
    const n = st.n as number;
    const r = st.r as number;
    if (r !== this.lastRound) {
      this.lastRound = r;
      for (const c of this.cups) c.destroy();
      this.cups = [];
      for (let i = 0; i < n; i++) this.cups.push(this.add(this.s.add.image(0, 28, 'cup').setOrigin(0.5, 1).setScale(1.6)));
      this.lastSwaps = 0;
    }
    if ((st.ham as number) >= 0) this.knownHam.set(r, st.ham as number);
    const ham = this.knownHam.get(r) ?? -1;
    const round = { n, start: st.st as number, ham, swaps: st.sw as [number, number][], swapTime: st.swt as number };
    const shuffle = round.start + T.show;
    const pick = shuffle + (st.ns as number) * round.swapTime;
    const { slots, moving } = slotsAt(round, Math.min(t, pick));
    if (round.swaps.length > this.lastSwaps) {
      this.lastSwaps = round.swaps.length;
      audio.play('whoosh');
    }
    const sx = (i: number) => (i - (n - 1) / 2) * (300 / Math.max(3, n));
    const lifted = t < shuffle || t >= pick + T.pick;
    slots.forEach((cup, slot) => {
      let x = sx(slot);
      let y = 28;
      if (moving && (slot === moving[0] || slot === moving[1])) {
        const from = sx(slot);
        const to = sx(slot === moving[0] ? moving[1] : moving[0]);
        const u = moving[2];
        x = from + (to - from) * u;
        y = 28 + Math.sin(u * Math.PI) * (slot === moving[0] ? -14 : 10);
      }
      const c = this.cups[cup];
      if (!c) return;
      c.setPosition(x, lifted && cup === ham ? y - 20 : lifted && t >= pick + T.pick ? y - 14 : y);
      if (cup === ham) this.gold.setPosition(x, 22).setVisible(lifted && ham >= 0);
    });
    const me = this.me<{ s: number; l: boolean }>(st);
    this.cursor.clear();
    if (t >= pick && t < pick + T.pick && me) {
      this.cursor.fillStyle(me.l ? 0x63c74d : 0xfee761, 1).fillTriangle(sx(me.s) - 6, 52, sx(me.s) + 6, 52, sx(me.s), 44);
    }
    const left = t < shuffle ? '¡MIRA DÓNDE ESTÁ LA LONCHA!' : t < pick ? '¡SIGUE EL CUBILETE!' : t < pick + T.pick ? (me?.l ? '¡ELEGIDO!' : `← → ELIGE · ESPACIO  ${Math.ceil(pick + T.pick - t)}`) : '¿ACERTASTE?';
    this.info.setText(fontText(`RONDA ${r + 1}/3 · ${left}`));
    const ps = st.ps as Ps<{ sc: number }>;
    const rows = Object.entries(ps)
      .sort((a, b) => b[1].sc - a[1].sc)
      .map(([id, p]) => [this.h.info(Number(id))?.name ?? '?', String(p.sc)] as [string, string]);
    this.board(214, -84, rows, this.board_);
  }

  onKey(k: MgKey): void {
    audio.play(k === 'a' ? 'click' : 'hover');
  }
}

// =================================================================== REFLEJOS

class ReflejosView extends MgView {
  private ham: Phaser.GameObjects.Image;
  private big: Phaser.GameObjects.BitmapText;
  private mine: Phaser.GameObjects.BitmapText;
  private list: Phaser.GameObjects.BitmapText[] = [];
  private hb = 0;
  private sigShown = -1;

  constructor(h: ViewHost) {
    super(h);
    this.ham = this.add(this.s.add.image(0, -10, 'ham').setScale(0));
    this.big = this.txt(0, -60, 'ESPERA...', 0xffffff, 3);
    this.mine = this.txt(0, 50, '', 0xfee761, 2);
  }

  update(st: St, dt: number): void {
    const r = st.r as number;
    const me = this.me<{ ms: (number | null)[] }>(st);
    const sig = st.sig as boolean;
    if (sig && this.sigShown !== r) {
      this.sigShown = r;
      this.ham.setScale(0);
      this.s.tweens.add({ targets: this.ham, scale: 7, duration: 120, ease: 'Back.easeOut' });
      this.big.setText(fontText('¡YA!')).setTint(0x63c74d);
      this.s.cameras.main.flash(80, 255, 255, 255);
      audio.play('go');
    }
    if (!sig && this.sigShown === r) {
      this.ham.setScale(0);
    }
    const my = me?.ms[r];
    if (!sig && (my === null || my === undefined)) {
      this.big.setText(fontText('ESPERA...')).setTint(0xffffff).setAlpha(0.6 + Math.sin(this.h.t() * 8) * 0.4);
      this.hb -= dt;
      if (this.hb <= 0) {
        this.hb = 0.8;
        audio.play('heart');
      }
    } else this.big.setAlpha(1);
    if (my !== null && my !== undefined) this.mine.setText(fontText(my === -1 ? '¡TE ADELANTASTE!' : my === -2 ? 'TARDE...' : `${my} MS`)).setTint(my > 0 ? 0xfee761 : 0xff5a5a);
    else this.mine.setText('');
    const ps = st.ps as Ps<{ ms: (number | null)[] }>;
    const rows = Object.entries(ps)
      .map(([id, p]) => [this.h.info(Number(id))?.name ?? '?', p.ms[r]] as [string, number | null])
      .filter(([, m]) => m !== null && m !== undefined && m > 0)
      .sort((a, b) => (a[1] as number) - (b[1] as number));
    rows.slice(0, 5).forEach(([n, m], i) => {
      if (!this.list[i]) this.list[i] = this.txt(0, 66 + i * 9, '', UI.muted);
      this.list[i].setText(fontText(`${i === 0 ? '¡EL MÁS RÁPIDO! ' : ''}${n} ${m} MS`)).setTint(i === 0 ? 0x63c74d : UI.muted);
    });
    for (let i = rows.length; i < this.list.length; i++) this.list[i].setText('');
  }

  onKey(k: MgKey, st: St): void {
    if (k !== 'a' && k !== 'b') return;
    if (st.sig) {
      audio.play('combo');
      shake(this.s, 0.006, 100);
    } else audio.play('denied');
  }
}

// =================================================================== RITMO

class RitmoView extends MgView {
  private g: Phaser.GameObjects.Graphics;
  private judge: Phaser.GameObjects.BitmapText;
  private combo: Phaser.GameObjects.BitmapText;
  private score: Phaser.GameObjects.BitmapText;
  private board_: Phaser.GameObjects.BitmapText[] = [];
  private lastPlayed = -1;
  private lastBeat = -1;
  private lastCombo = 0;
  private lastL = -1;

  constructor(h: ViewHost) {
    super(h);
    this.g = this.add(this.s.add.graphics());
    this.judge = this.txt(0, -40, '', 0xffffff, 2);
    this.combo = this.txt(-120, -20, '', 0xfee761, 3);
    this.score = this.txt(-120, 20, '', 0xffffff, 2);
    this.txt(0, 96, '← O ESPACIO · → O E', UI.muted);
  }

  update(st: St): void {
    const t = this.h.t();
    const notes = st.notes as [number, number][];
    const me = this.me<{ sc: number; c: number; l: string; lt: number; h: number[]; o: number }>(st);
    const g = this.g;
    g.clear();
    const HIT = 70;
    const SPEED = 130;
    const LX = [-26, 26];
    for (const x of LX) {
      g.fillStyle(0x1a1428, 1).fillRect(x - 18, -100, 36, 190);
      g.fillStyle(0xffffff, 0.15).fillRect(x - 18, HIT - 1, 36, 3);
    }
    // brillo en el pulso
    const beatNow = Math.round(t / BEAT);
    const near = Math.abs(t / BEAT - beatNow);
    g.lineStyle(2, 0xfee761, Math.max(0, 0.8 - near * 4)).strokeRect(-46, HIT - 10, 92, 22);
    if (beatNow !== this.lastBeat && near < 0.1 && t > 0.3) {
      this.lastBeat = beatNow;
      audio.play('drum');
    }
    notes.forEach(([nt, lane], i) => {
      const y = HIT - (nt - t) * SPEED;
      if (y < -110 || y > HIT + 30) return;
      const hit = me && i >= me.o && me.h[i - me.o] === 1;
      if (hit) return;
      const x = LX[lane];
      const col = lane === 0 ? 0x7cc8ff : 0xff7ab8;
      g.fillStyle(0x0d0b14, 1).fillTriangle(x + (lane === 0 ? -12 : 12), y, x + (lane === 0 ? 8 : -8), y - 11, x + (lane === 0 ? 8 : -8), y + 11);
      g.fillStyle(col, 1).fillTriangle(x + (lane === 0 ? -10 : 10), y, x + (lane === 0 ? 7 : -7), y - 9, x + (lane === 0 ? 7 : -7), y + 9);
      // la canción: cada flecha suena al llegar a la línea
      if (nt <= t && i > this.lastPlayed) {
        this.lastPlayed = i;
        audio.play(lane === 0 ? 'note0' : 'note1');
      }
    });
    if (me) {
      this.score.setText(String(me.sc));
      if (me.c !== this.lastCombo) {
        if (me.c > this.lastCombo && me.c % 5 === 0) {
          pop(this.s, this.combo, 1.5, 180);
          audio.play('combo');
        }
        this.lastCombo = me.c;
      }
      this.combo.setText(me.c > 1 ? `X${me.c}` : '').setTint(me.c >= 20 ? 0xff7ab8 : me.c >= 10 ? 0xfeae34 : 0xfee761);
      if (me.lt !== this.lastL && me.l) {
        this.lastL = me.lt;
        this.judge.setText(fontText(me.l)).setTint(me.l === 'PERFECTO' ? 0xfee761 : me.l === 'BIEN' ? 0x63c74d : 0xff5a5a).setAlpha(1);
        pop(this.s, this.judge, 1.4, 160);
        this.s.tweens.add({ targets: this.judge, alpha: 0, delay: 300, duration: 250 });
      }
    }
    const ps = st.ps as Ps<{ sc: number }>;
    const rows = Object.entries(ps)
      .sort((a, b) => b[1].sc - a[1].sc)
      .map(([id, p]) => [this.h.info(Number(id))?.name ?? '?', String(p.sc)] as [string, string]);
    this.board(214, -84, rows, this.board_);
  }

  onKey(k: MgKey): void {
    const lane = k === 'l' || k === 'a' ? -26 : 26;
    const fl = this.add(this.s.add.rectangle(lane, 70, 36, 6, 0xffffff, 0.7));
    this.s.tweens.add({ targets: fl, alpha: 0, scaleY: 3, duration: 150, onComplete: () => fl.destroy() });
  }
}

export function createView(id: MgId, h: ViewHost): MgView {
  switch (id) {
    case 'ruleta':
      return new RuletaView(h);
    case 'caballos':
      return new CaballosView(h);
    case 'corta':
      return new CortaView(h);
    case 'torre':
      return new TorreView(h);
    case 'tira':
      return new TiraView(h);
    case 'trilero':
      return new TrileroView(h);
    case 'reflejos':
      return new ReflejosView(h);
    case 'ritmo':
      return new RitmoView(h);
  }
}
