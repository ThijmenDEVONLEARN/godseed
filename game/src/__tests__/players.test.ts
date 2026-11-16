import type { GameMessage, Profile } from '@godseed/shared';
import { describe, expect, it, vi } from 'vitest';
import { createPlayers } from '../players';

const profile = (id: string, xp: number, level: number): Profile => ({ id, name: id, xp, level, rounds: 1, wins: 0, kills: 0, firstSeen: 0, lastSeen: 0 });

describe('players in the game', () => {
  it('asks the bridge once per viewer, bundled per second', () => {
    vi.useFakeTimers();
    const sent: GameMessage[] = [];
    const p = createPlayers((m) => sent.push(m));
    for (const id of ['a', 'b', 'a']) p.see(id);
    vi.advanceTimersByTime(1000);
    p.see('a');
    vi.advanceTimersByTime(1000);
    expect(sent).toEqual([{ type: 'profileRequest', ids: ['a', 'b'] }]);
    vi.useRealTimers();
  });

  it('levels up mid-round and again when the bridge sends a higher level', () => {
    const p = createPlayers(() => {});
    p.receive([profile('a', 300, 4)]);
    expect(p.provisional('a', 10, false)).toBeUndefined();
    expect(p.provisional('a', 20, false)).toBe(5); // 320 XP
    expect(p.provisional('a', 23, false)).toBeUndefined(); // already shown
    expect(p.receive([profile('a', 330, 5)])).toEqual([]);
    expect(p.receive([profile('a', 1700, 10)]).map((x) => x.id)).toEqual(['a']);
    p.setTop([profile('a', 1700, 10)]);
    expect(p.cosmetic('a')).toEqual({ tier: 2, top3: true, level: 10 });
    expect(p.cosmetic('new')).toEqual({ tier: 0, top3: false, level: 1 });
  });
});
