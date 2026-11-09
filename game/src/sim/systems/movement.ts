import { BALANCE } from '../../config/balance';
import { stepCost } from '../grid';
import { damageBuilding } from './combat';
import type { Mover, Team, Unit, World } from '../types';

export const ready = (world: World, m: Mover) => world.tick >= m.moveStartTick + m.moveTicks;
export const arrived = (m: Mover) => !m.path || m.path.length === 0;

/** Steps every mover one tile along its path when its previous step has finished. */
export function movement(world: World, walls: Map<number, Team>): void {
  for (const u of world.units) if (u.alive) stepMover(world, u, u.team, walls, u);
  for (const a of world.animals) if (a.alive) stepMover(world, a, undefined, walls);
}

function stepMover(world: World, m: Mover, team: Team | undefined, walls: Map<number, Team>, unit?: Unit): void {
  if (!m.path || m.path.length === 0 || !ready(world, m)) return;
  const next = m.path[0];
  const wallTeam = walls.get(next);
  if (unit && wallTeam !== undefined && wallTeam !== team) {
    // an enemy wall is in the way: break it down before stepping through
    if (world.tick >= unit.nextHitTick) {
      const wall = world.buildings.find((b) => b.alive && b.type === 'wall' && b.y * world.w + b.x === next);
      if (wall) damageBuilding(world, wall, unit.role === 'warrior' ? BALANCE.unit.warriorDamage : BALANCE.unit.workerDamage, unit.team);
      unit.nextHitTick = world.tick + BALANCE.unit.hitEveryTicks;
    }
    return;
  }
  const cost = stepCost(world, next, team, walls);
  if (cost === Infinity) {
    m.path = undefined;
    m.pathGoal = undefined;
    return;
  }
  m.path.shift();
  if (!m.path.length) m.path = undefined; // done: lets jobs test `!path` for "needs a new path"
  m.px = m.x;
  m.py = m.y;
  m.x = next % world.w;
  m.y = (next - m.x) / world.w;
  m.moveStartTick = world.tick;
  m.moveTicks = cost;
}
