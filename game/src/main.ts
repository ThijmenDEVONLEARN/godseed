import { Application, TextureStyle } from 'pixi.js';
import { TEAMS, type RoundEnd } from '@godseed/shared';
import { BALANCE } from './config/balance';
import { createCommandRouter } from './commands';
import { createBridgeClient } from './net/BridgeClient';
import { createArt, T } from './render/art';
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
view.root.position.set(ZONES.map.x, ZONES.map.y);
view.root.scale.set(TILE / T);
app.stage.addChild(view.root);

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
});
bridge.onEvent((e) => route(e));

function onEvents(world: World, events: SimEvent[]): void {
  hud.events(world, events);
  for (const e of events) {
    if (e.kind === 'join' && e.unitId !== undefined && e.team) view.point(e.unitId, PALETTE.team[e.team]);
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
  hud.update(sim.world);
  debug.set(`fps ${app.ticker.FPS.toFixed(0)} · seed ${sim.world.seed} · units ${sim.world.units.filter((u) => u.alive).length}`);
});

// dev keys: R new world, J fake viewer joins (the test panel at /panel.html does the rest)
let fakes = 0;
window.addEventListener('keydown', (e) => {
  if (e.key === 'r') location.search = `?seed=${Math.floor(Math.random() * 1e9)}`;
  if (e.key === 'j') route({ type: 'chat', viewer: { id: `fake${++fakes}`, name: `viewer_${fakes}` }, text: `!join ${TEAMS[fakes % TEAMS.length]}`, ts: Date.now() });
});
