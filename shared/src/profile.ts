import type { Team } from './events';

/** Everything the game keeps about a viewer. No other personal data. */
export interface Profile { id: string; name: string; xp: number; level: number; rounds: number; wins: number; kills: number; lastTeam?: Team; firstSeen: number; lastSeen: number }

/** One viewer at the end of a round: their score (3 per kill, 1 per 5 loads, 2 per building, 2 if alive) and whether they gave a command after !join. */
export interface RoundPlayer { id: string; name: string; team: Team; score: number; kills: number; commanded: boolean }

export const XP = { perRoundMax: 100, commanded: 5, win: 10 } as const;

/** XP for one round: the score, +5 for playing along, +10 for a win, at most 100. */
export const roundXp = (p: Pick<RoundPlayer, 'score' | 'commanded'>, won: boolean) =>
  Math.min(XP.perRoundMax, Math.max(0, Math.floor(p.score)) + (p.commanded ? XP.commanded : 0) + (won ? XP.win : 0));

export const levelOf = (xp: number) => Math.floor(Math.sqrt(Math.max(0, xp) / 20)) + 1;

/** Look per level, cosmetic only: 0 Villager, 1 Warrior, 2 Elder, 3 Legend. */
export const tierOf = (level: number): 0 | 1 | 2 | 3 => (level >= 20 ? 3 : level >= 10 ? 2 : level >= 5 ? 1 : 0);
export const TITLES = ['Villager', 'Warrior', 'Elder', 'Legend'] as const;
