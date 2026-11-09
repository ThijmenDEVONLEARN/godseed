import { BALANCE } from '../../config/balance';
import { TEAMS } from '@godseed/shared';
import { aliveUnitsOf, buildingsOf, dist, emit, npcsOf } from '../entities';
import { canAfford, placeBuilding, popCap } from '../systems/buildings';
import { retarget } from '../systems/jobs';
import { cap } from '../systems/population';
import { Tile, type BuildingType, type Resource, type Team, type World } from '../types';

/** Every few seconds each tribe decides what to build, what to gather and whether to raid. */
export function teamBrains(world: World): void {
  for (const team of TEAMS) if ((world.tick + TEAMS.indexOf(team) * 7) % BALANCE.brain.everyTicks === 0) think(world, team);
}

function think(world: World, team: Team): void {
  const t = world.teams[team], s = t.stock;
  const count = (type: BuildingType) => buildingsOf(world, team, type).length;
  const threatened = world.tick - t.lastThreatTick < BALANCE.brain.threatMemoryTicks;
  const pop = aliveUnitsOf(world, team).length;

  // what to build next: at most one project at a time
  if (!world.buildings.some((b) => b.alive && b.team === team && b.progress < 1)) {
    const wants: BuildingType[] = [];
    if (s.food < 20 && count('farm') < 4) wants.push('farm');
    if (pop >= popCap(world, team) - 2 && count('hut') < 9) wants.push('hut');
    if (threatened) wants.push(count('wall') < 18 ? 'wall' : 'tower');
    if (!count('smithy')) wants.push('smithy');
    if (s.gold >= 10 && !count('temple')) wants.push('temple');
    if (!count('bridge') && riverNear(world, team)) wants.push('bridge');
    if (count('tower') < 2 && count('hut') >= 3) wants.push('tower');
    if (count('farm') < 2) wants.push('farm');
    if (count('hut') < 9) wants.push('hut');
    const next = wants.find((w) => canAfford(world, team, w));
    if (next) placeBuilding(world, team, next);
  }

  // what to gather, most needed first
  const focus: Resource[] = [];
  if (s.food < 40) focus.push('food', 'food');
  focus.push('wood');
  if (s.stone < 40) focus.push('stone');
  if (!count('smithy') && s.iron < 5) focus.push('iron');
  if (!count('temple') && s.gold < 10) focus.push('gold');
  focus.push(s.food < 200 ? 'food' : 'stone', 'wood');
  t.focus = focus;

  // raids: at war, or now and then on the nearest tribe
  const due = world.tick - t.lastRaidTick >= BALANCE.brain.raidEveryTicks;
  if (due && (t.atWarWith.length || world.rng.chance(BALANCE.brain.raidChance))) {
    t.lastRaidTick = world.tick;
    const target = t.atWarWith[0] ?? nearestTeam(world, team);
    const npcs = npcsOf(world, team);
    const raiders = npcs.filter((u) => u.role === 'warrior').concat(npcs.filter((u) => u.role === 'worker').filter((_, i) => i % Math.round(1 / BALANCE.brain.raidWorkerShare) === 0));
    if (raiders.length >= 2) {
      for (const u of raiders) { u.carrying = undefined; retarget(world, u, target); }
      emit(world, { kind: 'raid', team, text: `${cap(team)} raids ${cap(target)}!`, x: t.homeX, y: t.homeY });
    } else if (!t.atWarWith.length) t.lastRaidTick = world.tick - BALANCE.brain.raidEveryTicks / 2;
  }
}

function nearestTeam(world: World, team: Team): Team {
  const me = world.teams[team];
  return TEAMS.filter((o) => o !== team).sort((a, b) => dist({ x: me.homeX, y: me.homeY }, { x: world.teams[a].homeX, y: world.teams[a].homeY }) - dist({ x: me.homeX, y: me.homeY }, { x: world.teams[b].homeX, y: world.teams[b].homeY }))[0];
}

function riverNear(world: World, team: Team): boolean {
  const t = world.teams[team];
  for (let y = t.homeY - 10; y <= t.homeY + 10; y++) for (let x = t.homeX - 10; x <= t.homeX + 10; x++) {
    if (x > 0 && y >= 0 && x < world.w - 1 && y < world.h && world.tiles[y * world.w + x] === Tile.Water && world.tiles[y * world.w + x - 1] !== Tile.Water) return true;
  }
  return false;
}
