import { describe, expect, it } from 'vitest';
import { POSES, pose, poseOf } from '../poses';

describe('poses', () => {
  it('every pose gives finite joint angles at any time', () => {
    for (const name of POSES) for (let t = 0; t < 6; t += 0.07) for (const v of Object.values(pose(name, t, 3))) expect(Number.isFinite(v), name).toBe(true);
  });

  it('walking swings legs and arms in opposite pairs and lifts the body', () => {
    const p = pose('walk', 0.3, 1);
    expect(p.legL).toBeCloseTo(-p.legR);
    expect(Math.sign(p.armL)).toBe(-Math.sign(p.legL));
    expect(p.y).toBeGreaterThan(0);
  });

  it('a chop winds up slowly and strikes fast', () => {
    const arm = (c: number) => pose('chop', c / 1.05).armR;
    expect(arm(0.62)).toBeLessThan(-2.5); // axe high after 62% of the cycle
    expect(arm(0.72)).toBeGreaterThan(-0.3); // down 10% later
  });

  it('a dying villager falls over once and stays down', () => {
    expect(pose('die', 0).lean).toBeCloseTo(0);
    expect(pose('die', 0.7).lean).toBeCloseTo(-1.55);
    expect(pose('die', 5)).toEqual(pose('die', 0.7));
  });

  it('picks the pose from what the unit does', () => {
    const gather = (res: 'wood' | 'gold' | 'food') => ({ job: { kind: 'gather' as const, res, stage: 'work' as const, tx: 0, ty: 0, workLeft: 1 } });
    expect(poseOf(gather('wood'), false)).toBe('chop');
    expect(poseOf(gather('gold'), false)).toBe('mine');
    expect(poseOf(gather('food'), false)).toBe('farm');
    expect(poseOf(gather('wood'), true)).toBe('walk');
    expect(poseOf({ ...gather('wood'), carrying: { res: 'wood', amount: 1 } }, true)).toBe('carry');
    expect(poseOf({ job: { kind: 'idle' } }, false, true)).toBe('sick');
    expect(poseOf({ job: { kind: 'pray', workLeft: 3 } }, false, true)).toBe('pray');
  });
});
