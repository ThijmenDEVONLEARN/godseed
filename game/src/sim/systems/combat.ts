import { BALANCE } from '../../config/balance';
import { completeOf, dist, emit } from '../entities';
import { ignite } from './fire';
import { setTile } from '../grid';
import { Tile, type Building, type Team, type Unit, type World } from '../types';

export function unitDamage(world: World, u: Unit): number {
  if (u.role === 'hero') return BALANCE.god.heroDamage;
  let base = u.role === 'warrior' || u.role === 'leader' ? BALANCE.unit.warriorDamage : BALANCE.unit.workerDamage;
  if (u.buff?.kind === 'weapon' && world.tick < u.buff.until) base *= BALANCE.god.weaponBonus;
  return completeOf(world, u.team, 'smithy').length ? base * BALANCE.unit.smithyBonus : base;
}

export function damageUnit(world: World, target: Unit, amount: number, by?: Unit, cause = 'fell'): void {
  if (!target.alive) return;
  if (target.buff?.kind === 'shield' && world.tick < target.buff.until) amount /= 2;
  target.hp -= amount;
  if (target.hp > 0) return;
  target.alive = false;
  target.path = undefined;
  if (target.viewerId) target.respawnAt = world.tick + BALANCE.unit.viewerRespawnTicks;
  if (world.leaders[target.team] === target.id) { world.leaders[target.team] = undefined; target.role = 'viewer'; }
  const who = target.name ? `${target.name} (${target.team})` : `a ${target.team} villager`;
  if (by) {
    by.kills++;
    world.teams[by.team].kills++;
    emit(world, { kind: 'kill', team: by.team, unitId: by.id, text: `${by.name ? `${by.name} (${by.team})` : `A ${by.team} ${by.role}`} slew ${who}`, x: target.x, y: target.y });
  } else {
    emit(world, { kind: 'death', team: target.team, text: `${who} ${cause}`, x: target.x, y: target.y });
  }
}

export function damageBuilding(world: World, b: Building, amount: number, by?: Team): void {
  if (!b.alive) return;
  b.hp -= amount;
  if (b.hp > 0) return;
  b.alive = false;
  b.burning = false;
  const i = b.y * world.w + b.x;
  if (b.type === 'bridge') setTile(world, i, Tile.Water);
  else if (b.progress >= 1) setTile(world, i, Tile.Ruins);
  emit(world, { kind: 'destroyed', team: b.team, text: `${by ? `${by} destroyed` : 'Lost'} a ${b.team} ${b.type}`, x: b.x, y: b.y });
}

/** Unit hits on its attack target or on adjacent raiders and wolves, plus tower shots. */
export function combat(world: World): void {
  const byId = new Map(world.units.map((u) => [u.id, u]));
  for (const u of world.units) {
    if (!u.alive || world.tick < u.nextHitTick) continue;
    let hit = false;
    if (u.job.kind === 'attack') {
      if (u.job.targetIsUnit) {
        const t = byId.get(u.job.targetId);
        if (t?.alive && dist(u, t) <= 1) { damageUnit(world, t, unitDamage(world, u), u); hit = true; }
      } else {
        const targetId = u.job.targetId;
        const b = world.buildings.find((x) => x.id === targetId);
        if (b?.alive && dist(u, b) <= 1) {
          if (u.job.burn && b.type !== 'wall') { ignite(world, b); u.job = { kind: 'idle' }; } else damageBuilding(world, b, unitDamage(world, u), u.team);
          hit = true;
        }
      }
    }
    if (!hit) {
      // self-defence against adjacent wolves and adjacent enemy raiders
      const wolf = world.animals.find((a) => a.alive && a.kind === 'wolf' && dist(a, u) <= 1);
      if (wolf) {
        wolf.hp -= unitDamage(world, u);
        if (wolf.hp <= 0) { wolf.alive = false; emit(world, { kind: 'kill', team: u.team, text: `${u.name ?? `A ${u.team} villager`} killed a wolf`, x: wolf.x, y: wolf.y }); }
        hit = true;
      } else {
        const raider = world.units.find((e) => e.alive && e.team !== u.team && e.job.kind === 'attack' && dist(e, u) <= 1);
        if (raider) { damageUnit(world, raider, unitDamage(world, u), u); hit = true; }
      }
    }
    if (hit) u.nextHitTick = world.tick + BALANCE.unit.hitEveryTicks;
  }
  for (const b of world.buildings) {
    if (!b.alive || b.type !== 'tower' || b.progress < 1 || world.tick < b.nextShotTick) continue;
    let best: Unit | undefined;
    for (const e of world.units) if (e.alive && e.team !== b.team && dist(e, b) <= BALANCE.tower.range && (!best || dist(e, b) < dist(best, b))) best = e;
    if (best) {
      damageUnit(world, best, BALANCE.tower.damage, undefined, `was shot by a ${b.team} tower`);
      if (!best.alive) world.teams[b.team].kills++;
      b.nextShotTick = world.tick + BALANCE.tower.everyTicks;
    }
  }
}
