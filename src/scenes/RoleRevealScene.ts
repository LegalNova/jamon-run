import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../config/balance';
import { keyName, settings } from '../config/settings';
import { audio } from '../core/audio';
import { input } from '../core/input';
import { IS_TOUCH } from '../core/touch';
import { modeInfo } from '../../shared/modes/rules';
import type { ModeId } from '../../shared/sim/types';
import { ensureCharTexture, Team } from '../gfx/characters';
import { TEAM_COLORS } from '../gfx/palette';
import { profile } from '../config/profile';
import { getMap, MapId, styleOf } from '../world/maps';
import { text, UI } from '../ui/widgets';
import { Backdrop, fadeIn, fadeTo } from './common';
import { outfitFor } from './GameScene';
import { MODE_COLORS } from './ModeSelectScene';
import type { OnlineModel } from '../net/OnlineModel';

/** Colores de los dos bandos de la ruleta según el modo. */
function wheelColors(mode: ModeId): { hunter: [number, number]; prey: [number, number] } {
  if (mode === 'infeccion') return { hunter: [0x3e8948, 0x265c42], prey: [TEAM_COLORS.escapist.main, TEAM_COLORS.escapist.dark] };
  return { hunter: [TEAM_COLORS.chaser.main, TEAM_COLORS.chaser.dark], prey: [TEAM_COLORS.escapist.main, TEAM_COLORS.escapist.dark] };
}

const SEGMENTS = 8;
const SEG = (Math.PI * 2) / SEGMENTS;
const R = 64;
/** Recordatorio antes de cada partida (ms) tras ver tu bando. */
const REMINDER_MS = 2000;

export class RoleRevealScene extends Phaser.Scene {
  private mapId: MapId = 'forest';
  private mode: ModeId = 'pilla';
  private role: Team = 'chaser';
  private footer?: Phaser.GameObjects.BitmapText;
  private wheel!: Phaser.GameObjects.Container;
  private group!: Phaser.GameObjects.Container;
  private spin!: Phaser.Tweens.Tween;
  private lastSeg = 0;
  private phase: 'spin' | 'reveal' | 'ready' = 'spin';
  private backdrop!: Backdrop;
  private prompt?: Phaser.GameObjects.BitmapText;
  private t = 0;
  private winSeg = 0;
  private highlight!: Phaser.GameObjects.Graphics;

  constructor() {
    super('RoleReveal');
  }

  private online: OnlineModel | null = null;
  private started = false;
  private tapped = false;
  private revealMs = 0;
  private spinMs = 3600;

  init(data: { mode?: ModeId; mapId?: MapId; online?: OnlineModel; revealMs?: number }): void {
    this.online = data.online ?? null;
    this.revealMs = data.revealMs ?? 0;
    // Online, el bando lo decide el servidor (la ruleta solo lo muestra).
    this.mapId = this.online ? this.online.mapId : (data.mapId ?? 'forest');
    this.mode = this.online ? this.online.mode : (data.mode ?? 'pilla');
    const hunterChance = this.mode === 'infeccion' ? 0.3 : 0.5;
    this.role = this.online ? this.online.player().team : this.mode === 'bomba' ? 'escapist' : Math.random() < hunterChance ? 'chaser' : 'escapist';
    this.spinMs = this.online ? Math.max(900, Math.min(3600, this.revealMs - 1600)) : 3600;
    this.phase = 'spin';
    this.t = 0;
    this.prompt = undefined;
    this.started = false;
    this.tapped = false;
  }

  create(): void {
    fadeIn(this);
    this.backdrop = new Backdrop(this, false, 0.2);
    const info = modeInfo(this.mode);
    text(this, VIEW_W / 2, 16, this.mode === 'bomba' ? '¡TODOS CONTRA TODOS!' : '¿QUÉ BANDO TE TOCA?', { scale: 2, color: UI.focusLight });
    text(this, VIEW_W / 2, 34, `${info.name} · MAPA: ${getMap(this.mapId).name}`, { color: MODE_COLORS[this.mode] });
    const WC = wheelColors(this.mode);

    this.group = this.add.container(VIEW_W / 2, 146);
    this.wheel = this.add.container(0, 0);
    this.group.add(this.wheel);
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.4).fillCircle(3, 4, R + 4);
    g.fillStyle(0x0d0b14, 1).fillCircle(0, 0, R + 4);
    for (let i = 0; i < SEGMENTS; i++) {
      const chaser = i % 2 === 0;
      const bomba = this.mode === 'bomba';
      g.fillStyle(bomba ? (chaser ? 0xfeae34 : 0xe43b44) : chaser ? WC.hunter[0] : WC.prey[0], 1);
      g.slice(0, 0, R, i * SEG, (i + 1) * SEG, false);
      g.fillPath();
      g.fillStyle(bomba ? (chaser ? 0xb85c18 : 0xa22633) : chaser ? WC.hunter[1] : WC.prey[1], 1);
      g.slice(0, 0, R * 0.42, i * SEG, (i + 1) * SEG, false);
      g.fillPath();
    }
    g.lineStyle(1, 0x0d0b14, 1);
    for (let i = 0; i < SEGMENTS; i++) {
      g.lineBetween(0, 0, Math.cos(i * SEG) * R, Math.sin(i * SEG) * R);
    }
    g.fillStyle(0xfeae34, 1);
    for (let i = 0; i < SEGMENTS; i++) g.fillRect(Math.round(Math.cos(i * SEG) * (R + 1)) - 1, Math.round(Math.sin(i * SEG) * (R + 1)) - 1, 3, 3);
    this.highlight = this.add.graphics();
    this.wheel.add([g, this.highlight]);
    for (let i = 0; i < SEGMENTS; i++) {
      const a = (i + 0.5) * SEG;
      const chaser = i % 2 === 0;
      const hunterIcon = this.mode === 'infeccion' ? 'p_virus' : this.mode === 'bomba' ? 'bomb_ham' : 'ham';
      const preyIcon = this.mode === 'escondite' ? 'prop_0_0' : this.mode === 'bomba' ? 'item_coin' : 'item_boot';
      const icon = this.add.image(Math.cos(a) * R * 0.7, Math.sin(a) * R * 0.7, chaser ? hunterIcon : preyIcon);
      if (hunterIcon === 'p_virus' && chaser) icon.setScale(3);
      icon.setRotation(a + Math.PI / 2);
      this.wheel.add(icon);
    }
    const hub = this.add.graphics();
    hub.fillStyle(0x0d0b14, 1).fillCircle(0, 0, 10);
    hub.fillStyle(0xfeae34, 1).fillCircle(0, 0, 8);
    hub.fillStyle(0xfee761, 1).fillCircle(-2, -2, 3);
    this.wheel.add(hub);

    // puntero fijo arriba (se mueve con la rueda, pero no gira)
    const ptr = this.add.graphics();
    ptr.fillStyle(0x0d0b14, 1).fillTriangle(-8, -R - 12, 8, -R - 12, 0, -R + 4);
    ptr.fillStyle(0xfee761, 1).fillTriangle(-6, -R - 11, 6, -R - 11, 0, -R + 1);
    this.group.add(ptr);

    // segmento ganador
    const options = [...Array(SEGMENTS).keys()].filter((i) => this.mode === 'bomba' || (i % 2 === 0) === (this.role === 'chaser'));
    this.winSeg = options[Math.floor(Math.random() * options.length)];
    const jitter = (Math.random() - 0.5) * SEG * 0.6;
    const final = -Math.PI / 2 - (this.winSeg + 0.5) * SEG + jitter + Math.PI * 2 * 6;
    this.wheel.rotation = 0;
    this.lastSeg = this.segUnderPointer();
    this.spin = this.tweens.add({
      targets: this.wheel,
      rotation: final,
      duration: this.spinMs,
      ease: 'Cubic.easeOut',
      onComplete: () => this.reveal(),
    });
    this.footer = text(this, VIEW_W / 2, VIEW_H - 12, this.online ? 'PARTIDA ONLINE · EMPIEZA EN UN MOMENTO' : IS_TOUCH ? 'TOCA PARA SALTAR' : 'ENTER: SALTAR · ESC: VOLVER', { color: UI.muted });
    this.input.on('pointerdown', () => (this.tapped = true));
    if (this.online) {
      const model = this.online;
      this.time.delayedCall(Math.max(this.spinMs + 900, this.revealMs - 150), () => fadeTo(this, 'Game', { model }));
    }
  }

  private segUnderPointer(): number {
    const a = Phaser.Math.Angle.Wrap(-Math.PI / 2 - this.wheel.rotation);
    return Math.floor(Phaser.Math.Angle.Normalize(a) / SEG);
  }

  private reveal(): void {
    if (this.phase !== 'spin') return;
    this.phase = 'reveal';
    audio.play('reveal');
    this.cameras.main.flash(200, 255, 255, 255);
    const chaser = this.role === 'chaser';
    const mode = this.mode;
    const info = modeInfo(mode);
    let color: number = chaser ? TEAM_COLORS.chaser.light : TEAM_COLORS.escapist.light;
    if (mode === 'infeccion' && chaser) color = 0x9cff5a;
    if (mode === 'bomba') color = 0xfeae34;

    this.highlight.clear();
    this.highlight.lineStyle(2, 0xffffff, 1);
    this.highlight.beginPath();
    this.highlight.slice(0, 0, R, this.winSeg * SEG, (this.winSeg + 1) * SEG, false);
    this.highlight.strokePath();

    this.tweens.add({ targets: this.group, x: 112, scale: 0.75, duration: 500, ease: 'Cubic.easeInOut' });

    const cx = 320;
    const titles: Record<ModeId, [string, string]> = {
      pilla: chaser ? ['¡EQUIPO AZUL!', 'ERES PERSEGUIDOR'] : ['¡EQUIPO ROJO!', 'ERES ESCAPISTA'],
      infeccion: chaser ? ['¡INFECTADO!', 'ERES EL PACIENTE CERO'] : ['¡SUPERVIVIENTE!', 'QUE NO TE TOQUEN'],
      bomba: ['¡JAMÓN BOMBA!', 'QUE NO TE EXPLOTE ENCIMA'],
      escondite: chaser ? ['¡BUSCADOR!', 'ENCUENTRA A LOS ESCONDIDOS'] : ['¡ESCONDIDO!', 'CONVIÉRTETE EN UN OBJETO'],
    };
    const title = text(this, cx, 50, titles[mode][0], { scale: 2, color });
    text(this, cx, 66, titles[mode][1], { color });
    title.setScale(0);
    this.tweens.add({ targets: title, scale: 2, duration: 300, ease: 'Back.easeOut' });

    const key = ensureCharTexture(this, mode === 'bomba' ? null : this.role, profile.look, outfitFor(mode, styleOf(this.mapId), this.role));
    const spr = this.add.sprite(cx, 138, key, 'down_idle0').setScale(3).setOrigin(0.5, 1);
    spr.play(`${key}_down_run`);
    if (mode === 'bomba') {
      const bomb = this.add.image(cx, 76, 'bomb_ham').setScale(2);
      this.tweens.add({ targets: bomb, y: 70, scale: 2.3, yoyo: true, repeat: -1, duration: 300 });
    }
    if (chaser && (mode === 'pilla' || mode === 'escondite')) {
      const ham = this.add.image(cx + 15, 123, 'ham').setScale(3).setOrigin(2 / 15, 4.5 / 9).setRotation(-1.2);
      this.tweens.add({ targets: ham, rotation: 0.6, yoyo: true, repeat: -1, duration: 260, ease: 'Sine.easeInOut', repeatDelay: 400 });
    }
    const b = settings.bindings;
    const K = (k: string) => keyName(k);
    const goals: Record<ModeId, string[]> = {
      pilla: chaser ? ['ENJAMONA A TODOS LOS ROJOS', 'Y VIGILA A LOS ATRAPADOS.'] : ['SOBREVIVE Y RESCATA A TUS', 'COLEGAS ENJAMONADOS.'],
      infeccion: chaser ? ['TOCA A LOS SUPERVIVIENTES', 'PARA CONTAGIARLOS.'] : ['AGUANTA 2:30. COGE OBJETOS', 'Y USA LA BARRERA.'],
      bomba: ['TOCA A ALGUIEN PARA PASARLE', 'EL JAMÓN. ¡QUEDA UNO!'],
      escondite: chaser ? ['GOLPEA LOS OBJETOS RAROS.', 'SI ES REAL, TE HACES DAÑO.'] : ['DISFRÁZATE Y NO TE MUEVAS.', 'CADA 20 S HACES RUIDO.'],
    };
    goals[mode].forEach((l, i) => text(this, cx, 148 + i * 11, l, { color: UI.text }));
    const ctrl: Record<ModeId, string[]> = {
      pilla: chaser
        ? [`${K(b.action)}: JAMONAZO · ${K(b.special)}: LANZAR`]
        : [`${K(b.action)}: DASH · ${K(b.special)}: HUMO`],
      infeccion: chaser ? [`${K(b.action)}: ABALANZARSE`] : [`${K(b.action)}: DASH · ${K(b.special)}: USAR OBJETO`],
      bomba: [`${K(b.action)}: DASH PARA PASARLA`],
      escondite: chaser ? [`${K(b.action)}: JAMONAZO`] : [`${K(b.special)}: DISFRAZ · ${K(b.rotate)}: GIRAR · SHIFT: QUIETO`],
    };
    // En el móvil, los nombres de los botones táctiles.
    const touchCtrl: Record<ModeId, string> = {
      pilla: chaser ? 'BOTÓN GOLPE · BOTÓN LANZAR' : 'BOTÓN DASH · BOTÓN HUMO',
      infeccion: chaser ? 'BOTÓN GOLPE: ABALANZARSE' : 'BOTÓN DASH · BOTÓN OBJETO',
      bomba: 'BOTÓN DASH PARA PASARLA',
      escondite: chaser ? 'BOTÓN GOLPE: JAMONAZO' : 'DISFRAZ · GIRAR · QUIETO',
    };
    (IS_TOUCH ? [touchCtrl[mode]] : ctrl[mode]).forEach((l, i) => text(this, cx, 174 + i * 10, l, { color: UI.focusLight }));
    const total = this.online ? this.online.roster.length : settings.chasers + settings.escapists;
    const nCh = this.online ? this.online.roster.filter((r) => r.team === 'chaser').length : mode === 'pilla' ? settings.chasers : 0;
    const vs = mode === 'bomba' ? `${total} JUGADORES · QUEDA UNO` : mode === 'pilla' ? `${nCh} AZULES VS ${total - nCh} ROJOS` : `${info.hunters} VS ${info.prey}`;
    text(this, cx, 186, vs, { color: UI.muted });
    text(this, cx, 204, '¡ATENTO A LOS PARONES!', { color: 0xff7ab8 });

    this.time.delayedCall(450, () => {
      this.phase = 'ready';
      if (!this.online) {
        this.footer?.setVisible(false);
        this.prompt = text(this, VIEW_W / 2, VIEW_H - 12, IS_TOUCH ? 'TOCA PARA JUGAR YA' : 'ENTER / ESPACIO: ¡A JUGAR YA!', { color: 0xffffff });
        // Recordatorio de 2 s y a jugar solo.
        this.time.delayedCall(REMINDER_MS, () => this.start());
      }
    });
  }

  update(_t: number, delta: number): void {
    const dt = delta / 1000;
    this.t += dt;
    this.backdrop.update(dt);
    if (this.phase === 'spin') {
      const s = this.segUnderPointer();
      if (s !== this.lastSeg) {
        this.lastSeg = s;
        audio.play('tick');
      }
    }
    if (this.prompt) this.prompt.setVisible(Math.floor(this.t * 2.5) % 2 === 0);
    if (this.online) return; // online no se puede saltar ni volver
    if (input.back()) {
      audio.play('back');
      fadeTo(this, 'MapSelect', { mode: this.mode });
      return;
    }
    const tap = this.tapped;
    this.tapped = false;
    if (input.confirm() || tap) {
      if (this.phase === 'spin') {
        this.spin.seek(this.spinMs - 10);
      } else if (this.phase === 'ready') {
        audio.play('click');
        this.start();
      }
    }
  }

  private start(): void {
    if (this.started || this.online) return;
    this.started = true;
    fadeTo(this, 'Game', { mode: this.mode, mapId: this.mapId, role: this.role });
  }
}
