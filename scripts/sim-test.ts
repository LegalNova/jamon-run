// Partidas de bots sin pantalla en todos los modos: ganadores, duración, monedas y rendimiento.
import { MAPS, MapId, mapAllowed } from '../shared/maps';
import { scaleFor } from '../shared/mapScale';
import { defaultHunters } from '../shared/modes/rules';
import { Sim } from '../shared/sim/Sim';
import type { ModeId, RosterEntry, SimEvent } from '../shared/sim/types';
import { randomLook } from '../shared/look';

const argv = (globalThis as unknown as { process: { argv: string[] } }).process.argv;
const N = Number(argv[2] ?? 4);
const PLAYERS = Number(argv[3] ?? 10);
const modes: ModeId[] = ['pilla', 'infeccion', 'bomba', 'escondite'];
for (const mode of modes) {
  const maps = MAPS.filter((m) => mapAllowed(m, mode) && (mode === 'bomba' ? m.arena || m.city : !m.arena)).map((m) => m.id as MapId);
  const res: string[] = [];
  let ms = 0;
  let steps = 0;
  const evCount: Record<string, number> = {};
  for (let k = 0; k < N; k++) {
    const mapId = maps[k % maps.length];
    const hunters = defaultHunters(mode, PLAYERS);
    const roster: RosterEntry[] = [];
    for (let i = 0; i < PLAYERS; i++) roster.push({ id: i, name: 'B' + i, team: i < hunters ? 'chaser' : 'escapist', look: randomLook('B' + i), human: false });
    const sim = new Sim({ mode, mapId, scale: scaleFor(PLAYERS, mapId), duration: mode === 'pilla' ? 120 : mode === 'infeccion' ? 150 : 180, difficulty: 'normal', roster });
    let guard = 0;
    while (sim.state !== 'ended' && guard++ < 60 * 700) {
      const t0 = performance.now();
      sim.step(1 / 60);
      ms += performance.now() - t0;
      steps++;
      for (const e of sim.drain() as SimEvent[]) evCount[e.t] = (evCount[e.t] ?? 0) + 1;
    }
    const coins = sim.chars.reduce((a, c) => a + c.stats.coins, 0);
    const medals = sim.chars.reduce((a, c) => a + c.stats.medals.length, 0);
    res.push(`${mapId}:${sim.winner}${sim.champion >= 0 ? '#' + sim.champion : ''}@${sim.matchTime.toFixed(0)}s c${coins} m${medals}`);
  }
  console.log(`\n== ${mode} (${PLAYERS} jugadores) ${(ms / steps).toFixed(3)} ms/paso`);
  console.log(res.join('\n'));
  console.log(Object.entries(evCount).filter(([k]) => !['say', 'coin', 'swing', 'dash'].includes(k)).map(([k, v]) => `${k}:${v}`).join(' '));
}
