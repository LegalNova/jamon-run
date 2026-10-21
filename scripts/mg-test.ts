// Juega todos los minijuegos y eventos solo con bots, sin pantalla: que acaben y den resultados.
import { EVENTS, MgBag, MgId, MINIGAMES, Paron, ParonKind } from '../shared/minigames';
import { secureRandom } from '../shared/minigames/rng';
import { buildSchedule } from '../shared/sim/Sim';

const players = Array.from({ length: 12 }, (_, i) => ({ id: i, name: 'B' + i, team: (i % 3 ? 'escapist' : 'chaser') as 'chaser' | 'escapist', bot: true }));
const extra = { rouletteHistory: [] as string[] };
const run = (kind: ParonKind, queue?: MgId[]) => {
  const p = new Paron(players, secureRandom, { kind, queue, extra });
  let t = 0;
  let bytes = 0;
  let n = 0;
  while (!p.done && t < 120) {
    p.tick(1 / 20);
    t += 1 / 20;
    bytes += JSON.stringify(p.net()).length;
    n++;
  }
  const top = p.results.slice(0, 2).map((r) => `${r.id}:${r.label}`).join(' | ');
  console.log(`${kind.padEnd(7)} ${(queue ?? []).join('+').padEnd(15)} total ${t.toFixed(1)}s · ${(bytes / n / 1024).toFixed(2)} KB/tick · ${top}`);
};
for (const def of MINIGAMES) run('mini', [def.id]);
run('mini', ['corta', 'atrapa']);
run('ruleta');
run('carrera');
void EVENTS;
// bolsa: 3 partidas de 3 parones sin repetir dentro de cada una
const bag = new MgBag(secureRandom);
for (let m = 0; m < 3; m++) {
  const used = new Set<MgId>();
  console.log('partida', m + 1, [0, 1, 2].map(() => bag.draw(1, used)[0]).join(', '));
}
for (const [mode, d, lvl] of [['pilla', 60, 'normal'], ['pilla', 120, 'normal'], ['infeccion', 150, 'normal'], ['escondite', 180, 'muchos'], ['bomba', 600, 'normal'], ['pilla', 120, 'pocos']] as const)
  console.log(mode, d, lvl, JSON.stringify(buildSchedule(mode, d, lvl, Math.random)));
