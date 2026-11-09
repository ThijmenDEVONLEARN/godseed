import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import type { BridgeMessage } from '@godseed/shared';
import { createBridge, parseFake } from '../server';

let close: (() => Promise<void>) | undefined;
afterEach(async () => { await close?.(); close = undefined; });

describe('bridge', () => {
  it('relays /fake events to the game and stores round ends', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'godseed-')), 'data', 'highscores.json');
    const port = 20000 + Math.floor(Math.random() * 20000);
    close = (await createBridge(port, file)).close;
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    const got: BridgeMessage[] = [];
    ws.on('message', (d) => got.push(JSON.parse(String(d)) as BridgeMessage));
    await new Promise((r) => ws.on('open', r));

    const res = await fetch(`http://127.0.0.1:${port}/fake`, { method: 'POST', body: JSON.stringify({ type: 'chat', viewer: { id: 'a', name: 'Alice' }, text: '!join red' }) });
    expect(res.status).toBe(204);
    expect((await fetch(`http://127.0.0.1:${port}/fake`, { method: 'POST', body: '{"type":"nope"}' })).status).toBe(400);

    ws.send(JSON.stringify({ type: 'roundEnd', seed: 1, winner: 'red', scores: { red: 3, blue: 2, yellow: 1, green: 0 }, topPlayers: [], endedAt: 1 }));
    await new Promise((r) => setTimeout(r, 100));
    ws.close();
    expect(got.some((m) => m.type === 'event' && m.event.type === 'chat' && m.event.text === '!join red')).toBe(true);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toHaveLength(1);
  });

  it('rejects malformed fake events', () => {
    expect(parseFake({ type: 'chat', viewer: { id: 1, name: 'x' }, text: 'hi' })).toBeNull();
    expect(parseFake({ type: 'gift', viewer: { id: 'a', name: 'A' }, coins: 'lots' })).toMatchObject({ coins: 1, repeat: 1 });
  });
});
