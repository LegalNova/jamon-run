import Phaser from 'phaser';
import { PARON } from '../../shared/balance';
import type { Equipped } from '../../shared/economy';
import { MgKey, mgDef, MINIGAMES, ParonNet, ParonPhase, PERKS } from '../../shared/minigames';
import { audio } from '../core/audio';
import { flash, pop, shake } from '../core/feel';
import { input } from '../core/input';
import { dance } from '../game/cosmetics';
import { ensureCharTexture } from '../gfx/characters';
import { fontText } from '../gfx/font';
import { createView, MgPlayerInfo, MgView } from '../minigames/views';
import { panel, text, UI } from '../ui/widgets';
import { viewSize } from './common';

/** Lo que la escena necesita de quien lleva el minijuego (partida offline/online o Sala de minijuegos). */
export interface MgHost {
  myId: number;
  net(): ParonNet | null;
  t(): number;
  input(k: MgKey): void;
  /** Evento Ruleta: apuesta y saldo. */
  bet(c: string, a: number): void;
  balance(): number;
  react(e: number): void;
  reactions(): { id: number; e: number }[];
  info(id: number): (MgPlayerInfo & { cos?: Equipped }) | undefined;
  onEnd(): void;
}

const PHASE_TITLES: Partial<Record<ParonPhase, string>> = { podium: 'PODIO', count: '¡SEGUIMOS!' };

/** Capa del Parón Dopamina: va encima de la partida congelada. */
export class MinigameScene extends Phaser.Scene {
  private host!: MgHost;
  private W = 480;
  private H = 270;
  private phase: ParonPhase | '' = '';
  private root!: Phaser.GameObjects.Container;
  private phaseC!: Phaser.GameObjects.Container;
  private dim!: Phaser.GameObjects.Rectangle;
  private bar!: Phaser.GameObjects.Graphics;
  private view: MgView | null = null;
  private slotList: Phaser.GameObjects.BitmapText[] = [];
  private slotY = 0;
  private slotLast = -1;
  private countLast = -1;
  private confetti!: Phaser.GameObjects.Particles.ParticleEmitter;
  private stopDances: (() => void)[] = [];
  private perkCards: Phaser.GameObjects.Container | null = null;
  private header!: Phaser.GameObjects.BitmapText;
  private frame!: Phaser.GameObjects.Graphics;
  private t = 0;
  private ended = false;

  constructor() {
    super('Minigame');
  }

  init(data: { host: MgHost }): void {
    this.host = data.host;
    this.phase = '';
    this.view = null;
    this.ended = false;
    this.stopDances = [];
    this.perkCards = null;
  }

  /** Toque/clic en la pantalla: lo traduce a teclas del minijuego o elige ventaja. */
  private onTap(p: Phaser.Input.Pointer): void {
    const net = this.host.net();
    if (!net) return;
    const x = p.x / this.cameras.main.zoom - this.W / 2;
    const y = p.y / this.cameras.main.zoom - this.H / 2;
    if (net.ph === 'play' && net.st && this.view) {
      const keys = this.view.onPointer(x, y, net.st);
      for (const k of keys) {
        this.host.input(k);
        this.view.onKey(k, net.st);
      }
    } else if (net.ph === 'podium' && net.perk?.[this.host.myId] && y > 70) {
      const mine = net.perk[this.host.myId];
      const i = Math.max(0, Math.min(2, Math.round(x / 108) + 1));
      for (let k = 0; k < (i - mine[0] + 3) % 3; k++) this.host.input('r');
      this.host.input('a');
      audio.play('click');
    }
  }

  create(): void {
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onTap(p));
    const { Z, W, H } = viewSize(this);
    this.W = W;
    this.H = H;
    this.cameras.main.setZoom(Z).setOrigin(0, 0).setScroll(0, 0);
    this.dim = this.add.rectangle(0, 0, W, H, 0x0b0912, 0.82).setOrigin(0);
    // Panel del minijuego (para que se lea bien encima de la partida congelada).
    this.frame = this.add.graphics();
    const fw = Math.min(W - 12, 468);
    const fh = Math.min(H - 12, 258);
    panel(this.frame, W / 2 - fw / 2, H / 2 - fh / 2, fw, fh, 0x15111f, 0x3d3160);
    this.frame.fillStyle(0xffffff, 0.04).fillRect(W / 2 - fw / 2 + 2, H / 2 - fh / 2 + 2, fw - 4, 14);
    this.frame.setVisible(false);
    this.root = this.add.container(W / 2, H / 2);
    this.phaseC = this.add.container(W / 2, H / 2);
    this.bar = this.add.graphics();
    this.header = text(this, W / 2, 10, '', { color: UI.focusLight });
    this.confetti = this.add
      .particles(0, 0, 'p_confetti', { lifespan: 1800, speed: { min: 80, max: 230 }, angle: { min: 210, max: 330 }, gravityY: 220, rotate: { min: 0, max: 360 }, tint: [0xe43b44, 0xfee761, 0x63c74d, 0x2f88e8, 0xff7ab8, 0xffffff], emitting: false })
      .setDepth(50);
    const onConf = (n: number) => this.confetti.emitParticleAt(this.W / 2 + (Math.random() - 0.5) * 160, this.H / 2 - 40, n);
    this.game.events.on('mgConfetti', onConf);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off('mgConfetti', onConf);
      this.view?.destroy();
      for (const s of this.stopDances) s();
      audio.setTempo(1);
    });
  }

  private clearPhase(): void {
    for (const s of this.stopDances) s();
    this.stopDances = [];
    this.phaseC.removeAll(true);
    this.perkCards = null;
  }

  private enter(ph: ParonPhase, net: ParonNet): void {
    this.phase = ph;
    this.clearPhase();
    this.frame.setVisible(ph !== 'break' && ph !== 'count');
    const def = mgDef(net.mg);
    const breakTitle = net.k === 'ruleta' ? '¡EVENTO RULETA!' : net.k === 'carrera' ? '¡CARRERA DE CABALLOS!' : net.n > 1 ? '¡PARÓN DOBLE!' : '¡PARÓN DOPAMINA!';
    this.header.setText(fontText(ph === 'break' || ph === 'slot' ? breakTitle : net.n > 1 ? `${def.name} · ${net.i + 1}/${net.n}` : def.name)).setTint(def.color);
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.phaseC.add(o);
      return o;
    };
    switch (ph) {
      case 'break': {
        // La pantalla se rompe en píxeles y aparece "¡PARÓN!" con corneta.
        audio.play('horn');
        shake(this, 0.012, 300);
        flash(this, 150);
        this.dim.setAlpha(0);
        this.tweens.add({ targets: this.dim, alpha: 0.82, duration: 600 });
        const cols = [0x2a2140, 0x3d3160, 0x1a1428, 0xc2414b, 0xfee761, 0x63c74d];
        for (let i = 0; i < 90; i++) {
          const r = add(this.add.rectangle((Math.random() - 0.5) * this.W, (Math.random() - 0.5) * this.H, 12, 12, cols[i % cols.length]));
          this.tweens.add({ targets: r, x: r.x * 1.8, y: r.y + 120 + Math.random() * 120, angle: Math.random() * 360, alpha: 0, duration: 900 + Math.random() * 500, ease: 'Quad.easeIn' });
        }
        const big = net.k === 'ruleta' ? 'RULETA' : net.k === 'carrera' ? 'CARRERA' : net.n > 1 ? '¡DOBLE!' : '¡PARÓN!';
        const t = add(text(this, 0, -10, big, { scale: 6, color: net.k === 'ruleta' ? 0x63c74d : 0xfee761 }));
        t.setScale(0);
        this.tweens.add({ targets: t, scale: 6, duration: 420, ease: 'Bounce.easeOut' });
        const sub = net.k === 'ruleta' ? 'TODO SE PARA: ¡HAGAN JUEGO!' : net.k === 'carrera' ? 'ELIGE TU CABALLO GANADOR' : net.n > 1 ? 'DOS MINIJUEGOS SEGUIDOS' : 'TODO SE CONGELA... ¡MINIJUEGO!';
        add(text(this, 0, 34, sub, { color: UI.text }));
        break;
      }
      case 'slot': {
        // Tragaperras: frena y se para en el minijuego que ha tocado.
        const g = add(this.add.graphics());
        panel(g, -120, -36, 240, 72, 0x1a1428, 0xfeae34);
        g.fillStyle(0xfee761, 1).fillTriangle(-130, -6, -130, 6, -122, 0).fillTriangle(130, -6, 130, 6, 122, 0);
        add(text(this, 0, -50, 'TOCA...', { color: UI.focusLight, scale: 2 }));
        this.slotList = [];
        const total = MINIGAMES.length * 5;
        for (let i = 0; i < total; i++) {
          const d = MINIGAMES[i % MINIGAMES.length];
          this.slotList.push(add(text(this, 0, 0, d.name, { color: d.color, scale: 2 })));
        }
        const target = (MINIGAMES.length * 4 + MINIGAMES.findIndex((m) => m.id === net.mg)) * 24;
        this.slotY = 0;
        this.slotLast = -1;
        const mask = this.make.graphics({}, false);
        mask.fillStyle(0xffffff).fillRect(this.W / 2 - 118, this.H / 2 - 34, 236, 68);
        for (const s of this.slotList) s.setMask(mask.createGeometryMask());
        this.tweens.addCounter({
          from: 0,
          to: target,
          duration: (PARON.phases.slot - 0.5) * 1000,
          ease: 'Cubic.easeOut',
          onUpdate: (tw) => {
            this.slotY = tw.getValue() ?? 0;
          },
          onComplete: () => {
            audio.play('jackpot');
            flash(this, 120);
            shake(this, 0.006, 150);
            this.confetti.emitParticleAt(this.W / 2, this.H / 2, 40);
          },
        });
        break;
      }
      case 'howto': {
        const ic = add(this.add.image(0, -40, `mg_${def.id}`).setScale(0));
        this.tweens.add({ targets: ic, scale: 3, duration: 300, ease: 'Back.easeOut' });
        this.tweens.add({ targets: ic, angle: { from: -8, to: 8 }, yoyo: true, repeat: -1, duration: 300 });
        add(text(this, 0, 14, def.name, { scale: 2, color: def.color }));
        add(text(this, 0, 34, def.howto[0], { color: UI.text }));
        add(text(this, 0, 46, def.howto[1], { color: UI.text }));
        add(text(this, 0, 66, `TECLAS: ${def.keys}`, { color: UI.focusLight }));
        audio.play('reveal');
        break;
      }
      case 'play':
        this.view?.destroy();
        this.view = createView(net.mg, {
          scene: this,
          root: this.root,
          myId: this.host.myId,
          info: (id) => this.host.info(id),
          t: () => this.host.t(),
          bet: (c, a) => this.host.bet(c, a),
          balance: () => this.host.balance(),
          send: (keys) => keys.forEach((k) => this.host.input(k)),
        });
        audio.play('go');
        break;
      case 'podium':
        this.view?.destroy();
        this.view = null;
        this.buildPodium(net);
        break;
      case 'count':
        this.countLast = -1;
        break;
      default:
        break;
    }
  }

  private buildPodium(net: ParonNet): void {
    const res = net.res ?? [];
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.phaseC.add(o);
      return o;
    };
    const g = add(this.add.graphics());
    const spots: [number, number, number][] = [
      [0, -10, 0xffd23f],
      [-90, 6, 0xc2c3c7],
      [90, 18, 0xc79a1c],
    ];
    const top = [...res].sort((a, b) => a.place - b.place).slice(0, 3);
    top.forEach((r, i) => {
      const [x, y, col] = spots[i];
      g.fillStyle(0x0d0b14, 1).fillRect(x - 36, y, 72, 80 - y);
      g.fillStyle(col, 1).fillRect(x - 35, y + 1, 70, 78 - y);
      add(text(this, x, y + 14, String(r.place + 1), { scale: 3, color: 0x1a1424 }));
      const info = this.host.info(r.id);
      if (!info) return;
      const key = ensureCharTexture(this, null, info.look);
      const spr = add(this.add.sprite(x, y - 2, key, 'down_idle0').setScale(3).setOrigin(0.5, 1));
      spr.play(`${key}_down_run`);
      this.stopDances.push(dance(this, spr, info.cos?.dance));
      add(text(this, x, y - 66, info.name, { color: r.id === this.host.myId ? 0xfee761 : UI.text }));
      add(text(this, x, y - 56, r.label, { color: col }));
    });
    const mine = res.find((r) => r.id === this.host.myId);
    add(text(this, 0, -100, mine ? (mine.won ? '¡HAS GANADO!' : `QUEDAS EN EL PUESTO ${mine.place + 1}`) : 'PODIO', { scale: 2, color: mine?.won ? 0x63c74d : UI.text }));
    if (mine?.won) {
      audio.play('win');
      this.confetti.emitParticleAt(this.W / 2, this.H / 2 - 60, 80);
    } else audio.play('fanfare');
    // Si has ganado, eliges una ventaja para lo que queda de partida.
    if (net.perk && net.perk[this.host.myId]) {
      const c = this.add.container(0, 92);
      this.phaseC.add(c);
      this.perkCards = c;
      add(text(this, 0, 76, '← → ELIGE TU VENTAJA · ESPACIO', { color: UI.focusLight }));
    }
  }

  private updatePerks(net: ParonNet): void {
    const c = this.perkCards;
    const mine = net.perk?.[this.host.myId];
    if (!c || !mine) return;
    c.removeAll(true);
    PERKS.forEach((p, i) => {
      const x = (i - 1) * 108;
      const g = this.add.graphics();
      const sel = mine[0] === i;
      panel(g, x - 50, -10, 100, 24, sel ? (mine[1] ? 0x2a6b3a : UI.panelLight) : UI.panelDark, sel ? 0xfee761 : UI.border);
      c.add(g);
      c.add(text(this, x, -2, p.name, { color: sel ? 0xfee761 : UI.text }));
      c.add(text(this, x, 8, mine[1] && sel ? '¡ELEGIDA!' : p.desc, { color: UI.muted }));
    });
  }

  private reaction(id: number, e: number): void {
    const x = 30 + Math.random() * (this.W - 60);
    const img = this.add.image(x, this.H + 10, `react_${e}`).setScale(1.6).setDepth(60);
    const name = text(this, x, this.H + 22, this.host.info(id)?.name ?? '', { color: UI.muted }).setDepth(60);
    this.tweens.add({ targets: [img, name], y: `-=${120 + Math.random() * 60}`, duration: 1800, ease: 'Sine.easeOut' });
    this.tweens.add({ targets: img, x: x + (Math.random() - 0.5) * 40, angle: (Math.random() - 0.5) * 40, duration: 1800 });
    this.tweens.add({ targets: [img, name], alpha: 0, delay: 1300, duration: 500, onComplete: () => (img.destroy(), name.destroy()) });
  }

  update(_t: number, delta: number): void {
    const dt = delta / 1000;
    this.t += dt;
    const net = this.host.net();
    if (!net || net.ph === 'end') {
      if (!this.ended) {
        this.ended = true;
        this.host.onEnd();
        this.scene.stop();
      }
      return;
    }
    if (net.ph !== this.phase) this.enter(net.ph, net);
    // barra de tiempo de la fase
    const total = net.ph === 'play' ? net.pt + this.host.t() : (PARON.phases[net.ph as keyof typeof PARON.phases] ?? 1);
    this.bar.clear();
    if (net.ph === 'play' || net.ph === 'podium') {
      const k = Math.max(0, Math.min(1, net.pt / Math.max(0.1, total)));
      this.bar.fillStyle(0x0d0b14, 1).fillRect(this.W / 2 - 101, 17, 202, 5);
      this.bar.fillStyle(k < 0.25 ? 0xe43b44 : 0x63c74d, 1).fillRect(this.W / 2 - 100, 18, Math.round(200 * k), 3);
    }
    if (net.ph === 'slot') {
      const idx = Math.floor(this.slotY / 24);
      this.slotList.forEach((s, i) => s.setY(i * 24 - this.slotY));
      if (idx !== this.slotLast) {
        this.slotLast = idx;
        audio.play('spinTick');
      }
    }
    if (net.ph === 'play' && net.st && this.view) this.view.update(net.st, dt);
    if (net.ph === 'podium') this.updatePerks(net);
    if (net.ph === 'count') {
      const n = Math.ceil(net.pt);
      if (n !== this.countLast && n > 0) {
        this.countLast = n;
        this.phaseC.removeAll(true);
        const t = text(this, 0, 0, String(n), { scale: 8, color: 0xfee761 });
        this.phaseC.add(t);
        this.phaseC.add(text(this, 0, 40, '¡VUELVE LA PARTIDA!', { color: UI.text }));
        pop(this, t, 1.5, 250);
        audio.play('count');
      }
      this.dim.setAlpha(Math.max(0.2, net.pt / PARON.phases.count) * 0.82);
    }
    this.header.setText(fontText(PHASE_TITLES[net.ph] ?? this.header.text));
    // teclas del minijuego
    const keys: MgKey[] = [];
    if (input.justPressed('action')) keys.push('a');
    if (input.justPressed('special')) keys.push('b');
    if (input.nav('left')) keys.push('l');
    if (input.nav('right')) keys.push('r');
    for (const k of keys) {
      if (net.ph === 'play' || net.ph === 'podium') this.host.input(k);
      if (net.ph === 'play' && net.st) this.view?.onKey(k, net.st);
      if (net.ph === 'podium') audio.play('hover');
    }
    // números: en la ruleta, 1-3 son los colores; si no, reacciones 1-5 (🔥😂😱👏🍖)
    for (let e = 0; e < 5; e++) {
      if (!(input.keyPressed(`Digit${e + 1}`) || input.keyPressed(`Numpad${e + 1}`))) continue;
      if (net.ph === 'play' && this.view?.onDigit(e + 1)) continue;
      this.host.react(e);
    }
    for (const r of this.host.reactions()) this.reaction(r.id, r.e);
  }
}
