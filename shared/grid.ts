import { TILE } from './balance';

/** Tipos de terreno (independientes del bioma). */
export enum Terrain {
  Ground = 0,
  Solid = 1,
  Water = 2,
  Bridge = 3,
  Bush = 4,
  Quicksand = 5,
  Ice = 6,
  DeepSnow = 7,
  /** Boca de metro: te lleva a la siguiente. */
  Metro = 8,
  /** Carril bici: acelera. */
  Lane = 9,
}

const CHAR_TERRAIN: Record<string, Terrain> = {
  '.': Terrain.Ground,
  ',': Terrain.Ground,
  X: Terrain.Ground,
  E: Terrain.Ground,
  o: Terrain.Ground,
  '#': Terrain.Solid,
  T: Terrain.Solid,
  r: Terrain.Solid,
  R: Terrain.Solid,
  n: Terrain.Solid,
  H: Terrain.Solid,
  '~': Terrain.Water,
  '=': Terrain.Bridge,
  b: Terrain.Bush,
  q: Terrain.Quicksand,
  i: Terrain.Ice,
  d: Terrain.DeepSnow,
  s: Terrain.Ground,
  c: Terrain.Solid,
  L: Terrain.Solid,
  P: Terrain.Solid,
  S: Terrain.Solid,
  g: Terrain.Solid,
  W: Terrain.Solid,
  C: Terrain.Solid,
  M: Terrain.Metro,
  k: Terrain.Lane,
  /** Barrera temporal (Infección). */
  B: Terrain.Solid,
  // Las Vegas
  N: Terrain.Solid,
  Y: Terrain.Solid,
  V: Terrain.Solid,
  I: Terrain.Solid,
  // La casa
  K: Terrain.Solid,
};

const MOVE_COST: Record<number, number> = {
  [Terrain.Ground]: 1,
  [Terrain.Bridge]: 1,
  [Terrain.Bush]: 1,
  [Terrain.Quicksand]: 2.6,
  [Terrain.Ice]: 1.5,
  [Terrain.DeepSnow]: 1.5,
  [Terrain.Metro]: 1,
  [Terrain.Lane]: 0.8,
};

/** Tiles que tapan la vista (los arbustos, el agua y las terrazas no). */
export const SIGHT_BLOCKERS = '#TRHnLPSWCNI';
/** Tiles que paran un jamón lanzado. */
export const SHOT_BLOCKERS = '#TRHnrLPSWCcgBNYVIK';

const DIRS = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
] as const;

/** Montículo binario mínimo de índices con prioridad. */
class MinHeap {
  private items: number[] = [];
  private prio: number[] = [];
  get size(): number {
    return this.items.length;
  }
  push(item: number, p: number): void {
    const a = this.items;
    const pr = this.prio;
    a.push(item);
    pr.push(p);
    let i = a.length - 1;
    while (i > 0) {
      const par = (i - 1) >> 1;
      if (pr[par] <= pr[i]) break;
      [a[par], a[i]] = [a[i], a[par]];
      [pr[par], pr[i]] = [pr[i], pr[par]];
      i = par;
    }
  }
  pop(): number {
    const a = this.items;
    const pr = this.prio;
    const top = a[0];
    const lastI = a.pop()!;
    const lastP = pr.pop()!;
    if (a.length > 0) {
      a[0] = lastI;
      pr[0] = lastP;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && pr[l] < pr[m]) m = l;
        if (r < a.length && pr[r] < pr[m]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        [pr[m], pr[i]] = [pr[i], pr[m]];
        i = m;
      }
    }
    return top;
  }
}

export interface DistField {
  dist: Float32Array;
  parent: Int32Array;
}

export class Grid {
  readonly w: number;
  readonly h: number;
  readonly chars: string[][];
  readonly terrain: Uint8Array;
  /** "Apertura" de cada tile: cuántos tiles libres hay cerca (evita callejones). */
  readonly openness: Float32Array;
  readonly passable: number[] = [];
  readonly chaserSpawns: number[] = [];
  readonly escapistSpawns: number[] = [];
  readonly itemSpawns: number[] = [];
  readonly metroTiles: number[] = [];
  /** Puertas de la casa (se abren solas; cerradas tapan la vista y paran los jamones). */
  readonly doorTiles: number[] = [];
  readonly doorClosed: Uint8Array;

  constructor(rows: string[]) {
    this.h = rows.length;
    this.w = rows[0].length;
    this.chars = rows.map((r) => r.split(''));
    this.terrain = new Uint8Array(this.w * this.h);
    this.doorClosed = new Uint8Array(this.w * this.h);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const c = rows[y][x] ?? '#';
        const t = CHAR_TERRAIN[c] ?? Terrain.Ground;
        const i = y * this.w + x;
        this.terrain[i] = t;
        if (this.walkableT(t)) this.passable.push(i);
        if (c === 'X') this.chaserSpawns.push(i);
        if (c === 'E') this.escapistSpawns.push(i);
        if (c === 'o') this.itemSpawns.push(i);
        if (c === 'M') this.metroTiles.push(i);
        if (c === 'D') {
          this.doorTiles.push(i);
          this.doorClosed[i] = 1;
        }
      }
    }
    this.openness = new Float32Array(this.w * this.h);
    for (const i of this.passable) {
      const x = i % this.w;
      const y = (i / this.w) | 0;
      let n = 0;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) if (this.walkable(x + dx, y + dy)) n++;
      this.openness[i] = n / 25;
    }
  }

  private saved = new Map<number, { c: string; t: number }>();

  /** Pone o quita una barrera temporal en unos tiles (devuelve los que ha cambiado). */
  setBarrier(tiles: number[], on: boolean): number[] {
    const done: number[] = [];
    for (const i of tiles) {
      const x = i % this.w;
      const y = (i / this.w) | 0;
      if (!this.inBounds(x, y)) continue;
      if (on) {
        if (this.saved.has(i) || !this.walkableIdx(i)) continue;
        this.saved.set(i, { c: this.chars[y][x], t: this.terrain[i] });
        this.chars[y][x] = 'B';
        this.terrain[i] = Terrain.Solid;
        done.push(i);
      } else {
        const s = this.saved.get(i);
        if (!s) continue;
        this.saved.delete(i);
        this.chars[y][x] = s.c;
        this.terrain[i] = s.t;
        done.push(i);
      }
    }
    return done;
  }

  private walkableT(t: number): boolean {
    return t !== Terrain.Solid && t !== Terrain.Water;
  }

  idx(tx: number, ty: number): number {
    return ty * this.w + tx;
  }

  inBounds(tx: number, ty: number): boolean {
    return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h;
  }

  walkable(tx: number, ty: number): boolean {
    if (!this.inBounds(tx, ty)) return false;
    return this.walkableT(this.terrain[ty * this.w + tx]);
  }

  walkableIdx(i: number): boolean {
    return this.walkableT(this.terrain[i]);
  }

  terrainAtTile(tx: number, ty: number): Terrain {
    if (!this.inBounds(tx, ty)) return Terrain.Solid;
    return this.terrain[ty * this.w + tx] as Terrain;
  }

  terrainAt(px: number, py: number): Terrain {
    return this.terrainAtTile(Math.floor(px / TILE), Math.floor(py / TILE));
  }

  charAt(tx: number, ty: number): string {
    return this.inBounds(tx, ty) ? this.chars[ty][tx] : '#';
  }

  solidAt(px: number, py: number): boolean {
    return !this.walkable(Math.floor(px / TILE), Math.floor(py / TILE));
  }

  /** ¿Este tile bloquea la vista? (Los arbustos, agua y nieve profunda no.) */
  blocksSight(tx: number, ty: number): boolean {
    if (!this.inBounds(tx, ty)) return true;
    const c = this.chars[ty][tx];
    if (c === 'D') return this.doorClosed[ty * this.w + tx] === 1;
    return SIGHT_BLOCKERS.includes(c);
  }

  /** ¿Este tile para un jamón lanzado? */
  blocksShot(tx: number, ty: number): boolean {
    if (!this.inBounds(tx, ty)) return true;
    const c = this.chars[ty][tx];
    if (c === 'D') return this.doorClosed[ty * this.w + tx] === 1;
    return SHOT_BLOCKERS.includes(c);
  }

  tileCenter(i: number): { x: number; y: number } {
    return { x: (i % this.w) * TILE + TILE / 2, y: Math.floor(i / this.w) * TILE + TILE / 2 };
  }

  tileOf(px: number, py: number): number {
    const tx = Math.max(0, Math.min(this.w - 1, Math.floor(px / TILE)));
    const ty = Math.max(0, Math.min(this.h - 1, Math.floor(py / TILE)));
    return ty * this.w + tx;
  }

  /** Línea de visión entre dos puntos (para la IA y los proyectiles). */
  lineOfSight(x0: number, y0: number, x1: number, y1: number): boolean {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    const steps = Math.ceil(len / 4);
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const tx = Math.floor((x0 + dx * t) / TILE);
      const ty = Math.floor((y0 + dy * t) / TILE);
      if (this.blocksSight(tx, ty)) return false;
    }
    return true;
  }

  /** ¿Puede un círculo de radio r ir en línea recta de A a B? */
  clearPath(x0: number, y0: number, x1: number, y1: number, r: number): boolean {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(len / 3));
    const rr = r + 1;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = x0 + dx * t;
      const y = y0 + dy * t;
      if (
        this.solidAt(x - rr, y - rr) ||
        this.solidAt(x + rr, y - rr) ||
        this.solidAt(x - rr, y + rr) ||
        this.solidAt(x + rr, y + rr)
      )
        return false;
    }
    return true;
  }

  moveCost(i: number): number {
    return MOVE_COST[this.terrain[i]] ?? 1;
  }

  private neighbours(i: number, out: (n: number, c: number) => void): void {
    const x = i % this.w;
    const y = (i / this.w) | 0;
    for (const [dx, dy, c] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!this.walkable(nx, ny)) continue;
      // Sin cortar esquinas en diagonal.
      if (dx !== 0 && dy !== 0 && (!this.walkable(x + dx, y) || !this.walkable(x, y + dy))) continue;
      const n = ny * this.w + nx;
      out(n, c * this.moveCost(n));
    }
  }

  /** A* entre dos tiles. Devuelve la lista de índices (incluye el destino) o null. */
  astar(start: number, goal: number, maxNodes = 4000): number[] | null {
    if (!this.walkableIdx(goal) || !this.walkableIdx(start)) return null;
    if (start === goal) return [goal];
    const n = this.w * this.h;
    const g = new Float32Array(n).fill(Infinity);
    const parent = new Int32Array(n).fill(-1);
    const closed = new Uint8Array(n);
    const gx = goal % this.w;
    const gy = (goal / this.w) | 0;
    const hfn = (i: number) => {
      const dx = Math.abs((i % this.w) - gx);
      const dy = Math.abs(((i / this.w) | 0) - gy);
      return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
    };
    const open = new MinHeap();
    g[start] = 0;
    open.push(start, hfn(start));
    let visited = 0;
    while (open.size > 0) {
      const cur = open.pop();
      if (closed[cur]) continue;
      if (cur === goal) break;
      closed[cur] = 1;
      if (++visited > maxNodes) return null;
      this.neighbours(cur, (nb, c) => {
        if (closed[nb]) return;
        const ng = g[cur] + c;
        if (ng < g[nb]) {
          g[nb] = ng;
          parent[nb] = cur;
          open.push(nb, ng + hfn(nb));
        }
      });
    }
    if (parent[goal] === -1) return null;
    const path: number[] = [];
    for (let c = goal; c !== start; c = parent[c]) path.push(c);
    return path.reverse();
  }

  /** Dijkstra desde varias fuentes. Útil para "mapas de peligro" y huidas. */
  dijkstra(sources: number[], maxDist = Infinity): DistField {
    const n = this.w * this.h;
    const dist = new Float32Array(n).fill(Infinity);
    const parent = new Int32Array(n).fill(-1);
    const open = new MinHeap();
    for (const s of sources) {
      if (!this.walkableIdx(s)) continue;
      dist[s] = 0;
      open.push(s, 0);
    }
    while (open.size > 0) {
      const cur = open.pop();
      const d = dist[cur];
      if (d > maxDist) continue;
      this.neighbours(cur, (nb, c) => {
        const nd = d + c;
        if (nd < dist[nb]) {
          dist[nb] = nd;
          parent[nb] = cur;
          open.push(nb, nd);
        }
      });
    }
    return { dist, parent };
  }

  /** Reconstruye el camino desde la fuente de un campo de Dijkstra hasta `target`. */
  pathFromField(field: DistField, target: number): number[] {
    const path: number[] = [];
    let c = target;
    let guard = 0;
    while (c !== -1 && field.dist[c] > 0 && guard++ < 5000) {
      path.push(c);
      c = field.parent[c];
    }
    return path.reverse();
  }

  /** Busca el tile caminable más cercano a un punto. */
  nearestWalkable(px: number, py: number): number {
    const i = this.tileOf(px, py);
    if (this.walkableIdx(i)) return i;
    let best = -1;
    let bd = Infinity;
    for (const p of this.passable) {
      const c = this.tileCenter(p);
      const d = (c.x - px) ** 2 + (c.y - py) ** 2;
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }
}
