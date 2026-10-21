/**
 * LONCHAS: la moneda del juego (solo virtual: no se compra con dinero real ni se cambia por nada).
 * Configuración y lógica pura del perfil: recompensas, nivel, misiones diarias, tienda y cosméticos.
 * La aplica el servidor (Durable Object de cada jugador); el cliente solo la usa para mostrarla.
 */
import { levelFor } from './balance';
import type { ModeId } from './sim/types';

export const ECONOMY = {
  /** Regalo diario: base + extra por cada día seguido (hasta maxStreak). */
  daily: { base: 80, perStreakDay: 20, maxStreak: 7 },
  /** Si te quedas a 0, te regalamos esto (una vez al día). */
  rescue: 60,
  /** Partida: las monedas ganadas en la partida pasan a lonchas a este ritmo, más fijos por jugar y ganar. */
  match: { coinRate: 0.5, play: 20, win: 40, cap: 400 },
  /** Minijuegos: lonchas por puesto (1º, 2º, 3º, resto). */
  minigame: { place: [70, 40, 25, 10], xp: [40, 25, 15, 8], bonusCap: 150 },
  /** Multiplicador por racha de minijuegos ganados seguidos. */
  streakMult: [1, 1, 1.2, 1.5, 2],
  /** Experiencia por partida. */
  xp: { play: 30, win: 50, perCoin: 0.25 },
  /** Partidas sin servidor (offline): no se pueden verificar del todo, así que tienen topes. */
  offline: { matchCap: 150, minigameCap: 60, dailyCap: 1000, minMatchGap: 40_000, minMinigameGap: 8_000, coinsCap: 400 },
  /** Si al subir de nivel ya tienes todos los regalos, te damos lonchas. */
  levelBonus: 150,
  missionsPerDay: 3,
} as const;

// ------------------------------------------------------------------ cosméticos

export type CosCat = 'hat' | 'trail' | 'hit' | 'frame' | 'emote' | 'dance';

export interface CosItem {
  id: string;
  cat: CosCat;
  name: string;
  price: number;
  /** Color principal (para iconos y partículas). */
  color: number;
}

export const COS_CATS: { id: CosCat; name: string }[] = [
  { id: 'hat', name: 'GORROS' },
  { id: 'trail', name: 'RASTROS' },
  { id: 'hit', name: 'GOLPES' },
  { id: 'frame', name: 'MARCOS' },
  { id: 'emote', name: 'EMOTES' },
  { id: 'dance', name: 'BAILES' },
];

export const COSMETICS: CosItem[] = [
  // gorros (se dibujan encima de la cabeza)
  { id: 'hat_chef', cat: 'hat', name: 'GORRO DE CHEF', price: 300, color: 0xf4f0e8 },
  { id: 'hat_montera', cat: 'hat', name: 'MONTERA', price: 450, color: 0x262033 },
  { id: 'hat_pirata', cat: 'hat', name: 'PIRATA', price: 500, color: 0x3a3446 },
  { id: 'hat_cuernos', cat: 'hat', name: 'CUERNOS', price: 600, color: 0xe43b44 },
  { id: 'hat_aureola', cat: 'hat', name: 'AUREOLA', price: 800, color: 0xfee761 },
  { id: 'hat_corona', cat: 'hat', name: 'CORONA IBÉRICA', price: 1500, color: 0xffd23f },
  { id: 'hat_helice', cat: 'hat', name: 'GORRA HÉLICE', price: 700, color: 0x2f88e8 },
  { id: 'hat_loncha', cat: 'hat', name: 'LONCHA EN LA CABEZA', price: 350, color: 0xc2414b },
  // rastros al correr
  { id: 'trail_stars', cat: 'trail', name: 'ESTRELLAS', price: 400, color: 0xfee761 },
  { id: 'trail_fire', cat: 'trail', name: 'FUEGO', price: 700, color: 0xfeae34 },
  { id: 'trail_hearts', cat: 'trail', name: 'CORAZONES', price: 500, color: 0xff7ab8 },
  { id: 'trail_lonchas', cat: 'trail', name: 'LONCHAS', price: 600, color: 0xc2414b },
  { id: 'trail_rainbow', cat: 'trail', name: 'ARCOÍRIS', price: 1200, color: 0x7cc8ff },
  { id: 'trail_bubbles', cat: 'trail', name: 'BURBUJAS', price: 450, color: 0x9ae6ff },
  // efectos de golpe
  { id: 'hit_confeti', cat: 'hit', name: 'CONFETI', price: 400, color: 0xff7ab8 },
  { id: 'hit_rayo', cat: 'hit', name: 'RAYOS', price: 700, color: 0xfee761 },
  { id: 'hit_lonchas', cat: 'hit', name: 'LLUVIA DE LONCHAS', price: 600, color: 0xc2414b },
  { id: 'hit_corazones', cat: 'hit', name: 'CORAZONES', price: 500, color: 0xe43b44 },
  { id: 'hit_pixel', cat: 'hit', name: 'PÍXELES', price: 900, color: 0x63c74d },
  // marcos del nombre
  { id: 'frame_oro', cat: 'frame', name: 'ORO', price: 600, color: 0xffd23f },
  { id: 'frame_fuego', cat: 'frame', name: 'FUEGO', price: 800, color: 0xfeae34 },
  { id: 'frame_neon', cat: 'frame', name: 'NEÓN', price: 700, color: 0x7cf6ff },
  { id: 'frame_arcoiris', cat: 'frame', name: 'ARCOÍRIS', price: 1300, color: 0xff7ab8 },
  { id: 'frame_jamon', cat: 'frame', name: 'JAMONERO', price: 500, color: 0xc2414b },
  // emotes (tecla G en partida)
  { id: 'emote_jamon', cat: 'emote', name: 'JAMÓN', price: 0, color: 0xc2414b },
  { id: 'emote_risa', cat: 'emote', name: 'RISA', price: 250, color: 0xfee761 },
  { id: 'emote_fuego', cat: 'emote', name: 'FUEGO', price: 300, color: 0xfeae34 },
  { id: 'emote_corazon', cat: 'emote', name: 'CORAZÓN', price: 300, color: 0xff7ab8 },
  { id: 'emote_llorar', cat: 'emote', name: 'LLORAR', price: 300, color: 0x7cc8ff },
  { id: 'emote_gafas', cat: 'emote', name: 'GAFAS DE SOL', price: 450, color: 0x262033 },
  // bailes de victoria
  { id: 'dance_salto', cat: 'dance', name: 'SALTITOS', price: 0, color: 0x63c74d },
  { id: 'dance_giro', cat: 'dance', name: 'PEONZA', price: 400, color: 0x7cc8ff },
  { id: 'dance_gusano', cat: 'dance', name: 'GUSANITO', price: 500, color: 0xfee761 },
  { id: 'dance_robot', cat: 'dance', name: 'ROBOT', price: 600, color: 0x8b9bb4 },
  { id: 'dance_moon', cat: 'dance', name: 'MOONWALK', price: 900, color: 0xb55088 },
  { id: 'dance_heli', cat: 'dance', name: 'HELICÓPTERO', price: 1100, color: 0xfeae34 },
];

export const FREE_ITEMS = ['emote_jamon', 'dance_salto'];

/** Regalo al subir de nivel (en orden; si ya lo tienes, el siguiente). */
export const LEVEL_REWARDS = [
  'hat_loncha',
  'trail_stars',
  'frame_jamon',
  'emote_risa',
  'hit_confeti',
  'dance_giro',
  'hat_chef',
  'trail_bubbles',
  'emote_fuego',
  'frame_oro',
  'hit_corazones',
  'dance_gusano',
  'hat_montera',
  'trail_hearts',
  'emote_corazon',
];

export function cosItem(id: string | undefined): CosItem | undefined {
  return id ? COSMETICS.find((c) => c.id === id) : undefined;
}

/** Lo que llevas puesto (lo ven los demás online). */
export type Equipped = Partial<Record<CosCat, string>>;

// ------------------------------------------------------------------ misiones

export type StatKey =
  | 'matches'
  | 'wins'
  | 'mgWins'
  | 'mgPlayed'
  | 'passes'
  | 'survive'
  | 'infections'
  | 'finds'
  | 'rescues'
  | 'hits'
  | 'perfects'
  | 'earned';

export interface MissionDef {
  id: string;
  text: string;
  goal: number;
  stat: StatKey;
  reward: number;
}

export const MISSIONS: MissionDef[] = [
  { id: 'mg2', text: 'GANA 2 MINIJUEGOS', goal: 2, stat: 'mgWins', reward: 120 },
  { id: 'mg4', text: 'JUEGA 4 MINIJUEGOS', goal: 4, stat: 'mgPlayed', reward: 80 },
  { id: 'pass5', text: 'PASA EL JAMÓN BOMBA 5 VECES', goal: 5, stat: 'passes', reward: 100 },
  { id: 'surv60', text: 'SOBREVIVE 60 S', goal: 60, stat: 'survive', reward: 80 },
  { id: 'play3', text: 'JUEGA 3 PARTIDAS', goal: 3, stat: 'matches', reward: 100 },
  { id: 'win1', text: 'GANA UNA PARTIDA', goal: 1, stat: 'wins', reward: 120 },
  { id: 'inf3', text: 'INFECTA A 3 SUPERVIVIENTES', goal: 3, stat: 'infections', reward: 100 },
  { id: 'find2', text: 'ENCUENTRA 2 ESCONDIDOS', goal: 2, stat: 'finds', reward: 100 },
  { id: 'resc2', text: 'RESCATA A 2 COMPAÑEROS', goal: 2, stat: 'rescues', reward: 100 },
  { id: 'hits10', text: 'DA 10 JAMONAZOS', goal: 10, stat: 'hits', reward: 80 },
  { id: 'perf3', text: 'CORTA 3 LONCHAS PERFECTAS', goal: 3, stat: 'perfects', reward: 120 },
  { id: 'earn300', text: 'GANA 300 LONCHAS JUGANDO', goal: 300, stat: 'earned', reward: 100 },
];

export interface MissionState {
  id: string;
  progress: number;
  done: boolean;
  claimed: boolean;
}

// ------------------------------------------------------------------ perfil

export interface ModeRecord {
  games: number;
  wins: number;
  coins: number;
  best: number;
}

export interface Profile {
  v: 1;
  lonchas: number;
  xp: number;
  owned: string[];
  equipped: Equipped;
  daily: { last: string; streak: number };
  missions: { day: string; list: MissionState[] };
  records: Partial<Record<ModeId, ModeRecord>>;
  mgRecords: Record<string, { played: number; wins: number }>;
  /** Minijuegos ganados seguidos (multiplica las lonchas). */
  mgStreak: number;
  medals: Record<string, number>;
  offline: { day: string; earned: number; lastAt: number };
  rescueDay: string;
  totals: Partial<Record<StatKey, number>>;
}

export function newProfile(): Profile {
  return {
    v: 1,
    lonchas: 150,
    xp: 0,
    owned: [...FREE_ITEMS],
    equipped: { emote: 'emote_jamon', dance: 'dance_salto' },
    daily: { last: '', streak: 0 },
    missions: { day: '', list: [] },
    records: {},
    mgRecords: {},
    mgStreak: 0,
    medals: {},
    offline: { day: '', earned: 0, lastAt: 0 },
    rescueDay: '',
    totals: {},
  };
}

/** Día (UTC) como texto: las misiones y el regalo cambian cada día. */
export function today(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Misiones del día (las mismas todo el día para cada jugador). */
export function dailyMissions(seed: string, day: string): MissionState[] {
  const pool = [...MISSIONS];
  let h = hash(seed + day);
  const out: MissionState[] = [];
  while (out.length < ECONOMY.missionsPerDay && pool.length) {
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    const m = pool.splice(h % pool.length, 1)[0];
    out.push({ id: m.id, progress: 0, done: false, claimed: false });
  }
  return out;
}

/** Lo que un jugador ha hecho en una partida o minijuego (lo calcula el servidor online). */
export interface PlayReport {
  kind: 'match' | 'minigame';
  mode?: ModeId;
  mg?: string;
  won: boolean;
  /** Monedas de la partida (Pilla, Infección...). */
  coins?: number;
  /** Puesto en el minijuego (0 = primero). */
  place?: number;
  medals?: string[];
  stats?: Partial<Record<StatKey, number>>;
}

/** Notificaciones que el cliente enseña después (lonchas, misiones, niveles, regalos). */
export type Notice =
  | { k: 'lonchas'; n: number; why: string }
  | { k: 'xp'; n: number }
  | { k: 'level'; level: number; item?: string; bonus?: number }
  | { k: 'mission'; id: string }
  | { k: 'streak'; n: number; mult: number }
  | { k: 'rescue'; n: number };

export interface ApplyResult {
  lonchas: number;
  xp: number;
  notices: Notice[];
}

/** Mantiene el perfil al día (misiones nuevas cada día). */
export function refresh(p: Profile, seed: string, now = Date.now()): void {
  const d = today(now);
  if (p.missions.day !== d) p.missions = { day: d, list: dailyMissions(seed, d) };
  for (const id of FREE_ITEMS) if (!p.owned.includes(id)) p.owned.push(id);
}

function grantRescue(p: Profile, notices: Notice[], now: number): void {
  if (p.lonchas <= 0) {
    p.lonchas = 0;
    const d = today(now);
    if (p.rescueDay !== d) {
      p.rescueDay = d;
      p.lonchas += ECONOMY.rescue;
      notices.push({ k: 'rescue', n: ECONOMY.rescue });
    }
  }
}

/** Suma experiencia y reparte los regalos de nivel. */
export function addXp(p: Profile, xp: number, notices: Notice[]): void {
  const before = levelFor(p.xp).level;
  p.xp += Math.max(0, Math.round(xp));
  const after = levelFor(p.xp).level;
  for (let lv = before + 1; lv <= after; lv++) {
    const item = LEVEL_REWARDS.find((id) => !p.owned.includes(id));
    if (item) {
      p.owned.push(item);
      notices.push({ k: 'level', level: lv, item });
    } else {
      p.lonchas += ECONOMY.levelBonus;
      notices.push({ k: 'level', level: lv, bonus: ECONOMY.levelBonus });
    }
  }
}

/** Avanza las misiones del día con las estadísticas de una partida. */
export function progressMissions(p: Profile, stats: Partial<Record<StatKey, number>>, notices: Notice[]): void {
  for (const m of p.missions.list) {
    if (m.done) continue;
    const def = MISSIONS.find((d) => d.id === m.id);
    if (!def) continue;
    const add = stats[def.stat] ?? 0;
    if (add <= 0) continue;
    m.progress = Math.min(def.goal, m.progress + add);
    if (m.progress >= def.goal) {
      m.done = true;
      notices.push({ k: 'mission', id: m.id });
    }
  }
  for (const [k, v] of Object.entries(stats)) p.totals[k as StatKey] = (p.totals[k as StatKey] ?? 0) + (v ?? 0);
}

/**
 * Aplica una partida o minijuego al perfil. `offline` = no verificable: con topes.
 * Devuelve lo ganado y las notificaciones.
 */
export function applyReport(p: Profile, r: PlayReport, offline: boolean, now = Date.now()): ApplyResult {
  const notices: Notice[] = [];
  const E = ECONOMY;
  let lonchas = 0;
  let xp = 0;
  const stats: Partial<Record<StatKey, number>> = { ...(r.stats ?? {}) };
  if (r.kind === 'match') {
    const coins = Math.max(0, Math.min(offline ? E.offline.coinsCap : 5000, Math.floor(r.coins ?? 0)));
    lonchas = Math.min(offline ? E.offline.matchCap : E.match.cap, Math.round(coins * E.match.coinRate) + E.match.play + (r.won ? E.match.win : 0));
    xp = E.xp.play + (r.won ? E.xp.win : 0) + coins * E.xp.perCoin + (r.medals?.length ?? 0) * 15;
    stats.matches = 1;
    if (r.won) stats.wins = 1;
    if (r.mode) {
      const rec = p.records[r.mode] ?? { games: 0, wins: 0, coins: 0, best: 0 };
      rec.games++;
      if (r.won) rec.wins++;
      rec.coins += coins;
      rec.best = Math.max(rec.best, coins);
      p.records[r.mode] = rec;
    }
    for (const m of (r.medals ?? []).slice(0, 12)) p.medals[m] = (p.medals[m] ?? 0) + 1;
  } else {
    const place = Math.max(0, Math.min(3, Math.floor(r.place ?? 3)));
    // Lonchas por el puesto + lo ganado apostando (ruleta, caballos), con tope.
    lonchas = E.minigame.place[place] + Math.min(E.minigame.bonusCap, Math.max(0, Math.floor(r.coins ?? 0)));
    xp = E.minigame.xp[place];
    stats.mgPlayed = 1;
    if (r.won) {
      p.mgStreak++;
      stats.mgWins = 1;
      const mult = E.streakMult[Math.min(E.streakMult.length - 1, p.mgStreak)];
      if (mult > 1) {
        lonchas = Math.round(lonchas * mult);
        notices.push({ k: 'streak', n: p.mgStreak, mult });
      }
    } else p.mgStreak = 0;
    if (r.mg) {
      const rec = p.mgRecords[r.mg] ?? { played: 0, wins: 0 };
      rec.played++;
      if (r.won) rec.wins++;
      p.mgRecords[r.mg] = rec;
    }
    if (offline) lonchas = Math.min(lonchas, E.offline.minigameCap);
  }
  if (offline) {
    // Topes diarios de lo que no se puede verificar.
    const d = today(now);
    if (p.offline.day !== d) p.offline = { day: d, earned: 0, lastAt: 0 };
    const gap = r.kind === 'match' ? E.offline.minMatchGap : E.offline.minMinigameGap;
    if (now - p.offline.lastAt < gap) {
      // Demasiado seguido para ser una partida de verdad: no cuenta.
      p.offline.lastAt = now;
      return { lonchas: 0, xp: 0, notices };
    }
    lonchas = Math.max(0, Math.min(lonchas, E.offline.dailyCap - p.offline.earned));
    p.offline.earned += lonchas;
    p.offline.lastAt = now;
    // Estadísticas creíbles como mucho.
    for (const k of Object.keys(stats) as StatKey[]) stats[k] = Math.min(stats[k] ?? 0, k === 'survive' ? 300 : 30);
  }
  stats.earned = lonchas;
  p.lonchas += lonchas;
  if (lonchas > 0) notices.push({ k: 'lonchas', n: lonchas, why: r.kind === 'match' ? 'PARTIDA' : 'MINIJUEGO' });
  notices.push({ k: 'xp', n: Math.round(xp) });
  addXp(p, xp, notices);
  progressMissions(p, stats, notices);
  return { lonchas, xp: Math.round(xp), notices };
}

/** Regalo diario: más lonchas si vienes días seguidos. */
export function claimDaily(p: Profile, now = Date.now()): { ok: boolean; amount: number; streak: number } {
  const d = today(now);
  if (p.daily.last === d) return { ok: false, amount: 0, streak: p.daily.streak };
  const yesterday = today(now - 86_400_000);
  p.daily.streak = p.daily.last === yesterday ? Math.min(ECONOMY.daily.maxStreak, p.daily.streak + 1) : 1;
  p.daily.last = d;
  const amount = ECONOMY.daily.base + (p.daily.streak - 1) * ECONOMY.daily.perStreakDay;
  p.lonchas += amount;
  return { ok: true, amount, streak: p.daily.streak };
}

export function claimMission(p: Profile, id: string): number {
  const m = p.missions.list.find((x) => x.id === id);
  const def = MISSIONS.find((d) => d.id === id);
  if (!m || !def || !m.done || m.claimed) return 0;
  m.claimed = true;
  p.lonchas += def.reward;
  return def.reward;
}

/** Comprar en la tienda: nunca deja el saldo por debajo de 0. */
export function buy(p: Profile, id: string, now = Date.now()): { ok: boolean; why?: string; notices: Notice[] } {
  const notices: Notice[] = [];
  const item = cosItem(id);
  if (!item) return { ok: false, why: 'NO EXISTE', notices };
  if (p.owned.includes(id)) return { ok: false, why: 'YA LO TIENES', notices };
  if (p.lonchas < item.price) return { ok: false, why: 'TE FALTAN LONCHAS', notices };
  p.lonchas -= item.price;
  p.owned.push(id);
  grantRescue(p, notices, now);
  return { ok: true, notices };
}

export function equip(p: Profile, cat: CosCat, id: string | null): boolean {
  if (id === null) {
    delete p.equipped[cat];
    return true;
  }
  const item = cosItem(id);
  if (!item || item.cat !== cat || !p.owned.includes(id)) return false;
  p.equipped[cat] = id;
  return true;
}

/** Solo lo que de verdad tienes y existe (para enseñarlo a los demás). */
export function sanitizeEquipped(raw: unknown): Equipped {
  const out: Equipped = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const c of COS_CATS) {
    const id = (raw as Record<string, unknown>)[c.id];
    const item = typeof id === 'string' ? cosItem(id) : undefined;
    if (item && item.cat === c.id) out[c.id] = item.id;
  }
  return out;
}

export function streakMult(streak: number): number {
  return ECONOMY.streakMult[Math.min(ECONOMY.streakMult.length - 1, Math.max(0, streak))];
}
