import type { Grid } from '../../shared/grid';
import type { MapId } from '../../shared/maps';
import type { MapScale } from '../../shared/mapScale';
import type { ModeNet } from '../../shared/modes/types';
import type { Prop } from '../../shared/props';
import type { SimChar } from '../../shared/sim/Char';
import { Sim } from '../../shared/sim/Sim';
import type { HeldInput, MatchState, ModeId, PickupType, RosterEntry, SimEvent, Team } from '../../shared/sim/types';
import type { Difficulty } from '../config/balance';

export interface PickupLike {
  iid: number;
  type: PickupType;
  x: number;
  y: number;
  life: number;
  dead: boolean;
}
export interface ProjectileLike {
  pid: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  travelled: number;
}
export interface SmokeLike {
  sid: number;
  x: number;
  y: number;
  life: number;
  radius: number;
}

/** Lo que la escena de juego y el HUD leen, venga de una simulación local o de la red. */
export interface GameModel {
  readonly online: boolean;
  readonly mode: ModeId;
  readonly mapId: MapId;
  /** Objetos del mapa (Escondite). */
  readonly props: Prop[];
  readonly scale: MapScale;
  readonly grid: Grid;
  readonly chars: SimChar[];
  readonly pickups: PickupLike[];
  readonly projectiles: ProjectileLike[];
  readonly smokes: SmokeLike[];
  readonly state: MatchState;
  readonly timeLeft: number;
  readonly matchTime: number;
  readonly duration: number;
  readonly winner: Team | null;
  readonly playerId: number;
  /** Ganador individual (Jamón Bomba / Leyenda). */
  readonly champion: number;
  /** Estado del modo para el HUD. */
  modeNet(): ModeNet;
  player(): SimChar;
  /** Avanza el modelo y devuelve los eventos ocurridos. */
  update(dt: number): SimEvent[];
  setHeld(h: HeldInput): void;
  press(what: 'action' | 'special' | 'rotate' | 'spin'): void;
  say(phrase: number): void;
  emote(): void;
  destroy(): void;
}

/** Partida contra bots en el propio navegador. */
export class OfflineModel implements GameModel {
  readonly online = false;
  readonly sim: Sim;

  constructor(
    o: { mode: ModeId; mapId: MapId; scale: MapScale; duration: number; difficulty: Difficulty; roster: RosterEntry[] },
    readonly playerId: number,
  ) {
    this.sim = new Sim(o);
  }

  get mapId() {
    return this.sim.mapId;
  }
  get mode() {
    return this.sim.mode;
  }
  get props() {
    return this.sim.props;
  }
  get champion() {
    return this.sim.champion;
  }
  modeNet(): ModeNet {
    return this.sim.modeNet();
  }
  get scale() {
    return this.sim.scale;
  }
  get grid() {
    return this.sim.grid;
  }
  get chars() {
    return this.sim.chars;
  }
  get pickups() {
    return this.sim.pickups;
  }
  get projectiles() {
    return this.sim.projectiles;
  }
  get smokes() {
    return this.sim.smokes;
  }
  get state() {
    return this.sim.state;
  }
  get timeLeft() {
    return this.sim.timeLeft;
  }
  get matchTime() {
    return this.sim.matchTime;
  }
  get duration() {
    return this.sim.duration;
  }
  get winner() {
    return this.sim.winner;
  }

  player(): SimChar {
    return this.sim.byId.get(this.playerId)!;
  }

  update(dt: number): SimEvent[] {
    this.sim.step(dt);
    return this.sim.drain();
  }

  setHeld(h: HeldInput): void {
    this.sim.setHeld(this.playerId, h);
  }

  press(what: 'action' | 'special' | 'rotate' | 'spin'): void {
    this.sim.press(this.playerId, what);
  }

  say(phrase: number): void {
    this.sim.say(this.playerId, phrase);
  }

  emote(): void {
    this.sim.emote(this.playerId);
  }

  destroy(): void {
    /* nada que liberar */
  }
}
