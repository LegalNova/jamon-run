import { TILE } from './balance';
import type { Grid } from './grid';

export interface Vec {
  x: number;
  y: number;
}

/**
 * Resuelve la colisión de un círculo contra los tiles sólidos.
 * Al empujar según el punto más cercano de cada tile, el círculo
 * "resbala" por las esquinas en lugar de quedarse enganchado.
 */
export function resolveCircle(grid: Grid, p: Vec, r: number): { hitX: boolean; hitY: boolean } {
  let hitX = false;
  let hitY = false;
  for (let iter = 0; iter < 4; iter++) {
    let moved = false;
    const tx0 = Math.floor((p.x - r) / TILE);
    const tx1 = Math.floor((p.x + r) / TILE);
    const ty0 = Math.floor((p.y - r) / TILE);
    const ty1 = Math.floor((p.y + r) / TILE);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (grid.walkable(tx, ty)) continue;
        const left = tx * TILE;
        const top = ty * TILE;
        const cx = Math.max(left, Math.min(p.x, left + TILE));
        const cy = Math.max(top, Math.min(p.y, top + TILE));
        const dx = p.x - cx;
        const dy = p.y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 >= r * r) continue;
        if (d2 > 0.0001) {
          const d = Math.sqrt(d2);
          const push = r - d + 0.01;
          p.x += (dx / d) * push;
          p.y += (dy / d) * push;
          if (Math.abs(dx) > Math.abs(dy)) hitX = true;
          else hitY = true;
        } else {
          // Centro dentro del tile: sacarlo por el lado más cercano.
          const dl = p.x - left;
          const dr = left + TILE - p.x;
          const dt = p.y - top;
          const db = top + TILE - p.y;
          const m = Math.min(dl, dr, dt, db);
          if (m === dl) p.x = left - r;
          else if (m === dr) p.x = left + TILE + r;
          else if (m === dt) p.y = top - r;
          else p.y = top + TILE + r;
          hitX = hitX || m === dl || m === dr;
          hitY = hitY || m === dt || m === db;
        }
        moved = true;
      }
    }
    if (!moved) break;
  }
  return { hitX, hitY };
}

/** Mueve un círculo en sub-pasos para no atravesar paredes a alta velocidad. */
export function moveCircle(grid: Grid, p: Vec, dx: number, dy: number, r: number): { hitX: boolean; hitY: boolean } {
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(dist / 3));
  let hitX = false;
  let hitY = false;
  for (let i = 0; i < steps; i++) {
    p.x += dx / steps;
    p.y += dy / steps;
    const h = resolveCircle(grid, p, r);
    hitX = hitX || h.hitX;
    hitY = hitY || h.hitY;
  }
  return { hitX, hitY };
}

export function clampToMap(grid: Grid, p: Vec, margin = 8): void {
  p.x = Math.max(margin, Math.min(grid.w * TILE - margin, p.x));
  p.y = Math.max(margin, Math.min(grid.h * TILE - margin, p.y));
}
