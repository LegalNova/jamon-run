/**
 * MAPAS
 * Cada mapa es una cuadrícula ASCII de 48x30 tiles (16 px por tile).
 *
 * Leyenda
 *   #  roca / muro (sólido)          .  suelo
 *   T  árbol / cactus / pino (sólido) b  arbusto (te esconde)
 *   r  roca pequeña (sólido)          ~  agua (sólido)
 *   =  puente                         q  arenas movedizas (ralentiza)
 *   R  muro de ruinas (sólido)        i  hielo (resbala)
 *   n  montón de nieve (sólido)       d  nieve profunda (ralentiza)
 *   H  cabaña (sólido, rectángulos)
 *   X  salida de perseguidores        E  salida preferente de escapistas (opcional)
 *   o  punto de aparición de objetos
 *
 * Ciudades
 *   ,  césped / monte                 s  arena de playa
 *   c  terraza de café (sólido)       M  boca de metro (te lleva a la siguiente)
 *   L  Torre Eiffel (sólido)          P  Pirámide del Louvre (sólido)
 *   S  Sagrada Família (sólido)       g  banco de trencadís (sólido)
 *   k  carril bici (acelera)          W  casas blancas (sólido)
 *   C  Hércules de Ceuta (sólido)
 *
 * Las Vegas
 *   N  casino (sólido)                Y  tragaperras (sólida, suelta premios)
 *   V  coche (sólido)                 z  parking
 *   I  columna del parking (sólida)   M  ascensor entre plantas del parking
 *
 * La casa (Escondite)
 *   f  parqué   u  baldosa   p  hormigón (garaje)   v  sótano   a  desván   y  escalera
 *   D  puerta (se abre sola al acercarte; cerrada tapa la vista)
 *   J  interruptor de la luz de la habitación
 *   c  mesa (sólida)   K  encimera (sólida)
 *   1 sofá  2 lámpara  3 nevera  4 lavadora  5 cama  6 armario  7 maceta  8 tele  9 cajas  0 bici
 *   (los muebles son objetos del Escondite: no son sólidos y te puedes convertir en ellos)
 */

/** Estilo visual de los tiles (cada mapa usa uno). */
export type BiomeId = 'forest' | 'desert' | 'snow' | 'paris' | 'barcelona' | 'ceuta' | 'vegas' | 'casa';
/** Arenas pequeñas para Jamón Bomba. */
export type ArenaId = 'plaza' | 'azotea' | 'patio';
export type MapId = BiomeId | ArenaId;

export interface MapDef {
  id: MapId;
  name: string;
  subtitle: string;
  description: string[];
  rows: string[];
  /** Mapas de ciudad (extras). */
  city?: boolean;
  /** Arena pequeña (Jamón Bomba). */
  arena?: boolean;
  /** Estilo de los tiles (por defecto, el propio id). */
  style?: BiomeId;
  /** Solo se ofrece en estos modos (por defecto, en todos). */
  modes?: string[];
}

const wrap = (inner: string[]): string[] => {
  const w = inner[0].length + 2;
  const border = '#'.repeat(w);
  return [border, ...inner.map((r) => '#' + r + '#'), border];
};

export const MAPS: MapDef[] = [
  {
    id: 'forest',
    name: 'BOSQUE',
    subtitle: 'Río de los Jamones',
    description: ['Arbustos para', 'esconderse y un río', 'con tres puentes.'],
    rows: wrap([
      'T....TT.......bbb...........TT.......bbbb....T',
      '.....TT...o...bbb....~~.....TT.......bbbb.....',
      '..............b......~~.........r.............',
      '..rr.....TTT.........==.....bb.........TT.....',
      '..rr.....TTT.........==.....bb.........TT.....',
      '.........TTT.........~~~...........o..........',
      '...bb..............#..~~.........TTT.....bb...',
      '...bb...TT.........#..~~.........TTT.....bb...',
      '........TT.....bbb....~~......................',
      '.o..............bbb...==...rr.......TT....o...',
      'TTT...................~~~..........TT.........',
      'TTT....rr..............~~.....bbb.............',
      '.......rr.....TT.......~~.....bbb.....TTT.....',
      '..............TT.......~~.............TTT.....',
      '..bbb..............X...==...X..........bb.....',
      '..bbb.............X....==....X.........bb.....',
      '.......TT..............~~.........r...........',
      '.......TT....rr.........~~........r....TT.....',
      '...TT..................~~~.........bbb........',
      '...TT.....o..........#.~~.#..........bbb...o..',
      '....................#..==..#..................',
      '..TTT.....bbb..........~~.........TT.....rr...',
      '..TTT.....bbb..........~~.........TT.....rr...',
      '..........bbb..........~~.....................',
      '.......r...............==.......TTT...........',
      '...o...r....TT.........==.......TTT.....bb....',
      '............TT.........~~....o..........bb....',
      'T....bbb.................................TT..T',
    ]),
  },
  {
    id: 'desert',
    name: 'DESIERTO',
    subtitle: 'Ruinas del Secadero',
    description: ['Ruinas con pasillos', 'estrechos. Las arenas', 'movedizas frenan.'],
    rows: wrap([
      'T.........T........qqqq.........T............T',
      '...........T.......qqqq..............o........',
      '..RRRRRR...........qqq.......RRRR.RRRR........',
      '..R....R..T.................R.......R....T....',
      '..R.o..R..........r.........R...o...R.........',
      '..R....R..........r.........R.......R.........',
      '..RR..RR...qqq..............RRR..RRR.....T....',
      '...........qqqq........T......................',
      '.....T.....qqq...........................T....',
      '..................RRRR.RR.RRRR.........r......',
      '...r..............R..........R.........r......',
      '...r....T.........R...X..X...R....qqq.........',
      '...........T..........X..X........qqq......o..',
      '...r..............R..........R....qqq.........',
      '...r..............R....o.....R................',
      '..................RRRR.RR.RRRR...........T....',
      '...T..........................................',
      '........qqqq..........T..........RRRR..RRRR...',
      '........qqqqq.......................R.....R...',
      '.o......qqqq.....r..........T.......R..o..R...',
      '.................r..................R.....R...',
      '...RRR.RRR.....................T....RR...RR...',
      '...R.....R.........qqq........................',
      '...R..o..R........qqqqq.........T.............',
      '...R.....R.........qqq..........T......r......',
      '...RRR.RRR...T.............o...........r......',
      '..............................T...............',
      'T.......T.........qq...................T.....T',
    ]),
  },
  {
    id: 'snow',
    name: 'NIEVE',
    subtitle: 'Lago Helado',
    description: ['Un lago helado que', 'resbala, cabañas y', 'montones de nieve.'],
    rows: wrap([
      'T......TT..........nn...........TT...........T',
      '..HHHH.TT..........................TT.....o...',
      '..HHHH............dddd.......HHHH.............',
      '..HHHH..o.........dddd.......HHHH.....nn......',
      '.....n.......................HHHH.............',
      '.....n.....TT.........TT..........n...........',
      '...........TT.....iiiiiiiiii...........TT.....',
      '...nn...........iiiiiiiiiiiiii.......o..TT....',
      '...nn..........iiiiiiiiiiiiiiii.......nn......',
      '..............iiiiiiinniiiiiiiii.......nnn....',
      '.TT...........iiiiiinnnniiiiiiii..............',
      '.TT..o.......iiiiiiinniiiiiiiiii......HHH.....',
      '..............iiiiiiiiiiiiiiiii.......HHH.....',
      '...............iiiiiiiiiiiiiii........HHH.....',
      '...n............iiiiiiiiiiii.........n........',
      '...dd...............X....X.............nn.....',
      '...dd.......TT.....n..........n.........nn....',
      '............TT......X....X.......o............',
      '..HHH.....................................TT..',
      '..HHH........nnn.......dddddd.............TT..',
      '..HHH.........n........dddddd........iiiiii...',
      '.......o............T.................iiiiiii.',
      '.........TT.....iiiii.......HHHH......iiiiiii.',
      '.........TT....iiiiiii......HHHH.......iiiii..',
      '...............iiiiiii......HHHH..............',
      '...nn............iii..........o........TT.....',
      '...nn.........T..........nn.........T.........',
      'T..........TT.............nn.................T',
    ]),
  },
  {
    id: 'paris',
    name: 'PARÍS',
    subtitle: 'Torre Eiffel y el Sena',
    description: ['El Sena con tres puentes.', 'Las bocas de metro te', 'llevan a otra punta.'],
    city: true,
    rows: wrap([
      'T............................................T',
      '..#####..#####...T..........T...#####..#####..',
      '..#####..#####..................#####..#####..',
      '..#####..#####.o.....PPP........#####..#####..',
      '........c.c..........PPP..............c...o...',
      '....o...........T....PPP.....T.c..............',
      '..#####..####....................####..#####..',
      '..#####..####.....bb......bb.....####..#####..',
      '..#####..####.c...............o..####..#####..',
      '..#####......M...T..........T..........#####..',
      '......................XX..........M..c........',
      '..............................................',
      '~~~~~==~~~~~~~~................~~~~~==~~~~~~~~',
      '~~~~~==~~~~~~~~~~~~~==~~~~~~~~~~~~~~==~~~~~~~~',
      '~~~~~==~~~~~~~~~~~~~==~~~~~~~~~~~~~~==~~~~~~~~',
      '...............~~~~~==~~~~~~~~~...............',
      '.......o..............XX......................',
      '...........M..T,,,,,,,,,,,,,,,,T........o.....',
      '..#####.####..,,,,,,,,,,,,,,,,,,....####......',
      '..#####.####..T,,,,,,LLLL,,,,,,T....####......',
      '..#####.####..,,,,,,,LLLL,,,,,,,....####.c....',
      '..............T,,,,,,LLLL,,,,,,T..............',
      '.........c....,,,,,,,,,,,,,,,,,,....M.........',
      '..#####.......T,,,,,,,,,,o,,,,,T.####..#####..',
      '..#####.......,,,bb,,,,,,,,bb,,,.####..#####..',
      '..#####.....o.T,,,,,,,bb,,,,,,,T.####..#####..',
      '..............,,,,,,,,,,,,,,,,,,..............',
      'T............................................T',
    ]),
  },
  {
    id: 'barcelona',
    name: 'BARCELONA',
    subtitle: 'Sagrada Família y playa',
    description: ['Manzanas con chaflán,', 'trencadís de Gaudí y', 'carriles bici que aceleran.'],
    city: true,
    rows: wrap([
      'T..................................k.........T',
      '..####....####...T........T...####.k..####....',
      '.######..######....SSSSSS....######k.######...',
      '.######..######....SSSSSS....######k.######...',
      '..####....####.....SSSSSS.....####.k..####....',
      '...................SSSSSS.......o..k..........',
      '....o........o...T........T........k.....o....',
      '..####....####................####.k..####....',
      '.######..######...bb.........######k.######...',
      '.######..######..g..gg..gg...######k.######...',
      '..####....####....gg..gg..g...####.k..####....',
      '........................bb.........k..........',
      'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk',
      '..####..k......T...T...............k..####....',
      '.######.k.................#####....k.######...',
      '.######.k......T...T.XX..#######...k.######...',
      '..####..k.................#####....k..####....',
      '........k......T...T.XX............k..........',
      '........k.o.................gg.....k..........',
      '........k......T...T...............k...o......',
      '........k..........................k..........',
      'ssssssssssssssssssssssssssssssssssssssssssssss',
      'ssssTsssssssTsssssssTssossssTsssssssTsssssTsss',
      'sssssssssssssssssssssssssssssssssbssssssssssss',
      'sssssssssbsssssssssssssssbssssosssssssssssssss',
      'ssssssssssssssssssssssssssssssssssssssssssssss',
      '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
      '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    ]),
  },
  {
    id: 'vegas',
    name: 'LAS VEGAS',
    subtitle: 'Neón, casinos y fuente',
    description: ['Tragaperras, coches,', 'un parking de dos plantas', 'y callejones traseros.'],
    city: true,
    rows: wrap([
      '.....................................zzzzozzzz',
      'NNNNNNNN.NNNNNNNNNN..NNNNNNNN.NNNNNN.zIzVVzzIz',
      'NNNNNNNN.NNNNNNNNNN..NNNNNNNN.NNNNNN.zzzzzzMzz',
      'NNNNNNNN.NNNNNNNNNN..NNNNNNNN.NNNNNN.zzzzzzzzz',
      'NNNNNNNN.NNNNNNNNNN..NNNNNNNN.NNNNNN.zIzVVzzIz',
      ',Y,Y,,T,,,Y,Y,Y,,T,,,,Y,Y,,T,,,Y,Y,,,zzzzzzzzz',
      '..............................................',
      '....VV..........VV............VV..............',
      '.............X......X.....X......X............',
      '..........VV...........VV............VV.......',
      ',,T,,,,,,T,,,,,,T,,,,,,T,,,,,,T,,,,,,T,,,,,,T,',
      ',,,,,,,,,,,,,,,,,,,,,,o,,,,,,,,,,,,,,,,,,,,,,,',
      ',,,YY,,,,T,,,,,,~~~~~~~~~~~~~~,,,,,,T,,,,YY,,,',
      ',,,,,,,,,,,Y,,,~~~~~~~~~~~~~~~~,,Y,,,,,,,,,,o,',
      ',o,,,,,,,,,Y,,,~~~~~~~~~~~~~~~~,,Y,,,,,,,,,,,,',
      ',,,YY,,,,T,,,,,,~~~~~~~~~~~~~~,,,,,,T,,,,YY,,,',
      ',,,,,,,,,,,,,,,,,,,,,,,o,,,,,,,,,,,,,,,,,,,,,,',
      ',,,,,T,,,,,,,T,,,,,,,T,,,,,,,T,,,,,,,T,,,,,,,T',
      '.......VV...................VV................',
      '..............................................',
      '...............VV......................VV.....',
      ',,,,,,,,,,,,,,,,,,,,,Y,,,Y,,,Y,,,Y,,,Y,,,,,,,,',
      'zzzzzzzzzVVzzzzzzz..NNNNNNN.NNNNNNN.NNNNN.NNNN',
      'zzIzzzzIzzzzIzzzIz..NNNNNNN.NNNNNNN.NNNNN.NNNN',
      'zzzzVVzzzzzzzzzzzz..NNNNNNN.NNNNNNN.NNNNN.NNNN',
      'zzzzzzzzzzzzzVVzzz..NNNNNNN.NNNNNNN.NNNNN.NNNN',
      'zzIzzzzIzzozIzzzIz..NNNNNNN.NNNNNNN.NNNNN.NNNN',
      'zMzzzzzzzzzzzzzzzz.........o..................',
    ]),
  },
  {
    id: 'casa',
    name: 'LA CASA',
    subtitle: 'Escondite en casa',
    description: ['Puertas que se abren solas,', 'luces en cada habitación', 'y muebles por todas partes.'],
    modes: ['escondite'],
    rows: wrap([
      'aaaaaaaaaaaa#ffffffff#ffffffff#uuuuuuu#fffffff',
      'a9a9aaaaaaaa#f5ffff6f#f5ffff6f#u4uuu7u#f5fff6f',
      'aaaaaaaa6aaa#ffffffff#ffffffff#uuuuuuu#fffffff',
      'aaaaaa0aaaaa#ffffffff#ffffofff#uuuuuuu#fffffff',
      'aaaaaaaaaa9a#7ffff2ff#fffff8ff#uuuu6uu#fffff2f',
      'aa2aaaaaaaaa#ffffffff#2fffffff#uuuuuuu#fffffff',
      'aaaaaaaaa7aa#ffJfffff#ffJfffff#uuJuuuu#ffJffff',
      'aaaaJaaaaaaa####DD#######DD#######D#######D###',
      '#####DD######fJfffff7fffffffffffffff7fffffffff',
      'yyyyyyyyyyyyDfffffffffffffffff2fffffffffffff6f',
      'yyyyyyyyyoyJ#####D#########D##########DD######',
      'ffffffffffff#u3uuuuu3u#fffJfffff#ffffJffffffff',
      'ff7fffffffff#uuuuuuuuu#fffffffff#f1fffff8fffff',
      'fffffffff2ff#Juuuuuuuu#f2fffff7f#fffffffffff2f',
      'ffffffffffffDuKKKKuuuuDfffffffffDfffffffffffff',
      'fff9ffffffffDuuuuuuuuuDfffccffffDfffffccfffoff',
      'ffffffffffff#uu4uuuuuu#fffccffff#ff1ffffffffff',
      'yyyyyyyyyyyy#uuuuuu7uu#f6ffff8ff#ffffffff7ff1f',
      'yyyyyyyyyyyy#uuuuuuuuu#fffffffff#fffffffffffff',
      '#####DD#########DD#########D##########DD######',
      'vvvvJvvvvvvv#fffffffff#uuuuuuuu#ppppJppppppppp',
      'v9v9vvvvvvvv#f7fffff6f#uuuuuu9u#p9p9pppppppp0p',
      'vvvvvvvvv4vv#fffffffff#Juuuuuuu#pppppppppppppp',
      'vvvvv9vvvvvv#fffffffffDuuuuuuuuDppppppVVpppppp',
      'vvvvvvvvvvvvDfffffffffDuuuuuuuu#ppppppVVppp0pp',
      'v6vvvvvvvvvv#Jffffffff#uuuuuuuu#pppppppppppppp',
      'vvvvvv0vvv9v#ffXXfXf0f#u4u4uu7u#p9ppppppoppp9p',
      'vvvvvvvvvvvv#f2fffffff#uuuuuuuu#pppppppppppppp',
    ]),
  },
  {
    id: 'plaza',
    name: 'LA PLAZA',
    subtitle: 'Fuente y carriles bici',
    description: ['Plaza pequeña con fuente.', 'Ideal para Jamón Bomba:', 'no hay donde esconderse.'],
    arena: true,
    style: 'barcelona',
    rows: wrap([
      'T............................T',
      '..o..........k...........o....',
      '...gg........k........gg......',
      '.............kXX..............',
      '....T...T....k....T...T.......',
      '..b..........k.............b..',
      '.........c...k...c............',
      'kkkkkkkkkkk~~~~~~kkkkkkkkkkkkk',
      '...........~~~~~~.............',
      '.....o.....~~~~~~.......o.....',
      'kkkkkkkkkkk~~~~~~kkkkkkkkkkkkk',
      '.........c...k...c............',
      '..b..........k.............b..',
      '....T...T....k....T...T.......',
      '.............k................',
      '...gg........k........gg......',
      '..o..........k...........o....',
      'T............................T',
    ]),
  },
  {
    id: 'azotea',
    name: 'LA AZOTEA',
    subtitle: 'Tejados de París',
    description: ['Chimeneas, terrazas y', 'un jardín en el centro.', 'Arena de Jamón Bomba.'],
    arena: true,
    style: 'paris',
    rows: wrap([
      '..............................',
      '.o..##.......r.......##....o..',
      '....##...............##.......',
      '..........cc....cc............',
      '..rr.......................rr.',
      '.......##.........##..........',
      '.......##....o....##..........',
      '.............XX...............',
      '.c...r....bbbbbbbb....r....c..',
      '.c...r....bbbbbbbb....r....c..',
      '..............................',
      '.......##.........##..........',
      '.......##....o....##..........',
      '..rr........................rr',
      '..........cc....cc............',
      '....##...............##.......',
      '.o..##.......r.......##....o..',
      '..............................',
    ]),
  },
  {
    id: 'patio',
    name: 'EL PATIO',
    subtitle: 'Patio andaluz con fuente',
    description: ['Paredes encaladas,', 'macetas y una fuente.', 'Arena de Jamón Bomba.'],
    arena: true,
    style: 'ceuta',
    rows: wrap([
      'WWW.......................WWW.',
      'W....b.....b.....b.....b....W.',
      'W.o........................oW.',
      '...WW....WW.......WW....WW....',
      '.............XX...............',
      '.b......b.............b.....b.',
      '........r....~~~~....r........',
      '.....o.......~~~~.......o.....',
      '........r....~~~~....r........',
      '.b......b.............b.....b.',
      '..............................',
      '...WW....WW.......WW....WW....',
      'W.o........................oW.',
      'W....b.....b.....b.....b....W.',
      'WWW.......................WWW.',
      '..............................',
      '....b....b....b....b....b.....',
      '..............................',
    ]),
  },
];

export function getMap(id: MapId): MapDef {
  return MAPS.find((m) => m.id === id) ?? MAPS[0];
}

/** ¿Se puede jugar este modo en este mapa? (La casa es solo para el Escondite.) */
export function mapAllowed(m: MapDef, mode: string): boolean {
  return !m.modes || m.modes.includes(mode);
}

/** Estilo de tiles de un mapa. */
export function styleOf(id: MapId): BiomeId {
  const m = getMap(id);
  return m.style ?? (m.id as BiomeId);
}
