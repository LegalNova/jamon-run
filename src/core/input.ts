import Phaser from 'phaser';
import { Action, ALT_BINDINGS, settings } from '../config/settings';

/** Botones de mando (layout "standard" de la Gamepad API). */
const PAD = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  BACK: 8,
  START: 9,
  UP: 12,
  DOWN: 13,
  LEFT: 14,
  RIGHT: 15,
};

const PAD_ACTIONS: Record<Action, number[]> = {
  up: [PAD.UP],
  down: [PAD.DOWN],
  left: [PAD.LEFT],
  right: [PAD.RIGHT],
  action: [PAD.A],
  sprint: [PAD.RB, PAD.RT, PAD.LB],
  special: [PAD.X],
  pause: [PAD.START],
  talk: [PAD.BACK],
  rotate: [PAD.Y],
  spin: [PAD.LT],
  emote: [],
};

type NavDir = 'up' | 'down' | 'left' | 'right';

const PREVENT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab']);

/**
 * Gestor de entrada global: teclado (por KeyboardEvent.code) + mando.
 * Se actualiza una vez por paso del juego, así que todas las escenas ven
 * el mismo estado de "recién pulsado" en el mismo frame.
 */
class InputManager {
  private down = new Set<string>();
  private queued = new Set<string>();
  private pressed = new Set<string>();
  private padDown = new Set<number>();

  /** Vibración del mando (si hay uno y se permite). */
  rumble(strength: number, ms: number): void {
    if (!settings.rumble) return;
    try {
      for (const p of navigator.getGamepads?.() ?? []) {
        const act = (p as unknown as { vibrationActuator?: { playEffect(t: string, o: object): Promise<unknown> } } | null)?.vibrationActuator;
        void act?.playEffect('dual-rumble', { duration: ms, strongMagnitude: Math.min(1, strength), weakMagnitude: Math.min(1, strength * 0.7) }).catch(() => undefined);
      }
    } catch {
      /* sin vibración */
    }
  }
  private padPrev = new Set<number>();
  private padAxes = { x: 0, y: 0 };
  private navHeld: Record<NavDir, number> = { up: -1, down: -1, left: -1, right: -1 };
  private navFired = new Set<NavDir>();
  private capture: ((code: string) => void) | null = null;
  private typing: ((key: string, code: string) => void) | null = null;
  private anyQueued = false;
  private anyPressed = false;
  lastDevice: 'keyboard' | 'gamepad' = 'keyboard';
  padConnected = false;

  attach(game: Phaser.Game): void {
    window.addEventListener('keydown', (e) => {
      if (PREVENT.has(e.code)) e.preventDefault();
      this.lastDevice = 'keyboard';
      if (this.typing) {
        e.preventDefault();
        this.typing(e.key, e.code);
        return;
      }
      if (this.capture) {
        e.preventDefault();
        const cb = this.capture;
        this.capture = null;
        cb(e.code);
        return;
      }
      if (!e.repeat) {
        this.queued.add(e.code);
        this.anyQueued = true;
      }
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
    });
    window.addEventListener('blur', () => {
      this.down.clear();
    });
    window.addEventListener('gamepadconnected', () => (this.padConnected = true));
    window.addEventListener('gamepaddisconnected', () => {
      this.padConnected = navigator.getGamepads?.().some((p) => !!p) ?? false;
    });
    game.events.on(Phaser.Core.Events.PRE_STEP, (_t: number, delta: number) => this.update(delta / 1000));
  }

  private update(dt: number): void {
    this.pressed = this.queued;
    this.queued = new Set();
    this.anyPressed = this.anyQueued;
    this.anyQueued = false;

    // Mando
    this.padPrev = this.padDown;
    this.padDown = new Set();
    this.padAxes.x = 0;
    this.padAxes.y = 0;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p || !p.connected) continue;
      this.padConnected = true;
      p.buttons.forEach((b, i) => {
        if (b.pressed || b.value > 0.5) this.padDown.add(i);
      });
      const ax = p.axes[0] ?? 0;
      const ay = p.axes[1] ?? 0;
      if (Math.hypot(ax, ay) > 0.25) {
        this.padAxes.x = ax;
        this.padAxes.y = ay;
      }
      break; // solo el primer mando
    }
    for (const b of this.padDown) {
      if (!this.padPrev.has(b)) {
        this.anyPressed = true;
        this.lastDevice = 'gamepad';
      }
    }
    if (Math.hypot(this.padAxes.x, this.padAxes.y) > 0.5) this.lastDevice = 'gamepad';

    // Navegación de menús con auto-repetición
    this.navFired.clear();
    const arrows: Record<NavDir, string> = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
    (['up', 'down', 'left', 'right'] as NavDir[]).forEach((d) => {
      // Toques muy rápidos (pulsar y soltar entre dos frames) también cuentan.
      if (this.pressed.has(arrows[d]) || this.pressed.has(settings.bindings[d])) {
        this.navFired.add(d);
        this.navHeld[d] = this.navHeldNow(d) ? 0 : -1;
        return;
      }
      const held = this.navHeldNow(d);
      if (!held) {
        this.navHeld[d] = -1;
        return;
      }
      if (this.navHeld[d] < 0) {
        this.navHeld[d] = 0;
        this.navFired.add(d);
        return;
      }
      const prev = this.navHeld[d];
      this.navHeld[d] += dt;
      const first = 0.38;
      const rep = 0.1;
      if (prev < first && this.navHeld[d] >= first) this.navFired.add(d);
      else if (prev >= first && Math.floor((this.navHeld[d] - first) / rep) > Math.floor((prev - first) / rep)) {
        this.navFired.add(d);
      }
    });
  }

  private navHeldNow(d: NavDir): boolean {
    const arrows: Record<NavDir, string> = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
    if (this.down.has(arrows[d]) || this.down.has(settings.bindings[d])) return true;
    if (PAD_ACTIONS[d].some((b) => this.padDown.has(b))) return true;
    const { x, y } = this.padAxes;
    if (d === 'up') return y < -0.55;
    if (d === 'down') return y > 0.55;
    if (d === 'left') return x < -0.55;
    return x > 0.55;
  }

  private codesFor(action: Action): string[] {
    return [settings.bindings[action], ...(ALT_BINDINGS[action] ?? [])];
  }

  isDown(action: Action): boolean {
    if (this.codesFor(action).some((c) => this.down.has(c))) return true;
    return PAD_ACTIONS[action].some((b) => this.padDown.has(b));
  }

  /** ¿Se ha pulsado esta tecla concreta (KeyboardEvent.code) en este frame? */
  keyPressed(code: string): boolean {
    return this.pressed.has(code);
  }

  justPressed(action: Action): boolean {
    if (this.codesFor(action).some((c) => this.pressed.has(c))) return true;
    return PAD_ACTIONS[action].some((b) => this.padDown.has(b) && !this.padPrev.has(b));
  }

  /** Vector de movimiento (-1..1). Analógico con mando. */
  moveVector(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    if (this.isDown('left')) x -= 1;
    if (this.isDown('right')) x += 1;
    if (this.isDown('up')) y -= 1;
    if (this.isDown('down')) y += 1;
    if (x === 0 && y === 0 && (this.padAxes.x || this.padAxes.y)) {
      x = this.padAxes.x;
      y = this.padAxes.y;
    }
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y };
  }

  nav(d: NavDir): boolean {
    return this.navFired.has(d);
  }

  confirm(): boolean {
    return (
      this.pressed.has('Enter') ||
      this.pressed.has('NumpadEnter') ||
      this.pressed.has('Space') ||
      this.pressed.has(settings.bindings.action) ||
      (this.padDown.has(PAD.A) && !this.padPrev.has(PAD.A)) ||
      (this.padDown.has(PAD.START) && !this.padPrev.has(PAD.START))
    );
  }

  back(): boolean {
    return (
      this.pressed.has('Escape') ||
      this.pressed.has('Backspace') ||
      this.pressed.has(settings.bindings.pause) ||
      (this.padDown.has(PAD.B) && !this.padPrev.has(PAD.B))
    );
  }

  anyPressedNow(): boolean {
    return this.anyPressed;
  }

  /** Captura la siguiente tecla pulsada (para reasignar controles). */
  captureNextKey(cb: (code: string) => void): void {
    this.capture = cb;
  }

  cancelCapture(): void {
    this.capture = null;
  }

  isCapturing(): boolean {
    return this.capture !== null;
  }

  /** Modo escritura (p. ej. el nombre): las teclas van al callback y no al juego. */
  startTyping(cb: (key: string, code: string) => void): void {
    this.typing = cb;
    this.down.clear();
  }

  stopTyping(): void {
    this.typing = null;
  }

  isTyping(): boolean {
    return this.typing !== null;
  }

  /** Olvida las pulsaciones de este frame (evita que una pulsación active dos cosas). */
  consume(): void {
    this.pressed.clear();
    this.anyPressed = false;
    this.navFired.clear();
    this.padPrev = new Set(this.padDown);
  }
}

export const input = new InputManager();
