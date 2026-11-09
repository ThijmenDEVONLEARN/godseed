import { BALANCE } from '../config/balance';
import { teamBrains } from './ai/TeamBrain';
import { applyCommand, type SimCommand } from './commands';
import { wallMap } from './pathfind';
import { startWorld } from './setup';
import { animals } from './systems/animals';
import { combat } from './systems/combat';
import { fire } from './systems/fire';
import { jobs } from './systems/jobs';
import { movement } from './systems/movement';
import { population } from './systems/population';
import { round } from './systems/round';
import { vote } from './systems/vote';
import { godTick } from './god';
import type { SimEvent, World } from './types';

export type { SimCommand };

export interface Simulation {
  world: World;
  enqueue(cmd: SimCommand): void;
  /** Advances one tick (1/10 s) and returns the events of that tick. */
  step(): SimEvent[];
}

export function createSimulation(seed: number): Simulation {
  const world = startWorld(seed);
  let queue: SimCommand[] = [];
  return {
    world,
    enqueue: (cmd) => { queue.push(cmd); },
    step() {
      world.tick++;
      world.events = [];
      world.pathBudget = BALANCE.pathBudgetPerTick;
      for (const cmd of queue) applyCommand(world, cmd);
      queue = [];
      if (world.round.phase !== 'scoreboard') {
        teamBrains(world);
        const walls = wallMap(world);
        jobs(world, walls);
        movement(world, walls);
        combat(world);
        godTick(world);
        fire(world, world.tick < world.rainUntil);
        population(world);
        animals(world, walls);
        vote(world);
      }
      round(world);
      return world.events;
    },
  };
}
