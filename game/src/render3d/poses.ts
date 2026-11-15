import type { Resource, Unit } from '../sim/types';

export const POSES = ['idle', 'walk', 'carry', 'chop', 'mine', 'farm', 'build', 'pray', 'fight', 'cheer', 'sick', 'die', 'wave', 'rally'] as const;
export type PoseName = (typeof POSES)[number];
export type Tool = 'axe' | 'pick' | 'hoe' | 'hammer' | 'sword';

/** Joint angles in radians and offsets in villager heights. Arms and legs hang down at 0; negative x swings forward and up. */
export interface Pose {
  armL: number; armR: number; armLz: number; armRz: number;
  legL: number; legR: number;
  /** Root: lift, forward lean (x), twist (y). */
  y: number; lean: number; twist: number;
  headX: number; headY: number;
}

export const TOOL: Partial<Record<PoseName, Tool>> = { chop: 'axe', mine: 'pick', farm: 'hoe', build: 'hammer', fight: 'sword' };

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const io = (k: number) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
const out = (k: number) => 1 - (1 - k) ** 3;
const cycle = (t: number, speed: number, seed: number) => (((t * speed + seed * 0.37) % 1) + 1) % 1;

/** One villager pose. `t` in seconds (for 'die': seconds since death), `seed` shifts the phase so a crowd is never in step. */
export function pose(name: PoseName, t: number, seed = 0): Pose {
  const p: Pose = { armL: 0, armR: 0, armLz: -0.06, armRz: 0.06, legL: 0, legR: 0, y: 0, lean: 0, twist: 0, headX: 0, headY: 0 };
  const ph = t * 9 + seed, s = Math.sin(ph);
  switch (name) {
    case 'idle':
      p.headY = Math.sin(t * 0.6 + seed) * 0.45;
      p.armL = Math.sin(t * 1.1 + seed) * 0.05;
      p.armR = -p.armL;
      break;
    case 'walk':
    case 'carry':
      p.legL = s * 0.8; p.legR = -s * 0.8;
      p.y = Math.abs(s) * 0.07;
      if (name === 'walk') { p.armL = -s * 0.68; p.armR = s * 0.68; }
      else { p.armL = p.armR = -1.25; p.armLz = 0.25; p.armRz = -0.25; }
      break;
    case 'chop':
    case 'mine': {
      // slow wind-up, fast strike, short rest
      const c = cycle(t, 1.05, seed);
      const a = c < 0.62 ? lerp(-0.35, -2.75, io(c / 0.62)) : c < 0.72 ? lerp(-2.75, -0.15, (c - 0.62) / 0.1) : lerp(-0.15, -0.35, (c - 0.72) / 0.28);
      p.armR = a; p.armL = a * 0.9; p.armLz = 0.42; p.armRz = -0.42;
      p.lean = c > 0.62 && c < 0.85 ? 0.28 : c < 0.62 ? -0.05 - 0.08 * io(c / 0.62) : -0.05;
      p.twist = -0.15;
      break;
    }
    case 'farm': {
      const c = cycle(t, 0.85, seed);
      const a = c < 0.6 ? lerp(-0.4, -1.5, io(c / 0.6)) : lerp(-1.5, -0.2, Math.min(1, (c - 0.6) / 0.12));
      p.armL = p.armR = a; p.armLz = 0.4; p.armRz = -0.4;
      p.lean = 0.32; p.y = -0.05;
      break;
    }
    case 'build': {
      const c = cycle(t, 2.6, seed);
      p.armR = c < 0.7 ? lerp(-0.8, -2.2, io(c / 0.7)) : lerp(-2.2, -0.6, (c - 0.7) / 0.3);
      p.armL = -0.9; p.y = -0.12; p.legL = -0.5; p.legR = 0.3; p.lean = 0.2;
      break;
    }
    case 'pray': {
      const b = Math.sin(t * 1.6 + seed);
      p.y = -0.27; p.legL = p.legR = 1.45;
      p.armL = p.armR = -2.75 + b * 0.12; p.armLz = 0.32; p.armRz = -0.32;
      p.lean = -0.12 + b * 0.07; p.headX = -0.3;
      break;
    }
    case 'fight': {
      const c = cycle(t, 1.5, seed), a = c < 0.55 ? io(c / 0.55) : 1 - out((c - 0.55) / 0.45);
      p.armR = lerp(-0.6, -2.4, a) + (c > 0.55 && c < 0.7 ? 1.6 : 0); p.armRz = lerp(0.1, -0.9, a);
      p.twist = c > 0.55 ? -0.5 * (1 - out((c - 0.55) / 0.45)) : 0.3 * a;
      p.lean = c > 0.55 && c < 0.75 ? 0.25 : 0;
      p.legL = -0.45; p.legR = 0.35; p.armL = -1.1; p.armLz = 0.2;
      break;
    }
    case 'cheer': {
      const k = cycle(t, 1.8, seed);
      p.y = Math.sin(k * Math.PI) * 0.38;
      p.armL = -2.9 + Math.sin(t * 14) * 0.18; p.armR = -2.9 - Math.sin(t * 14) * 0.18; p.armLz = 0.4; p.armRz = -0.4;
      p.legL = p.legR = k < 0.5 ? -0.25 : 0;
      break;
    }
    case 'sick': {
      const cough = Math.sin(t * 7 + seed) > 0.8;
      p.lean = 0.38 + (cough ? 0.18 : 0); p.headX = 0.3; p.y = -0.05;
      p.armL = -0.6; p.armLz = 0.4; p.armR = -1.4 - (cough ? 0.4 : 0); p.armRz = -0.3;
      break;
    }
    case 'die': {
      const k = out(Math.min(1, Math.max(0, t) / 0.7));
      p.lean = -k * 1.55; p.y = -k * 0.35;
      p.armL = -k * 2.4; p.armLz = 0.6 * k; p.armR = -k * 2.2; p.armRz = -0.7 * k; p.legL = -k * 0.3;
      break;
    }
    case 'wave':
      p.armR = -2.6; p.armRz = -0.3 + Math.sin(t * 9) * 0.35;
      p.headY = Math.sin(t * 1.3) * 0.2;
      break;
    case 'rally':
      p.armR = -3.05; p.armRz = -0.1 + Math.sin(t * 5) * 0.1;
      p.lean = -0.08; p.legL = -0.3; p.legR = 0.2;
      break;
  }
  return p;
}

const GATHER: Record<Resource, PoseName> = { wood: 'chop', stone: 'mine', iron: 'mine', gold: 'mine', food: 'farm' };

/** The pose that shows what a unit is doing in the sim right now. */
export function poseOf(u: Pick<Unit, 'job' | 'carrying'>, moving: boolean, sick = false): PoseName {
  if (moving) return u.carrying ? 'carry' : 'walk';
  const j = u.job;
  if (j.kind === 'gather' && j.stage === 'work') return GATHER[j.res];
  if (j.kind === 'build') return 'build';
  if (j.kind === 'attack') return 'fight';
  if (j.kind === 'pray') return 'pray';
  return sick ? 'sick' : 'idle';
}
