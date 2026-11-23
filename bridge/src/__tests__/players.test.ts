import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createPlayers } from '../players';

const dir = () => mkdtempSync(join(tmpdir(), 'godseed-players-'));

describe('player profiles', () => {
  it('adds XP, wins and kills per round and keeps them on disk', () => {
    const file = join(dir(), 'players.json');
    const players = createPlayers(file, () => 1000);
    players.applyRound([{ id: 'ann', name: 'Ann', team: 'red', score: 300, kills: 4, commanded: true }, { id: 'bob', name: 'Bob', team: 'blue', score: 6, kills: 2, commanded: false }], 'red');
    const [ann] = players.applyRound([{ id: 'ann', name: 'Ann', team: 'red', score: 300, kills: 1, commanded: true }], 'blue');
    expect(ann).toMatchObject({ xp: 200, level: 4, rounds: 2, wins: 1, kills: 5, lastTeam: 'red' });
    expect(createPlayers(file).top().map((p) => p.id)).toEqual(['ann', 'bob']);
    expect(createPlayers(file).get(['bob', 'nobody'])).toHaveLength(1);
  });

  it('ignores junk from the socket', () => {
    const players = createPlayers(join(dir(), 'players.json'));
    expect(players.applyRound([{ id: '', team: 'red' }, { id: 'x', team: 'purple' }, null], 'red')).toEqual([]);
    expect(players.applyRound('nope', 'red')).toEqual([]);
    expect(players.get('nope')).toEqual([]);
  });

  it('backs up a corrupt file and starts empty', () => {
    const d = dir(), file = join(d, 'players.json');
    writeFileSync(file, '{ broken');
    const players = createPlayers(file, () => 42);
    expect(players.top()).toEqual([]);
    expect(readFileSync(join(d, 'players.json.corrupt-42'), 'utf8')).toBe('{ broken');
    players.applyRound([{ id: 'c', name: 'C', team: 'green', score: 1, kills: 0, commanded: false }], 'red');
    expect(readdirSync(d).sort()).toEqual(['players.json', 'players.json.corrupt-42']);
  });
});
