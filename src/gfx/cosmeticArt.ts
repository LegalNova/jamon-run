/**
 * Pixel art de los cosméticos (gorros, emotes, rastros), de las reacciones (1-5)
 * y del icono de la loncha (la moneda del juego).
 */
import Phaser from 'phaser';
import { PAL } from './palette';
import { gridTexture, PixelGrid } from './pixel';

const O = PAL.outline;

function pat(scene: Phaser.Scene, key: string, w: number, h: number, rows: string[], map: Record<string, string>, outline = true): void {
  const g = new PixelGrid(w, h);
  g.pattern(outline ? 1 : 0, outline ? 1 : 0, rows, map);
  if (outline) g.outline(O);
  gridTexture(scene, key, g);
}

/** Gorros: se dibujan encima de la cabeza (origen abajo en el centro). */
function buildHats(scene: Phaser.Scene): void {
  pat(scene, 'cos_hat_chef', 14, 12, ['..wwwwwwww..', '.wwwwwwwwww.', 'wwwwwwwwwwww', 'wwwgwwwwgwww', '.wwwwwwwwww.', '..wwwwwwww..', '..gggggggg..', '..wwwwwwww..', '..wwwwwwww..'], { w: '#f4f0e8', g: '#c2c3c7' });
  pat(scene, 'cos_hat_montera', 18, 8, ['...kkk....kkk...', '..kkkkk..kkkkk..', '.kkpkkkkkkkkpkk.', 'kkkkkkkkkkkkkkkk', '.....kkkkkk.....'], { k: '#262033', p: '#e43b44' });
  pat(scene, 'cos_hat_pirata', 18, 9, ['......kkkk......', '...kkkkkkkkkk...', '.kkkkkkwwkkkkkk.', 'kkkkkkkwwkkkkkkk', '.kkkkkkkkkkkkkk.', '..yyyyyyyyyyyy..'], { k: '#262033', w: '#f4f0e8', y: '#ffd23f' });
  pat(scene, 'cos_hat_cuernos', 16, 7, ['r............r', 'rr..........rr', '.rr........rr.', '.Rrr......rrR.', '..RRr....rRR..'], { r: '#e43b44', R: '#a22633' });
  pat(scene, 'cos_hat_aureola', 14, 5, ['..yyyyyyyy..', '.y........y.', '..yyyyyyyy..'], { y: '#fee761' });
  pat(scene, 'cos_hat_corona', 14, 9, ['y..y..y..y', 'y..y.yy..y', 'yy.yyyyy.y', 'yyyyyyyyyy', 'yrybyyrbyy', 'YYYYYYYYYY'].map((r) => '.' + r + '.'), { y: '#ffd23f', Y: '#c79a1c', r: '#e43b44', b: '#2f88e8' });
  pat(scene, 'cos_hat_helice', 16, 9, ['rrrr..bbbb..', '....kk......', '.....k......', '..rrrrrrrr..', '.rryyrrrrrr.', 'rrrrrrrrrrrrr'], { r: '#2f88e8', b: '#e43b44', k: '#262033', y: '#fee761' });
  pat(scene, 'cos_hat_loncha', 16, 7, ['..mmmmmmmmmm..', '.mmMmmfmmMmmm.', 'mmmmmmfmmmmmmm', '.rrrrrrrrrrrr.'], { m: PAL.hamMeat, M: PAL.hamMeatDark, f: PAL.hamFat, r: PAL.hamRind });
}

/** Emotes y reacciones (iconos de 12x12). */
function buildEmotes(scene: Phaser.Scene): void {
  const face = (key: string, rows: string[], extra: Record<string, string> = {}) =>
    pat(scene, key, 14, 14, rows, { y: '#fee761', Y: '#feae34', k: '#262033', w: '#ffffff', r: '#e43b44', b: '#7cc8ff', ...extra });
  pat(scene, 'emote_jamon', 15, 11, ['......rrrr...', '....rrmmmmr..', 'hbrrrmmffmmr.', 'hbrrrmfmmMmr.', 'hbRRrmmmmMMr.', '....RRmmmMr..', '......RRRR...'], { h: PAL.hoof, b: PAL.hamBone, r: PAL.hamRind, R: PAL.hamRindDark, m: PAL.hamMeat, M: PAL.hamMeatDark, f: PAL.hamFat });
  face('emote_risa', ['...yyyyyy...', '.yyyyyyyyyy.', 'yykkyyyykkyy', 'ykyykyykyyky', 'yyyyyyyyyyyy', 'yykkkkkkkkyy', 'yykwwwwwwkyy', 'yykrrrrrrkyy', '.yykkkkkkyy.', '...yyyyyy...']);
  pat(scene, 'emote_fuego', 12, 14, ['....r.....', '...rr..r..', '..rryr.rr.', '.rryyrrrr.', 'rryyyyyrr.', 'ryyywyyyrr', 'ryywwwyyyr', 'rryywwyyrr', '.rryyyyrr.', '..rrrrrr..'], { r: '#e43b44', y: '#feae34', w: '#fee761' });
  pat(scene, 'emote_corazon', 13, 12, ['.rr...rr.', 'rwrr.rrrr', 'rwrrrrrrr', 'rrrrrrrrr', '.rrrrrrr.', '..rrrrr..', '...rrr...', '....r....'].map((r) => r + '..'), { r: '#ff4a6e', w: '#ffffff' });
  face('emote_llorar', ['...yyyyyy...', '.yyyyyyyyyy.', 'yykkyyyykkyy', 'ybyyyyyyyyby', 'ybyyyyyyyyby', 'ybyykkkkyyby', 'yyykyyyykyyy', '.yyyyyyyyyy.', '...yyyyyy...']);
  face('emote_gafas', ['...yyyyyy...', '.yyyyyyyyyy.', 'kkkkkkkkkkkk', 'ykkkkyykkkky', 'yykkyyyykkyy', 'yyyyyyyyyyyy', 'yykyyyyykyyy', '.yykkkkkkyy.', '...yyyyyy...']);
  // reacciones 1-5: 🔥 😂 😱 👏 🍖
  pat(scene, 'react_0', 12, 14, ['....r.....', '...rr..r..', '..rryr.rr.', '.rryyrrrr.', 'rryyyyyrr.', 'ryyywyyyrr', 'ryywwwyyyr', 'rryywwyyrr', '.rryyyyrr.', '..rrrrrr..'], { r: '#e43b44', y: '#feae34', w: '#fee761' });
  face('react_1', ['...yyyyyy...', '.yyyyyyyyyy.', 'bykkyyyykkyb', 'bkyykyykyykb', 'byyyyyyyyyyb', 'yykkkkkkkkyy', 'yykwwwwwwkyy', 'yykrrrrrrkyy', '.yykkkkkkyy.', '...yyyyyy...']);
  face('react_2', ['...yyyyyy...', '.yyyyyyyyyy.', 'yywwyyyywwyy', 'yywkyyyykwyy', 'yyyyyyyyyyyy', 'yyyykkkkyyyy', 'yyyykrrkyyyy', 'yyyykrrkyyyy', '.yyykkkkyyy.', '...yyyyyy...']);
  pat(scene, 'react_3', 14, 13, ['..y....y....', '.yy...yy..y.', '.y.y.y.y.y..', '..ssss..ssss', '.sssss.sssss', '.ssssssssss.', '.sssssssss..', '..sssssss...', '...sssss....'], { s: '#f5c9a3', y: '#fee761' });
  pat(scene, 'react_4', 15, 11, ['......rrrr...', '....rrmmmmr..', 'hbrrrmmffmmr.', 'hbrrrmfmmMmr.', 'hbRRrmmmmMMr.', '....RRmmmMr..', '......RRRR...'], { h: PAL.hoof, b: PAL.hamBone, r: PAL.hamRind, R: PAL.hamRindDark, m: PAL.hamMeat, M: PAL.hamMeatDark, f: PAL.hamFat });
}

function buildParticlesAndIcons(scene: Phaser.Scene): void {
  // La loncha: icono de la moneda (pequeño y grande).
  pat(scene, 'icon_loncha', 12, 9, ['..mmmmmm..', '.mmMmfmmm.', 'mmmmmfmMmm', 'mMmmmfmmmm', '.rrrrrrrr.'], { m: '#e46a72', M: PAL.hamMeatDark, f: PAL.hamFat, r: PAL.hamRind });
  {
    const g = new PixelGrid(22, 15);
    g.pattern(1, 1, ['....mmmmmmmmmm....', '..mmmmMmmmfmmmmm..', '.mmMmmmmmmfmmmMmm.', 'mmmmmmMmmmffmmmmmm', 'mmMmmmmmmmmfmmmMmm', 'mmmmmmmMmmmffmmmmm', '.mmmmmmmmmmmfmmmm.', '..rrrrrrrrrrrrrr..', '....rrrrrrrrrr....'], { m: '#e46a72', M: PAL.hamMeatDark, f: PAL.hamFat, r: PAL.hamRind });
    g.set(5, 3, '#ffffff');
    g.set(6, 3, '#ffffff');
    g.outline(O);
    gridTexture(scene, 'icon_loncha_big', g);
  }
  pat(scene, 'p_heart', 7, 6, ['.r.r.', 'rrrrr', '.rrr.', '..r..'], { r: '#ffffff' }, false);
  pat(scene, 'p_bubble', 6, 6, ['.ww.', 'w..w', 'w..w', '.ww.'], { w: '#ffffff' }, false);
  pat(scene, 'p_flame', 4, 5, ['.w.', 'www', 'www', '.w.'], { w: '#ffffff' }, false);
  pat(scene, 'icon_mission', 10, 12, ['.kkkkkk.', 'kwwwwwwk', 'kwkkkkwk', 'kwwwwwwk', 'kwkkkwwk', 'kwwwwwwk', 'kwkkkkwk', 'kwwwwwwk', '.kkkkkk.'], { k: '#7a4a24', w: '#f4f0e8' });
  pat(scene, 'icon_gift', 12, 12, ['..r..r..', '...rr...', 'yyyrryyy', 'yyyrryyy', 'gggrrggg', 'gggrrggg', 'gggrrggg', 'gggrrggg'].map((r) => '.' + r + '.'), { r: '#e43b44', y: '#ffd23f', g: '#2f88e8' });
  pat(scene, 'icon_shop', 12, 11, ['yyyyyyyyyy', 'ryryryryry', 'rrrrrrrrrr', '.wwwwwwww.', '.wkkwwwww.', '.wkkwwwww.', '.wwwwwwww.'], { y: '#feae34', r: '#e43b44', w: '#f4f0e8', k: '#3a4466' });
  pat(scene, 'icon_dice', 10, 10, ['wwwwwwww', 'wkwwwwkw', 'wwwwwwww', 'wwwkkwww', 'wwwwwwww', 'wkwwwwkw', 'wwwwwwww'], { w: '#f4f0e8', k: '#262033' });
}

export function buildCosmeticArt(scene: Phaser.Scene): void {
  buildHats(scene);
  buildEmotes(scene);
  buildParticlesAndIcons(scene);
}
