/**
 * Pixel art de los modos y de la capa de "dopamina":
 * objetos del Escondite (con 4 giros), jamón bomba, objetos de Infección,
 * monedas, caballos de la carrera, iconos de modo y luces para la noche.
 */
import Phaser from 'phaser';
import { PROP_KINDS } from '../../shared/props';
import { CHAR_H, CHAR_W } from './characters';
import { PAL } from './palette';
import { gridTexture, makeCanvas, PixelGrid, stripTexture } from './pixel';

const O = PAL.outline;

/** Dibuja un objeto en un frame del mismo tamaño que un personaje (16x20) apoyado en el suelo. */
function propGrid(kind: number, side: boolean): PixelGrid {
  const g = new PixelGrid(CHAR_W, CHAR_H);
  const base = CHAR_H - 2; // fila del suelo (igual que los pies de un personaje)
  const P = (x: number, y: number, rows: string[], map: Record<string, string>) => g.pattern(x, y, rows, map);
  switch (PROP_KINDS[kind]) {
    case 'papelera': {
      const m = { g: '#3e8948', G: '#265c42', l: '#63c74d', k: '#1f1a2b', w: '#c2c3c7' };
      P(side ? 4 : 3, base - 11, side
        ? ['.GGGGGG.', 'kkkkkkkk', 'gglggggG', 'gglggggG', 'gglgwggG', 'gglggggG', 'gglggggG', 'gglggggG', 'gglggggG', 'GgggggGG', '.GGGGGG.']
        : ['.GGGGGGGG.', 'kkkkkkkkkk', 'ggglgggggG', 'ggglggwggG', 'ggglgwwggG', 'ggglggwggG', 'ggglgggggG', 'ggglgggggG', 'ggglgggggG', 'GggggggggG', '.GGGGGGGG.'], m);
      break;
    }
    case 'farola': {
      const m = { k: '#262033', K: '#3a4466', y: '#fee761', Y: '#feae34', w: '#ffffff' };
      P(side ? 5 : 4, 1, side
        ? ['.kkkk.', 'kKKKKk', 'kywyyk', 'kyyyYk', '.kkkk.', '..kk..', '..kk..', '..kK..', '..kk..', '..kk..', '..kK..', '..kk..', '..kk..', '..kK..', '..kk..', '.kkkk.', 'kkkkkk']
        : ['..kkkk..', '.kKKKKk.', 'kkywyykk', '.kyyyYk.', '..kkkk..', '...kk...', '...kk...', '...kK...', '...kk...', '...kk...', '...kK...', '...kk...', '...kk...', '...kK...', '...kk...', '..kkkk..', '.kkkkkk.'], m);
      break;
    }
    case 'maceta': {
      const m = { t: '#c86a3a', T: '#8a4224', l: '#63c74d', L: '#3e8948', f: '#ff7ab8', y: '#fee761' };
      P(side ? 3 : 3, base - 12, side
        ? ['...l.f....', '..lLlff...', '.lLlLl.l..', 'lLlLlLlL..', '.LlLlLl...', 'tttttttt..', 'TtttttTT..', '.tttttT...', '.tttttT...', '.TtttTT...', '..TTTT....']
        : ['..f..l..f.', '.ffylLlff.', '.lLlLlLlL.', 'lLlLlLlLlL', '.LlLlLlLl.', 'tttttttttt', 'TttttttttT', '.ttttttTT.', '.ttttttTT.', '.TtttttTT.', '..TTTTTT..'], m);
      break;
    }
    case 'caja': {
      const m = { b: '#b8763e', B: '#7a4a24', l: '#d8a060', k: '#5a3418' };
      P(side ? 3 : 2, base - 10, side
        ? ['kkkkkkkkkk', 'kllllllllk', 'kbBbbbbBbk', 'kbbBbbBbbk', 'kbbbBBbbbk', 'kbbbBBbbbk', 'kbbBbbBbbk', 'kbBbbbbBbk', 'kllllllllk', 'kkkkkkkkkk']
        : ['kkkkkkkkkkkk', 'kllllllllllk', 'kbBbbbbbbBbk', 'kbbBbbbbBbbk', 'kbbbBbbBbbbk', 'kbbbbBBbbbbk', 'kbbbBbbBbbbk', 'kbbBbbbbBbbk', 'kllllllllllk', 'kkkkkkkkkkkk'], m);
      break;
    }
    case 'silla': {
      const m = { r: '#b85c18', R: '#7a3b22', l: '#e08a3a' };
      P(side ? 4 : 3, base - 13, side
        ? ['RR......', 'Rr......', 'Rr......', 'Rr......', 'Rr......', 'Rr......', 'Rrlllll.', 'RRrrrrrR', 'R.R...R.', 'R.R...R.', 'R.R...R.', 'R.R...R.', 'R.R...R.']
        : ['.RRRRRRRR.', '.RllllllR.', '.RrrrrrrR.', '.RllllllR.', '.RrrrrrrR.', '.R......R.', 'RlllllllllR'.slice(0, 10), 'RrrrrrrrrR', 'R.R....R.R', 'R.R....R.R', 'R.R....R.R', 'R.R....R.R', 'R......R.R'.slice(0, 10)], m);
      break;
    }
    case 'barril': {
      const m = { b: '#8a5a3a', B: '#5a3418', l: '#b8763e', k: '#3a4466', K: '#8b9bb4' };
      P(side ? 3 : 3, base - 12, side
        ? ['..BBBBBB..', '.BbbllbbB.', 'kKkkkkkkkk', 'Bbbbllbbbb', 'Bbbbllbbbb', 'Bbbbllbbbb', 'Bbbbllbbbb', 'kKkkkkkkkk', 'Bbbbllbbbb', '.BbbllbbB.', '..BBBBBB..']
        : ['..BBBBBB..', '.BbblbbbB.', 'kKkkkkkkkk', 'BbbblbbbbB', 'BbbblbbbbB', 'BbbblbbbbB', 'BbbblbbbbB', 'kKkkkkkkkk', 'BbbblbbbbB', '.BbblbbbB.', '..BBBBBB..'], m);
      break;
    }
    case 'banco': {
      const m = { g: '#3e8948', G: '#265c42', w: '#b8763e', W: '#7a4a24', k: '#262033' };
      P(side ? 4 : 0, base - 9, side
        ? ['WW......', 'Ww......', 'Ww......', 'WWwwwwwW', 'kk....kk', 'k......k', 'k......k', 'kk....kk', 'k......k']
        : ['WWWWWWWWWWWWWWWW', 'wwwwwwwwwwwwwwww', 'WWWWWWWWWWWWWWWW', 'wwwwwwwwwwwwwwww', 'WWWWWWWWWWWWWWWW', '.kk..........kk.', '.k............k.', '.k............k.', '.kk..........kk.'], m);
      break;
    }
    case 'cubo': {
      const m = { b: '#2f88e8', B: '#1d4ea8', l: '#7cc8ff', k: '#262033', w: '#c2c3c7' };
      P(side ? 5 : 4, base - 8, side
        ? ['.kkkk.', 'kwwwwk', 'blbbbB', 'blbbbB', 'blbbbB', 'blbbbB', '.bbbB.', '.BBBB.']
        : ['.kkkkkk.', 'kwwwwwwk', 'blbbbbbB', 'blbbbbbB', 'blbbbbbB', 'blbbbbbB', '.bbbbbB.', '.BBBBBB.'], m);
      break;
    }
  }
  g.outline(O);
  return g;
}

function buildProps(scene: Phaser.Scene): void {
  for (let k = 0; k < PROP_KINDS.length; k++) {
    const front = propGrid(k, false);
    const side = propGrid(k, true);
    // 4 giros: frente, lado, frente espejado, lado espejado.
    const variants = [front, side, front.flipX(), side.flipX()];
    variants.forEach((g, r) => gridTexture(scene, `prop_${k}_${r}`, g));
  }
}

function icon(scene: Phaser.Scene, key: string, rows: string[], map: Record<string, string>): void {
  const g = new PixelGrid(rows[0].length + 2, rows.length + 2);
  g.pattern(1, 1, rows, map);
  g.outline(O);
  gridTexture(scene, key, g);
}

function buildItems(scene: Phaser.Scene): void {
  icon(scene, 'item_barrier', [
    'w.........w',
    'wroorroorrw',
    'wwwwwwwwwww',
    'woorroorrow',
    'w.........w',
    'w.........w',
  ], { w: PAL.offWhite, r: PAL.red, o: '#feae34' });
  icon(scene, 'item_grenade', [
    '...kk....',
    '..kggk...',
    '.ggggggg.',
    'gglggggGg',
    'glgggggGg',
    'gggggggGg',
    'ggggggGGg',
    '.gggGGGg.',
    '..ggggg..',
  ], { k: PAL.grey3, g: PAL.grey1, l: PAL.white, G: PAL.grey2 });
  icon(scene, 'item_coin', [
    '.yyyy.',
    'yllyyY',
    'ylyYyY',
    'ylyYyY',
    'yyyyyY',
    '.YYYY.',
  ], { y: '#ffd23f', Y: '#c79a1c', l: '#fff4b0' });
  // tile de barrera (Infección)
  {
    const g = new PixelGrid(16, 16);
    for (let x = 0; x < 16; x++) {
      g.set(x, 4, PAL.offWhite);
      g.set(x, 9, PAL.offWhite);
      for (let y = 5; y <= 8; y++) g.set(x, y, Math.floor((x + y) / 3) % 2 ? '#e43b44' : '#f4f0e8');
    }
    for (const x of [1, 14]) for (let y = 2; y <= 14; y++) g.set(x, y, '#5a6988');
    g.rect(0, 14, 3, 2, '#3a4466');
    g.rect(13, 14, 3, 2, '#3a4466');
    g.outline(O);
    gridTexture(scene, 'barrier_tile', g);
  }
  // jamón bomba: el jamón con mecha encendida
  {
    const g = new PixelGrid(17, 14);
    g.pattern(1, 4, [
      '......rrrr.....',
      '....rrmmmmr....',
      'hbrrrmmffmmr...',
      'hbrrrmfmmMmr...',
      'hbRRrmmmmMMr...',
      '....RRmmmMr....',
      '......RRRR.....',
    ], { h: PAL.hoof, b: PAL.hamBone, r: PAL.hamRind, R: PAL.hamRindDark, m: PAL.hamMeat, M: PAL.hamMeatDark, f: PAL.hamFat });
    g.pattern(10, 0, ['...y', '..k.', '.k..', 'k...'], { k: '#262033', y: '#fee761' });
    g.outline(O);
    gridTexture(scene, 'bomb_ham', g);
  }
  // loncha de jamón (partícula de la explosión)
  {
    const g = new PixelGrid(5, 4);
    g.pattern(0, 0, ['.mmf.', 'mmMmf', 'mMmmf', '.fff.'], { m: PAL.hamMeat, M: PAL.hamMeatDark, f: PAL.hamFat });
    gridTexture(scene, 'p_slice', g);
  }
  // confeti
  {
    const g = new PixelGrid(2, 3);
    g.rect(0, 0, 2, 3, '#ffffff');
    gridTexture(scene, 'p_confetti', g);
  }
  // partícula verde de contagio
  {
    const g = new PixelGrid(3, 3);
    g.pattern(0, 0, ['.g.', 'gGg', '.g.'], { g: '#9cff5a', G: '#e6ff5a' });
    gridTexture(scene, 'p_virus', g);
  }
  // indicadores sobre la cabeza
  icon(scene, 'ind_infected', ['ggggg', '.ggg.', '..g..'], { g: '#9cff5a' });
  icon(scene, 'ind_neutral', ['wwwww', '.www.', '..w..'], { w: '#f4f0e8' });
  // signo de interrogación (pistas del Escondite)
  icon(scene, 'p_hint', ['.www.', 'w...w', '...w.', '..w..', '.....', '..w..'], { w: PAL.yellowLight });
}

function buildModeIcons(scene: Phaser.Scene): void {
  const mk = (key: string, draw: (g: PixelGrid) => void) => {
    const g = new PixelGrid(30, 30);
    draw(g);
    g.outline(O);
    gridTexture(scene, key, g);
  };
  mk('mode_pilla', (g) => {
    g.pattern(2, 8, [
      '..........rrrrrrrr....',
      '.......rrrrmmmmmmmmr..',
      'hhbbrrrrrmmmmffffmmmr.',
      'hhbbrrrrrmmmmfmmmmMMr.',
      'hhbbrrrrrmmmfmmmmmMMr.',
      'hhbbRRRRrmmmmmmmmMMMr.',
      '.......RRRRmmmmmMMMr..',
      '..........RRRRRRRR....',
    ], { h: PAL.hoof, b: PAL.hamBone, r: PAL.hamRind, R: PAL.hamRindDark, m: PAL.hamMeat, M: PAL.hamMeatDark, f: PAL.hamFat });
    g.pattern(17, 0, ['..y..', '.yyy.', 'yyyyy', '.yyy.', '..y..'], { y: PAL.yellowLight });
  });
  mk('mode_infeccion', (g) => {
    g.ellipse(15, 15, 9, 9, '#63c74d');
    g.ellipse(15, 15, 6, 6, '#9cff5a');
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      for (let r = 9; r <= 12; r++) g.set(15 + Math.cos(a) * r, 15 + Math.sin(a) * r, '#3e8948');
      g.ellipse(15 + Math.cos(a) * 13, 15 + Math.sin(a) * 13, 1.6, 1.6, '#e6ff5a');
    }
    g.ellipse(12, 13, 1.5, 1.5, '#262033');
    g.ellipse(18, 13, 1.5, 1.5, '#262033');
    g.rect(12, 18, 7, 1, '#262033');
  });
  mk('mode_bomba', (g) => {
    g.ellipse(14, 18, 10, 9, '#c2414b');
    g.ellipse(14, 18, 7, 6, '#e46a72');
    g.ellipse(11, 15, 2, 2, '#f6dcc0');
    g.rect(4, 22, 20, 2, '#7a3b22');
    for (let i = 0; i < 6; i++) g.set(18 + i, 9 - i, '#262033');
    g.pattern(22, 0, ['.y.y.', 'y.Y.y', '.YwY.', 'y.Y.y', '.y.y.'], { y: '#feae34', Y: '#fee761', w: '#ffffff' });
  });
  mk('mode_escondite', (g) => {
    g.pattern(5, 4, [
      '.GGGGGGGGGGGGGGG.',
      'kkkkkkkkkkkkkkkkk',
      'ggglgggggggggggGG',
      'ggglggggggggggggG',
      'ggglgggwwwwgggggG',
      'ggglggw.ww.wggggG',
      'ggglggwwwwwwggggG',
      'ggglgggw..wgggggG',
      'ggglggggggggggggG',
      'ggglggggggggggggG',
      'ggglggggggggggggG',
      'ggglggggggggggggG',
      'GggggggggggggggGG',
      '.GGGGGGGGGGGGGGG.',
    ], { g: '#3e8948', G: '#265c42', l: '#63c74d', k: '#1f1a2b', w: '#ffffff', '.': '#1f1a2b' });
    g.pattern(12, 19, ['kk...kk'], { k: '#1f1a2b' });
  });
}

/** Caballos de la carrera (2 frames de galope) con el color de su jinete. */
function buildHorses(scene: Phaser.Scene): void {
  const silks = ['#e43b44', '#feae34', '#2f88e8', '#63c74d'];
  silks.forEach((silk, i) => {
    const frames: { name: string; grid: PixelGrid }[] = [];
    for (let f = 0; f < 2; f++) {
      const g = new PixelGrid(22, 16);
      const m = { b: '#7a4a24', B: '#4a2a14', m: '#2a1a10', s: silk, k: '#f5c9a3', w: '#ffffff' };
      g.pattern(0, 0, [
        '.........ss.........',
        '........ssss........',
        '.........k..........',
        '.......ssss.....mm..',
        '......sssss....bbbm.',
        '..m...bbbbbbbbbbbbb.',
        '.mm..bbbbbbbbbbbbbb.',
        '.m..bbbbbbbbbbbbB...',
        '....bbbbbbbbbbbB....',
        '.....BbbbbbbbbB.....',
      ], m);
      const legs = f === 0
        ? ['.....b.b....b..b.....', '....b...b..b....b....', '...B....B.B......B...', '...B.....BB.......B..']
        : ['......bb.....bb......', '......b.b...b.b......', '.....B..B..B...B.....', '.....B...BB.....B....'];
      g.pattern(0, 10, legs, m);
      g.outline(O);
      frames.push({ name: `f${f}`, grid: g });
    }
    stripTexture(scene, `horse_${i}`, frames);
    if (!scene.anims.exists(`horse_${i}_run`)) {
      scene.anims.create({ key: `horse_${i}_run`, frames: [{ key: `horse_${i}`, frame: 'f0' }, { key: `horse_${i}`, frame: 'f1' }], frameRate: 12, repeat: -1 });
    }
  });
}

/** Luces para la oscuridad de los modos nocturnos (se "borran" de una capa negra). */
function buildLights(scene: Phaser.Scene): void {
  {
    const R = 64;
    const { tex, ctx } = makeCanvas(scene, 'light_round', R * 2, R * 2);
    const gr = ctx.createRadialGradient(R, R, 0, R, R, R);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.55, 'rgba(255,255,255,0.85)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, R * 2, R * 2);
    tex.refresh();
  }
  {
    // Cono de linterna apuntando a la derecha (origen en el borde izquierdo, centro vertical).
    const L = 150;
    const H = 120;
    const { tex, ctx } = makeCanvas(scene, 'light_cone', L, H);
    const gr = ctx.createRadialGradient(0, H / 2, 4, 0, H / 2, L);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.7, 'rgba(255,255,255,0.8)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.moveTo(0, H / 2 - 4);
    ctx.lineTo(L, 0);
    ctx.lineTo(L, H);
    ctx.lineTo(0, H / 2 + 4);
    ctx.closePath();
    ctx.fill();
    tex.refresh();
  }
}

export function buildModeArt(scene: Phaser.Scene): void {
  buildProps(scene);
  buildItems(scene);
  buildModeIcons(scene);
  buildHorses(scene);
  buildLights(scene);
}
