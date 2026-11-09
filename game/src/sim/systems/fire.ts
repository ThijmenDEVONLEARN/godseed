import { BALANCE } from '../../config/balance';
import { emit } from '../entities';
import { NEIGHBORS, setTile } from '../grid';
import { damageBuilding } from './combat';
import { Tile, type Building, type World } from '../types';

export function ignite(world: World, b: Building): void {
  if (!b.alive || b.burning || b.type === 'wall') return;
  b.burning = true;
  emit(world, { kind: 'fire', team: b.team, text: `A ${b.team} ${b.type} is on fire!`, x: b.x, y: b.y });
}

export function igniteTile(world: World, i: number): void {
  if (world.tiles[i] === Tile.Forest && !world.burningTiles.has(i)) world.burningTiles.set(i, world.tick + BALANCE.fire.forestBurnTicks);
}

/** Burning buildings lose hp and can spread to neighbours; burning forest turns to ash and regrows later. */
export function fire(world: World, raining: boolean): void {
  const check = world.tick % BALANCE.fire.checkEveryTicks === 0;
  for (const b of world.buildings) {
    if (!b.alive || !b.burning) continue;
    if (raining) { b.burning = false; continue; }
    damageBuilding(world, b, BALANCE.fire.buildingDamagePerTick);
    if (!check || !b.alive) continue;
    if (world.rng.chance(BALANCE.fire.putOutChance)) { b.burning = false; continue; }
    if (world.rng.chance(BALANCE.fire.spreadChance)) {
      const near = world.buildings.find((o) => o.alive && !o.burning && o !== b && Math.max(Math.abs(o.x - b.x), Math.abs(o.y - b.y)) <= 1);
      if (near) ignite(world, near);
      for (const [dx, dy] of NEIGHBORS) igniteTile(world, (b.y + dy) * world.w + b.x + dx);
    }
  }
  for (const [i, until] of [...world.burningTiles]) {
    if (raining) { world.burningTiles.delete(i); continue; }
    if (check && world.rng.chance(BALANCE.fire.spreadChance)) {
      const x = i % world.w, y = (i - x) / world.w;
      const [dx, dy] = world.rng.pick(NEIGHBORS);
      if (x + dx >= 0 && y + dy >= 0 && x + dx < world.w && y + dy < world.h) igniteTile(world, (y + dy) * world.w + x + dx);
    }
    if (world.tick < until) continue;
    world.burningTiles.delete(i);
    world.deposits[i] = 0;
    setTile(world, i, Tile.Burnt);
    world.regrowTiles.set(i, world.tick + BALANCE.fire.burntRegrowTicks);
  }
  for (const [i, at] of [...world.regrowTiles]) {
    if (world.tick < at) continue;
    world.regrowTiles.delete(i);
    if (world.tiles[i] === Tile.Burnt) setTile(world, i, Tile.Grass);
  }
}
