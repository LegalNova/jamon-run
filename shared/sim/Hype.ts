/**
 * DOPAMINA: monedas con combo, medallas, dos tiradas de la ruleta global,
 * una tirada personal por jugador (Q) y la carrera de caballos de cada partida.
 * Todo lo decide la simulación (en online, el servidor) y llega a los clientes como eventos.
 */
import { HYPE, MODES } from '../balance';
import type { SimChar } from './Char';
import type { Sim } from './Sim';
import type { SimEvent, Team } from './types';

interface Pending {
  at: number;
  kind: 'global' | 'me';
  id: number;
  r: number;
}

export class Hype {
  private combo = new Map<number, { t: number; n: number }>();
  private spinTimes: number[];
  private spinIdx = 0;
  private pending: Pending[] = [];
  /** Efecto global activo (turbo, cabezones, doble...) y segundos que le quedan. */
  effect = '';
  effectLeft = 0;
  private raceAt: number;
  private raceState = 0;
  private raceEndAt = 0;
  /** Caballo ganador de esta partida (al azar). */
  readonly horseWinner: number;
  private botSpinAt = new Map<number, number>();

  constructor(private sim: Sim) {
    const bomba = sim.mode === 'bomba';
    const minAt = sim.mode === 'escondite' ? MODES.escondite.hideSeconds + 4 : 6;
    this.spinTimes = bomba ? [...HYPE.bombaSpinsAt] : HYPE.globalSpinsAt.map((f) => Math.max(minAt, f * sim.duration));
    this.raceAt = bomba ? HYPE.bombaRaceAt : Math.max(minAt + 6, HYPE.raceAt * sim.duration);
    this.horseWinner = Math.floor(sim.random() * HYPE.horses.length);
    for (const c of sim.chars) {
      c.spinsLeft = HYPE.personalSpins;
      if (!c.human) this.botSpinAt.set(c.id, HYPE.personalFrom + sim.random() * 40);
    }
  }

  /** Da monedas. Con combo, si encadenas acciones rápido el premio se multiplica. */
  award(id: number, base: number, combo = true): number {
    const c = this.sim.byId.get(id);
    if (!c || base <= 0) return 0;
    let n = 1;
    if (combo) {
      const prev = this.combo.get(id);
      n = prev && this.sim.matchTime - prev.t < HYPE.comboWindow ? Math.min(HYPE.comboMax, prev.n + 1) : 1;
      this.combo.set(id, { t: this.sim.matchTime, n });
    }
    const amount = base * n * (this.effect === 'doble' ? 2 : 1);
    c.stats.coins += amount;
    this.sim.pushEvent({ t: 'coin', id, n: amount, c: n });
    return amount;
  }

  /** Monedas por lo que pasa en la partida. */
  onEvent(e: SimEvent): void {
    const C = HYPE.coins;
    switch (e.t) {
      case 'hit':
        if (e.a >= 0) this.award(e.a, C.hit);
        break;
      case 'trap':
        if (e.a >= 0) this.award(e.a, C.trap);
        break;
      case 'rescue':
        this.award(e.by, C.rescue);
        break;
      case 'dodge':
        this.award(e.v, C.dodge);
        break;
      case 'block':
        this.award(e.v, C.block);
        break;
      case 'pickup':
        this.award(e.id, e.type === 'coin' ? HYPE.coinValue : C.item);
        break;
      case 'infect':
        if (e.a >= 0) this.award(e.a, C.infect);
        break;
      case 'pass':
        this.award(e.from, C.pass);
        break;
    }
  }

  tick(dt: number): void {
    const sim = this.sim;
    const t = sim.matchTime;
    // Ruleta global: dos tiradas por partida.
    if (this.spinIdx < this.spinTimes.length && t >= this.spinTimes[this.spinIdx]) {
      this.spinIdx++;
      const r = Math.floor(sim.random() * HYPE.globalWheel.length);
      this.pending.push({ at: t + HYPE.spinDelay, kind: 'global', id: -1, r });
      sim.pushEvent({ t: 'roulette', kind: 'global', id: -1, r });
    }
    // Los bots también tiran de la ruleta personal.
    for (const [id, at] of this.botSpinAt) {
      if (t >= at) {
        this.botSpinAt.delete(id);
        this.spin(id);
      }
    }
    // Premios que se aplican cuando la ruleta para de girar.
    for (const p of this.pending) if (t >= p.at) this.apply(p);
    this.pending = this.pending.filter((p) => t < p.at);

    if (this.effectLeft > 0) {
      this.effectLeft -= dt;
      if (this.effectLeft <= 0) {
        sim.pushEvent({ t: 'effect', e: this.effect, on: false, id: -1 });
        this.effect = '';
      }
    }

    // Carrera de caballos.
    if (this.raceState === 0 && t >= this.raceAt) {
      this.raceState = 1;
      this.raceEndAt = t + HYPE.raceSeconds;
      sim.pushEvent({ t: 'race', w: this.horseWinner });
    } else if (this.raceState === 1 && t >= this.raceEndAt) {
      this.raceState = 2;
      sim.pushEvent({ t: 'raceEnd', w: this.horseWinner });
      for (const c of sim.chars) {
        if (c.horse !== this.horseWinner) continue;
        this.award(c.id, HYPE.coins.horse, false);
        this.medal(c, 'SUERTUDO', false);
      }
    }
  }

  /** Tirada personal (tecla Q). */
  spin(id: number): boolean {
    const sim = this.sim;
    const c = sim.byId.get(id);
    if (!c || !c.alive || c.spinsLeft <= 0 || sim.state !== 'play' || sim.matchTime < HYPE.personalFrom) return false;
    if (this.pending.some((p) => p.kind === 'me' && p.id === id)) return false;
    c.spinsLeft--;
    const w = HYPE.personalWeights;
    let x = sim.random() * w.reduce((a, b) => a + b, 0);
    let r = 0;
    while (r < w.length - 1 && (x -= w[r]) >= 0) r++;
    this.pending.push({ at: sim.matchTime + HYPE.spinDelay, kind: 'me', id, r });
    sim.pushEvent({ t: 'roulette', kind: 'me', id, r });
    if (c.sayCd <= 0 && sim.random() < 0.6) sim.say(id, 29);
    return true;
  }

  private apply(p: Pending): void {
    const sim = this.sim;
    if (p.kind === 'global') {
      const e = HYPE.globalWheel[p.r];
      if (this.effect) sim.pushEvent({ t: 'effect', e: this.effect, on: false, id: -1 });
      this.effect = '';
      this.effectLeft = 0;
      if (e === 'turbo' || e === 'cabezones' || e === 'doble') {
        this.effect = e;
        this.effectLeft = HYPE.effectSeconds;
      } else if (e === 'lluvia') {
        sim.coinRain(HYPE.rainCoins);
      } else if (e === 'cambiazo') {
        sim.shufflePositions();
      } else if (e === 'escudos') {
        for (const c of sim.chars) if (c.alive && c.trapped <= 0 && !sim.isHunter(c)) c.shield = true;
      }
      sim.pushEvent({ t: 'effect', e, on: true, id: -1 });
      return;
    }
    const c = sim.byId.get(p.id);
    if (!c || !c.alive) return;
    const prize = HYPE.personalWheel[p.r];
    switch (prize) {
      case 'botas':
        c.bootTime = 8;
        break;
      case 'escudo':
        c.shield = true;
        break;
      case 'monedas':
        this.award(c.id, HYPE.coins.roulette, false);
        break;
      case 'dash':
        c.dashFree = 8;
        break;
      case 'invisible':
        c.invisible = 6;
        break;
      case 'jackpot':
        this.award(c.id, HYPE.coins.jackpot, false);
        this.medal(c, 'JACKPOT', false);
        break;
    }
    sim.pushEvent({ t: 'effect', e: prize, on: true, id: c.id });
  }

  medal(c: SimChar, m: string, bonus = true): void {
    if (c.stats.medals.includes(m)) return;
    c.stats.medals.push(m);
    this.sim.pushEvent({ t: 'medal', id: c.id, m });
    if (bonus) this.award(c.id, HYPE.medalBonus, false);
  }

  /** Al acabar: monedas para los ganadores y medallas. */
  finish(winner: Team): void {
    const sim = this.sim;
    for (const c of sim.chars) {
      const won = sim.mode === 'bomba' ? c.id === sim.champion : c.team === winner;
      if (won) this.award(c.id, HYPE.coins.win, false);
    }
    sim.modeImpl.finish(sim, winner);
    let mvp: SimChar | null = null;
    for (const c of sim.chars) if (!mvp || c.stats.coins > mvp.stats.coins) mvp = c;
    if (mvp && mvp.stats.coins > 0) this.medal(mvp, 'MVP');
  }
}
