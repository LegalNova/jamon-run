import { COS_CATS, CosCat, PlayReport, StatKey } from '../../shared/economy';
import { validCode } from '../../shared/protocol';
import { validMode } from '../../shared/modes/rules';
import { WHEEL } from '../../shared/minigames/ruleta';
import { secureRandom } from '../../shared/minigames/rng';
import { Matchmaker } from './Matchmaker';
import { Profile } from './Profile';
import { Room } from './Room';
import { profileOf, validAccount } from './accounts';

export { Matchmaker, Profile, Room };

export interface Env {
  ROOM: DurableObjectNamespace<Room>;
  MATCHMAKER: DurableObjectNamespace<Matchmaker>;
  PROFILE: DurableObjectNamespace<Profile>;
  ASSETS: Fetcher;
  /** Worker antiguo (perfiles de antes del cambio de nombre). */
  LEGACY?: Fetcher;
  /** Solo en el Worker antiguo: adónde redirigir. */
  REDIRECT_TO?: string;
}


const STAT_KEYS: StatKey[] = ['matches', 'wins', 'mgWins', 'mgPlayed', 'passes', 'survive', 'infections', 'finds', 'rescues', 'hits', 'perfects', 'earned'];

/** Partida offline que manda el navegador: se limpia y el perfil le pone topes. */
function cleanReport(raw: unknown): PlayReport | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const kind = r.kind === 'minigame' ? 'minigame' : r.kind === 'match' ? 'match' : r.kind === 'event' ? 'event' : null;
  if (!kind) return null;
  const stats: Partial<Record<StatKey, number>> = {};
  const rs = (r.stats && typeof r.stats === 'object' ? r.stats : {}) as Record<string, unknown>;
  for (const k of STAT_KEYS) if (k !== 'earned' && k !== 'matches' && k !== 'wins' && k !== 'mgWins' && k !== 'mgPlayed') {
    const v = Number(rs[k]);
    if (Number.isFinite(v) && v > 0) stats[k] = Math.floor(v);
  }
  return {
    kind,
    mode: validMode(r.mode) ? r.mode : undefined,
    mg: typeof r.mg === 'string' ? r.mg.slice(0, 20) : undefined,
    won: !!r.won,
    coins: Math.max(0, Math.floor(Number(r.coins) || 0)),
    place: Math.max(0, Math.min(3, Math.floor(Number(r.place) || 0))),
    medals: Array.isArray(r.medals) ? r.medals.filter((m) => typeof m === 'string').slice(0, 8).map((m) => (m as string).slice(0, 20)) : [],
    stats,
  };
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

/**
 * Worker de JAMONGUS:
 *  - /api/quick  → código de una sala pública con sitio (partida rápida)
 *  - /api/new    → código nuevo para una sala privada
 *  - /api/rank   → ranking mundial por modo
 *  - /ws/CODIGO  → WebSocket con la sala (un Durable Object por código)
 *  - el resto    → el juego (archivos estáticos de dist/)
 */
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const mm = () => env.MATCHMAKER.get(env.MATCHMAKER.idFromName('global'));

    // URL antigua: todo redirige a JAMONGUS, salvo el traspaso de perfiles (solo por service binding).
    if (env.REDIRECT_TO) {
      if (url.pathname === '/api/legacy-profile') {
        const id = url.searchParams.get('id');
        if (!validAccount(id)) return json({ error: 'Cuenta no válida' }, 400);
        return json({ profile: await profileOf(env, id).peek() });
      }
      return Response.redirect(env.REDIRECT_TO + url.pathname + url.search, 301);
    }

    if (url.pathname === '/api/quick') return json({ code: await mm().quick() });
    if (url.pathname === '/api/new') return json({ code: await mm().newCode() });
    if (url.pathname === '/api/stats') return json(await mm().stats());
    if (url.pathname === '/api/rank') return json(await mm().rank());

    // Perfil: lonchas, misiones, tienda. El cliente pide; el servidor decide.
    if (url.pathname === '/api/me') {
      let body: Record<string, unknown> = {};
      if (req.method === 'POST') {
        try {
          body = (await req.json()) as Record<string, unknown>;
        } catch {
          return json({ error: 'JSON no válido' }, 400);
        }
      } else body = { id: url.searchParams.get('id'), op: 'get' };
      const id = body.id;
      if (!validAccount(id)) return json({ error: 'Cuenta no válida' }, 400);
      const p = profileOf(env, id);
      switch (body.op) {
        case 'get':
          return json({ profile: await p.get(id) });
        case 'daily':
          return json(await p.daily(id));
        case 'buy':
          return json(await p.buy(id, String(body.item ?? '')));
        case 'equip': {
          const cat = String(body.cat) as CosCat;
          if (!COS_CATS.some((c) => c.id === cat)) return json({ error: 'Categoría no válida' }, 400);
          return json(await p.equip(id, cat, typeof body.item === 'string' ? body.item : null));
        }
        case 'claim':
          return json(await p.claim(id, String(body.mission ?? '')));
        case 'roulette': {
          // Ruleta sin sala (offline): el número lo saca el servidor, no el navegador.
          const pocket = WHEEL[Math.floor(secureRandom() * WHEEL.length)];
          const r = await p.roulette(id, String(body.color), Number(body.amount) || 0, pocket);
          return json({ profile: r.profile, delta: r.delta, notices: r.notices, pocket });
        }
        case 'offline': {
          const r = cleanReport(body.report);
          if (!r) return json({ error: 'Informe no válido' }, 400);
          return json(await p.report(id, r, false));
        }
      }
      return json({ error: 'Operación desconocida' }, 400);
    }

    const m = /^\/ws\/([A-Za-z]{5})$/.exec(url.pathname);
    if (m) {
      const code = m[1].toUpperCase();
      if (!validCode(code)) return json({ error: 'Código no válido' }, 400);
      if (req.headers.get('Upgrade') !== 'websocket') return json({ error: 'Se esperaba un WebSocket' }, 426);
      const target = new URL(req.url);
      target.searchParams.set('code', code);
      return env.ROOM.get(env.ROOM.idFromName(code)).fetch(new Request(target.toString(), req));
    }
    return env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<Env>;
