import { Application, Graphics, TextureStyle } from 'pixi.js';
import { TEAMS, type RoundEnd } from '@godseed/shared';
import { BALANCE } from './config/balance';
import { createCommandRouter } from './commands';
import { createBridgeClient } from './net/BridgeClient';
import { createArt, T } from './render/art';
import { createCamera } from './render/Camera';
import { PALETTE } from './render/palette';
import { fitToWindow } from './render/stage';
import { WorldView } from './render/WorldView';
import { createSimulation } from './sim/Simulation';
import type { SimEvent, World } from './sim/types';
import { createHud } from './ui/Hud';
import { MAP_TILES, SCREEN, TILE, ZONES } from './ui/layout';
import { createDebug } from './ui/debug';

TextureStyle.defaultOptions.scaleMode = 'nearest';

const stage = document.getElementById('stage')!;
const ui = document.getElementById('ui')!;
const app = new Application();
await app.init({ width: SCREEN.w, height: SCREEN.h, antialias: false, roundPixels: true, backgroundAlpha: 0 });
stage.prepend(app.canvas);
fitToWindow(stage);
await document.fonts.load('700 34px "Pixelify Sans"').catch(() => undefined);

const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed') ?? Math.floor(Math.random() * 1e9));
const sim = createSimulation(seed);
const view = new WorldView(createArt(), MAP_TILES.w, MAP_TILES.h);
const camera = createCamera(MAP_TILES.w, MAP_TILES.h);
const mapMask = new Graphics().rect(ZONES.map.x, ZONES.map.y, ZONES.map.w, ZONES.map.h).fill('#fff');
view.root.mask = mapMask;
app.stage.addChild(view.root, mapMask);

/** Puts the camera's tile (x, y) in the middle of the map zone at the given zoom, never showing past the map edge. */
function applyCamera(c: { x: number; y: number; zoom: number }): void {
  const scale = (TILE / T) * c.zoom, tile = TILE * c.zoom;
  const half = { x: ZONES.map.w / 2 / tile, y: ZONES.map.h / 2 / tile };
  const cx = Math.min(MAP_TILES.w - half.x, Math.max(half.x, c.x + 0.5)), cy = Math.min(MAP_TILES.h - half.y, Math.max(half.y, c.y + 0.5));
  view.root.scale.set(scale);
  view.labelScale = Math.min(1, 1.5 / c.zoom);
  view.root.position.set(ZONES.map.x + ZONES.map.w / 2 - cx * tile, ZONES.map.y + ZONES.map.h / 2 - cy * tile);
}

const hud = createHud(ui);
const debug = createDebug(ui);

const bridge = createBridgeClient(params.get('bridge') ?? `ws://${location.hostname || 'localhost'}:8765`);
bridge.onStatus((up) => hud.connected(up));
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
bridge.onEvent((e) => route(e));

function onEvents(world: World, events: SimEvent[]): void {
  hud.events(world, events);
  camera.events(events, performance.now());
  for (const e of events) {
    if ((e.kind !== 'god' && e.kind !== 'leader') || e.x === undefined || e.y === undefined) continue;
    const track = e.effect ? { effect: e.effect } : e.unitId !== undefined ? { unitId: e.unitId } : undefined;
    camera.gift(e.x, e.y, (e.durationTicks ?? 50) * 100, performance.now(), track);
  }
  for (const e of events) {
    if (e.kind === 'join' && e.unitId !== undefined && e.team) view.point(e.unitId, PALETTE.team[e.team]);
    if (e.kind === 'storm' && e.x !== undefined && e.y !== undefined) view.bolt(e.x, e.y);
    if (e.kind === 'roundEnd' && e.team) bridge.send(roundEnd(world, e.team));
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
let acc = 0;
app.ticker.add((t) => {
  acc += Math.min(t.deltaMS, 1000);
  while (acc >= msPerTick) {
    acc -= msPerTick;
    onEvents(sim.world, sim.step());
  }
  view.sync(sim.world, acc / msPerTick);
  applyCamera(camera.update(sim.world, performance.now(), t.deltaMS, (id) => view.positions.get(id)));
  hud.update(sim.world);
  debug.set(`fps ${app.ticker.FPS.toFixed(0)} · seed ${sim.world.seed} · units ${sim.world.units.filter((u) => u.alive).length} · cam ${camera.prio}`);
});

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
