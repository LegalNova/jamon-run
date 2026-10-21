// Juega todos los minijuegos solo con bots, sin pantalla: que acaben y den resultados.
import { MINIGAMES, Paron } from '../shared/minigames';
import { secureRandom } from '../shared/minigames/rng';

const players = Array.from({ length: 12 }, (_, i) => ({ id: i, name: 'B' + i, team: (i % 3 ? 'escapist' : 'chaser') as 'chaser' | 'escapist', bot: true }));
const extra = { rouletteHistory: [] as string[] };
for (const def of MINIGAMES) {
  const p = new Paron(players, secureRandom, { forced: def.id, extra });
  let t = 0;
  let bytes = 0;
  let n = 0;
  while (!p.done && t < 120) {
    p.tick(1 / 20);
    t += 1 / 20;
    bytes += JSON.stringify(p.net()).length;
    n++;
  }
  const top = p.results.slice(0, 3).map((r) => `${r.id}:${r.label}${r.bonus ? ` +${r.bonus}` : ''}`).join(' | ');
  console.log(`${def.id.padEnd(9)} total ${t.toFixed(1)}s juego ${p.game.duration.toFixed(1)}s · ganadores ${p.results.filter((r) => r.won).length} · ${(bytes / n / 1024).toFixed(2)} KB/tick · ${top} · ventajas ${[...p.chosenPerks().values()].join(',')}`);
}
