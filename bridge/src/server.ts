import { createServer, type IncomingMessage } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import type { BridgeMessage, GameMessage, ViewerEvent } from '@godseed/shared';
import { createStore } from './store';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
const isLocal = (req: IncomingMessage) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '');

const VIEWER_EVENTS = new Set<ViewerEvent['type']>(['chat', 'like', 'follow', 'share', 'enter', 'gift']);

/** Validates an untrusted `/fake` body just enough that the game can rely on its shape. */
export function parseFake(body: unknown): ViewerEvent | null {
  const e = body as Partial<ViewerEvent> & { viewer?: { id?: unknown; name?: unknown } };
  if (!e || typeof e !== 'object' || !VIEWER_EVENTS.has(e.type as ViewerEvent['type'])) return null;
  if (typeof e.viewer?.id !== 'string' || typeof e.viewer.name !== 'string') return null;
  const viewer = { id: e.viewer.id.slice(0, 64), name: e.viewer.name.slice(0, 64) };
  const ts = Date.now();
  const r = body as Record<string, unknown>;
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  switch (e.type) {
    case 'chat': return typeof r.text === 'string' ? { type: 'chat', viewer, text: r.text.slice(0, 200), ts } : null;
    case 'like': return { type: 'like', viewer, count: Math.max(1, Math.floor(num(r.count, 1))), ts };
    case 'gift': return { type: 'gift', viewer, giftId: num(r.giftId, 0), giftName: String(r.giftName ?? 'Gift').slice(0, 40), coins: Math.max(1, Math.floor(num(r.coins, 1))), repeat: Math.max(1, Math.floor(num(r.repeat, 1))), ts };
    default: return { type: e.type as 'follow' | 'share' | 'enter', viewer, ts };
  }
}

/** WebSocket hub for the game plus `POST /fake` for the test panel. TikTok events come in through `publish`. */
export function createBridge(port: number, dataFile: string) {
  const store = createStore(dataFile);
  const clients = new Set<WebSocket>();
  const send = (ws: WebSocket, m: BridgeMessage) => ws.send(JSON.stringify(m));
  // a game that (re)connects learns the last known TikTok state, not a stale "fake: up"
  let status: ViewerEvent = { type: 'status', connected: true, source: 'fake', ts: Date.now() };
  const publish = (event: ViewerEvent) => {
    if (event.type === 'status') status = event;
    for (const ws of clients) send(ws, { type: 'event', event });
  };

  const http = createServer((req, res) => {
    if (req.method === 'OPTIONS') { res.writeHead(204, CORS).end(); return; }
    if (req.method === 'GET') {
      // someone opened the bridge in a browser: point them to the game and the test panel
      res.writeHead(200, { ...CORS, 'Content-Type': 'text/plain; charset=utf-8' }).end('Godseed bridge is running.\n\nGame:       http://localhost:5173\nTest panel: http://localhost:5173/panel.html\n');
      return;
    }
    if (req.method !== 'POST' || req.url !== '/fake') { res.writeHead(404, CORS).end(); return; }
    if (!isLocal(req)) { res.writeHead(403, CORS).end(); return; }
    let raw = '';
    req.on('data', (c: Buffer) => { raw += c; if (raw.length > 10_000) req.destroy(); });
    req.on('end', () => {
      let event: ViewerEvent | null = null;
      try { event = parseFake(JSON.parse(raw)); } catch { /* bad json → 400 below */ }
      if (!event) { res.writeHead(400, CORS).end('bad event'); return; }
      publish(event);
      res.writeHead(204, CORS).end();
    });
  });

  const wss = new WebSocketServer({ server: http });
  wss.on('connection', (ws) => {
    clients.add(ws);
    send(ws, { type: 'event', event: status });
    send(ws, { type: 'highscores', rounds: store.rounds() });
    ws.on('close', () => clients.delete(ws));
    ws.on('message', (data) => {
      let m: GameMessage;
      try { m = JSON.parse(String(data)) as GameMessage; } catch { return; }
      if (m.type === 'roundEnd') {
        store.add(m);
        for (const c of clients) send(c, { type: 'highscores', rounds: store.rounds() });
      }
    });
  });

  return new Promise<{ publish: typeof publish; close: () => Promise<void> }>((resolve) => {
    http.listen(port, '127.0.0.1', () => resolve({
      publish,
      close: () => new Promise<void>((done) => { for (const ws of clients) ws.terminate(); wss.close(); http.close(() => done()); }),
    }));
  });
}
