import { TEAMS, roundXp, type RoundEnd } from '@godseed/shared';
import { BALANCE } from './config/balance';
import { createCommandRouter } from './commands';
import { createBridgeClient } from './net/BridgeClient';
import { createCamera } from './render/Camera';
import { PALETTE } from './render/palette';
import { fitToWindow } from './render/stage';
import { createPlayers } from './players';
import { createSimulation } from './sim/Simulation';
import { viewerScore } from './sim/systems/round';
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
bridge.onStatus((up) => { bridgeUp = up; showStatus(); if (up) players.resend(); });

// profiles, XP and levels (R6): the bridge keeps them, the game shows them
const players = createPlayers(bridge.send);
const commanded = new Set<string>(); // viewers who gave a command this round, +5 XP
const welcomeLater = new Set<string>(); // joined before their profile arrived
const unitOf = (viewerId: string) => sim.world.units.find((u) => u.viewerId === viewerId && u.alive);
const dress = (id: string) => view.setCosmetic(id, players.cosmetic(id));
function welcome(id: string): void {
  const p = players.get(id), u = unitOf(id);
  if (!p?.rounds || !u) return;
  hud.banner(`Welcome back ${u.name} · Lv ${players.level(id)} · ${p.wins} ${p.wins === 1 ? 'win' : 'wins'}`, u.team);
  view.celebrate(u.id, false);
}
function levelUp(id: string): void {
  dress(id);
  const u = unitOf(id);
  if (!u) return;
  hud.banner(`LEVEL UP! ${u.name} is now Lv ${players.level(id)}`, u.team, true);
  view.celebrate(u.id, true);
}
bridge.onProfiles((ps) => {
  const ups = new Set(players.receive(ps).map((p) => p.id));
  for (const p of ps) {
    dress(p.id);
    if (ups.has(p.id)) levelUp(p.id);
    if (welcomeLater.delete(p.id)) welcome(p.id);
  }
});
bridge.onLeaderboard((top) => {
  const before = players.top.map((p) => p.id);
  players.setTop(top);
  for (const id of new Set([...before, ...top.map((p) => p.id)])) dress(id); // the gold star moves with the top 3
});
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
  focus: (unitId, viewerId) => { commanded.add(viewerId); camera.command(unitId, viewerId, performance.now()); },
  lastTeam: (viewerId) => players.get(viewerId)?.lastTeam,
  help: () => hud.help(),
});
bridge.onEvent((e) => {
  if (e.type === 'status') {
    if (liveUp && !e.connected) hud.feed('TikTok chat offline, reconnecting...');
    liveUp = e.connected;
    showStatus();
  } else players.see(e.viewer.id);
  route(e);
});

function onEvents(world: World, events: SimEvent[]): void {
  hud.events(world, events);
  camera.events(events, performance.now());
  for (const e of events) {
    if (e.kind !== 'god' || e.x === undefined || e.y === undefined) continue;
    const track = e.effect ? { effect: e.effect } : e.unitId !== undefined ? { unitId: e.unitId } : undefined;
    camera.gift(e.x, e.y, (e.durationTicks ?? 50) * 100, performance.now(), track, { by: e.viewerId, coins: e.coins });
  }
  for (const e of events) {
    if (e.kind === 'join' && e.unitId !== undefined && e.team) {
      view.point(e.unitId, PALETTE.team[e.team]);
      view.gesture(e.unitId, 'wave', 40);
      if (e.viewerId) { dress(e.viewerId); if (players.get(e.viewerId)) welcome(e.viewerId); else welcomeLater.add(e.viewerId); }
    }
    // a kill can push a viewer over a level line mid-round
    if (e.kind === 'kill' && e.unitId !== undefined) {
      const u = world.units.find((x) => x.id === e.unitId);
      if (u?.viewerId && players.provisional(u.viewerId, viewerScore(u), commanded.has(u.viewerId))) levelUp(u.viewerId);
    }
    if (e.kind === 'newRound') { commanded.clear(); if (world.statue) dress(world.statue.viewerId); }
    if (e.kind === 'built' && e.x !== undefined && e.y !== undefined) for (const u of world.units) if (u.alive && u.team === e.team && Math.abs(u.x - e.x) + Math.abs(u.y - e.y) <= 2) view.gesture(u.id, 'cheer', 20);
    view.event(e, world);
    if (e.kind === 'roundEnd' && e.team) {
      const msg = roundEnd(world, e.team);
      bridge.send(msg);
      const earned = (msg.players ?? []).map((p) => ({ name: p.name, team: p.team, xp: roundXp(p, p.team === e.team) })).sort((a, b) => b.xp - a.xp);
      hud.board(world, earned, () => players.top);
    }
    const line = speaker && lineFor(world, e);
    if (line) speaker.say(line);
  }
}

function roundEnd(world: World, winner: RoundEnd['winner']): RoundEnd {
  const list = world.units
    .filter((u) => u.viewerId && u.name)
    .map((u) => ({ id: u.viewerId!, name: u.name!, team: u.team, score: viewerScore(u), kills: u.kills, commanded: commanded.has(u.viewerId!) }))
    .sort((a, b) => b.score - a.score);
  const topPlayers = list.slice(0, 5).map(({ name, team, score }) => ({ name, team, score }));
  const scores = Object.fromEntries(TEAMS.map((t) => [t, world.teams[t].score])) as RoundEnd['scores'];
  return { type: 'roundEnd', seed: world.seed, winner, scores, topPlayers, players: list, endedAt: Date.now() };
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
    // dev: jump to the real storm window, so it lasts the normal 3 minutes
    sim.world.round.startTick = sim.world.tick - (BALANCE.round.roundTicks - BALANCE.round.stormTicks);
    sim.world.round.phaseUntil = sim.world.tick;
  }
});
