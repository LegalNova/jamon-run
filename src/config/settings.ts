import { BALANCE, Difficulty } from './balance';
import { PARON, ParonLevel } from '../../shared/balance';

export type Action = 'up' | 'down' | 'left' | 'right' | 'action' | 'sprint' | 'special' | 'pause' | 'talk' | 'rotate' | 'spin' | 'emote';

export const ACTIONS: Action[] = ['up', 'down', 'left', 'right', 'action', 'sprint', 'special', 'rotate', 'spin', 'talk', 'emote', 'pause'];

export const ACTION_LABELS: Record<Action, string> = {
  up: 'ARRIBA',
  down: 'ABAJO',
  left: 'IZQUIERDA',
  right: 'DERECHA',
  action: 'GOLPE / DASH',
  sprint: 'SPRINT',
  special: 'HABILIDAD',
  pause: 'PAUSA',
  talk: 'FRASES (RUEDA)',
  rotate: 'GIRAR (ESCONDITE)',
  spin: 'RULETA',
  emote: 'EMOTE',
};

export const DEFAULT_BINDINGS: Record<Action, string> = {
  up: 'KeyW',
  down: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  action: 'Space',
  sprint: 'ShiftLeft',
  special: 'KeyE',
  pause: 'Escape',
  talk: 'KeyT',
  rotate: 'KeyR',
  spin: 'KeyQ',
  emote: 'KeyG',
};

/** Teclas alternativas fijas (siempre activas además de la asignación). */
export const ALT_BINDINGS: Partial<Record<Action, string[]>> = {
  up: ['ArrowUp'],
  down: ['ArrowDown'],
  left: ['ArrowLeft'],
  right: ['ArrowRight'],
  sprint: ['ShiftRight'],
};

export interface Settings {
  musicVolume: number;
  sfxVolume: number;
  difficulty: Difficulty;
  fullscreen: boolean;
  /** Voces sintetizadas de las frases. */
  voices: boolean;
  /** Menos temblores de pantalla y destellos. */
  reduceFx: boolean;
  /** Parones por partida contra bots. */
  paron: ParonLevel;
  /** Calidad gráfica: auto (baja sola si va lento), alta o baja. */
  quality: 'auto' | 'alta' | 'baja';
  /** Vibración del mando. */
  rumble: boolean;
  duration: number;
  chasers: number;
  escapists: number;
  bindings: Record<Action, string>;
}

const STORAGE_KEY = 'jamonrun.settings.v1';

function defaults(): Settings {
  return {
    musicVolume: 0.5,
    sfxVolume: 0.7,
    difficulty: 'normal',
    fullscreen: false,
    voices: true,
    reduceFx: false,
    paron: 'normal',
    quality: 'auto',
    rumble: true,
    duration: BALANCE.match.defaultDuration,
    chasers: BALANCE.match.defaultChasers,
    escapists: BALANCE.match.defaultEscapists,
    bindings: { ...DEFAULT_BINDINGS },
  };
}

function clamp(v: unknown, min: number, max: number, def: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def;
}

function load(): Settings {
  const d = defaults();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return d;
    const s = JSON.parse(raw) as Partial<Settings>;
    const m = BALANCE.match;
    return {
      musicVolume: clamp(s.musicVolume, 0, 1, d.musicVolume),
      sfxVolume: clamp(s.sfxVolume, 0, 1, d.sfxVolume),
      difficulty: s.difficulty && s.difficulty in BALANCE.ai ? s.difficulty : d.difficulty,
      fullscreen: !!s.fullscreen,
      voices: s.voices === undefined ? true : !!s.voices,
      reduceFx: !!s.reduceFx,
      paron: s.paron && s.paron in PARON.levels ? s.paron : d.paron,
      quality: s.quality === 'alta' || s.quality === 'baja' ? s.quality : 'auto',
      rumble: s.rumble === undefined ? true : !!s.rumble,
      duration: (m.durationOptions as readonly number[]).includes(s.duration as number) ? (s.duration as number) : d.duration,
      chasers: Math.round(clamp(s.chasers, m.minChasers, m.maxChasers, d.chasers)),
      escapists: Math.round(clamp(s.escapists, m.minEscapists, m.maxEscapists, d.escapists)),
      bindings: { ...d.bindings, ...(s.bindings ?? {}) },
    };
  } catch {
    return d;
  }
}

export const settings: Settings = load();

export function saveSettings(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* almacenamiento no disponible: se ignora */
  }
}

export function resetBindings(): void {
  settings.bindings = { ...DEFAULT_BINDINGS };
  saveSettings();
}

const KEY_NAMES: Record<string, string> = {
  Space: 'ESPACIO',
  ShiftLeft: 'SHIFT IZQ',
  ShiftRight: 'SHIFT DER',
  ControlLeft: 'CTRL IZQ',
  ControlRight: 'CTRL DER',
  AltLeft: 'ALT IZQ',
  AltRight: 'ALT DER',
  MetaLeft: 'CMD IZQ',
  MetaRight: 'CMD DER',
  Escape: 'ESC',
  Enter: 'ENTER',
  Tab: 'TAB',
  Backspace: 'BORRAR',
  ArrowUp: 'FLECHA ARRIBA',
  ArrowDown: 'FLECHA ABAJO',
  ArrowLeft: 'FLECHA IZQ',
  ArrowRight: 'FLECHA DER',
  CapsLock: 'BLOQ MAYUS',
};

export function keyName(code: string): string {
  if (KEY_NAMES[code]) return KEY_NAMES[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'NUM ' + code.slice(6).toUpperCase();
  return code.toUpperCase();
}
