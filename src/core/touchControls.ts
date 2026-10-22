/**
 * CONTROLES TÁCTILES (solo en móviles y tablets).
 * Joystick dinámico a la izquierda (aparece donde pones el dedo) y botones grandes y
 * semitransparentes a la derecha: acción, sprint, habilidad, girar, frases, ruleta y pausa.
 * No juega por su cuenta: solo "pulsa" las mismas acciones que el teclado (ver core/input.ts).
 * Se dibuja a 1 píxel de pantalla por unidad, así que los tamaños son px reales (mínimo 48).
 */
import Phaser from 'phaser';
import type { Action } from '../config/settings';
import { HYPE } from '../../shared/balance';
import { abilityFor } from '../../shared/modes/rules';
import { FONT, fontText } from '../gfx/font';
import { TEAM_COLORS } from '../gfx/palette';
import { input } from './input';
import { IS_TOUCH } from './touch';

export const TOUCH = {
  /** Radio del joystick (px de pantalla) y del mando que se mueve. */
  stickR: 58,
  knobR: 26,
  /** Zona del joystick: parte izquierda de la pantalla. */
  stickZone: 0.5,
  /** Botones: radio en px (diámetro mínimo 52 px, por encima de los 48 recomendados). */
  big: 46,
  mid: 36,
  small: 28,
  alpha: 0.35,
  /** Vibración corta al pulsar (ms). */
  tapVibrate: 12,
};

type BtnId = 'action' | 'sprint' | 'special' | 'rotate' | 'talk' | 'spin' | 'pause';

interface Btn {
  id: BtnId;
  action: Action;
  hold: boolean;
  r: number;
  x: number;
  y: number;
  label: string;
  visible: boolean;
  down: number | null;
  text: Phaser.GameObjects.BitmapText;
}

const LABELS: Record<string, string> = { attack: 'GOLPE', throw: 'LANZAR', dash: 'DASH', smoke: 'HUMO', item: 'OBJETO', disguise: 'DISFRAZ', none: '' };

interface GameLike {
  player: { team: 'chaser' | 'escapist'; disguise: number; heldItem: never; bomb: boolean; alive: boolean; spinsLeft: number };
  model: { mode: Parameters<typeof abilityFor>[0]; matchTime: number; state: string };
}

export class TouchScene extends Phaser.Scene {
  private g!: Phaser.GameObjects.Graphics;
  private btns: Btn[] = [];
  private stick: { id: number; ox: number; oy: number; x: number; y: number } | null = null;
  private shown = false;

  constructor() {
    super({ key: 'Touch', active: false });
  }

  create(): void {
    this.cameras.main.setZoom(1).setOrigin(0, 0).setScroll(0, 0);
    this.g = this.add.graphics();
    const mk = (id: BtnId, action: Action, hold: boolean, r: number, label: string): Btn => ({
      id,
      action,
      hold,
      r,
      x: 0,
      y: 0,
      label,
      visible: true,
      down: null,
      text: this.add.bitmapText(0, 0, FONT, fontText(label)).setOrigin(0.5).setScale(r >= TOUCH.mid ? 2 : 1).setAlpha(0.85),
    });
    this.btns = [
      mk('action', 'action', false, TOUCH.big, 'GOLPE'),
      mk('sprint', 'sprint', true, TOUCH.mid, 'SPRINT'),
      mk('special', 'special', false, TOUCH.mid, 'HUMO'),
      mk('rotate', 'rotate', false, TOUCH.small, 'GIRAR'),
      mk('talk', 'talk', false, TOUCH.small, 'FRASES'),
      mk('spin', 'spin', false, TOUCH.small, 'RULETA'),
      mk('pause', 'pause', false, TOUCH.small, 'II'),
    ];
    this.layout();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this));
    this.input.on('pointerdown', this.onDown, this);
    this.input.on('pointermove', this.onMove, this);
    this.input.on('pointerup', this.onUp, this);
    this.input.on('pointerupoutside', this.onUp, this);
    this.input.on('gameout', () => this.releaseAll());
  }

  /** Coloca los botones según el tamaño de la pantalla (esquina inferior derecha para el pulgar). */
  private layout(): void {
    const W = this.scale.width;
    const H = this.scale.height;
    const pos: Record<BtnId, [number, number]> = {
      action: [W - 70, H - 72],
      sprint: [W - 172, H - 50],
      special: [W - 60, H - 182],
      rotate: [W - 158, H - 150],
      talk: [W - 36, 120],
      spin: [W - 36, 186],
      pause: [W - 36, 40],
    };
    for (const b of this.btns) {
      [b.x, b.y] = pos[b.id];
      b.text.setPosition(b.x, b.y);
    }
  }

  private game_(): GameLike | null {
    if (!this.scene.isActive('Game')) return null;
    const gs = this.scene.get('Game') as unknown as Partial<GameLike>;
    return gs.player && gs.model ? (gs as GameLike) : null;
  }

  /** ¿Se ven los controles? Solo durante la partida (no en pausa, minijuegos ni resultados). */
  private wanted(): boolean {
    return !!this.game_() && !this.scene.isActive('Pause') && !this.scene.isActive('Options') && !this.scene.isActive('Minigame') && !this.scene.isActive('Results');
  }

  private hit(x: number, y: number): Btn | null {
    let best: Btn | null = null;
    let bd = Infinity;
    for (const b of this.btns) {
      if (!b.visible) continue;
      // Zona de toque algo más grande que el dibujo.
      const d = Math.hypot(x - b.x, y - b.y);
      if (d <= b.r + 12 && d < bd) {
        bd = d;
        best = b;
      }
    }
    return best;
  }

  private onDown(p: Phaser.Input.Pointer): void {
    if (!this.shown) return;
    const b = this.hit(p.x, p.y);
    if (b) {
      if (b.down !== null) return;
      b.down = p.id;
      input.virtualPress(b.action);
      if (b.hold) input.virtualHold(b.action, true);
      input.vibrate(TOUCH.tapVibrate);
      return;
    }
    if (!this.stick && p.x < this.scale.width * TOUCH.stickZone && p.y > 70) {
      // Joystick dinámico: aparece donde pones el dedo (sin salirse de la pantalla).
      const ox = Phaser.Math.Clamp(p.x, TOUCH.stickR + 8, this.scale.width - TOUCH.stickR - 8);
      const oy = Phaser.Math.Clamp(p.y, TOUCH.stickR + 8, this.scale.height - TOUCH.stickR - 8);
      this.stick = { id: p.id, ox, oy, x: p.x, y: p.y };
      this.updateStick();
    }
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (this.stick && p.id === this.stick.id) {
      this.stick.x = p.x;
      this.stick.y = p.y;
      this.updateStick();
    }
  }

  private onUp(p: Phaser.Input.Pointer): void {
    if (this.stick && p.id === this.stick.id) {
      this.stick = null;
      input.virtualMove(0, 0);
    }
    for (const b of this.btns) {
      if (b.down !== p.id) continue;
      b.down = null;
      if (b.hold) input.virtualHold(b.action, false);
    }
  }

  private updateStick(): void {
    const s = this.stick;
    if (!s) return;
    let dx = s.x - s.ox;
    let dy = s.y - s.oy;
    const d = Math.hypot(dx, dy);
    // Si el dedo se va lejos, la base le sigue (como en los juegos de móvil).
    if (d > TOUCH.stickR * 1.4) {
      s.ox += (dx / d) * (d - TOUCH.stickR * 1.4);
      s.oy += (dy / d) * (d - TOUCH.stickR * 1.4);
      dx = s.x - s.ox;
      dy = s.y - s.oy;
    }
    const len = Math.hypot(dx, dy);
    const dead = 8;
    if (len < dead) input.virtualMove(0, 0);
    else {
      const k = Math.min(1, (len - dead) / (TOUCH.stickR - dead)) / len;
      input.virtualMove(dx * k, dy * k);
    }
  }

  private releaseAll(): void {
    this.stick = null;
    for (const b of this.btns) b.down = null;
    input.releaseAll();
  }

  /** Botones que tocan ahora (según el modo y lo que hace cada uno). */
  private refresh(gs: GameLike): void {
    const p = gs.player;
    const mode = gs.model.mode;
    const set = (id: BtnId, visible: boolean, label?: string) => {
      const b = this.btns.find((x) => x.id === id)!;
      b.visible = visible;
      if (label !== undefined && label !== b.label) {
        b.label = label;
        b.text.setText(fontText(label));
      }
    };
    const a = abilityFor(mode, p, 'action');
    const sp = abilityFor(mode, p, 'special');
    set('action', true, p.alive ? LABELS[a] || 'GOLPE' : 'CÁMARA');
    set('special', p.alive && sp !== 'none', mode === 'escondite' && p.disguise >= 0 ? 'CAMBIAR' : LABELS[sp]);
    set('sprint', p.alive, mode === 'escondite' && p.disguise >= 0 ? 'QUIETO' : 'SPRINT');
    set('rotate', p.alive && mode === 'escondite' && p.disguise >= 0);
    set('spin', p.alive && p.spinsLeft > 0 && gs.model.matchTime >= HYPE.personalFrom && gs.model.state === 'play');
    set('talk', true);
    set('pause', true);
  }

  update(): void {
    const want = this.wanted();
    if (want !== this.shown) {
      this.shown = want;
      if (!want) this.releaseAll();
      else {
        // Encima de la interfaz de la partida, pero debajo de los avisos.
        this.scene.bringToTop();
        if (this.scene.isActive('Toast')) this.scene.bringToTop('Toast');
      }
    }
    const g = this.g.clear();
    for (const b of this.btns) b.text.setVisible(false);
    if (!want) return;
    const gs = this.game_()!;
    this.refresh(gs);
    const team = TEAM_COLORS[gs.player.team];
    for (const b of this.btns) {
      if (!b.visible) continue;
      const pressed = b.down !== null;
      g.fillStyle(pressed ? team.main : 0x0d0b14, pressed ? 0.55 : TOUCH.alpha).fillCircle(b.x, b.y, b.r);
      g.lineStyle(2, b.id === 'action' ? team.light : 0xffffff, pressed ? 0.9 : 0.45).strokeCircle(b.x, b.y, b.r);
      b.text.setVisible(true).setAlpha(pressed ? 1 : 0.8);
    }
    const s = this.stick;
    if (s) {
      g.fillStyle(0x0d0b14, 0.3).fillCircle(s.ox, s.oy, TOUCH.stickR);
      g.lineStyle(2, 0xffffff, 0.4).strokeCircle(s.ox, s.oy, TOUCH.stickR);
      let dx = s.x - s.ox;
      let dy = s.y - s.oy;
      const d = Math.hypot(dx, dy);
      if (d > TOUCH.stickR) {
        dx = (dx / d) * TOUCH.stickR;
        dy = (dy / d) * TOUCH.stickR;
      }
      g.fillStyle(0xffffff, 0.45).fillCircle(s.ox + dx, s.oy + dy, TOUCH.knobR);
    } else {
      // Pista: dónde va el joystick.
      g.lineStyle(2, 0xffffff, 0.12).strokeCircle(110, this.scale.height - 100, TOUCH.stickR);
    }
  }
}

/** Arranca los controles táctiles (no hace nada en ordenador). */
export function startTouchControls(scene: Phaser.Scene): void {
  if (!IS_TOUCH || scene.scene.isActive('Touch')) return;
  scene.scene.launch('Touch');
}

/** Pantalla completa y horizontal al pulsar JUGAR (en iPhone no existe y se sigue igual). */
export function mobileFullscreen(): void {
  if (!IS_TOUCH) return;
  try {
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
    if (!document.fullscreenElement) {
      const req = el.requestFullscreen?.({ navigationUI: 'hide' }) ?? (el.webkitRequestFullscreen?.(), undefined);
      void Promise.resolve(req)
        .then(() => (screen.orientation as unknown as { lock?: (o: string) => Promise<void> })?.lock?.('landscape'))
        .catch(() => undefined);
    }
  } catch {
    /* sin pantalla completa (iPhone): no pasa nada */
  }
}
