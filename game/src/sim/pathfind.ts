import { BALANCE } from '../config/balance';
import { NEIGHBORS, stepCost } from './grid';
import type { Mover, Team, World } from './types';

/** Tile index → team of every complete, standing wall. Rebuilt once per tick. */
export function wallMap(world: World): Map<number, Team> {
  const m = new Map<number, Team>();
  for (const b of world.buildings) if (b.alive && b.type === 'wall' && b.progress >= 1) m.set(b.y * world.w + b.x, b.team);
  return m;
}

/** A* on the 4-connected grid with tile costs. Returns the steps after `from`, or null. */
export function findPath(world: World, from: number, goal: number, team: Team | undefined, walls: Map<number, Team>): number[] | null {
  if (from === goal) return [];
  const w = world.w, gx = goal % w, gy = (goal - gx) / w;
  const g = new Map<number, number>([[from, 0]]);
  const came = new Map<number, number>();
  const heap: [number, number][] = [];
  const push = (f: number, i: number) => {
    heap.push([f, i]);
    for (let c = heap.length - 1; c > 0;) {
      const p = (c - 1) >> 1;
      if (heap[p][0] < heap[c][0] || (heap[p][0] === heap[c][0] && heap[p][1] <= heap[c][1])) break;
      [heap[p], heap[c]] = [heap[c], heap[p]];
      c = p;
    }
  };
  const pop = () => {
    const top = heap[0], last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      for (let p = 0; ;) {
        const l = 2 * p + 1, r = l + 1;
        let m = p;
        const less = (a: number, b: number) => heap[a][0] < heap[b][0] || (heap[a][0] === heap[b][0] && heap[a][1] < heap[b][1]);
        if (l < heap.length && less(l, m)) m = l;
        if (r < heap.length && less(r, m)) m = r;
        if (m === p) break;
        [heap[p], heap[m]] = [heap[m], heap[p]];
        p = m;
      }
    }
    return top;
  };
  push(0, from);
  for (let expansions = 0; heap.length && expansions < BALANCE.pathMaxExpansions; expansions++) {
    const [, cur] = pop();
    if (cur === goal) {
      const path = [cur];
      for (let c = cur; came.has(c) && came.get(c) !== from;) { c = came.get(c)!; path.push(c); }
      return path.reverse();
    }
    const cx = cur % w, cy = (cur - cx) / w, gc = g.get(cur)!;
    for (const [dx, dy] of NEIGHBORS) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= world.h) continue;
      const n = ny * w + nx, cost = stepCost(world, n, team, walls);
      if (cost === Infinity) continue;
      const ng = gc + cost;
      if (ng >= (g.get(n) ?? Infinity)) continue;
      g.set(n, ng);
      came.set(n, cur);
      push(ng + Math.abs(nx - gx) + Math.abs(ny - gy), n);
    }
  }
  return null;
}

export type PathResult = 'ok' | 'wait' | 'fail';

/** Gives the mover a path to `goal`, within the per-tick budget. */
export function requestPath(world: World, m: Mover, goal: number, team: Team | undefined, walls: Map<number, Team>): PathResult {
  if (m.pathGoal === goal && m.path) return 'ok';
  if (world.pathBudget <= 0) return 'wait';
  world.pathBudget--;
  const path = findPath(world, m.y * world.w + m.x, goal, team, walls);
  if (!path) {
    m.path = undefined;
    m.pathGoal = undefined;
    return 'fail';
  }
  m.path = path;
  m.pathGoal = goal;
  return 'ok';
}
