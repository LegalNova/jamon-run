import { validCode } from '../../shared/protocol';
import { Matchmaker } from './Matchmaker';
import { Room } from './Room';

export { Matchmaker, Room };

export interface Env {
  ROOM: DurableObjectNamespace<Room>;
  MATCHMAKER: DurableObjectNamespace<Matchmaker>;
  ASSETS: Fetcher;
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

/**
 * Worker de JAMÓN RUN:
 *  - /api/quick  → código de una sala pública con sitio (partida rápida)
 *  - /api/new    → código nuevo para una sala privada
 *  - /ws/CODIGO  → WebSocket con la sala (un Durable Object por código)
 *  - el resto    → el juego (archivos estáticos de dist/)
 */
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const mm = () => env.MATCHMAKER.get(env.MATCHMAKER.idFromName('global'));

    if (url.pathname === '/api/quick') return json({ code: await mm().quick() });
    if (url.pathname === '/api/new') return json({ code: await mm().newCode() });
    if (url.pathname === '/api/stats') return json(await mm().stats());

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
