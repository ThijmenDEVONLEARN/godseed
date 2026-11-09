import { BALANCE } from '../../config/balance';
import { buildingsOf, dist, emit } from '../entities';
import { idx, setTile } from '../grid';
import { requestPath } from '../pathfind';
import { completeBuilding, nextConstruction } from './buildings';
import { arrived, ready } from './movement';
import { Deposit, Tile, type Building, type Resource, type Team, type Unit, type World } from '../types';

const DEPOSIT_FOR: Partial<Record<Resource, Deposit>> = { wood: Deposit.Tree, stone: Deposit.Stone, iron: Deposit.Iron, gold: Deposit.Gold };

/** Nearest tile holding a deposit of this kind, or undefined. */
function nearestDeposit(world: World, kind: Deposit, from: { x: number; y: number }): number | undefined {
  let best: number | undefined, bd = Infinity;
  for (let i = 0; i < world.deposits.length; i++) {
    if (world.deposits[i] !== kind) continue;
    const x = i % world.w, y = (i - x) / world.w, d = Math.abs(x - from.x) + Math.abs(y - from.y);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

const homeIdx = (world: World, team: Team) => world.teams[team].homeY * world.w + world.teams[team].homeX;

/** Moves a unit towards a tile; true once standing on it. Unreachable goals send the unit idle. */
function goTo(world: World, u: Unit, goal: number, walls: Map<number, Team>): boolean {
  if (u.y * world.w + u.x === goal) return true;
  if (u.pathGoal !== goal || !u.path) {
    const r = requestPath(world, u, goal, u.team, walls);
    if (r === 'fail') {
      u.job = { kind: 'idle' };
      emit(world, { kind: 'noPath', team: u.team, text: `${u.name ?? 'A villager'} cannot get there`, x: u.x, y: u.y });
    }
  }
  return false;
}

/** Picks a new job for an idle villager. */
export function chooseJob(world: World, u: Unit): void {
  const team = world.teams[u.team];
  if (u.role === 'warrior' || u.role === 'leader') { u.job = { kind: 'defend' }; return; }
  const site = nextConstruction(world, u.team, u);
  const builders = site ? world.units.filter((o) => o.alive && o.job.kind === 'build' && o.job.targetId === site.id).length : 0;
  if (site && builders < 3) { u.job = { kind: 'build', targetId: site.id }; return; }
  const res = team.focus[u.id % team.focus.length] ?? 'wood';
  startGather(world, u, res);
}

export function startGather(world: World, u: Unit, res: Resource): void {
  if (res === 'food') {
    const farms = buildingsOf(world, u.team, 'farm').filter((b) => b.progress >= 1);
    if (farms.length) {
      const f = farms[u.id % farms.length];
      const spots = [-1, 0, 1].flatMap((dy) => [-1, 0, 1].map((dx) => [f.x + dx, f.y + dy] as const));
      const [tx, ty] = spots[world.rng.int(spots.length)];
      u.job = { kind: 'gather', res, stage: 'go', tx, ty, workLeft: BALANCE.gather.workTicks.food };
      return;
    }
    const sheep = nearestSheep(world, u);
    if (sheep) { u.job = { kind: 'hunt', targetId: sheep.id, stage: 'go' }; return; }
    res = 'wood';
  }
  const target = nearestDeposit(world, DEPOSIT_FOR[res]!, u);
  if (target === undefined) { u.job = { kind: 'defend' }; return; }
  const tx = target % world.w;
  u.job = { kind: 'gather', res, stage: 'go', tx, ty: (target - tx) / world.w, workLeft: BALANCE.gather.workTicks[res] };
}

function nearestSheep(world: World, u: Unit) {
  let best;
  for (const a of world.animals) if (a.alive && a.kind === 'sheep' && dist(a, u) < 25 && (!best || dist(a, u) < dist(best, u))) best = a;
  return best;
}

function deliver(world: World, u: Unit): void {
  if (u.carrying) world.teams[u.team].stock[u.carrying.res] += u.carrying.amount;
  u.carrying = undefined;
  u.job = { kind: 'idle' };
}

/** Runs each unit's job state machine. Viewer units only act on their own orders. */
export function jobs(world: World, walls: Map<number, Team>): void {
  const unitsById = new Map(world.units.map((x) => [x.id, x]));
  for (const u of world.units) {
    if (!u.alive || !ready(world, u)) continue;
    if (u.job.kind === 'idle' && !u.viewerId) chooseJob(world, u);
    const job = u.job;
    switch (job.kind) {
      case 'gather': {
        const target = job.ty * world.w + job.tx;
        if (job.stage === 'go') {
          if (goTo(world, u, target, walls)) job.stage = 'work';
        } else if (job.stage === 'work') {
          if (--job.workLeft > 0) break;
          let amount = BALANCE.gather.carry;
          if (job.res === 'food') {
            if (world.tiles[target] !== Tile.Farmland) amount = 0;
          } else {
            const left = world.depositAmount[target];
            amount = Math.min(amount, left);
            world.depositAmount[target] = left - amount;
            if (left - amount <= 0 && world.deposits[target]) {
              world.deposits[target] = Deposit.None;
              if (world.tiles[target] === Tile.Forest) setTile(world, target, Tile.Grass);
              else world.dirtyTiles.push(target);
            }
          }
          u.carrying = amount ? { res: job.res, amount } : undefined;
          job.stage = 'return';
        } else if (goTo(world, u, homeIdx(world, u.team), walls)) deliver(world, u);
        break;
      }
      case 'hunt': {
        const sheep = world.animals.find((a) => a.id === job.targetId);
        if (job.stage === 'go') {
          if (!sheep?.alive) { u.job = { kind: 'idle' }; break; }
          if (dist(u, sheep) <= 1) {
            sheep.alive = false;
            u.carrying = { res: 'food', amount: BALANCE.animals.sheepFood };
            job.stage = 'return';
          } else if (arrived(u) || (world.tick % 20 === u.id % 20)) {
            u.path = undefined;
            goTo(world, u, sheep.y * world.w + sheep.x, walls);
          }
        } else if (goTo(world, u, homeIdx(world, u.team), walls)) deliver(world, u);
        break;
      }
      case 'build': {
        const b = world.buildings.find((x) => x.id === job.targetId);
        if (!b?.alive || b.progress >= 1) { u.job = { kind: 'idle' }; break; }
        if (dist(u, b) <= 1) {
          u.path = undefined;
          b.progress = Math.min(1, b.progress + BALANCE.buildRatePerTick);
          if (b.progress >= 1) completeBuilding(world, b);
        } else if (!u.path) {
          const goal = buildSpot(world, b);
          if (goal === undefined || requestPath(world, u, goal, u.team, walls) === 'fail') u.job = { kind: 'idle' };
        }
        break;
      }
      case 'attack': {
        const target: Unit | Building | undefined = job.targetIsUnit ? unitsById.get(job.targetId) : world.buildings.find((x) => x.id === job.targetId);
        if (!target?.alive) { retarget(world, u, job.team); break; }
        if (dist(u, target) <= 1) { u.path = undefined; break; }
        const goal = target.y * world.w + target.x;
        if (!u.path || (u.pathGoal !== goal && world.tick % 10 === u.id % 10)) {
          u.path = undefined;
          if (requestPath(world, u, goal, u.team, walls) === 'fail') retarget(world, u, job.team);
        }
        break;
      }
      case 'defend': {
        const t = world.teams[u.team];
        const enemy = world.units.find((e) => e.alive && e.team !== u.team && Math.abs(e.x - t.homeX) + Math.abs(e.y - t.homeY) <= BALANCE.brain.defendRadius);
        if (enemy) {
          t.lastThreatTick = world.tick;
          u.job = { kind: 'attack', team: enemy.team, targetId: enemy.id, targetIsUnit: true };
        } else if (Math.abs(u.x - t.homeX) + Math.abs(u.y - t.homeY) > 3 && !u.path) {
          goTo(world, u, homeIdx(world, u.team), walls);
        } else if (!u.viewerId && u.role === 'worker') {
          u.job = { kind: 'idle' };
        }
        break;
      }
    }
  }
}

/** A walkable tile next to (or on) a building. */
function buildSpot(world: World, b: Building): number | undefined {
  for (const [dx, dy] of [[0, 0], [0, 1], [1, 0], [-1, 0], [0, -1]]) {
    const x = b.x + dx, y = b.y + dy;
    if (x < 0 || y < 0 || x >= world.w || y >= world.h) continue;
    const t = world.tiles[idx(world.w, x, y)];
    if (t !== Tile.Water && t !== Tile.DeepWater && t !== Tile.Mountain) return idx(world.w, x, y);
  }
  return undefined;
}

/** After a target dies: next enemy nearby, else the enemy's nearest building, else go home. */
export function retarget(world: World, u: Unit, team: Team): void {
  let unit: Unit | undefined;
  for (const e of world.units) if (e.alive && e.team === team && dist(e, u) <= 8 && (!unit || dist(e, u) < dist(unit, u))) unit = e;
  if (unit) { u.job = { kind: 'attack', team, targetId: unit.id, targetIsUnit: true }; return; }
  let b: Building | undefined;
  for (const x of world.buildings) if (x.alive && x.team === team && x.type !== 'wall' && (!b || dist(x, u) < dist(b, u))) b = x;
  if (b && dist(b, u) <= 30) { u.job = { kind: 'attack', team, targetId: b.id, targetIsUnit: false }; return; }
  u.path = undefined;
  u.job = u.viewerId ? { kind: 'idle' } : { kind: 'defend' };
}
