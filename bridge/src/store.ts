import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { RoundEnd } from '@godseed/shared';

const MAX_ROUNDS = 50;

/** All-time highscores on disk. Never cleared automatically; only `pnpm --filter @godseed/bridge clear-highscores` empties it. */
export function createStore(file: string) {
  const read = (): RoundEnd[] => {
    try {
      return JSON.parse(readFileSync(file, 'utf8')) as RoundEnd[];
    } catch {
      return [];
    }
  };
  return {
    rounds: read,
    add(round: RoundEnd): void {
      // shortcut: keeps the newest 50 rounds, so old records can drop off; switch to keeping the best 50 if Dev wants all-time bests
      const rounds = [...read(), round].slice(-MAX_ROUNDS);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify(rounds, null, 2));
    },
  };
}
