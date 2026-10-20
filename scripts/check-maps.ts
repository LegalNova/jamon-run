// Valida los mapas: tamaño, conectividad, salidas y objetos.
import { MAPS } from '../shared/maps';
import { Grid } from '../shared/grid';

let ok = true;
for (const m of MAPS) {
  const w = m.rows[0].length;
  m.rows.forEach((r, y) => {
    if (r.length !== w) {
      ok = false;
      console.log(`[${m.id}] fila ${y} mide ${r.length} (esperado ${w})`);
    }
  });
  const g = new Grid(m.rows);
  const start = g.chaserSpawns[0] ?? g.passable[0];
  const f = g.dijkstra([start]);
  const unreachable = g.passable.filter((i) => !Number.isFinite(f.dist[i]));
  if (unreachable.length) {
    ok = false;
    console.log(`[${m.id}] ${unreachable.length} tiles inalcanzables:`, unreachable.map((i) => `(${i % g.w},${(i / g.w) | 0})`).join(' '));
  }
  // Cabañas deben ser rectángulos
  console.log(`[${m.id}] ${w}x${m.rows.length} libres=${g.passable.length} X=${g.chaserSpawns.length} E=${g.escapistSpawns.length} o=${g.itemSpawns.length}`);
}
console.log(ok ? 'MAPAS OK' : 'MAPAS CON ERRORES');
if (!ok) (globalThis as unknown as { process: { exit(n: number): void } }).process.exit(1);

// Los mapas escalados (más jugadores) también deben estar conectados.
import { buildRows } from '../shared/mapScale';
for (const m of MAPS) {
  for (const sc of [{ sx: 2, sy: 1 }, { sx: 2, sy: 2 }]) {
    const g = new Grid(buildRows(m.id, sc));
    const f = g.dijkstra([g.chaserSpawns[0]]);
    const bad = g.passable.filter((i) => !Number.isFinite(f.dist[i])).length;
    console.log(`[${m.id} ${sc.sx}x${sc.sy}] ${g.w}x${g.h} libres=${g.passable.length} X=${g.chaserSpawns.length} inalcanzables=${bad}`);
    if (bad) (globalThis as unknown as { process: { exit(n: number): void } }).process.exit(1);
  }
}
