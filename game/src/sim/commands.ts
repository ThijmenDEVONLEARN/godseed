import { BALANCE } from '../config/balance';
import { dist, emit, spawnUnit } from './entities';
import { canAfford, placeBuilding } from './systems/buildings';
import { castVote } from './systems/vote';
import { applyGift, applyGod, smallestTeam } from './god';
import type { GodEffect } from '../config/gifts';
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
  | { kind: 'gift'; name: string; coins: number; giftId: number }
  | { kind: 'god'; effect: GodEffect; name: string }
  | { kind: 'leaderCmd'; cmd: 'rally' | 'tax' | 'war' | 'peace'; team?: Team }
);

const info = (world: World, text: string, team?: Team) => emit(world, { kind: 'info', team, text });

export function viewerUnit(world: World, viewerId: string): Unit | undefined {
  return world.units.find((u) => u.viewerId === viewerId);
}

export function applyCommand(world: World, cmd: SimCommand): void {
  if (cmd.kind === 'join') return join(world, cmd.viewerId, cmd.name, cmd.team);
  if (cmd.kind === 'vote') return castVote(world, cmd.viewerId, cmd.option);
  if (cmd.kind === 'gift') return applyGift(world, cmd.viewerId, cmd.name, cmd.coins, cmd.giftId);
  if (cmd.kind === 'god') {
    const own = viewerUnit(world, cmd.viewerId);
    return applyGod(world, cmd.effect, own?.alive ? own.team : smallestTeam(world), cmd.name, own?.alive ? own : undefined);
  }
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
    case 'leaderCmd': return leaderCommand(world, u, cmd.cmd, cmd.team);
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

const TAX_COOLDOWN_TICKS = 1200; // 2 min
const PEACE_EXTRA_TICKS = 1500; // on top of the normal raid interval

function leaderCommand(world: World, u: Unit, cmd: 'rally' | 'tax' | 'war' | 'peace', other?: Team): void {
  if (world.leaders[u.team] !== u.id || u.role !== 'leader') { info(world, `${u.name}: only the chief can do that (gift 199 coins)`, u.team); return; }
  const t = world.teams[u.team];
  switch (cmd) {
    case 'rally':
      for (const x of world.units) if (x.alive && x.team === u.team && x !== u && !x.viewerId) { x.job = { kind: 'guard', x: u.x, y: u.y }; x.path = undefined; }
      emit(world, { kind: 'info', team: u.team, text: `Chief ${u.name} rallies ${u.team}!` });
      return;
    case 'tax':
      if (world.tick < (t.taxReadyTick ?? 0)) { info(world, `${u.name}: the people were taxed recently`, u.team); return; }
      if (t.stock.food < 5) { info(world, `${u.name}: not enough food to tax`, u.team); return; }
      t.taxReadyTick = world.tick + TAX_COOLDOWN_TICKS;
      t.stock.food -= 5; t.stock.gold += 5;
      emit(world, { kind: 'info', team: u.team, text: `Chief ${u.name} taxed the people: +5 gold` });
      return;
    case 'war': case 'peace':
      if (!other || other === u.team) { info(world, `${u.name}: !${cmd} red / blue / yellow / green`, u.team); return; }
      t.atWarWith = cmd === 'war' ? [other, ...t.atWarWith.filter((x) => x !== other)] : t.atWarWith.filter((x) => x !== other);
      if (cmd === 'war') t.lastRaidTick = -1e9;
      else {
        // peace is mutual: both sides stop their raids and call back fighters already on the way
        const o = world.teams[other];
        o.atWarWith = o.atWarWith.filter((x) => x !== u.team);
        t.lastRaidTick = o.lastRaidTick = world.tick + PEACE_EXTRA_TICKS; // both tribes stay defensive for ~5 min
        for (const x of world.units) {
          if (x.alive && x.job.kind === 'attack' && ((x.team === u.team && x.job.team === other) || (x.team === other && x.job.team === u.team))) { x.job = { kind: 'idle' }; x.path = undefined; }
        }
      }
      emit(world, { kind: 'info', team: u.team, text: cmd === 'war' ? `${u.team.toUpperCase()} DECLARES WAR ON ${other.toUpperCase()}!` : `${u.team} makes peace with ${other}` });
      return;
  }
}
