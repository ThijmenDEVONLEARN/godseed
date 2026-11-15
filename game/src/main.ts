import { TEAMS, type RoundEnd } from '@godseed/shared';
import { BALANCE } from './config/balance';
import { createCommandRouter } from './commands';
import { createBridgeClient } from './net/BridgeClient';
import { createCamera } from './render/Camera';
import { PALETTE } from './render/palette';
import { fitToWindow } from './render/stage';
import { createSimulation } from './sim/Simulation';
import type { SimEvent, World } from './sim/types';
import { createHud } from './ui/Hud';
import { MAP_TILES, ZONES } from './ui/layout';
import { createDebug } from './ui/debug';
import { createSpeaker, lineFor } from './voice/speaker';

const stage = document.getElementById('stage')!;
const ui = document.getElementById('ui')!;
const params = new URLSearchParams(location.search);
fitToWindow(stage);
await document.fonts.load('700 34px "Pixelify Sans"').catch(() => undefined);

const seed = Number(params.get('seed') ?? Math.floor(Math.random() * 1e9));
const sim = createSimulation(seed);
// 3D is the game; ?r=pixi shows the old 2D view while the 3D one is being finished
const view = params.get('r') === 'pixi'
  ? await (await import('./render/pixiView')).createPixiView(stage)
  : await (await import('./render3d/view3d')).create3DView(stage, ZONES.map.y, ZONES.bottom.y - 8 - ZONES.map.y);
const camera = createCamera(MAP_TILES.w, MAP_TILES.h);

const hud = createHud(ui);
const debug = createDebug(ui);

const bridge = createBridgeClient(params.get('bridge') ?? `ws://${location.hostname || 'localhost'}:8765`);
// local Kokoro voice (tts/server.py); ?voice=off silences it, ?voice=am_michael picks another voice
const speaker = params.get('voice') === 'off' ? undefined : createSpeaker({ url: params.get('tts') ?? 'http://127.0.0.1:8880', voice: params.get('voice') ?? 'bm_george' });
// green dot = bridge reachable and TikTok (or the test panel) feeding events
let bridgeUp = false, liveUp = true;
const showStatus = () => hud.connected(bridgeUp && liveUp);
bridge.onStatus((up) => { bridgeUp = up; showStatus(); });
bridge.onHighscores((rounds) => hud.setHighscores(rounds));
const route = createCommandRouter(sim, {
  feed: hud.feed,
  say: (id, text) => view.say(id, text),
  highlight: (id) => {
    const u = sim.world.units.find((x) => x.id === id);
    if (!u) return;
    view.point(id, PALETTE.team[u.team]);
    view.say(id, `${u.name} · ${u.team} · ${Math.ceil(u.hp)} hp · ${u.kills} kills`, 4000);
  },
  vote: (viewerId, option) => sim.enqueue({ kind: 'vote', viewerId, option }),
  likes: (total) => hud.likes(total),
});
bridge.onEvent((e) => {
  if (e.type === 'status') {
    if (liveUp && !e.connected) hud.feed('TikTok chat offline, reconnecting...');
    liveUp = e.connected;
    showStatus();
  }
  route(e);
});

function onEvents(world: World, events: SimEvent[]): void {
  hud.events(world, events);
  camera.events(events, performance.now());
  for (const e of events) {
    if ((e.kind !== 'god' && e.kind !== 'leader') || e.x === undefined || e.y === undefined) continue;
    const track = e.effect ? { effect: e.effect } : e.unitId !== undefined ? { unitId: e.unitId } : undefined;
    camera.gift(e.x, e.y, (e.durationTicks ?? 50) * 100, performance.now(), track);
  }
  for (const e of events) {
    if (e.kind === 'join' && e.unitId !== undefined && e.team) { view.point(e.unitId, PALETTE.team[e.team]); view.gesture(e.unitId, 'wave', 40); }
    if (e.kind === 'built' && e.x !== undefined && e.y !== undefined) for (const u of world.units) if (u.alive && u.team === e.team && Math.abs(u.x - e.x) + Math.abs(u.y - e.y) <= 2) view.gesture(u.id, 'cheer', 20);
    if (e.kind === 'storm' && e.x !== undefined && e.y !== undefined) view.bolt(e.x, e.y);
    if (e.kind === 'roundEnd' && e.team) bridge.send(roundEnd(world, e.team));
    const line = speaker && lineFor(world, e);
    if (line) speaker.say(line);
  }
}

function roundEnd(world: World, winner: RoundEnd['winner']): RoundEnd {
  const topPlayers = world.units
    .filter((u) => u.viewerId && u.name)
    .map((u) => ({ name: u.name!, team: u.team, score: 3 * u.kills + (u.alive ? 2 : 0) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  const scores = Object.fromEntries(TEAMS.map((t) => [t, world.teams[t].score])) as RoundEnd['scores'];
  return { type: 'roundEnd', seed: world.seed, winner, scores, topPlayers, endedAt: Date.now() };
}

// ?speed=20 fast-forwards, handy for checking rounds
const speed = Number(params.get('speed') ?? 1);
const msPerTick = 1000 / BALANCE.ticksPerSecond / speed;
let acc = 0, last = performance.now(), fps = 60;
function loop(now: number): void {
  const dtMs = Math.min(now - last, 1000);
  last = now;
  fps += (1000 / Math.max(1, dtMs) - fps) * 0.05;
  acc += dtMs;
  while (acc >= msPerTick) {
    acc -= msPerTick;
    onEvents(sim.world, sim.step());
  }
  view.sync(sim.world, acc / msPerTick);
  view.camera(sim.world, camera.update(sim.world, now, dtMs, (id) => view.positions.get(id)), camera.focus, dtMs);
  view.render();
  hud.update(sim.world);
  debug.set(`fps ${fps.toFixed(0)} · seed ${sim.world.seed} · units ${sim.world.units.filter((u) => u.alive).length} · cam ${camera.prio} · ${view.info()}`);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
// for automated checks (Playwright): step the world without waiting for real time
Object.assign(window, { __gs: { sim, camera, view, route: (e: Parameters<typeof route>[0]) => route(e) } });

// dev keys: R new world, J fake viewer joins, G random gift, S start the Final Storm (the test panel at /panel.html does the rest)
let fakes = 0;
window.addEventListener('keydown', (e) => {
  if (e.key === 'r') location.search = `?seed=${Math.floor(Math.random() * 1e9)}`;
  if (e.key === 'g') route({ type: 'gift', viewer: { id: `fake${fakes}`, name: `viewer_${fakes}` }, giftId: 0, giftName: 'Test', coins: [1, 5, 20, 50, 199, 200, 500][Math.floor(Math.random() * 7)], repeat: 1, ts: Date.now() });
  if (e.key === 'j') route({ type: 'chat', viewer: { id: `fake${++fakes}`, name: `viewer_${fakes}` }, text: `!join ${TEAMS[fakes % TEAMS.length]}`, ts: Date.now() });
  if (e.key === 's' && sim.world.round.phase === 'play') {
    // dev: jump to the real storm window, so it lasts the normal 10 minutes
    sim.world.round.startTick = sim.world.tick - (BALANCE.round.roundTicks - BALANCE.round.stormTicks);
    sim.world.round.phaseUntil = sim.world.tick;
  }
});
