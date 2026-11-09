import { Application, TextureStyle } from 'pixi.js';
import { BALANCE } from './config/balance';
import { createArt, T } from './render/art';
import { fitToWindow } from './render/stage';
import { WorldView } from './render/WorldView';
import { createSimulation } from './sim/Simulation';
import { createHud } from './ui/Hud';
import { MAP_TILES, SCREEN, TILE, ZONES } from './ui/layout';
import { createDebug } from './ui/debug';
import { TEAMS } from '@godseed/shared';

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
// ?speed=20 fast-forwards, handy for checking rounds
const speed = Number(params.get('speed') ?? 1);
const msPerTick = 1000 / BALANCE.ticksPerSecond / speed;
let acc = 0;
app.ticker.add((t) => {
  acc += Math.min(t.deltaMS, 1000);
  while (acc >= msPerTick) {
    acc -= msPerTick;
    hud.events(sim.world, sim.step());
  }
  view.sync(sim.world, acc / msPerTick);
  hud.update(sim.world);
  debug.set(`fps ${app.ticker.FPS.toFixed(0)} · seed ${sim.world.seed} · units ${sim.world.units.filter((u) => u.alive).length}`);
});

// dev keys until the TikTok bridge exists: R new world, J fake viewer joins
let fakes = 0;
window.addEventListener('keydown', (e) => {
  if (e.key === 'r') location.search = `?seed=${Math.floor(Math.random() * 1e9)}`;
  if (e.key === 'j') sim.enqueue({ kind: 'join', viewerId: `fake${++fakes}`, name: `viewer_${fakes}`, team: TEAMS[fakes % TEAMS.length] });
});
