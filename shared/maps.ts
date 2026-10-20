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
 */

export type BiomeId = 'forest' | 'desert' | 'snow';

export interface MapDef {
  id: BiomeId;
  name: string;
  subtitle: string;
  description: string[];
  rows: string[];
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
];

export function getMap(id: BiomeId): MapDef {
  return MAPS.find((m) => m.id === id) ?? MAPS[0];
}
