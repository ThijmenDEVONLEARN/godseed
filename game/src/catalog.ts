// Model catalogue: every villager pose, role, level look, animal and building stage on one flat field.
// Open /catalog.html?page=poses|people|buildings while the dev server runs.
import { TEAMS, type Team } from '@godseed/shared';
import { POSES } from './render3d/poses';
import { WorldView3D, type Cosmetic } from './render3d/WorldView3D';
import { createSimulation } from './sim/Simulation';
import { Deposit, Tile, type Animal, type Building, type BuildingType, type Job, type Role, type Unit } from './sim/types';
import { SCREEN } from './ui/layout';

const PAGES = ['poses', 'people', 'buildings'] as const;
const page = (new URLSearchParams(location.search).get('page') ?? 'poses') as (typeof PAGES)[number];
document.getElementById('nav')!.innerHTML = PAGES.map((p) => `<a href="?page=${p}"${p === page ? ' aria-current="page"' : ''}>${p}</a>`).join('');

const stage = document.getElementById('stage')!;
const fitStage = () => { stage.style.transform = `scale(${Math.min(innerWidth / SCREEN.w, innerHeight / SCREEN.h)})`; };
addEventListener('resize', fitStage);
fitStage();

// a real world as the base, flattened to grass so nothing but the models is on show
const world = createSimulation(1).world;
world.tiles.fill(Tile.Grass);
world.deposits.fill(Deposit.None);
world.units = []; world.buildings = []; world.animals = []; world.effects = [];
world.burningTiles.clear();

const COLS = 3, GAP = page === 'buildings' ? 3 : 2, X0 = Math.floor(world.w / 2) - GAP, Y0 = Math.floor(world.h / 2) - 4;
const cell = (i: number) => ({ x: X0 + (i % COLS) * GAP, y: Y0 + Math.floor(i / COLS) * GAP });
let nextId = 1;
const view = new WorldView3D(stage, 0, SCREEN.h);
view.sync(world, 0); // builds the terrain first, so the poses and facings set below are kept
const walkers: Unit[] = [], mortals: Unit[] = [];

function unit(i: number, name: string, o: { team?: Team; role?: Role; job?: Job; carrying?: Unit['carrying']; viewerId?: string } = {}): Unit {
  const { x, y } = cell(i);
  const u = {
    id: nextId++, x, y, px: x, py: y, moveStartTick: 0, moveTicks: 4, alive: true, hp: 30, maxHp: 30, hunger: 0, nextHitTick: 0, kills: 0,
    team: o.team ?? TEAMS[i % 4], role: o.role ?? 'worker', name, job: o.job ?? { kind: 'idle' }, carrying: o.carrying, viewerId: o.viewerId,
  } as unknown as Unit;
  world.units.push(u);
  view.turn(u.id, 0.35); // towards the camera, a little side-on so swings read
  return u;
}
const building = (i: number, type: BuildingType, o: Partial<Building> = {}): Building => {
  const b = { id: nextId++, team: TEAMS[i % 4], type, ...cell(i), hp: 100, maxHp: 100, progress: 1, burning: false, alive: true, nextShotTick: 0, ...o } as Building;
  world.buildings.push(b);
  return b;
};
const legend: string[] = [];

if (page === 'poses') {
  POSES.forEach((name, i) => {
    const u = unit(i, name, { carrying: name === 'carry' ? { res: 'wood', amount: 1 } : undefined });
    if (name === 'walk' || name === 'carry') walkers.push(u);
    else if (name === 'die') mortals.push(u);
    else view.gesture(u.id, name, Infinity);
  });
} else if (page === 'people') {
  (['worker', 'warrior', 'leader', 'hero'] as Role[]).forEach((role, i) => unit(i, role, { role, team: 'blue' }));
  const looks: [string, Cosmetic][] = [['lv 1', { tier: 0 }], ['lv 5', { tier: 1 }], ['lv 10', { tier: 2 }], ['lv 20', { tier: 3 }], ['top 3', { tier: 3, top3: true }]];
  looks.forEach(([name, cos], i) => { unit(4 + i, name, { role: 'viewer', team: TEAMS[i % 4], viewerId: `v${i}` }); view.setCosmetic(`v${i}`, cos); });
  walkers.push(unit(9, 'lv 20', { role: 'viewer', team: 'red', viewerId: 'v3' }));
  for (const [i, kind] of [[10, 'sheep'], [11, 'wolf']] as const) { view.turn(nextId, 1.2); world.animals.push({ id: nextId++, kind, ...cell(i), px: cell(i).x, py: cell(i).y, moveStartTick: 0, moveTicks: 4, alive: true, hp: 6, nextHitTick: 0 } as unknown as Animal); }
  legend.push('Row 1: worker, warrior, leader. Row 2: hero, then viewer levels.', 'Bottom row: a walking Legend, sheep, wolf');
} else {
  const types: BuildingType[] = ['hut', 'farm', 'wall', 'tower', 'smithy', 'temple', 'bridge'];
  types.forEach((type, i) => building(i, type));
  building(7, 'hut', { progress: 0.45 });
  building(8, 'tower', { burning: true, hp: 45 });
  building(9, 'smithy').hp = 0; // falls on the fifth tick, see step()
  legend.push('1 hut  2 farm  3 wall', '4 tower  5 smithy  6 temple', '7 bridge  8 being built  9 burning', '10 ruin');
}
document.getElementById('legend')!.textContent = legend.join('\n');

const rows = Math.ceil((world.units.length + world.buildings.length + world.animals.length) / COLS);
const mid = { x: X0 + GAP, y: Y0 + ((rows - 1) * GAP) / 2 }, eye = { x: mid.x + 0.4, y: mid.y + (4.5 + rows * 0.5) * GAP, up: (3.5 + rows * 0.45) * GAP * (page === 'buildings' ? 1.5 : 1) };
let last = performance.now(), acc = 0;
function step(): void {
  world.tick++;
  for (const u of walkers) if (world.tick >= u.moveStartTick + u.moveTicks) {
    // pace one tile to the right and back
    const home = cell(world.units.indexOf(u)).x, to = u.x === home ? home + 1 : home;
    u.px = u.x; u.py = u.y; u.x = to; u.moveStartTick = world.tick;
  }
  for (const u of mortals) u.alive = world.tick % 60 < 10;
  if (world.tick === 5) for (const b of world.buildings) if (b.hp <= 0) b.alive = false;
}
function draw(alpha: number): void {
  view.sync(world, alpha);
  view.lookFrom(eye, mid);
  view.render();
}
function loop(now: number): void {
  for (acc += Math.min(now - last, 1000), last = now; acc >= 100; acc -= 100) step();
  draw(acc / 100);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
// for automated screenshots: advance and draw without waiting for real time
Object.assign(window, { __cat: { step, draw, world } });
