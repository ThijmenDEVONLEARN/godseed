import { BALANCE } from '../config/balance';
import { teamBrains } from './ai/TeamBrain';
import { spawnUnit } from './entities';
import { wallMap } from './pathfind';
import { startWorld } from './setup';
import { animals } from './systems/animals';
import { combat } from './systems/combat';
import { fire } from './systems/fire';
import { jobs } from './systems/jobs';
import { movement } from './systems/movement';
import { population } from './systems/population';
import { round } from './systems/round';
import type { SimEvent, Team, World } from './types';

/** Everything viewers can do reaches the sim as a command; phase 2 adds the rest. */
export type SimCommand = { kind: 'join'; viewerId: string; name: string; team: Team };

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
      for (const cmd of queue) apply(world, cmd);
      queue = [];
      if (world.round.phase !== 'scoreboard') {
        teamBrains(world);
        const walls = wallMap(world);
        jobs(world, walls);
        movement(world, walls);
        combat(world);
        fire(world, false);
        population(world);
        animals(world, walls);
      }
      round(world);
      return world.events;
    },
  };
}

function apply(world: World, cmd: SimCommand): void {
  if (cmd.kind !== 'join') return;
  const mine = world.units.find((u) => u.viewerId === cmd.viewerId);
  if (mine?.alive || (mine && world.tick < (mine.respawnAt ?? 0))) return;
  if (mine) world.units.splice(world.units.indexOf(mine), 1);
  const t = world.teams[cmd.team];
  spawnUnit(world, cmd.team, 'viewer', t.homeX, t.homeY, { viewerId: cmd.viewerId, name: cmd.name });
  world.events.push({ tick: world.tick, kind: 'join', team: cmd.team, x: t.homeX, y: t.homeY, text: `${cmd.name} joined ${cmd.team}` });
}
