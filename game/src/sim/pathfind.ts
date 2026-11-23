import { BALANCE } from '../config/balance';
import { NEIGHBORS, stepCost } from './grid';
import type { Mover, Team, World } from './types';

/** Tile index → team of every complete, standing wall. Rebuilt once per tick. */
export function wallMap(world: World): Map<number, Team> {
  const m = new Map<number, Team>();
  for (const b of world.buildings) if (b.alive && b.type === 'wall' && b.progress >= 1) m.set(b.y * world.w + b.x, b.team);
  return m;
}

// Scratch buffers shared by every search; `stamp` marks which entries belong to the current one.
let gCost = new Float64Array(0), came = new Int32Array(0), seen = new Uint32Array(0), stamp = 0;
let heapF = new Float64Array(1024), heapI = new Int32Array(1024);

/** A* on the 4-connected grid with tile costs. Returns the steps after `from`, or null. */
export function findPath(world: World, from: number, goal: number, team: Team | undefined, walls: Map<number, Team>): number[] | null {
  if (from === goal) return [];
  const w = world.w, h = world.h, gx = goal % w, gy = (goal - gx) / w;
  if (seen.length < w * h) {
    gCost = new Float64Array(w * h);
    came = new Int32Array(w * h);
    seen = new Uint32Array(w * h);
  }
  stamp++;
  let size = 0;
  // Min-heap ordered by f, then by tile index, so equal paths always resolve the same way.
  const less = (a: number, b: number) => heapF[a] < heapF[b] || (heapF[a] === heapF[b] && heapI[a] < heapI[b]);
  const swap = (a: number, b: number) => {
    const f = heapF[a], i = heapI[a];
    heapF[a] = heapF[b]; heapI[a] = heapI[b];
    heapF[b] = f; heapI[b] = i;
  };
  const push = (f: number, i: number) => {
    if (size === heapF.length) {
      const nf = new Float64Array(size * 2), ni = new Int32Array(size * 2);
      nf.set(heapF); ni.set(heapI);
      heapF = nf; heapI = ni;
    }
    heapF[size] = f; heapI[size] = i;
    for (let c = size++; c > 0;) {
      const p = (c - 1) >> 1;
      if (!less(c, p)) break;
      swap(c, p);
      c = p;
    }
  };
  const pop = () => {
    const top = heapI[0];
    size--;
    heapF[0] = heapF[size]; heapI[0] = heapI[size];
    for (let p = 0; ;) {
      const l = 2 * p + 1, r = l + 1;
      let m = p;
      if (l < size && less(l, m)) m = l;
      if (r < size && less(r, m)) m = r;
      if (m === p) break;
      swap(p, m);
      p = m;
    }
    return top;
  };
  seen[from] = stamp; gCost[from] = 0; came[from] = -1;
  push(0, from);
  for (let expansions = 0; size && expansions < BALANCE.pathMaxExpansions; expansions++) {
    const cur = pop();
    if (cur === goal) {
      const path = [cur];
      for (let c = cur; came[c] !== -1 && came[c] !== from;) { c = came[c]; path.push(c); }
      return path.reverse();
    }
    const cx = cur % w, cy = (cur - cx) / w, gc = gCost[cur];
    for (const [dx, dy] of NEIGHBORS) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const n = ny * w + nx, cost = stepCost(world, n, team, walls);
      if (cost === Infinity) continue;
      const ng = gc + cost;
      if (seen[n] === stamp && ng >= gCost[n]) continue;
      seen[n] = stamp; gCost[n] = ng; came[n] = cur;
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
