/** ESCONDITE JAMONERO: los escondidos se transforman en objetos del mapa. */
import { BALANCE, HYPE, MODES } from '../balance';
import { wrapAngle } from '../sim/Char';
import type { SimChar } from '../sim/Char';
import type { Sim } from '../sim/Sim';
import type { Team } from '../sim/types';
import { kindsFor } from '../props';
import { BaseMode, ModeNet } from './types';

const M = MODES.escondite;

export class EsconditeMode extends BaseMode {
  readonly id = 'escondite' as const;
  readonly itemWeights = null;
  phase = 0;
  private hideTimer: number = M.hideSeconds;
  private hintTimer: number = M.hintEvery;

  setup(sim: Sim): void {
    sim.phase = 0;
    for (const c of sim.chars) {
      if (c.team === 'chaser') c.maxHp = c.hp = M.seekerHp;
    }
  }

  private hiders(sim: Sim): SimChar[] {
    return sim.chars.filter((c) => c.alive && c.team === 'escapist');
  }

  tick(sim: Sim, dt: number): void {
    for (const c of this.hiders(sim)) c.stats.timeSurvived += dt;
    if (this.phase === 0) {
      this.hideTimer -= dt;
      if (this.hideTimer <= 0) {
        this.phase = 1;
        sim.phase = 1;
        sim.emit({ t: 'seek' });
      }
      return;
    }
    // Pistas sonoras: cada 20 s (cada 10 s en el último tramo).
    this.hintTimer -= dt;
    if (this.hintTimer <= 0) {
      this.hintTimer = sim.timeLeft <= M.lateFrom ? M.hintEveryLate : M.hintEvery;
      for (const h of this.hiders(sim)) {
        sim.emit({ t: 'hint', id: h.id, x: Math.round(h.x), y: Math.round(h.y), s: Math.floor(sim.random() * 4) });
        sim.award(h.id, HYPE.coins.hintSurvived, false);
      }
    }
  }

  disguise(sim: Sim, c: SimChar): void {
    // El objeto más cercano: te conviertes en uno igual (y con el mismo giro).
    let best = -1;
    let bd = Infinity;
    sim.props.forEach((p, i) => {
      const d = Math.hypot(p.x - c.x, p.y - c.y);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    const kinds = kindsFor(sim.grid);
    let k: number;
    if (best >= 0 && bd <= M.disguiseRange && sim.props[best].k !== c.disguise) {
      k = sim.props[best].k;
      c.rot = sim.props[best].rot;
    } else if (c.disguise >= 0) {
      k = kinds[(kinds.indexOf(c.disguise) + 1) % kinds.length];
    } else {
      k = best >= 0 ? sim.props[best].k : kinds[Math.floor(sim.random() * kinds.length)];
    }
    c.disguise = k;
    c.dashTime = 0;
    sim.emit({ t: 'disguise', id: c.id, k });
  }

  rotate(_sim: Sim, c: SimChar): void {
    if (c.disguise >= 0) c.rot = (c.rot + 1) % 4;
  }

  canHit(a: SimChar, v: SimChar): boolean {
    return a.team === 'chaser' && v.team === 'escapist' && v.alive;
  }

  meleeDamage(): number {
    return M.hitDamage;
  }

  afterMelee(sim: Sim, a: SimChar, victims: SimChar[]): void {
    for (const v of victims) {
      if (v.disguise >= 0) {
        // ¡Encontrado! Sale del disfraz y tarda un poco en poder volver a esconderse.
        v.disguise = -1;
        v.specialCd = 4;
        a.stats.finds++;
        sim.award(a.id, HYPE.coins.find, true);
        sim.emit({ t: 'disguise', id: v.id, k: -1 });
      }
    }
    if (victims.length) return;
    // ¿Has golpeado un objeto de verdad? Te haces daño.
    const C = BALANCE.chaser;
    let hit = -1;
    sim.props.forEach((p, i) => {
      if (hit >= 0) return;
      const dx = p.x - a.x;
      const dy = p.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d > C.attackRange + 6) return;
      const ang = Math.abs(wrapAngle(Math.atan2(dy, dx) - Math.atan2(a.fy, a.fx)));
      if (d > 7 && ang > C.attackArc) return;
      hit = i;
    });
    if (hit < 0) return;
    a.hp = Math.max(0, a.hp - M.missPenalty);
    a.stats.misses++;
    sim.emit({ t: 'miss', id: a.id, pid: hit });
    if (a.hp <= 0) {
      // Mareado: se queda un rato quieto y recupera media vida.
      a.stun = 2.5;
      a.hp = Math.round(M.seekerHp / 2);
    }
  }

  onDowned(sim: Sim, v: SimChar, a: SimChar | null): void {
    v.knockOut(sim, a ? a.id : -1);
    if (a) sim.award(a.id, HYPE.coins.eliminate, true);
  }

  checkEnd(sim: Sim): void {
    if (this.hiders(sim).length === 0) sim.end('chaser');
    else if (sim.timeLeft <= 0) sim.end('escapist');
  }

  net(sim: Sim, out: ModeNet): void {
    out.ph = this.phase;
    out.pt = this.phase === 0 ? Math.max(0, Math.round(this.hideTimer * 10)) : 0;
    out.nh = Math.max(0, Math.ceil(this.hintTimer));
    out.n = this.hiders(sim).length;
    out.tot = sim.chars.filter((c) => c.team === 'escapist').length;
  }

  finish(sim: Sim, winner: Team): void {
    for (const c of sim.chars) {
      if (c.team === 'escapist' && c.alive && c.stats.hitsTaken === 0) sim.medal(c, 'CAMALEÓN');
      if (c.team === 'chaser' && c.stats.finds >= 2) sim.medal(c, 'OJO DE HALCÓN');
      if (c.team === 'chaser' && c.stats.finds >= 1 && c.stats.misses === 0) sim.medal(c, 'FRANCOTIRADOR');
    }
    void winner;
  }
}
