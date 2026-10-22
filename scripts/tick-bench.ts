// Coste de un tick del servidor (3 pasos de simulación + snapshot en JSON para cada jugador),
// medido en Node: dentro de Cloudflare el reloj no avanza durante la ejecución y no se puede medir ahí.
//   npm run bench:tick -- 17   (jugadores por sala)
import { randomLook } from '../shared/look';
import { scaleFor } from '../shared/mapScale';
import { compactEvent, encodeChar } from '../shared/protocol';
import { Sim } from '../shared/sim/Sim';
import type { RosterEntry } from '../shared/sim/types';

const argv = (globalThis as unknown as { process: { argv: string[] } }).process.argv;
const N = Number(argv[2] ?? 17);
const TICKS = 20 * 120;
const roster: RosterEntry[] = [];
for (let i = 0; i < N; i++) roster.push({ id: i, name: 'P' + i, team: i < Math.ceil(N / 4) ? 'chaser' : 'escapist', look: randomLook('P' + i), human: false });
const sim = new Sim({ mode: 'pilla', mapId: 'barcelona', scale: scaleFor(N, 'barcelona'), duration: 300, difficulty: 'normal', roster, paron: 'no' });
const times: number[] = [];
let bytes = 0;
for (let t = 0; t < TICKS && sim.state !== 'ended'; t++) {
  const t0 = performance.now();
  for (let k = 0; k < 3; k++) sim.step(1 / 60);
  const snap = JSON.stringify({ n: t, c: sim.chars.map(encodeChar), ms: sim.modeNet(), e: sim.drain().map(compactEvent) });
  for (let i = 0; i < N; i++) bytes += snap.length + 60;
  times.push(performance.now() - t0);
}
times.sort((a, b) => a - b);
const pct = (p: number) => times[Math.min(times.length - 1, Math.floor((times.length - 1) * p))].toFixed(2);
console.log(`${N} jugadores · ${times.length} ticks · ms/tick p50 ${pct(0.5)} · p95 ${pct(0.95)} · max ${pct(1)} · salida ${Math.round(bytes / times.length / 1024 * 20)} KB/s por sala`);
