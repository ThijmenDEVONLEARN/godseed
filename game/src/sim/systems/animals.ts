import { BALANCE } from '../../config/balance';
import { dist, emit, spawnAnimal } from '../entities';
import { NEIGHBORS, walkableTile } from '../grid';
import { requestPath } from '../pathfind';
import { damageUnit } from './combat';
import { ready } from './movement';
import { Tile, type Animal, type Team, type Unit, type World } from '../types';

function farFromHomes(world: World, x: number, y: number, d: number): boolean {
  return Object.values(world.teams).every((t) => Math.abs(t.homeX - x) + Math.abs(t.homeY - y) > d);
}

function randomTile(world: World, tile: Tile, minHomeDist: number): [number, number] | undefined {
  for (let tries = 0; tries < 200; tries++) {
    const x = world.rng.int(world.w), y = world.rng.int(world.h);
    if (world.tiles[y * world.w + x] === tile && farFromHomes(world, x, y, minHomeDist)) return [x, y];
  }
  return undefined;
}

export function spawnStartAnimals(world: World): void {
  for (let i = 0; i < BALANCE.animals.sheepStart; i++) {
    const p = randomTile(world, Tile.Grass, 5);
    if (p) spawnAnimal(world, 'sheep', ...p);
  }
}

function wander(world: World, a: Animal): void {
  const [dx, dy] = world.rng.pick(NEIGHBORS);
  const x = a.x + dx, y = a.y + dy;
  if (x < 0 || y < 0 || x >= world.w || y >= world.h || !walkableTile(world.tiles[y * world.w + x])) return;
  a.path = [y * world.w + x];
  a.pathGoal = a.path[0];
}

/** Sheep wander; wolves spawn in forests, hunt nearby villagers and otherwise roam. */
export function animals(world: World, walls: Map<number, Team>): void {
  const A = BALANCE.animals;
  if (world.tick % A.wolfEveryTicks === 0 && world.animals.filter((a) => a.alive && a.kind === 'wolf').length < A.wolfMax) {
    const p = randomTile(world, Tile.Forest, 8);
    if (p) { spawnAnimal(world, 'wolf', ...p); emit(world, { kind: 'death', text: 'Wolves howl in the forest', x: p[0], y: p[1] }); }
  }
  for (const a of world.animals) {
    if (!a.alive || !ready(world, a) || (a.path && a.path.length)) continue;
    if (a.kind === 'sheep') { if (world.rng.chance(0.05)) wander(world, a); continue; }
    let prey: Unit | undefined;
    for (const u of world.units) if (u.alive && dist(u, a) <= A.wolfAggroRange && (!prey || dist(u, a) < dist(prey, a))) prey = u;
    if (!prey) { if (world.rng.chance(0.1)) wander(world, a); continue; }
    if (dist(prey, a) <= 1) {
      if (world.tick >= a.nextHitTick) { damageUnit(world, prey, A.wolfDamage, undefined, 'was eaten by wolves'); a.nextHitTick = world.tick + BALANCE.unit.hitEveryTicks; }
    } else {
      requestPath(world, a, prey.y * world.w + prey.x, undefined, walls);
      if (a.path) a.path = a.path.slice(0, 2);
    }
  }
  if (world.tick % 100 === 0) world.animals = world.animals.filter((a) => a.alive);
}
