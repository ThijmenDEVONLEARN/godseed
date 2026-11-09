import { BALANCE } from '../../config/balance';
import { TEAMS } from '@godseed/shared';
import { aliveUnitsOf, completeOf, emit, npcsOf, spawnUnit } from '../entities';
import { damageUnit } from './combat';
import { popCap } from './buildings';
import type { Team, World } from '../types';

/** Hunger, eating at home, births, and the villager minimum that keeps every tribe alive. */
export function population(world: World): void {
  const h = BALANCE.hunger;
  if (world.tick % h.dropEveryTicks === 0) {
    for (const u of world.units) {
      if (!u.alive) continue;
      const t = world.teams[u.team];
      u.hunger = Math.max(0, u.hunger - 1);
      const home = Math.abs(u.x - t.homeX) + Math.abs(u.y - t.homeY) <= 3;
      if (u.hunger < h.eatBelow && home && t.stock.food >= 1) { t.stock.food--; u.hunger = h.max; }
      if (u.hunger === 0) damageUnit(world, u, h.starveDamage, undefined, 'starved');
    }
  }
  for (const team of TEAMS) {
    const t = world.teams[team];
    const pop = aliveUnitsOf(world, team).length;
    if (world.tick % BALANCE.birthEveryTicks === 0 && t.stock.food >= BALANCE.birthFoodCost && pop < popCap(world, team)) {
      t.stock.food -= BALANCE.birthFoodCost;
      newVillager(world, team);
      emit(world, { kind: 'birth', team, text: `A child was born in ${cap(team)}`, x: t.homeX, y: t.homeY });
    }
    if (world.tick % BALANCE.npcRespawnTicks === 0 && npcsOf(world, team).length < BALANCE.npcMin) {
      newVillager(world, team);
      emit(world, { kind: 'birth', team, text: `The gods send a settler to ${cap(team)}`, x: t.homeX, y: t.homeY });
    }
  }
  if (world.tick % 100 === 0) world.units = world.units.filter((u) => u.alive || u.viewerId);
}

export function newVillager(world: World, team: Team) {
  const t = world.teams[team];
  const warriorEvery = completeOf(world, team, 'smithy').length ? 4 : 6;
  const n = npcsOf(world, team).length + 1;
  return spawnUnit(world, team, n % warriorEvery === 0 ? 'warrior' : 'worker', t.homeX, t.homeY);
}

export const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
