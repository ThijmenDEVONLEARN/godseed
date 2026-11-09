import { TEAMS } from '@godseed/shared';
import { BALANCE } from '../config/balance';
import { spawnUnit } from './entities';
import { spawnStartAnimals } from './systems/animals';
import { generateWorld } from './worldgen/generate';
import type { World } from './types';

/** A fresh world with every tribe's starting villagers (2 warriors) and the starting animals. */
export function startWorld(seed: number): World {
  const world = generateWorld(seed);
  for (const team of TEAMS) {
    const t = world.teams[team];
    for (let i = 0; i < BALANCE.startNpcs; i++) spawnUnit(world, team, i < 2 ? 'warrior' : 'worker', t.homeX, t.homeY);
  }
  spawnStartAnimals(world);
  return world;
}
