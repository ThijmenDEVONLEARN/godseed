import { expect, test } from 'vitest';
import { createRng } from '../rng';
import { fnv1a, hashValue } from '../hash';

test('same seed gives the same sequence, other seed differs', () => {
  const a = createRng(42), b = createRng(42), c = createRng(43);
  const sa = Array.from({ length: 1000 }, () => a.next());
  const sb = Array.from({ length: 1000 }, () => b.next());
  const sc = Array.from({ length: 1000 }, () => c.next());
  expect(sa).toEqual(sb);
  expect(sa).not.toEqual(sc);
  expect(sa.every((x) => x >= 0 && x < 1)).toBe(true);
});

test('int, pick and chance stay in range', () => {
  const r = createRng(1);
  for (let i = 0; i < 500; i++) {
    expect(r.int(5)).toBeLessThan(5);
    expect(['a', 'b']).toContain(r.pick(['a', 'b']));
  }
  expect(r.chance(0)).toBe(false);
  expect(r.chance(1)).toBe(true);
});

test('hash is stable and key-order independent', () => {
  expect(fnv1a('abc')).toBe(fnv1a('abc'));
  expect(hashValue({ a: 1, b: new Uint8Array([1, 2]) })).toBe(hashValue({ b: new Uint8Array([1, 2]), a: 1 }));
  expect(hashValue({ a: 1 })).not.toBe(hashValue({ a: 2 }));
});
