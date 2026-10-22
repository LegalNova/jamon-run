// PRUEBA DE CARGA: N clientes falsos (Node + ws) repartidos en varias salas durante unos minutos.
// Mide mensajes por segundo, bytes, ritmo real de los ticks del servidor (vistos desde fuera),
// ping y desconexiones.
//
//   node scripts/loadtest.mjs                       → 50 clientes, 3 salas, 5 min contra local (wrangler dev)
//   node scripts/loadtest.mjs --url https://jamongus.jamon-run.workers.dev --minutes 2
//   Opciones: --clients 50 --rooms 3 --minutes 5 --url ws://127.0.0.1:8787 --paron normal
import WebSocket from 'ws';

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const CLIENTS = Number(arg('clients', 50));
const ROOMS = Number(arg('rooms', 3));
const MINUTES = Number(arg('minutes', 5));
const PARON = arg('paron', 'normal');
let base = arg('url', 'ws://127.0.0.1:8787');
base = base.replace(/^http/, 'ws').replace(/\/$/, '');
const RUN = [...Array(3)].map(() => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('');
const codes = [...Array(ROOMS).keys()].map((i) => `L${RUN}${String.fromCharCode(65 + i)}`.slice(0, 5));

const stats = {
  started: Date.now(),
  recvMsgs: 0,
  recvBytes: 0,
  sentMsgs: 0,
  sentInputs: 0,
  snapshots: 0,
  disconnects: 0,
  closeCodes: {},
  reconnects: 0,
  errors: 0,
  rtts: [],
  perSecond: [],
};
/** Por sala: ritmo de los ticks (hora del servidor en cada snapshot) y huecos de llegada. */
const rooms = new Map(codes.map((c) => [c, { serverGaps: [], arrivalGaps: [], lastTs: 0, lastArrive: 0, lastN: -1, missed: 0, matches: 0, players: 0 }]));

function encodeInput(x, y, sprint, a) {
  const b = Buffer.alloc(8);
  b.writeUInt8(1, 0);
  b.writeInt8(Math.round(x * 100), 1);
  b.writeInt8(Math.round(y * 100), 2);
  b.writeUInt8(sprint ? 1 : 0, 3);
  b.writeUInt8(a & 255, 4);
  return b;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (arr, p) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((s.length - 1) * p))];
};

class FakeClient {
  constructor(i, code, host) {
    this.i = i;
    this.code = code;
    this.host = host;
    this.pid = `carga-${RUN}-${i}`;
    this.inMatch = false;
    this.a = 0;
    this.dir = { x: 0, y: 0, sprint: false };
    this.lastSent = '';
    this.lastSendAt = 0;
    this.closedOnPurpose = false;
    this.connect();
  }

  connect() {
    const ws = new WebSocket(`${base}/ws/${this.code}`);
    this.ws = ws;
    ws.binaryType = 'arraybuffer';
    ws.on('open', () => {
      this.send({ t: 'hello', pid: this.pid, look: { name: `CARGA${this.i}` }, acct: '' });
    });
    ws.on('message', (data, isBinary) => {
      stats.recvMsgs++;
      stats.recvBytes += data.length ?? data.byteLength ?? 0;
      if (isBinary) return;
      const txt = data.toString();
      if (txt === 'pong') {
        if (this.pingAt) stats.rtts.push(Date.now() - this.pingAt);
        this.pingAt = 0;
        return;
      }
      let m;
      try {
        m = JSON.parse(txt);
      } catch {
        return;
      }
      this.onMsg(m);
    });
    ws.on('close', (code) => {
      this.inMatch = false;
      if (this.closedOnPurpose) return;
      stats.disconnects++;
      stats.closeCodes[code] = (stats.closeCodes[code] ?? 0) + 1;
      if (stats.disconnects <= 3) console.log(`  desconexión: cliente ${this.i}, código ${code}, a los ${((Date.now() - stats.started) / 1000).toFixed(1)} s`);
      setTimeout(() => {
        stats.reconnects++;
        this.connect();
      }, 800);
    });
    ws.on('error', () => stats.errors++);
  }

  send(obj) {
    if (this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(obj));
    stats.sentMsgs++;
  }

  onMsg(m) {
    const room = rooms.get(this.code);
    if (m.t === 'lobby') {
      room.players = m.players.filter((p) => p.connected).length;
      if (this.host && m.phase === 'lobby' && !this.configured) {
        this.configured = true;
        this.send({ t: 'settings', s: { mode: 'pilla', duration: 300, botFill: 0, paron: PARON, mapId: 'barcelona' } });
      }
      const me = m.players.find((p) => p.id === m.you);
      // Los demás se ponen "listos"; el anfitrión arranca cuando lo están todos.
      if (!this.host && m.phase === 'lobby' && me && !me.ready && Date.now() - (this.readyAt ?? 0) > 500) {
        this.readyAt = Date.now();
        this.send({ t: 'ready', v: true });
      }
      if (this.host && this.wantStart && m.phase === 'lobby' && m.players.filter((p) => p.connected && !p.host).every((p) => p.ready) && Date.now() - (this.startAt ?? 0) > 1500) {
        this.startAt = Date.now();
        this.send({ t: 'start' });
      }
    } else if (m.t === 'start') {
      this.inMatch = true;
      if (this.host) room.matches++;
    } else if (m.t === 'results') {
      this.inMatch = false;
      // La sala vuelve al lobby: el anfitrión arranca otra en cuanto todos están listos.
    } else if (m.t === 's') {
      stats.snapshots++;
      if (this.host) {
        const now = Date.now();
        const s = m.s;
        if (room.lastTs && s.n > room.lastN) {
          room.serverGaps.push((s.ts - room.lastTs) / (s.n - room.lastN));
          room.arrivalGaps.push(now - room.lastArrive);
          if (s.n - room.lastN > 1 && s.n - room.lastN < 4) room.missed += s.n - room.lastN - 1;
        }
        room.lastTs = s.ts;
        room.lastN = s.n;
        room.lastArrive = now;
      }
    }
  }

  /** Movimiento "humano": cambia de dirección cada 0,3-1,5 s; golpea de vez en cuando. */
  tickInput(now) {
    if (!this.inMatch) return;
    if (!this.nextTurn || now > this.nextTurn) {
      const a = Math.random() * Math.PI * 2;
      const stop = Math.random() < 0.15;
      this.dir = { x: stop ? 0 : Math.cos(a), y: stop ? 0 : Math.sin(a), sprint: Math.random() < 0.3 };
      this.nextTurn = now + 300 + Math.random() * 1200;
    }
    if (Math.random() < 0.02) this.a++;
    const key = `${Math.round(this.dir.x * 100)},${Math.round(this.dir.y * 100)},${this.dir.sprint},${this.a}`;
    // Solo si cambia y como mucho 10 veces por segundo (igual que el juego).
    if (key === this.lastSent || now - this.lastSendAt < 100) return;
    this.lastSent = key;
    this.lastSendAt = now;
    if (this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(encodeInput(this.dir.x, this.dir.y, this.dir.sprint, this.a));
    stats.sentMsgs++;
    stats.sentInputs++;
  }

  ping(clock) {
    if (this.ws.readyState !== WebSocket.OPEN) return;
    if (clock) this.send({ t: 'ping', c: Date.now() });
    else {
      this.pingAt = Date.now();
      this.ws.send('ping');
      stats.sentMsgs++;
    }
  }

  close() {
    this.closedOnPurpose = true;
    try {
      this.send({ t: 'leave' });
      this.ws.close(1000);
    } catch {
      /* nada */
    }
  }
}

async function main() {
  console.log(`Prueba de carga: ${CLIENTS} clientes en ${ROOMS} salas (${codes.join(', ')}) durante ${MINUTES} min → ${base}`);
  const clients = [];
  for (let i = 0; i < CLIENTS; i++) {
    const r = i % ROOMS;
    clients.push(new FakeClient(i, codes[r], i < ROOMS));
    await sleep(40);
  }
  await sleep(3000);
  for (const c of clients.filter((c) => c.host)) {
    c.wantStart = true;
    c.send({ t: 'start' });
  }

  const end = Date.now() + MINUTES * 60_000;
  let sec = 0;
  let last = { ...stats };
  const inputTimer = setInterval(() => {
    const now = Date.now();
    for (const c of clients) c.tickInput(now);
  }, 20);
  const pingTimer = setInterval(() => {
    sec++;
    // Como el juego: un ping cada 2 s (y con hora cada 10 s).
    if (sec % 2 === 0) for (const c of clients) c.ping(sec % 10 === 0);
    const row = {
      t: sec,
      recv: stats.recvMsgs - last.recvMsgs,
      kb: Math.round((stats.recvBytes - last.recvBytes) / 1024),
      sent: stats.sentMsgs - last.sentMsgs,
      inputs: stats.sentInputs - last.sentInputs,
    };
    stats.perSecond.push(row);
    last = { ...stats };
    if (sec % 30 === 0) {
      const ticks = [...rooms.values()].map((r) => `${r.players}j/${pct(r.serverGaps.slice(-600), 0.5).toFixed(0)}ms`).join(' ');
      console.log(`${sec}s · recibidos ${row.recv}/s (${row.kb} KB/s) · enviados ${row.sent}/s (entradas ${row.inputs}/s) · desconexiones ${stats.disconnects} · salas ${ticks}`);
    }
  }, 1000);
  while (Date.now() < end) await sleep(1000);
  clearInterval(inputTimer);
  clearInterval(pingTimer);
  for (const c of clients) c.close();
  await sleep(500);

  const ps = stats.perSecond.slice(5);
  const avg = (f) => ps.reduce((a, r) => a + f(r), 0) / Math.max(1, ps.length);
  const allServer = [...rooms.values()].flatMap((r) => r.serverGaps);
  const allArrival = [...rooms.values()].flatMap((r) => r.arrivalGaps);
  const inputsPerPlayer = avg((r) => r.inputs) / CLIENTS;
  const summary = {
    clientes: CLIENTS,
    salas: ROOMS,
    minutos: MINUTES,
    partidas: [...rooms.values()].reduce((a, r) => a + r.matches, 0),
    recibidosPorSeg: Math.round(avg((r) => r.recv)),
    kbPorSeg: Math.round(avg((r) => r.kb)),
    enviadosPorSeg: Math.round(avg((r) => r.sent)),
    entradasPorJugadorYSeg: Number(inputsPerPlayer.toFixed(2)),
    tickServidorMs: { p50: Number(pct(allServer, 0.5).toFixed(1)), p95: Number(pct(allServer, 0.95).toFixed(1)), max: Number(pct(allServer, 1).toFixed(1)) },
    llegadaSnapshotsMs: { p50: pct(allArrival, 0.5), p95: pct(allArrival, 0.95), max: pct(allArrival, 1) },
    ticksPerdidos: [...rooms.values()].reduce((a, r) => a + r.missed, 0),
    pingMs: { p50: pct(stats.rtts, 0.5), p95: pct(stats.rtts, 0.95) },
    desconexiones: stats.disconnects,
    codigosDeCierre: stats.closeCodes,
    errores: stats.errors,
  };
  console.log('\nRESULTADO');
  console.log(JSON.stringify(summary, null, 2));
  process.exit(0);
}

main();
