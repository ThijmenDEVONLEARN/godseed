import { TEAMS } from '@godseed/shared';
import { BALANCE } from '../config/balance';
import { aliveUnitsOf, dist, emit, spawnUnit } from './entities';
import { canAfford, placeBuilding } from './systems/buildings';
import { castVote } from './systems/vote';
import type { Building, BuildingType, Order, Team, Unit, World } from './types';

/** Everything a viewer can do reaches the sim as a command. Names are already filtered by the parser. */
export type SimCommand = { viewerId: string } & (
  | { kind: 'join'; name: string; team?: Team }
  | { kind: 'build'; building: BuildingType }
  | { kind: 'order'; order: Order }
  | { kind: 'attackTeam'; team: Team }
  | { kind: 'attackPlayer'; targetName: string }
  | { kind: 'burn' }
  | { kind: 'rename'; name: string }
  | { kind: 'vote'; option: 1 | 2 | 3 }
);

const info = (world: World, text: string, team?: Team) => emit(world, { kind: 'info', team, text });

export function viewerUnit(world: World, viewerId: string): Unit | undefined {
  return world.units.find((u) => u.viewerId === viewerId);
}

export function applyCommand(world: World, cmd: SimCommand): void {
  if (cmd.kind === 'join') return join(world, cmd.viewerId, cmd.name, cmd.team);
  if (cmd.kind === 'vote') return castVote(world, cmd.viewerId, cmd.option);
  const u = viewerUnit(world, cmd.viewerId);
  if (!u?.alive) {
    info(world, u ? `${u.name}: you are dead, !join again soon` : `Type !join to get a villager first`);
    return;
  }
  switch (cmd.kind) {
    case 'build': {
      if (!canAfford(world, u.team, cmd.building)) {
        const need = Object.entries(BALANCE.costs[cmd.building]).map(([r, n]) => `${n} ${r}`).join(' + ');
        info(world, `${u.name}: ${u.team} needs ${need} for a ${cmd.building}`, u.team);
        return;
      }
      const placed = placeBuilding(world, u.team, cmd.building);
      if (!placed.length) { info(world, `${u.name}: no room for a ${cmd.building}`, u.team); return; }
      u.job = { kind: 'build', targetId: placed[0].id };
      u.path = undefined;
      return;
    }
    case 'order':
      u.order = cmd.order;
      u.job = { kind: 'idle' };
      u.path = undefined;
      return;
    case 'attackTeam': {
      if (cmd.team === u.team) { info(world, `${u.name}: that is your own tribe!`, u.team); return; }
      const target = nearestEnemy(world, u, cmd.team);
      if (!target) { info(world, `${u.name}: nothing of ${cmd.team} left to attack`, u.team); return; }
      setAttack(u, cmd.team, target);
      return;
    }
    case 'attackPlayer': {
      const name = cmd.targetName.toLowerCase();
      const target = world.units.find((e) => e.alive && e !== u && e.name?.toLowerCase() === name);
      if (!target) { info(world, `${u.name}: nobody called ${cmd.targetName} is alive`, u.team); return; }
      setAttack(u, target.team, target);
      return;
    }
    case 'burn': {
      let best: Building | undefined;
      for (const b of world.buildings) if (b.alive && b.team !== u.team && b.type !== 'wall' && !b.burning && (!best || dist(b, u) < dist(best, u))) best = b;
      if (!best) { info(world, `${u.name}: nothing to burn`, u.team); return; }
      u.job = { kind: 'attack', team: best.team, targetId: best.id, targetIsUnit: false, burn: true };
      u.path = undefined;
      return;
    }
    case 'rename':
      info(world, `${u.name} is now called ${cmd.name}`, u.team);
      u.name = cmd.name;
      return;
  }
}

function setAttack(u: Unit, team: Team, target: Unit | Building): void {
  u.job = { kind: 'attack', team, targetId: target.id, targetIsUnit: 'role' in target };
  u.path = undefined;
}

function nearestEnemy(world: World, u: Unit, team: Team): Unit | Building | undefined {
  let best: Unit | Building | undefined;
  for (const e of [...world.buildings, ...world.units]) {
    if (!e.alive || e.team !== team || ('type' in e && e.type === 'wall')) continue;
    if (!best || dist(e, u) < dist(best, u)) best = e;
  }
  return best;
}

function join(world: World, viewerId: string, name: string, wanted?: Team): void {
  const mine = viewerUnit(world, viewerId);
  if (mine?.alive) { info(world, `${mine.name} is already in ${mine.team}`, mine.team); return; }
  if (mine && world.tick < (mine.respawnAt ?? 0)) {
    info(world, `${mine.name}: you can rejoin in ${Math.ceil(((mine.respawnAt ?? 0) - world.tick) / BALANCE.ticksPerSecond)}s`, mine.team);
    return;
  }
  const team = wanted ?? mine?.team ?? smallestTeam(world);
  if (mine) world.units.splice(world.units.indexOf(mine), 1);
  const t = world.teams[team];
  const u = spawnUnit(world, team, 'viewer', t.homeX, t.homeY, { viewerId, name });
  emit(world, { kind: 'join', team, x: t.homeX, y: t.homeY, unitId: u.id, text: `${name} joined ${team}` });
}

function smallestTeam(world: World): Team {
  const sizes = TEAMS.map((t) => aliveUnitsOf(world, t).length);
  const min = Math.min(...sizes);
  return world.rng.pick(TEAMS.filter((_, i) => sizes[i] === min));
}
