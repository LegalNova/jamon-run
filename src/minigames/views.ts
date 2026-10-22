/**
 * Vistas de los minijuegos del Parón. Solo dibujan el estado (que decide el servidor online)
 * y dan respuesta inmediata a tus teclas (sonido, texto, temblor).
 */
import Phaser from 'phaser';
import { touchify } from '../core/touch';
import { MG } from '../../shared/balance';
import type { MgId, MgKey } from '../../shared/minigames';
import { BEAT } from '../../shared/minigames/ritmo';
import { cutGrade, knifeAt } from '../../shared/minigames/corta';
import { slabAt } from '../../shared/minigames/torre';
import { pullAt } from '../../shared/minigames/tira';
import { slotsAt } from '../../shared/minigames/trilero';
import { Color, payout, pocketColor, WHEEL } from '../../shared/minigames/ruleta';
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
  /** Evento Ruleta: apostar y saldo de lonchas. */
  bet(c: string, a: number): void;
  balance(): number;
  /** Enviar teclas (para los toques en pantalla). */
  send(keys: MgKey[]): void;
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
    return this.add(text(this.s, x, y, touchify(s), { color, scale, origin }));
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
  /** Toque en pantalla (coordenadas locales): qué teclas manda. Por defecto, ESPACIO. */
  onPointer(_x: number, _y: number, _st: St): MgKey[] {
    return ['a'];
  }
  /** Teclas numéricas (la ruleta usa 1-3). */
  onDigit(_n: number): boolean {
    return false;
  }
  destroy(): void {
    this.c.destroy();
  }
}

// =================================================================== EVENTO RULETA

const COLOR_INFO: { c: Color; name: string; pay: string; fill: number; key: string }[] = [
  { c: 'rojo', name: 'ROJO', pay: 'PAGA 1 A 1', fill: 0xc8283a, key: '1' },
  { c: 'negro', name: 'NEGRO', pay: 'PAGA 1 A 1', fill: 0x2a2433, key: '2' },
  { c: 'verde', name: 'VERDE 0/00', pay: 'PAGA 17 A 1', fill: 0x2f9e5a, key: '3' },
];

/** Evento Ruleta: tres botones enormes, una cantidad y listo. */
class RuletaView extends MgView {
  private wheel: Phaser.GameObjects.Container;
  private ball: Phaser.GameObjects.Arc;
  private bubble: Phaser.GameObjects.BitmapText;
  private bubbleBg: Phaser.GameObjects.Graphics;
  private btns: { g: Phaser.GameObjects.Graphics; zone: Phaser.GameObjects.Zone; x: number; y: number; w: number; h: number; c: Color }[] = [];
  private amountText: Phaser.GameObjects.BitmapText;
  private winText: Phaser.GameObjects.BitmapText;
  private balText: Phaser.GameObjects.BitmapText;
  private bar: Phaser.GameObjects.Graphics;
  private result: Phaser.GameObjects.BitmapText;
  private others: Phaser.GameObjects.BitmapText[] = [];
  private hist: Phaser.GameObjects.Graphics;
  private amt: Phaser.GameObjects.Container;
  private coin: Phaser.GameObjects.Image;
  private color: Color | null = null;
  private amount = 50;
  private r0 = 0;
  private target = 0;
  private started = false;
  private shown = false;
  private lastBounce = 0;
  private R = 48;

  constructor(h: ViewHost) {
    super(h);
    const R = this.R;
    const cx = -150;
    const cy = -6;
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
    g.fillStyle(0xc79a1c, 1).fillCircle(0, 0, 5);
    this.wheel.add(g);
    WHEEL.forEach((p, i) => {
      const a = -Math.PI / 2 + (i + 0.5) * seg;
      this.wheel.add(this.s.add.bitmapText(Math.cos(a) * R * 0.8, Math.sin(a) * R * 0.8, FONT, p).setOrigin(0.5).setScale(0.5).setRotation(a + Math.PI / 2));
    });
    const ptr = this.add(this.s.add.graphics());
    ptr.fillStyle(0xffd23f, 1).fillTriangle(cx - 4, cy - R - 10, cx + 4, cy - R - 10, cx, cy - R - 2);
    this.ball = this.add(this.s.add.circle(cx, cy - R - 3, 2.5, 0xffffff));
    const ck = ensureCharTexture(this.s, null, { name: '', color: 9, skin: 2, hair: 3, hairColor: 0, hat: 0, glasses: 0, extra: 2 });
    this.add(this.s.add.sprite(cx - 44, cy - 74, ck, 'down_idle0').setScale(2).play(`${ck}_down_idle`));
    this.bubbleBg = this.add(this.s.add.graphics());
    this.bubble = this.add(this.s.add.bitmapText(cx - 26, cy - 88, FONT_PLAIN, '').setOrigin(0, 0.5).setTint(0x1a1424));
    this.hist = this.add(this.s.add.graphics());
    // tres botones enormes
    COLOR_INFO.forEach((ci, i) => {
      const x = -60 + i * 92;
      const y = -78;
      const w = 86;
      const hgt = 60;
      const bg = this.add(this.s.add.graphics());
      this.txt(x + w / 2, y + 20, ci.name, 0xffffff, ci.c === 'verde' ? 1 : 2);
      this.txt(x + w / 2, y + 40, ci.pay, 0xfee761);
      this.txt(x + 8, y + 8, ci.key, 0xc2c3c7);
      const zone = this.add(this.s.add.zone(x + w / 2, y + hgt / 2, w, hgt).setInteractive({ useHandCursor: true }));
      zone.on('pointerdown', () => this.pick(ci.c));
      this.btns.push({ g: bg, zone, x, y, w, h: hgt, c: ci.c });
    });
    // cantidad
    this.amt = this.add(this.s.add.container(0, 0));
    this.coin = this.add(this.s.add.image(-46, 6, 'icon_loncha_big'));
    this.amountText = this.txt(28, 6, '50', 0xffd23f, 3);
    this.balText = this.txt(110, 6, '', UI.muted, 1, [0, 0.5]);
    const amounts: [string, () => void][] = [
      ['-', () => this.setAmount(this.amount - MG.ruleta.step)],
      ...MG.ruleta.amounts.map((a) => [String(a), () => this.setAmount(a)] as [string, () => void]),
      ['TODO', () => this.setAmount(Number.MAX_SAFE_INTEGER)],
      ['+', () => this.setAmount(this.amount + MG.ruleta.step)],
    ];
    amounts.forEach(([label, fn], i) => {
      const w = label === 'TODO' ? 44 : 34;
      const x = -60 + i * 46 + (label === '+' ? 10 : 0);
      const y = 34;
      const bg = this.s.add.graphics();
      panel(bg, x, y, w, 24, UI.panelLight);
      this.amt.add(bg);
      this.amt.add(this.s.add.bitmapText(x + w / 2, y + 12, FONT, fontText(label)).setOrigin(0.5).setScale(label.length === 1 ? 2 : 1));
      const z = this.s.add.zone(x + w / 2, y + 12, w, 28).setInteractive({ useHandCursor: true });
      z.on('pointerdown', () => {
        fn();
        audio.play('click');
      });
      this.amt.add(z);
    });
    this.winText = this.txt(80, 74, '', 0x63c74d, 1);
    this.bar = this.add(this.s.add.graphics());
    this.result = this.txt(60, 0, '', 0xffffff, 2);
    this.setAmount(50);
  }

  private balance(): number {
    return Math.max(0, Math.min(MG.ruleta.maxBet, this.h.balance()));
  }

  private setAmount(a: number): void {
    const max = this.balance();
    this.amount = Math.max(Math.min(MG.ruleta.step, max), Math.min(max, Math.round(a)));
    this.amountText.setText(String(this.amount));
    pop(this.s, this.amountText, 1.2, 120);
    if (this.color) this.h.bet(this.color, this.amount);
  }

  private pick(c: Color): void {
    if (this.h.t() >= MG.ruleta.bet) return;
    if (this.balance() <= 0) {
      audio.play('denied');
      this.result.setText(fontText('NO TIENES LONCHAS')).setTint(0xff5a5a);
      return;
    }
    this.color = c;
    this.h.bet(c, this.amount);
    audio.play('thump');
    shake(this.s, 0.003, 60);
  }

  private say(s: string): void {
    this.bubble.setText(fontText(s));
    this.bubbleBg.clear();
    if (!s) return;
    const w = this.bubble.width + 6;
    this.bubbleBg.fillStyle(0xffffff, 1).fillRect(this.bubble.x - 3, this.bubble.y - 6, w, 12);
    this.bubbleBg.fillTriangle(this.bubble.x - 3, this.bubble.y + 2, this.bubble.x - 8, this.bubble.y + 5, this.bubble.x + 2, this.bubble.y + 6);
  }

  update(st: St, dt: number): void {
    const R = MG.ruleta;
    const t = this.h.t();
    const betting = t < R.bet;
    const mine = this.me<{ c: Color; a: number }>(st);
    // botones
    for (const b of this.btns) {
      const sel = (mine?.c ?? this.color) === b.c;
      const fill = COLOR_INFO.find((c) => c.c === b.c)!.fill;
      b.g.clear();
      b.g.fillStyle(0x000000, 0.4).fillRect(b.x + 3, b.y + 4, b.w, b.h);
      b.g.fillStyle(sel ? 0xfee761 : 0x0d0b14, 1).fillRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4);
      b.g.fillStyle(fill, betting || sel ? 1 : 0.4).fillRect(b.x, b.y, b.w, b.h);
      b.g.fillStyle(0xffffff, 0.15).fillRect(b.x, b.y, b.w, 3);
      b.zone.input!.enabled = betting;
    }
    this.amt.setAlpha(betting ? 1 : 0.3);
    // Al cerrarse las apuestas, el sitio de la cantidad es para el resultado.
    this.amountText.setVisible(betting);
    this.coin.setVisible(betting);
    this.balText.setVisible(betting);
    this.balText.setText(fontText(`TIENES ${this.h.balance()}`));
    const c = mine?.c ?? this.color;
    const a = mine?.a ?? this.amount;
    if (betting) this.winText.setText(fontText(c ? `AL ${c.toUpperCase()}: SI SALE, GANAS +${a * R.pay[c]}` : 'ELIGE UN COLOR (1 2 3)')).setTint(c ? 0x63c74d : 0xfee761);
    else if (!mine) this.winText.setText(fontText('SIN APUESTA ESTA VEZ')).setTint(UI.muted);
    else this.winText.setText(fontText(`APUESTA: ${mine.a} AL ${mine.c.toUpperCase()}`)).setTint(0xfee761);
    // barra de tiempo (10 s)
    this.bar.clear();
    if (betting) {
      const k = 1 - t / R.bet;
      this.bar.fillStyle(0x0d0b14, 1).fillRect(-60, -94, 270, 6);
      this.bar.fillStyle(k < 0.3 ? 0xe43b44 : 0x63c74d, 1).fillRect(-59, -93, Math.round(268 * k), 4);
    }
    // rueda y bola
    const pk = st.pk as string;
    const ss = st.ss as number;
    const seg = (Math.PI * 2) / WHEEL.length;
    if (!pk || ss < 0) {
      this.wheel.rotation = t * 0.5;
      this.ball.setPosition(this.wheel.x + Math.cos(-t * 2) * (this.R + 3), this.wheel.y + Math.sin(-t * 2) * (this.R + 3));
      this.say(betting ? (t < R.bet - 3 ? '¡HAGAN JUEGO!' : '¡ÚLTIMAS APUESTAS!') : 'NO VA MÁS');
    } else {
      if (!this.started) {
        this.started = true;
        this.r0 = this.wheel.rotation;
        const i = WHEEL.indexOf(pk);
        // La rueda para justo en el número que ha salido (sin trucos de "casi").
        let target = -(i + 0.5) * seg;
        while (target < this.r0 + Math.PI * 6) target += Math.PI * 2;
        this.target = target;
        audio.play('whoosh');
      }
      const u = Math.min(1, Math.max(0, (t - ss) / R.spin));
      const e = 1 - Math.pow(1 - u, 3);
      this.wheel.rotation = this.r0 + (this.target - this.r0) * e;
      const ballA = -Math.PI / 2 - (1 - e) * Math.PI * 12;
      const drop = u < 0.65 ? this.R + 3 : this.R * 0.8 + Math.abs(Math.sin(u * 40)) * (1 - u) * 10;
      this.ball.setPosition(this.wheel.x + Math.cos(ballA) * drop, this.wheel.y + Math.sin(ballA) * drop);
      if (u > 0.65 && u < 1 && t - this.lastBounce > 0.08 + u * 0.15) {
        this.lastBounce = t;
        audio.play('ball');
      }
      this.say(u < 1 ? 'NO VA MÁS' : `¡EL ${pk} ${pocketColor(pk).toUpperCase()}!`);
      if (u >= 1 && !this.shown) {
        this.shown = true;
        const d = mine ? payout(mine.c, mine.a, pk) : 0;
        this.btns.forEach((b) => b.g.setAlpha(b.c === pocketColor(pk) ? 1 : 0.25));
        if (d > 0) {
          this.result.setText(fontText(`¡GANAS +${d}!`)).setTint(0xfee761);
          audio.play('jackpot');
          shake(this.s, 0.008, 220);
          this.s.game.events.emit('mgConfetti', 70);
        } else if (d < 0) {
          this.result.setText(fontText(`PIERDES ${-d}`)).setTint(0xff5a5a);
          audio.play('lose');
        } else this.result.setText(fontText(`SALE ${pocketColor(pk).toUpperCase()}`)).setTint(0xffffff);
        pop(this.s, this.result, 1.5, 220);
      }
    }
    // últimos números
    this.hist.clear();
    ((st.h as string[]) ?? []).slice(0, 10).forEach((p, i) => {
      const x = -196 + i * 10;
      const col = pocketColor(p) === 'verde' ? 0x2f9e5a : pocketColor(p) === 'rojo' ? 0xc8283a : 0x1d1a24;
      this.hist.fillStyle(0x0d0b14, 1).fillRect(x - 1, 63, 10, 8);
      this.hist.fillStyle(col, 1).fillRect(x, 64, 8, 6);
    });
    // lo que apuestan los demás
    const ps = Object.entries((st.ps as Ps<{ c: Color; a: number }>) ?? {}).filter(([id]) => Number(id) !== this.h.myId).slice(0, 4);
    ps.forEach(([id, b], i) => {
      if (!this.others[i]) this.others[i] = this.txt(-212, 78 + i * 9, '', UI.muted, 1, [0, 0.5]);
      this.others[i].setText(fontText(`${this.h.info(Number(id))?.name ?? '?'} ${b.a} ${b.c.toUpperCase()}`));
    });
    void dt;
  }

  onKey(k: MgKey): void {
    if (this.h.t() >= MG.ruleta.bet) return;
    // ESPACIO cambia de color; ← → la cantidad.
    if (k === 'a' || k === 'b') {
      const order: Color[] = ['rojo', 'negro', 'verde'];
      this.pick(order[(order.indexOf(this.color ?? 'verde') + 1) % 3]);
    } else this.setAmount(this.amount + (k === 'l' ? -MG.ruleta.step : MG.ruleta.step));
  }

  /** En la ruleta se toca en los botones (no en cualquier sitio). */
  onPointer(): MgKey[] {
    return [];
  }

  /** Teclas 1, 2, 3: rojo, negro, verde. */
  onDigit(n: number): boolean {
    if (n < 1 || n > 3) return false;
    this.pick(COLOR_INFO[n - 1].c);
    return true;
  }
}

// =================================================================== CABALLOS

const COMMENTS = ['¡SALEN!', '¡VA EN CABEZA {H}!', '¡ADELANTA {H}!', '¡QUÉ IGUALADO!', '¡RECTA FINAL!'];

class CaballosView extends MgView {
  onPointer(_x: number, y: number, st: St): MgKey[] {
    if (this.h.t() >= MG.caballos.pick) return ['a'];
    const me = this.me<{ s: number; l: boolean }>(st);
    if (!me || me.l) return [];
    const lane = Math.max(0, Math.min(MG.caballos.horses.length - 1, Math.round((y + 66) / 24)));
    const n = MG.caballos.horses.length;
    const keys: MgKey[] = [];
    for (let k = 0; k < (lane - me.s + n) % n; k++) keys.push('r');
    keys.push('a');
    return keys;
  }

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
      this.prompt.setText(fontText(me?.l ? `¡TU CABALLO: ${C.horses[me.s]}! PAGA X${odds[me.s]}` : touchify('← → ELEGIR · ESPACIO CONFIRMAR')));
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
      this.prompt.setText(fontText(me?.l ? touchify('¡MACHACA ESPACIO PARA ANIMAR A TU CABALLO!') : 'NO ELEGISTE CABALLO... ¡A MIRAR!')).setTint(Math.floor(t * 8) % 2 ? 0xffffff : 0xfee761);
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
  onPointer(x: number, _y: number, st: St): MgKey[] {
    const me = this.me<{ s: number }>(st);
    const n = st.n as number;
    if (!me) return [];
    const slot = Math.max(0, Math.min(n - 1, Math.round(x / (300 / Math.max(3, n)) + (n - 1) / 2)));
    const keys: MgKey[] = [];
    for (let k = 0; k < (slot - me.s + n) % n; k++) keys.push('r');
    keys.push('a');
    return keys;
  }

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
    const left = t < shuffle ? '¡MIRA DÓNDE ESTÁ LA LONCHA!' : t < pick ? '¡SIGUE EL CUBILETE!' : t < pick + T.pick ? (me?.l ? '¡ELEGIDO!' : `${touchify('← → ELIGE · ESPACIO')}  ${Math.ceil(pick + T.pick - t)}`) : '¿ACERTASTE?';
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

  onPointer(x: number): MgKey[] {
    return [x < 0 ? 'l' : 'r'];
  }

  onKey(k: MgKey): void {
    const lane = k === 'l' || k === 'a' ? -26 : 26;
    const fl = this.add(this.s.add.rectangle(lane, 70, 36, 6, 0xffffff, 0.7));
    this.s.tweens.add({ targets: fl, alpha: 0, scaleY: 3, duration: 150, onComplete: () => fl.destroy() });
  }
}

// =================================================================== ATRAPA LONCHAS

class AtrapaView extends MgView {
  private g: Phaser.GameObjects.Graphics;
  private basket: Phaser.GameObjects.Container;
  private items = new Map<number, Phaser.GameObjects.Image>();
  private score: Phaser.GameObjects.BitmapText;
  private lane = 2;
  private localAt = -9;
  private got = new Set<number>();
  private board_: Phaser.GameObjects.BitmapText[] = [];

  constructor(h: ViewHost) {
    super(h);
    this.g = this.add(this.s.add.graphics());
    const N = MG.atrapa.lanes;
    for (let i = 0; i < N; i++) {
      this.g.fillStyle(i % 2 ? 0x1a1428 : 0x211a33, 1).fillRect(this.laneX(i) - 26, -100, 52, 200);
    }
    const b = this.s.add.graphics();
    b.fillStyle(0x0d0b14, 1).fillRect(-21, -9, 42, 16);
    b.fillStyle(0xb8763e, 1).fillRect(-20, -8, 40, 14);
    b.fillStyle(0x7a4a24, 1).fillRect(-20, -2, 40, 2).fillRect(-20, 3, 40, 2);
    this.basket = this.add(this.s.add.container(this.laneX(2), 82, [b]));
    this.score = this.txt(-200, -86, '0', 0xfee761, 3, [0, 0.5]);
    this.txt(0, 96, '← → MUEVE LA CESTA · TOCA A LOS LADOS', UI.muted);
  }

  private laneX(i: number): number {
    return (i - (MG.atrapa.lanes - 1) / 2) * 54;
  }

  update(st: St, dt: number): void {
    const t = this.h.t();
    const me = this.me<{ l: number; s: number; g: number[] }>(st);
    // la cesta responde al instante; el servidor manda cuando no estás pulsando
    if (me && t - this.localAt > 0.4) this.lane = me.l;
    this.basket.x += (this.laneX(this.lane) - this.basket.x) * Math.min(1, dt * 20);
    if (me) {
      this.score.setText(String(me.s));
      for (const i of me.g) {
        if (this.got.has(i)) continue;
        this.got.add(i);
        const it = (st.d as number[][])[i];
        audio.play(it[2] === 2 ? 'boom' : it[2] === 1 ? 'jackpot' : 'coin');
        if (it[2] === 2) shake(this.s, 0.01, 200);
        pop(this.s, this.score, 1.4);
        this.items.get(i)?.destroy();
        this.items.delete(i);
      }
    }
    const drops = st.d as number[][];
    drops.forEach(([tl, lane, type], i) => {
      const y = 82 - (tl - t) * 120;
      let img = this.items.get(i);
      if (y < -110 || y > 100 || this.got.has(i)) {
        if (img && y > 100) {
          img.destroy();
          this.items.delete(i);
        }
        return;
      }
      if (!img) {
        img = this.add(this.s.add.image(this.laneX(lane), y, type === 2 ? 'bomb_ham' : type === 1 ? 'icon_loncha_big' : 'p_slice'));
        if (type === 0) img.setScale(3);
        if (type === 1) img.setTint(0xffd23f);
        this.items.set(i, img);
      }
      img.setY(y).setAngle(type === 0 ? t * 120 : 0);
    });
    const ps = st.ps as Ps<{ s: number }>;
    const rows = Object.entries(ps)
      .sort((a, b) => b[1].s - a[1].s)
      .map(([id, p]) => [this.h.info(Number(id))?.name ?? '?', String(p.s)] as [string, string]);
    this.board(214, -84, rows, this.board_);
  }

  onKey(k: MgKey): void {
    this.localAt = this.h.t();
    this.lane = Math.max(0, Math.min(MG.atrapa.lanes - 1, this.lane + (k === 'l' || k === 'a' ? -1 : 1)));
    audio.play('hover');
  }

  onPointer(x: number): MgKey[] {
    return [x < this.basket.x ? 'l' : 'r'];
  }
}

// =================================================================== CUENTA JAMONES

class CuentaView extends MgView {
  private flying = new Map<string, Phaser.GameObjects.Image>();
  private opts: { g: Phaser.GameObjects.Graphics; t: Phaser.GameObjects.BitmapText }[] = [];
  private info: Phaser.GameObjects.BitmapText;
  private lastRound = -1;
  private board_: Phaser.GameObjects.BitmapText[] = [];

  constructor(h: ViewHost) {
    super(h);
    this.info = this.txt(0, -88, '', 0xfee761);
    for (let i = 0; i < 3; i++) {
      const g = this.add(this.s.add.graphics());
      this.opts.push({ g, t: this.txt((i - 1) * 90, 50, '', 0xffffff, 3) });
    }
  }

  update(st: St): void {
    const C = MG.cuenta;
    const t = this.h.t();
    const r = st.r as number;
    if (r !== this.lastRound) {
      this.lastRound = r;
      for (const im of this.flying.values()) im.destroy();
      this.flying.clear();
    }
    const start = st.st as number;
    const pickAt = start + C.show;
    const items = st.it as number[][];
    for (const [it0, hgt, type] of items) {
      const key = `${r}:${it0}:${hgt}`;
      const x = -230 + (t - it0) * 240;
      let im = this.flying.get(key);
      if (!im) {
        im = this.add(this.s.add.image(x, -60 + hgt * 90, type === 0 ? 'ham' : 'p_slice').setScale(type === 0 ? 2 : 3));
        this.flying.set(key, im);
        audio.play('whoosh');
      }
      im.setX(x).setVisible(x < 240);
    }
    const ops = st.op as number[];
    const ans = st.ans as number;
    const me = this.me<{ s: number; l: boolean }>(st);
    this.opts.forEach((o, i) => {
      o.g.clear();
      o.t.setText(ops.length ? String(ops[i]) : '');
      if (!ops.length) return;
      const x = (i - 1) * 90;
      const sel = me?.s === i;
      const right = ans >= 0 && ops[i] === ans;
      o.g.fillStyle(right ? 0x63c74d : sel ? (me?.l ? 0x2a6b3a : 0xfee761) : 0x0d0b14, 1).fillRect(x - 36, 28, 72, 44);
      o.g.fillStyle(right ? 0x2a6b3a : UI.panelLight, 1).fillRect(x - 34, 30, 68, 40);
    });
    this.info.setText(fontText(`RONDA ${r + 1}/${C.rounds} · ${t < pickAt ? 'CUENTA LOS JAMONES (NO LAS LONCHAS)' : ans < 0 ? '¿CUÁNTOS JAMONES?' : `ERAN ${ans}`}`));
    const ps = st.ps as Ps<{ sc: number }>;
    const rows = Object.entries(ps)
      .sort((a, b) => b[1].sc - a[1].sc)
      .map(([id, p]) => [this.h.info(Number(id))?.name ?? '?', String(p.sc)] as [string, string]);
    this.board(214, -84, rows, this.board_);
  }

  onKey(k: MgKey): void {
    audio.play(k === 'a' ? 'click' : 'hover');
  }

  onPointer(x: number, y: number, st: St): MgKey[] {
    const me = this.me<{ s: number }>(st);
    if (!me || y < 20) return [];
    const i = Math.max(0, Math.min(2, Math.round(x / 90) + 1));
    const keys: MgKey[] = [];
    for (let k = 0; k < (i - me.s + 3) % 3; k++) keys.push('r');
    keys.push('a');
    return keys;
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
    case 'atrapa':
      return new AtrapaView(h);
    case 'cuenta':
      return new CuentaView(h);
  }
}
