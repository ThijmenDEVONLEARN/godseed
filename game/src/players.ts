import { levelOf, roundXp, tierOf, type GameMessage, type Profile } from '@godseed/shared';
import type { Cosmetic } from './render3d/WorldView3D';

/** Profiles from the bridge, plus the level each viewer shows on screen right now. */
export function createPlayers(send: (m: GameMessage) => void) {
  const known = new Map<string, Profile>(), asked = new Set<string>(), waiting = new Set<string>(), shown = new Map<string, number>();
  let top: Profile[] = [], timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => { timer = undefined; if (waiting.size) send({ type: 'profileRequest', ids: [...waiting] }); waiting.clear(); };
  const ask = (id: string) => { waiting.add(id); timer ??= setTimeout(flush, 1000); };
  const level = (id: string) => shown.get(id) ?? known.get(id)?.level ?? 1;
  return {
    /** A viewer did something: fetch their profile once, bundled per second. */
    see(id: string): void { if (!asked.has(id)) { asked.add(id); ask(id); } },
    /** The bridge (re)connected: ask again for everyone seen so far. */
    resend(): void { for (const id of asked) ask(id); },
    get: (id: string) => known.get(id),
    get top() { return top; },
    setTop(t: Profile[]): void { top = t; },
    level,
    cosmetic: (id: string): Cosmetic => ({ tier: tierOf(level(id)), top3: top.slice(0, 3).some((p) => p.id === id), level: level(id) }),
    /** Stores profiles; returns the ones whose level went past what was on screen. */
    receive(ps: Profile[]): Profile[] {
      const ups: Profile[] = [];
      for (const p of ps) {
        const was = shown.get(p.id);
        known.set(p.id, p);
        if (was !== undefined && p.level > was) ups.push(p);
        shown.set(p.id, Math.max(was ?? 0, p.level));
      }
      return ups;
    },
    /** The game adds this round's XP early so a level-up shows at once; the bridge's numbers win at round end. Returns the new level, if any. */
    provisional(id: string, score: number, commanded: boolean): number | undefined {
      const lv = levelOf((known.get(id)?.xp ?? 0) + roundXp({ score, commanded }, false)), was = level(id);
      shown.set(id, Math.max(lv, was));
      return lv > was ? lv : undefined;
    },
  };
}
export type Players = ReturnType<typeof createPlayers>;
