/** Paleta limitada del juego (hex). */
export const PAL = {
  outline: '#1a1424',
  ink: '#262033',
  white: '#ffffff',
  offWhite: '#f4f0e8',
  grey1: '#c2c3c7',
  grey2: '#8b9bb4',
  grey3: '#5a6988',
  grey4: '#3a4466',

  red: '#e43b44',
  redDark: '#a22633',
  redLight: '#ff7a6e',
  blue: '#2f88e8',
  blueDark: '#1d4ea8',
  blueLight: '#7cc8ff',
  yellow: '#feae34',
  yellowLight: '#fee761',
  green: '#63c74d',
  greenDark: '#3e8948',
  greenDeep: '#265c42',
  pink: '#f6a3b0',

  pants: '#3b3352',
  pantsDark: '#272038',
  shoe: '#1f1a2b',

  // jamón
  hamRind: '#7a3b22',
  hamRindDark: '#552616',
  hamMeat: '#c2414b',
  hamMeatDark: '#8c2a36',
  hamFat: '#f6dcc0',
  hamBone: '#f2ece0',
  hoof: '#2b2230',
} as const;

export const SKINS = [
  { skin: '#f5c9a3', shade: '#d99c79' },
  { skin: '#e0a370', shade: '#b97a4f' },
  { skin: '#a8704f', shade: '#7d4f37' },
  { skin: '#6e4433', shade: '#4f2f24' },
];

export const HAIRS = ['#3b2a22', '#7a4a2a', '#e8b04a', '#1f1a24', '#c4572b', '#9a9aa8'];

export function hexToInt(hex: string): number {
  return parseInt(hex.replace('#', ''), 16);
}

/** Colores de los equipos: AZUL = los que pillan, ROJO = los que huyen. */
export const TEAM_COLORS = {
  chaser: { main: 0x2a6be0, light: 0x7cc8ff, dark: 0x1a429a, team: 'AZUL', role: 'PERSEGUIDOR' },
  escapist: { main: 0xd8222c, light: 0xff6a5a, dark: 0x9c1820, team: 'ROJO', role: 'ESCAPISTA' },
} as const;
