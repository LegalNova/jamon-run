import Phaser from 'phaser';
import { EXTRAS, GLASSES, HAIR_COLORS, HATS, HAIR_STYLES, Look, LOOK_COLORS, lookKey, SKIN_TONES } from '../../shared/look';
import type { Team } from '../../shared/sim/types';
import { PAL } from './palette';
import { gridTexture, PixelGrid, rng, stripTexture } from './pixel';

export type { Team };
export type Dir = 'down' | 'up' | 'side';

/** Tamaño de cada frame de personaje: 16x20 (4 filas libres arriba para sombreros y peinados). */
export const CHAR_W = 16;
export const CHAR_H = 20;
const OY = 4;

type Legs = 'stand' | 'L' | 'R' | 'mid';
type Face = 'normal' | 'hurt';

interface Pose {
  legs: Legs;
  bob: number;
  headDy: number;
  handL: number;
  handR: number;
  face: Face;
  lean: number;
}

/** Colores del uniforme de cada equipo (o ropa propia si no hay equipo). */
const UNIFORM = {
  // Equipo ROJO (los que huyen): chándal rojo, gorra GUCHI, cadena dorada, riñonera y zapatillas blancas.
  escapist: { shirt: '#d8222c', shirtDark: '#9c1820', shirtLight: '#ff6a5a', pants: '#c01c26', pantsDark: '#8a141c', shoe: '#f4f4f4' },
  // Equipo AZUL (los que pillan): uniforme azul.
  chaser: { shirt: '#2a6be0', shirtDark: '#1a429a', shirtLight: '#7cc8ff', pants: '#1d2f6b', pantsDark: '#141f4a', shoe: '#1f1a2b' },
};

const GOLD = '#ffd23f';
const GOLD_DARK = '#c79a1c';

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, v + amt));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

const HEAD_ROWS: [number, number, number][] = [
  [1, 5, 10],
  [2, 4, 11],
  [3, 3, 12],
  [4, 3, 12],
  [5, 3, 12],
  [6, 3, 12],
  [7, 3, 12],
  [8, 3, 12],
  [9, 4, 11],
];

class Painter {
  constructor(private g: PixelGrid, private lx: number, private dy: number) {}
  /** Pixel en coordenadas de cabeza (se mueve con la cabeza). */
  h(x: number, y: number, c: string | null): void {
    this.g.set(x + this.lx, y + this.dy + OY, c);
  }
  hr(x: number, y: number, w: number, hh: number, c: string): void {
    for (let j = 0; j < hh; j++) for (let i = 0; i < w; i++) this.h(x + i, y + j, c);
  }
  /** Pixel en coordenadas de cuerpo. */
  b(x: number, y: number, c: string | null): void {
    this.g.set(x + this.lx, y + OY, c);
  }
  inHead(x: number, y: number): boolean {
    const r = HEAD_ROWS.find((row) => row[0] === y);
    return !!r && x >= r[1] && x <= r[2];
  }
}

interface Colors {
  skin: string;
  skinShade: string;
  hair: string;
  hairDark: string;
  own: string;
  ownDark: string;
  shirt: string;
  shirtDark: string;
  shirtLight: string;
  pants: string;
  pantsDark: string;
  shoe: string;
}

function colorsFor(team: Team | null, look: Look): Colors {
  const skin = SKIN_TONES[look.skin] ?? SKIN_TONES[0];
  const hair = HAIR_COLORS[look.hairColor]?.hex ?? '#3b2a22';
  const own = LOOK_COLORS[look.color]?.hex ?? '#f77622';
  const u = team
    ? UNIFORM[team]
    : { shirt: own, shirtDark: shade(own, -50), shirtLight: shade(own, 50), pants: PAL.pants, pantsDark: PAL.pantsDark, shoe: PAL.shoe };
  return { skin: skin.skin, skinShade: skin.shade, hair, hairDark: shade(hair, -35), own, ownDark: shade(own, -50), ...u };
}

// ------------------------------------------------------------------ cabeza

function drawHair(p: Painter, style: number, dir: Dir, C: Colors, hatOn: boolean): void {
  const H = C.hair;
  const Hd = C.hairDark;
  const topRows = (rows: number) => {
    for (const [y, x0, x1] of HEAD_ROWS.slice(0, rows)) for (let x = x0; x <= x1; x++) p.h(x, y, H);
  };
  const name = HAIR_STYLES[style];
  if (name === 'CALVO') {
    if (dir !== 'side') p.h(6, 2, shade(C.skin, 40));
    else p.h(8, 2, shade(C.skin, 40));
    return;
  }
  if (dir === 'up') {
    if (name === 'RAPADO') {
      for (const [y, x0, x1] of HEAD_ROWS.slice(0, 8)) for (let x = x0; x <= x1; x++) if ((x + y) % 2 === 0 || y < 3) p.h(x, y, H);
    } else if (name === 'CRESTA') {
      for (let y = -2; y <= 8; y++) {
        p.h(7, y, H);
        p.h(8, y, y < 0 ? Hd : H);
      }
    } else {
      for (const [y, x0, x1] of HEAD_ROWS.slice(0, 8)) for (let x = x0; x <= x1; x++) p.h(x, y, H);
      p.h(3, 6, C.skin);
      p.h(12, 6, C.skin);
      p.h(6, 2, shade(H, 30));
    }
    if (name === 'AFRO') {
      for (let y = -2; y <= 6; y++) for (let x = 1; x <= 14; x++) if (((x - 7.5) / 7) ** 2 + ((y - 2) / 4.6) ** 2 <= 1) p.h(x, y, (x + y) % 4 === 0 ? Hd : H);
    } else if (name === 'MELENA') {
      for (let y = 6; y <= 11; y++) for (let x = 3; x <= 12; x++) p.h(x, y, y === 11 ? Hd : H);
    } else if (name === 'COLETA') {
      for (let y = 8; y <= 11; y++) p.h(7, y, H), p.h(8, y, Hd);
    } else if (name === 'MOÑO' && !hatOn) {
      p.hr(6, -2, 4, 3, H);
      p.h(7, -2, shade(H, 30));
    } else if (name === 'TUPÉ' && !hatOn) {
      p.hr(5, 0, 6, 1, H);
    }
    return;
  }
  if (dir === 'side') {
    // mirando a la derecha
    const back = () => {
      for (let y = 3; y <= 7; y++) for (let x = 3; x <= 6; x++) p.h(x, y, H);
      p.h(3, 8, H);
    };
    if (name === 'RAPADO') {
      topRows(2);
      p.h(4, 3, Hd);
      p.h(3, 4, Hd);
    } else if (name === 'CRESTA') {
      for (let y = -2; y <= 2; y++) for (let x = 5; x <= 9; x++) if (y >= 0 || (x >= 6 && x <= 8)) p.h(x, y, y < 1 ? Hd : H);
    } else if (name === 'AFRO') {
      for (let y = -2; y <= 7; y++) for (let x = 1; x <= 12; x++) {
        if (((x - 6) / 6) ** 2 + ((y - 2.5) / 4.8) ** 2 > 1) continue;
        if (x >= 9 && y >= 4) continue;
        p.h(x, y, (x + y) % 4 === 0 ? Hd : H);
      }
    } else {
      topRows(2);
      back();
      for (let x = 7; x <= 11; x++) p.h(x, 3, H);
      if (name === 'FLEQUILLO') {
        p.h(11, 4, H);
        p.h(10, 4, H);
      }
      if (name === 'MELENA') for (let y = 8; y <= 11; y++) for (let x = 3; x <= 6; x++) p.h(x, y, y === 11 ? Hd : H);
      if (name === 'COLETA') {
        p.h(2, 3, H);
        for (let y = 4; y <= 8; y++) p.h(1, y, H), p.h(2, y, Hd);
      }
      if (name === 'MOÑO' && !hatOn) p.hr(3, -1, 3, 2, H);
      if (name === 'TUPÉ' && !hatOn) {
        p.hr(7, 0, 6, 1, H);
        p.h(12, 1, H);
        p.h(13, 1, Hd);
      }
    }
    return;
  }
  // de frente
  if (name === 'RAPADO') {
    topRows(1);
    for (let x = 4; x <= 11; x++) if (x % 2 === 0) p.h(x, 2, H);
    return;
  }
  if (name === 'CRESTA') {
    for (let y = -2; y <= 2; y++) {
      p.h(7, y, H);
      p.h(8, y, y < 0 ? Hd : H);
    }
    return;
  }
  if (name === 'AFRO') {
    for (let y = -2; y <= 5; y++) for (let x = 1; x <= 14; x++) {
      if (((x - 7.5) / 7) ** 2 + ((y - 2) / 4.4) ** 2 > 1) continue;
      if (y >= 3 && x >= 4 && x <= 11) continue;
      p.h(x, y, (x * 3 + y) % 5 === 0 ? Hd : H);
    }
    return;
  }
  topRows(2);
  p.h(3, 3, H);
  p.h(12, 3, H);
  p.h(3, 4, H);
  p.h(12, 4, H);
  if (name === 'CORTO') {
    p.h(5, 3, H);
    p.h(6, 3, H);
    p.h(6, 4, H);
    p.h(9, 3, H);
  } else if (name === 'FLEQUILLO') {
    for (let x = 4; x <= 9; x++) p.h(x, 3, H);
    p.h(4, 4, H);
    p.h(5, 4, H);
    p.h(6, 4, Hd);
  } else if (name === 'MELENA') {
    for (let x = 4; x <= 11; x++) p.h(x, 3, x === 7 || x === 8 ? C.skin : H);
    for (let y = 4; y <= 11; y++) {
      p.h(3, y, H);
      p.h(12, y, H);
      if (y >= 5) {
        p.h(2, y, Hd);
        p.h(13, y, Hd);
      }
    }
  } else if (name === 'COLETA') {
    p.h(5, 3, H);
    p.h(10, 3, H);
    for (let y = 3; y <= 7; y++) p.h(13, y, y === 3 ? H : Hd);
  } else if (name === 'MOÑO') {
    p.h(5, 3, H);
    p.h(10, 3, H);
    if (!hatOn) {
      p.hr(6, -2, 4, 3, H);
      p.h(7, -2, shade(H, 30));
    }
  } else if (name === 'TUPÉ') {
    p.h(5, 3, H);
    p.h(6, 3, H);
    if (!hatOn) {
      p.hr(4, 0, 7, 1, H);
      p.hr(5, -1, 5, 1, H);
      p.h(9, -1, shade(H, 30));
    }
  }
}

function drawFace(p: Painter, team: Team | null, dir: Dir, pose: Pose, C: Colors): void {
  const ink = PAL.ink;
  if (dir === 'up') return;
  if (dir === 'side') {
    p.h(7, 5, C.skinShade);
    p.h(7, 6, C.skinShade);
    if (pose.face === 'hurt') {
      p.h(10, 6, ink);
      p.h(11, 6, ink);
      p.h(11, 8, ink);
    } else if (team === 'chaser') {
      p.h(10, 5, ink);
      p.h(11, 5, ink);
      p.h(11, 6, ink);
      p.h(10, 6, PAL.white);
      p.h(10, 8, ink);
      p.h(11, 8, ink);
    } else {
      p.h(10, 5, ink);
      p.h(10, 6, ink);
      p.h(11, 8, ink);
    }
    return;
  }
  if (pose.face === 'hurt') {
    [[5, 6], [6, 6], [9, 6], [10, 6], [5, 5], [10, 5], [7, 8], [8, 8], [7, 7], [8, 7]].forEach(([x, y]) => p.h(x, y, ink));
  } else if (team === 'chaser') {
    p.h(5, 5, ink);
    p.h(10, 5, ink);
    p.h(6, 6, ink);
    p.h(5, 6, PAL.white);
    p.h(9, 6, ink);
    p.h(10, 6, PAL.white);
    for (let x = 6; x <= 9; x++) p.h(x, 8, ink);
    p.h(7, 8, PAL.white);
  } else if (team === 'escapist') {
    // cara de susto
    p.h(5, 5, ink);
    p.h(5, 6, ink);
    p.h(10, 5, ink);
    p.h(10, 6, ink);
    p.h(7, 8, ink);
    p.h(8, 8, ink);
    p.h(7, 9, C.skinShade);
  } else {
    // sonrisa
    p.h(5, 5, ink);
    p.h(5, 6, ink);
    p.h(10, 5, ink);
    p.h(10, 6, ink);
    p.h(6, 8, ink);
    p.h(7, 9, ink);
    p.h(8, 9, ink);
    p.h(9, 8, ink);
  }
}

function drawExtra(p: Painter, extra: number, dir: Dir, C: Colors): void {
  const name = EXTRAS[extra];
  if (dir === 'up') {
    if (name === 'BUFANDA') p.hr(4, 10, 8, 1, C.own);
    if (name === 'PENDIENTE') {
      p.h(3, 7, GOLD);
      p.h(12, 7, GOLD);
    }
    return;
  }
  const side = dir === 'side';
  switch (name) {
    case 'BIGOTE':
      if (side) {
        p.h(10, 7, C.hair);
        p.h(11, 7, C.hair);
      } else {
        for (let x = 5; x <= 10; x++) p.h(x, 7, C.hair);
        p.h(5, 8, C.hair);
        p.h(10, 8, C.hair);
      }
      break;
    case 'BARBA':
      if (side) {
        for (let x = 7; x <= 11; x++) p.h(x, 9, C.hair);
        p.h(8, 8, C.hair);
        p.h(9, 8, C.hair);
        p.h(11, 10, C.hairDark);
      } else {
        for (let x = 4; x <= 11; x++) p.h(x, 9, C.hair);
        p.h(4, 8, C.hair);
        p.h(5, 8, C.hair);
        p.h(10, 8, C.hair);
        p.h(11, 8, C.hair);
        p.h(6, 7, C.hair);
        p.h(9, 7, C.hair);
        for (let x = 6; x <= 9; x++) p.h(x, 10, C.hairDark);
      }
      break;
    case 'PECAS':
      if (side) {
        p.h(9, 7, '#b5653d');
        p.h(11, 7, '#b5653d');
      } else [[4, 7], [6, 7], [9, 7], [11, 7]].forEach(([x, y]) => p.h(x, y, '#b5653d'));
      break;
    case 'TIRITA':
      if (side) {
        p.h(9, 7, '#f2cf9c');
        p.h(10, 7, '#f2cf9c');
      } else {
        p.h(9, 7, '#f2cf9c');
        p.h(10, 7, PAL.white);
        p.h(11, 7, '#f2cf9c');
      }
      break;
    case 'PENDIENTE':
      if (side) p.h(7, 8, GOLD);
      else {
        p.h(3, 8, GOLD);
        p.h(12, 8, GOLD);
      }
      break;
    case 'BUFANDA':
      p.hr(4, 10, 8, 1, C.own);
      if (side) {
        p.h(4, 11, C.ownDark);
        p.h(3, 11, C.own);
      } else {
        p.h(10, 11, C.own);
        p.h(10, 12, C.ownDark);
      }
      break;
    case 'PAJARITA':
      if (side) {
        p.h(10, 10, '#e43b44');
      } else {
        p.h(6, 10, '#e43b44');
        p.h(9, 10, '#e43b44');
        p.h(7, 10, '#a22633');
        p.h(8, 10, '#a22633');
      }
      break;
    case 'COLORETE':
      if (side) p.h(11, 7, PAL.pink);
      else {
        p.h(4, 7, PAL.pink);
        p.h(11, 7, PAL.pink);
      }
      break;
    case 'CICATRIZ':
      if (side) {
        p.h(9, 4, '#9c3a3a');
        p.h(10, 5, '#9c3a3a');
      } else {
        p.h(9, 3, '#9c3a3a');
        p.h(10, 4, '#9c3a3a');
        p.h(11, 5, '#9c3a3a');
      }
      break;
  }
}

function drawGlasses(p: Painter, glasses: number, dir: Dir): void {
  const name = GLASSES[glasses];
  if (dir === 'up' || name === 'NINGUNA') return;
  const ink = PAL.ink;
  if (dir === 'side') {
    switch (name) {
      case 'PARCHE PIRATA':
        p.h(10, 5, ink);
        p.h(10, 6, ink);
        p.h(9, 4, ink);
        for (let x = 4; x <= 8; x++) p.h(x, 4, ink);
        break;
      case 'VISOR':
        for (let x = 8; x <= 12; x++) p.h(x, 5, '#4ff0ff');
        break;
      case 'MONÓCULO':
        p.h(11, 5, GOLD);
        p.h(11, 7, GOLD_DARK);
        break;
      default: {
        const lens = name === 'DE SOL' ? ink : name === '3D' ? '#4fd8ff' : name === 'CORAZONES' ? '#ff5a9a' : null;
        for (let x = 7; x <= 9; x++) p.h(x, 5, ink);
        p.h(11, 5, ink);
        p.h(11, 6, ink);
        if (lens) p.h(10, 5, lens);
      }
    }
    return;
  }
  switch (name) {
    case 'REDONDAS':
      [[4, 5], [4, 6], [6, 5], [6, 6], [5, 4], [5, 7], [9, 5], [9, 6], [11, 5], [11, 6], [10, 4], [10, 7], [7, 5], [8, 5]].forEach(([x, y]) =>
        p.h(x, y, ink),
      );
      break;
    case 'DE SOL':
      p.hr(4, 5, 3, 2, ink);
      p.hr(9, 5, 3, 2, ink);
      p.h(7, 5, ink);
      p.h(8, 5, ink);
      p.h(4, 5, PAL.white);
      p.h(9, 5, PAL.white);
      break;
    case '3D':
      p.hr(4, 5, 3, 2, '#ff4a4a');
      p.hr(9, 5, 3, 2, '#4fd8ff');
      p.hr(3, 4, 10, 1, PAL.white);
      p.h(7, 5, PAL.white);
      p.h(8, 5, PAL.white);
      break;
    case 'MONÓCULO':
      [[9, 4], [11, 4], [9, 7], [11, 7], [12, 5], [12, 6]].forEach(([x, y]) => p.h(x, y, GOLD));
      p.h(12, 8, GOLD_DARK);
      p.h(12, 9, GOLD_DARK);
      break;
    case 'CORAZONES':
      [[4, 5], [6, 5], [4, 6], [5, 6], [6, 6], [5, 7], [9, 5], [11, 5], [9, 6], [10, 6], [11, 6], [10, 7]].forEach(([x, y]) => p.h(x, y, '#ff5a9a'));
      p.h(7, 5, ink);
      p.h(8, 5, ink);
      break;
    case 'VISOR':
      p.hr(3, 5, 10, 2, '#4ff0ff');
      p.hr(4, 5, 3, 1, PAL.white);
      break;
    case 'PARCHE PIRATA':
      p.hr(9, 4, 3, 3, ink);
      for (let x = 3; x <= 8; x++) p.h(x, 3 + (x > 5 ? 1 : 0), ink);
      break;
    case 'DE PASTA':
      [[4, 4], [5, 4], [6, 4], [4, 7], [5, 7], [6, 7], [4, 5], [4, 6], [6, 5], [6, 6], [9, 4], [10, 4], [11, 4], [9, 7], [10, 7], [11, 7], [9, 5], [9, 6], [11, 5], [11, 6], [7, 5], [8, 5]].forEach(
        ([x, y]) => p.h(x, y, ink),
      );
      break;
  }
}

function drawHat(p: Painter, hat: number, dir: Dir, C: Colors, guchi: boolean): void {
  if (guchi) {
    // Gorra roja con el logo de parodia "GUCHI" (dorado). Nada que ver con ninguna marca real.
    const R = '#d8222c';
    const Rd = '#9c1820';
    for (let y = -1; y <= 2; y++) for (let x = 4 - (y > 0 ? 1 : 0); x <= 11 + (y > 0 ? 1 : 0); x++) p.h(x, y, R);
    p.h(5, -1, shade(R, 40));
    if (dir === 'down') {
      p.hr(2, 3, 12, 1, Rd);
      p.h(7, 0, GOLD);
      p.h(8, 0, GOLD);
      p.h(7, 1, GOLD);
      p.h(8, 1, GOLD_DARK);
    } else if (dir === 'side') {
      for (let x = 9; x <= 14; x++) p.h(x, 3, Rd);
      p.h(9, 1, GOLD);
      p.h(9, 0, GOLD);
    } else {
      p.hr(6, 3, 4, 1, Rd);
      p.h(7, 2, PAL.white);
    }
    return;
  }
  const name = HATS[hat];
  const own = C.own;
  switch (name) {
    case 'GORRA':
      for (let y = -1; y <= 2; y++) for (let x = 4 - (y > 0 ? 1 : 0); x <= 11 + (y > 0 ? 1 : 0); x++) p.h(x, y, own);
      if (dir === 'down') p.hr(2, 3, 12, 1, C.ownDark);
      else if (dir === 'side') for (let x = 9; x <= 14; x++) p.h(x, 3, C.ownDark);
      else p.hr(6, 3, 4, 1, C.ownDark);
      p.h(7, -1, PAL.white);
      break;
    case 'GORRO DE LANA':
      for (let y = -1; y <= 3; y++) for (let x = 3; x <= 12; x++) if (y > -1 || (x > 3 && x < 12)) p.h(x, y, y === 3 ? C.ownDark : own);
      for (let x = 4; x <= 11; x += 2) p.h(x, 2, C.ownDark);
      p.hr(7, -3, 2, 2, PAL.white);
      break;
    case 'VAQUERO':
      p.hr(5, -2, 6, 3, '#8a5a3a');
      p.h(7, -2, '#6b4229');
      p.h(8, -2, '#6b4229');
      p.hr(5, 0, 6, 1, '#3b2a22');
      if (dir === 'side') p.hr(2, 1, 13, 1, '#a06a44');
      else p.hr(0, 1, 16, 1, '#a06a44');
      break;
    case 'CORONA':
      p.hr(4, 0, 8, 2, GOLD);
      [4, 7, 8, 11].forEach((x) => p.h(x, -1, GOLD));
      p.h(4, -2, GOLD);
      p.h(11, -2, GOLD);
      p.h(6, 1, '#e43b44');
      p.h(9, 1, '#3d8ff2');
      p.h(5, 0, GOLD_DARK);
      break;
    case 'CHISTERA':
      p.hr(5, -4, 6, 5, '#1f1a24');
      p.hr(5, -1, 6, 1, '#e43b44');
      p.h(6, -4, '#3a3446');
      if (dir === 'side') p.hr(3, 1, 11, 1, '#1f1a24');
      else p.hr(3, 1, 10, 1, '#1f1a24');
      break;
    case 'CASCO VIKINGO':
      for (let y = -1; y <= 2; y++) for (let x = 3; x <= 12; x++) if (y > -1 || (x > 4 && x < 11)) p.h(x, y, '#9aa7bf');
      p.hr(3, 2, 10, 1, '#6f7f9e');
      p.h(7, 0, '#c2c3c7');
      if (dir !== 'side') {
        [[1, -3], [1, -2], [2, -1], [2, 0], [14, -3], [14, -2], [13, -1], [13, 0]].forEach(([x, y]) => p.h(x, y, PAL.offWhite));
      } else {
        [[5, -3], [5, -2], [6, -1]].forEach(([x, y]) => p.h(x, y, PAL.offWhite));
      }
      break;
    case 'BOINA':
      for (let x = 3; x <= 12; x++) p.h(x, 1, own);
      for (let x = 4; x <= 13; x++) p.h(x, 0, own);
      p.hr(6, -1, 6, 1, own);
      p.h(9, -2, C.ownDark);
      p.hr(3, 2, 10, 1, C.ownDark);
      break;
    case 'FLOR':
      if (dir === 'up') break;
      {
        const fx = dir === 'side' ? 6 : 10;
        [[fx, 0], [fx + 2, 0], [fx, 2], [fx + 2, 2], [fx + 1, -1], [fx + 1, 3]].forEach(([x, y]) => p.h(x, y, '#ff7ab8'));
        p.h(fx + 1, 1, GOLD);
      }
      break;
    case 'GORRO DE FIESTA':
      for (let y = -4; y <= 1; y++) {
        const half = Math.floor((y + 5) / 2);
        for (let x = 8 - half; x <= 7 + half; x++) p.h(x, y, (y + x) % 3 === 0 ? GOLD : own);
      }
      p.h(7, -5, PAL.white);
      p.h(8, -5, PAL.white);
      break;
  }
}

function drawHead(p: Painter, team: Team | null, look: Look, dir: Dir, pose: Pose, C: Colors): void {
  for (const [y, x0, x1] of HEAD_ROWS) for (let x = x0; x <= x1; x++) p.h(x, y, C.skin);
  for (let x = 5; x <= 10; x++) p.h(x, 9, C.skinShade);
  const guchi = team === 'escapist';
  const hatOn = guchi || look.hat !== 0;
  drawHair(p, look.hair, dir, C, hatOn);
  drawFace(p, team, dir, pose, C);
  drawExtra(p, look.extra, dir, C);
  drawGlasses(p, look.glasses, dir);
  drawHat(p, look.hat, dir, C, guchi);
}

// ------------------------------------------------------------------ cuerpo

function drawBody(p: Painter, team: Team | null, dir: Dir, pose: Pose, C: Colors): void {
  const red = team === 'escapist';
  const blue = team === 'chaser';
  const leg = (x: number, c: string) => {
    p.b(x, 13, c);
    p.b(x + 1, 13, c);
    p.b(x, 14, C.shoe);
    p.b(x + 1, 14, C.shoe);
  };
  if (dir === 'side') {
    for (let y = 10; y <= 11; y++) for (let x = 5; x <= 10; x++) p.b(x, y, C.shirt);
    for (let x = 5; x <= 10; x++) p.b(x, 12, C.shirtDark);
    p.b(9, 10, C.shirtLight);
    if (red) {
      p.b(6, 10, PAL.white);
      p.b(6, 11, PAL.white);
      p.b(10, 10, GOLD); // cadena
      p.b(9, 12, C.own); // riñonera
      p.b(10, 12, C.own);
    }
    if (blue) p.b(5, 12, PAL.white);
    // brazo
    p.b(7 + pose.handR, 11, blue ? C.own : C.shirtDark);
    p.b(8 + pose.handR, 12, C.skin);
    if (pose.legs === 'stand' || pose.legs === 'mid') {
      leg(6, C.pantsDark);
      leg(8, C.pants);
    } else if (pose.legs === 'L') {
      leg(4, C.pantsDark);
      leg(9, C.pants);
    } else {
      leg(4, C.pants);
      leg(9, C.pantsDark);
    }
    if (red) p.b(9, 13, PAL.white);
    return;
  }
  for (let y = 10; y <= 11; y++) for (let x = 4; x <= 11; x++) p.b(x, y, C.shirt);
  for (let x = 5; x <= 10; x++) p.b(x, 12, C.shirtDark);
  if (dir === 'down') {
    p.b(6, 10, C.shirtLight);
    if (red) {
      // cadena dorada, cremallera y rayas blancas del chándal
      p.b(6, 10, GOLD);
      p.b(7, 11, GOLD);
      p.b(8, 11, GOLD);
      p.b(9, 10, GOLD);
      p.b(4, 10, PAL.white);
      p.b(11, 10, PAL.white);
      // riñonera
      for (let x = 5; x <= 10; x++) p.b(x, 12, C.own);
      p.b(7, 12, GOLD);
      p.b(8, 12, C.ownDark);
    } else if (blue) {
      p.b(7, 10, C.shirtLight);
      p.b(8, 10, C.shirtLight);
      p.b(7, 11, PAL.white);
      for (let x = 5; x <= 10; x++) p.b(x, 12, PAL.offWhite);
      p.b(7, 12, GOLD);
    } else {
      p.b(7, 11, C.shirtLight);
    }
  } else if (red) {
    p.b(4, 10, PAL.white);
    p.b(11, 10, PAL.white);
    p.b(7, 10, GOLD);
    p.b(8, 10, GOLD);
  }
  // manos (el brazalete del uniforme azul lleva tu color)
  p.b(3, 11 + pose.handL, C.skin);
  p.b(12, 11 + pose.handR, C.skin);
  p.b(3, 10 + pose.handL, blue ? C.own : C.shirtDark);
  p.b(12, 10 + pose.handR, blue ? C.own : C.shirtDark);
  const legL = pose.legs !== 'R';
  const legR = pose.legs !== 'L';
  [5, 6, 9, 10].forEach((x) => p.b(x, 13, C.pants));
  if (red) {
    p.b(5, 13, PAL.white);
    p.b(10, 13, PAL.white);
  }
  const foot = (x: number, down: boolean) => {
    p.b(x, down ? 14 : 13, C.shoe);
    p.b(x + 1, down ? 14 : 13, C.shoe);
  };
  foot(5, legL);
  foot(9, legR);
}

function frame(team: Team | null, look: Look, dir: Dir, pose: Pose): PixelGrid {
  const g = new PixelGrid(CHAR_W, CHAR_H);
  const C = colorsFor(team, look);
  drawBody(new Painter(g, pose.lean, 0), team, dir, pose, C);
  drawHead(new Painter(g, pose.lean, pose.headDy), team, look, dir, pose, C);
  const out = pose.bob ? g.shifted(0, pose.bob) : g;
  out.outline(PAL.outline);
  return out;
}

const base: Pose = { legs: 'stand', bob: 0, headDy: 0, handL: 0, handR: 0, face: 'normal', lean: 0 };

const POSES: Record<string, Partial<Pose>> = {
  idle0: {},
  idle1: { headDy: 1 },
  run0: { legs: 'L', handL: 1, handR: -1 },
  run1: { legs: 'mid', bob: -1 },
  run2: { legs: 'R', handL: -1, handR: 1 },
  run3: { legs: 'mid', bob: -1 },
  atk: { handL: -2, handR: -2 },
  hurt: { face: 'hurt', headDy: 1, handL: -2, handR: -2 },
};

export const CHAR_FRAMES = Object.keys(POSES);

/**
 * Devuelve (y crea si hace falta) la textura animada de un personaje.
 * team = null para la vista previa sin uniforme.
 */
export function ensureCharTexture(scene: Phaser.Scene, team: Team | null, look: Look): string {
  const key = `chr_${team ?? 'none'}_${lookKey(look)}`;
  if (scene.textures.exists(key)) return key;
  const frames: { name: string; grid: PixelGrid }[] = [];
  for (const dir of ['down', 'up', 'side'] as Dir[]) {
    for (const name of CHAR_FRAMES) {
      const p = { ...base, ...POSES[name] };
      if (dir === 'side' && name === 'atk') p.handR = 3;
      if (dir === 'side' && name === 'hurt') p.lean = -1;
      frames.push({ name: `${dir}_${name}`, grid: frame(team, look, name === 'hurt' && dir === 'up' ? 'down' : dir, p) });
    }
  }
  stripTexture(scene, key, frames);
  const anims = scene.anims;
  for (const dir of ['down', 'up', 'side']) {
    const mk = (suffix: string, names: string[], rate: number, repeat: number) => {
      const k = `${key}_${dir}_${suffix}`;
      if (anims.exists(k)) return;
      anims.create({ key: k, frames: names.map((n) => ({ key, frame: `${dir}_${n}` })), frameRate: rate, repeat });
    };
    mk('idle', ['idle0', 'idle1'], 2.5, -1);
    mk('run', ['run0', 'run1', 'run2', 'run3'], 10, -1);
    mk('atk', ['atk'], 1, 0);
    mk('hurt', ['hurt'], 1, 0);
  }
  return key;
}

export const VARIANTS = 6;

/** Aspectos fijos para los personajes decorativos de los menús. */
function presetLook(team: Team, v: number): Look {
  const r = rng(v * 97 + (team === 'chaser' ? 13 : 71));
  const n = (k: number) => Math.floor(r() * k);
  return { name: '', color: n(LOOK_COLORS.length), skin: n(SKIN_TONES.length - 1), hair: n(HAIR_STYLES.length), hairColor: n(5), hat: r() < 0.5 ? 0 : n(HATS.length), glasses: r() < 0.6 ? 0 : n(GLASSES.length), extra: r() < 0.5 ? 0 : n(EXTRAS.length) };
}

/** Clave de textura de un personaje decorativo (menús, ruleta...). */
export function charKey(team: Team, variant: number): string {
  return `chr_${team}_${lookKey(presetLook(team, variant % VARIANTS))}`;
}

function buildPresets(scene: Phaser.Scene): void {
  for (let v = 0; v < VARIANTS; v++) {
    ensureCharTexture(scene, 'chaser', presetLook('chaser', v));
    ensureCharTexture(scene, 'escapist', presetLook('escapist', v));
  }
}

function buildGhost(scene: Phaser.Scene): void {
  const frames: { name: string; grid: PixelGrid }[] = [];
  for (let f = 0; f < 2; f++) {
    const g = new PixelGrid(16, 16);
    g.ellipse(8, 6.5, 5.5, 5.5, '#e8f0ff');
    g.rect(3, 6, 10, 6, '#e8f0ff');
    for (let x = 3; x <= 12; x++) {
      const wave = (x + f) % 3 === 0 ? 1 : 0;
      g.set(x, 12 + wave, '#e8f0ff');
    }
    g.rect(4, 9, 8, 2, '#c8d6f0');
    g.set(6, 6, PAL.ink);
    g.set(6, 7, PAL.ink);
    g.set(10, 6, PAL.ink);
    g.set(10, 7, PAL.ink);
    g.set(8, 9, PAL.ink);
    g.outline('#5a6988');
    frames.push({ name: `g${f}`, grid: g });
  }
  stripTexture(scene, 'ghost', frames);
  if (!scene.anims.exists('ghost_float')) {
    scene.anims.create({ key: 'ghost_float', frames: [{ key: 'ghost', frame: 'g0' }, { key: 'ghost', frame: 'g1' }], frameRate: 3, repeat: -1 });
  }
}

function buildHam(scene: Phaser.Scene): void {
  const g = new PixelGrid(15, 9);
  g.pattern(1, 1, [
    '......rrrr...',
    '....rrmmmmr..',
    'hbrrrmmffmmr.',
    'hbrrrmfmmMmr.',
    'hbRRrmmmmMMr.',
    '....RRmmmMr..',
    '......RRRR...',
  ], {
    h: PAL.hoof,
    b: PAL.hamBone,
    r: PAL.hamRind,
    R: PAL.hamRindDark,
    m: PAL.hamMeat,
    M: PAL.hamMeatDark,
    f: PAL.hamFat,
  });
  g.outline(PAL.outline);
  gridTexture(scene, 'ham', g);
}

function icon(scene: Phaser.Scene, key: string, rows: string[], map: Record<string, string>): void {
  const g = new PixelGrid(rows[0].length + 2, rows.length + 2);
  g.pattern(1, 1, rows, map);
  g.outline(PAL.outline);
  gridTexture(scene, key, g);
}

function buildItems(scene: Phaser.Scene): void {
  icon(scene, 'item_medkit', [
    '.wwwwwwwww.',
    'wwwwwrwwwww',
    'wwwwrrrwwww',
    'wwwwrrrwwww',
    'wrrrrrrrrrw',
    'wrrrrrrrrrw',
    'wwwwrrrwwww',
    'wwwwrrrwwww',
    'gwwwwrwwwwg',
    '.ggggggggg.',
  ], { w: PAL.offWhite, r: PAL.red, g: PAL.grey1 });
  icon(scene, 'item_boot', [
    '..ww.......',
    '.wwyyyy....',
    'wwwybyy....',
    '..wyyyy....',
    '...yyyy....',
    '...yyyyy...',
    '...yyyyyyy.',
    '..yyyyyyyyy',
    '..ddddddddd',
  ], { w: PAL.white, y: PAL.yellow, b: PAL.blue, d: '#b85c18' });
  icon(scene, 'item_shield', [
    '.ccccccccc.',
    'cclllllllcc',
    'clllwlllllc',
    'cllwllllllc',
    'clllllllllc',
    'clllllllllc',
    '.cllllllld.',
    '.ccllllldd.',
    '..cclllcd..',
    '....ccd....',
  ], { c: '#7cc8ff', l: '#3d8ff2', w: PAL.white, d: PAL.blueDark });
  // iconos del HUD (sin objeto)
  icon(scene, 'icon_dash', [
    '...ww...',
    '..www...',
    '.wwwwww.',
    'wwwwwwww',
    '.wwwwww.',
    '..www...',
    '...ww...',
  ], { w: PAL.blueLight });
  icon(scene, 'icon_smoke', [
    '..gg.gg.',
    '.ggggggg',
    'gggwgggg',
    'gggggggg',
    '.gggggg.',
    '..gggg..',
  ], { g: PAL.grey1, w: PAL.white });
  icon(scene, 'icon_heart', [
    '.rr.rr.',
    'rwrrrrr',
    'rrrrrrr',
    '.rrrrr.',
    '..rrr..',
    '...r...',
  ], { r: PAL.red, w: PAL.white });
  icon(scene, 'icon_bolt', [
    '...yy',
    '..yy.',
    '.yyyy',
    'yyyy.',
    '..yy.',
    '.yy..',
    '.y...',
  ], { y: PAL.yellowLight });
  icon(scene, 'icon_clock', [
    '.wwwww.',
    'wwwkwww',
    'wwwkwww',
    'wwwkkkw',
    'wwwwwww',
    '.wwwww.',
  ], { w: PAL.offWhite, k: PAL.ink });
  icon(scene, 'icon_people', [
    '.bb..bb.',
    'bbbbbbbb',
    '.bb..bb.',
    'bbbbbbbb',
    'bbbbbbbb',
  ], { b: PAL.blueLight });
  icon(scene, 'icon_skull', [
    '.wwwww.',
    'wwwwwww',
    'wkwwwkw',
    'wwwkwww',
    '.wwwww.',
    '.w.w.w.',
  ], { w: PAL.offWhite, k: PAL.ink });
}

function buildIndicators(scene: Phaser.Scene): void {
  icon(scene, 'ind_chaser', ['bbbbb', '.bbb.', '..b..'], { b: '#4f9dff' });
  icon(scene, 'ind_escapist', ['rrrrr', '.rrr.', '..r..'], { r: '#ff4a4a' });
  icon(scene, 'ind_player', [
    'yyyyyyy',
    'yllllly',
    '.yllly.',
    '..yly..',
    '...y...',
  ], { y: PAL.yellow, l: PAL.yellowLight });
  // sombra
  const s = new PixelGrid(12, 5);
  s.ellipse(6, 2.5, 6, 2.5, '#000000');
  gridTexture(scene, 'shadow', s);
}

function buildParticles(scene: Phaser.Scene): void {
  const p = new PixelGrid(2, 2);
  p.rect(0, 0, 2, 2, '#ffffff');
  gridTexture(scene, 'p_px', p);
  const p1 = new PixelGrid(1, 1);
  p1.set(0, 0, '#ffffff');
  gridTexture(scene, 'p_dot', p1);
  const d = new PixelGrid(5, 5);
  d.pattern(0, 0, ['.###.', '#####', '#####', '#####', '.###.'], { '#': '#ffffff' });
  gridTexture(scene, 'p_dust', d);
  const sp = new PixelGrid(7, 7);
  sp.pattern(0, 0, ['...#...', '...#...', '..###..', '#######', '..###..', '...#...', '...#...'], { '#': '#ffffff' });
  gridTexture(scene, 'p_star', sp);
  const sm = new PixelGrid(10, 10);
  sm.ellipse(5, 5, 5, 5, '#ffffff');
  gridTexture(scene, 'p_smoke', sm);
  const lf = new PixelGrid(3, 2);
  lf.pattern(0, 0, ['##.', '.##'], { '#': '#ffffff' });
  gridTexture(scene, 'p_leaf', lf);
  const ring = new PixelGrid(16, 16);
  for (let a = 0; a < 64; a++) {
    const ang = (a / 64) * Math.PI * 2;
    ring.set(Math.round(7.5 + Math.cos(ang) * 7), Math.round(7.5 + Math.sin(ang) * 7), '#ffffff');
  }
  gridTexture(scene, 'p_ring', ring);
  // arco del golpe (media luna blanca)
  const arc = new PixelGrid(24, 24);
  for (let r = 9; r <= 11; r++) {
    for (let a = -60; a <= 60; a += 2) {
      const ang = (a * Math.PI) / 180;
      arc.set(Math.round(4 + Math.cos(ang) * r), Math.round(12 + Math.sin(ang) * r), r === 11 ? '#ffffff' : '#fff3c4');
    }
  }
  gridTexture(scene, 'fx_arc', arc);
}

export function buildCharacterTextures(scene: Phaser.Scene): void {
  buildPresets(scene);
  buildGhost(scene);
  buildHam(scene);
  buildItems(scene);
  buildIndicators(scene);
  buildParticles(scene);
}
