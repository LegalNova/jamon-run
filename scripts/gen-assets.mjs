// Genera por código (sin ningún asset externo) la imagen para compartir (og:image)
// y los iconos de la app (PWA): public/og.png, public/icon-192.png, public/icon-512.png, public/apple-touch-icon.png
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function png(w, h, rgba) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

class Canvas {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.d = Buffer.alloc(w * h * 4);
  }
  rect(x, y, w, h, hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    for (let j = Math.max(0, y); j < Math.min(this.h, y + h); j++)
      for (let i = Math.max(0, x); i < Math.min(this.w, x + w); i++) {
        const o = (j * this.w + i) * 4;
        this.d[o] = r;
        this.d[o + 1] = g;
        this.d[o + 2] = b;
        this.d[o + 3] = 255;
      }
  }
  /** Dibuja un patrón de caracteres con tamaño de píxel `s`. */
  pattern(x, y, rows, map, s) {
    rows.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) if (map[row[i]]) this.rect(x + i * s, y + j * s, s, s, map[row[i]]);
    });
  }
}

const FONT = {
  J: ['..###', '...#.', '...#.', '...#.', '#..#.', '#..#.', '.##..'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
};

function word(c, text, cx, y, s, colorA, colorB, split) {
  const w = text.length * 6 * s - s;
  let x = Math.round(cx - w / 2);
  [...text].forEach((ch, i) => {
    const col = i < split ? colorA : colorB;
    // sombra y contorno
    c.pattern(x + s, y + s, FONT[ch], { '#': '#1a1424' }, s);
    c.pattern(x, y, FONT[ch], { '#': col }, s);
    x += 6 * s;
  });
}

const HAM = ['......rrrr...', '....rrmmmmr..', 'hbrrrmmffmmr.', 'hbrrrmfmmMmr.', 'hbRRrmmmmMMr.', '....RRmmmMr..', '......RRRR...'];
const HAM_MAP = { h: '#2b2230', b: '#f2ece0', r: '#7a3b22', R: '#552616', m: '#c2414b', M: '#8c2a36', f: '#f6dcc0' };

function background(c) {
  for (let y = 0; y < c.h; y += 16) for (let x = 0; x < c.w; x += 16) c.rect(x, y, 16, 16, ((x + y) / 16) % 2 ? '#1a1428' : '#211a33');
}

mkdirSync('public', { recursive: true });

// og:image 1200x630
{
  const c = new Canvas(1200, 630);
  background(c);
  c.rect(0, 470, 1200, 160, '#2a2140');
  c.pattern(520, 90, HAM, HAM_MAP, 13);
  word(c, 'JAMONGUS', 600, 260, 22, '#ff8a7a', '#fee761', 5);
  // personajes
  const P = ['.rrrr.', 'rrrrrr', '.ssss.', '.sksk.', '.ssss.', 'gggggg', '.g..g.', '.w..w.'];
  for (let i = 0; i < 6; i++) c.pattern(160 + i * 160, 480, P, { r: i % 2 ? '#2a6be0' : '#d8222c', s: '#f5c9a3', k: '#262033', g: i % 2 ? '#2a6be0' : '#2a2530', w: '#f4f4f4' }, 12);
  writeFileSync('public/og.png', png(c.w, c.h, c.d));
}

// iconos cuadrados
for (const size of [192, 512, 180]) {
  const c = new Canvas(size, size);
  c.rect(0, 0, size, size, '#1a1428');
  const s = Math.floor(size / 16);
  c.pattern(Math.round(size / 2 - 6.5 * s), Math.round(size * 0.18), HAM, HAM_MAP, s);
  const ws = Math.max(2, Math.floor(size / 64));
  word(c, 'JAMONGUS', size / 2, Math.round(size * 0.62), ws, '#ff8a7a', '#fee761', 5);
  writeFileSync(size === 180 ? 'public/apple-touch-icon.png' : `public/icon-${size}.png`, png(size, size, c.d));
}
console.log('og.png e iconos generados en public/');
