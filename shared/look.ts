/**
 * Personalización del personaje ("Mi personaje").
 * Solo datos: el dibujo está en el cliente (src/gfx/characters.ts).
 * El servidor usa sanitizeLook() para no fiarse de lo que envía el cliente.
 */

export interface Look {
  name: string;
  color: number;
  skin: number;
  hair: number;
  hairColor: number;
  hat: number;
  glasses: number;
  extra: number;
}

export const LOOK_COLORS: { name: string; hex: string }[] = [
  { name: 'NARANJA', hex: '#f77622' },
  { name: 'LIMA', hex: '#8ad94a' },
  { name: 'VERDE', hex: '#2f9e5a' },
  { name: 'TURQUESA', hex: '#2ec4c4' },
  { name: 'MORADO', hex: '#8e5ad8' },
  { name: 'ROSA', hex: '#f45ba0' },
  { name: 'AMARILLO', hex: '#f2c230' },
  { name: 'MARRÓN', hex: '#8a5a3a' },
  { name: 'BLANCO', hex: '#e8e8f0' },
  { name: 'GRIS', hex: '#7a8396' },
  { name: 'NEGRO', hex: '#2c2838' },
  { name: 'CIELO', hex: '#6fc2ff' },
];

export const SKIN_TONES: { name: string; skin: string; shade: string }[] = [
  { name: 'MUY CLARA', skin: '#fbd7bd', shade: '#e0ad8f' },
  { name: 'CLARA', skin: '#f5c9a3', shade: '#d99c79' },
  { name: 'MEDIA', skin: '#e0a370', shade: '#b97a4f' },
  { name: 'TOSTADA', skin: '#c68650', shade: '#9c633a' },
  { name: 'MORENA', skin: '#a8704f', shade: '#7d4f37' },
  { name: 'OSCURA', skin: '#7f4f37', shade: '#5c3726' },
  { name: 'MUY OSCURA', skin: '#5e3a29', shade: '#43281c' },
  { name: 'VERDE MARCIANO', skin: '#9ad37a', shade: '#6ea456' },
];

export const HAIR_STYLES = ['CORTO', 'RAPADO', 'FLEQUILLO', 'CRESTA', 'COLETA', 'AFRO', 'MELENA', 'MOÑO', 'CALVO', 'TUPÉ'];

export const HAIR_COLORS: { name: string; hex: string }[] = [
  { name: 'CASTAÑO', hex: '#5a3a24' },
  { name: 'NEGRO', hex: '#1f1a24' },
  { name: 'RUBIO', hex: '#e8b04a' },
  { name: 'PELIRROJO', hex: '#c4572b' },
  { name: 'CANOSO', hex: '#b8b8c8' },
  { name: 'AZUL', hex: '#3d6fe0' },
  { name: 'ROSA', hex: '#f07ab8' },
  { name: 'VERDE', hex: '#3fae5c' },
];

export const HATS = ['NINGUNO', 'GORRA', 'GORRO DE LANA', 'VAQUERO', 'CORONA', 'CHISTERA', 'CASCO VIKINGO', 'BOINA', 'FLOR', 'GORRO DE FIESTA'];

export const GLASSES = ['NINGUNA', 'REDONDAS', 'DE SOL', '3D', 'MONÓCULO', 'CORAZONES', 'VISOR', 'PARCHE PIRATA', 'DE PASTA'];

export const EXTRAS = ['NADA', 'BIGOTE', 'BARBA', 'PECAS', 'TIRITA', 'PENDIENTE', 'BUFANDA', 'PAJARITA', 'COLORETE', 'CICATRIZ'];

export const LOOK_LIMITS: Record<Exclude<keyof Look, 'name'>, number> = {
  color: LOOK_COLORS.length,
  skin: SKIN_TONES.length,
  hair: HAIR_STYLES.length,
  hairColor: HAIR_COLORS.length,
  hat: HATS.length,
  glasses: GLASSES.length,
  extra: EXTRAS.length,
};

export const NAME_MAX = 12;
const NAME_OK = /[^A-ZÁÉÍÓÚÜÑ0-9 .\-_!?]/g;

export function cleanName(s: unknown): string {
  return String(s ?? '')
    .toUpperCase()
    .replace(NAME_OK, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX);
}

const pick = (n: number) => Math.floor(Math.random() * n);

const BOT_NAMES = ['PILI', 'MANOLO', 'LOLA', 'PACO', 'CARMEN', 'RAFA', 'NURIA', 'TONI', 'MARI', 'PEPE', 'LUCÍA', 'CHEMA', 'ROCÍO', 'KIKE', 'INMA', 'FERMÍN', 'AMPARO', 'CURRO', 'MAITE', 'BRUNO'];

export function randomLook(name?: string): Look {
  return {
    name: name ?? BOT_NAMES[pick(BOT_NAMES.length)],
    color: pick(LOOK_COLORS.length),
    skin: pick(SKIN_TONES.length - 1), // el verde marciano solo si lo eliges tú
    hair: pick(HAIR_STYLES.length),
    hairColor: pick(5),
    hat: Math.random() < 0.45 ? 0 : pick(HATS.length),
    glasses: Math.random() < 0.6 ? 0 : pick(GLASSES.length),
    extra: Math.random() < 0.5 ? 0 : pick(EXTRAS.length),
  };
}

export function botName(i: number): string {
  return BOT_NAMES[i % BOT_NAMES.length];
}

/** Valida y recorta un look recibido de fuera. */
export function sanitizeLook(raw: unknown, fallbackName = 'JUGADOR'): Look {
  const r = (raw ?? {}) as Partial<Record<keyof Look, unknown>>;
  const num = (v: unknown, max: number) => {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) && n >= 0 && n < max ? n : 0;
  };
  return {
    name: cleanName(r.name) || fallbackName,
    color: num(r.color, LOOK_LIMITS.color),
    skin: num(r.skin, LOOK_LIMITS.skin),
    hair: num(r.hair, LOOK_LIMITS.hair),
    hairColor: num(r.hairColor, LOOK_LIMITS.hairColor),
    hat: num(r.hat, LOOK_LIMITS.hat),
    glasses: num(r.glasses, LOOK_LIMITS.glasses),
    extra: num(r.extra, LOOK_LIMITS.extra),
  };
}

/** Clave estable del aspecto (para cachear texturas). */
export function lookKey(l: Look): string {
  return [l.color, l.skin, l.hair, l.hairColor, l.hat, l.glasses, l.extra].join('-');
}
