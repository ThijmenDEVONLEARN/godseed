import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { TEAMS, levelOf, roundXp, type Profile, type RoundPlayer, type Team } from '@godseed/shared';

const clean = (s: unknown, max: number) => (typeof s === 'string' ? s.slice(0, max) : '');
const count = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0);

/**
 * Player profiles on disk. Writes go to a temp file and are renamed into place, so a crash never leaves half a file.
 * A file that does not parse is kept as a backup and the store starts empty. Never cleared automatically.
 */
export function createPlayers(file: string, now = () => Date.now()) {
  let all: Record<string, Profile> = {};
  if (existsSync(file)) {
    try {
      all = JSON.parse(readFileSync(file, 'utf8')) as Record<string, Profile>;
      if (!all || typeof all !== 'object' || Array.isArray(all)) throw new Error('not an object');
    } catch {
      renameSync(file, `${file}.corrupt-${now()}`);
      all = {};
    }
  }
  const save = () => {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(`${file}.tmp`, JSON.stringify(all, null, 2));
    renameSync(`${file}.tmp`, file);
  };
  return {
    get: (ids: unknown): Profile[] => (Array.isArray(ids) ? ids.slice(0, 200) : []).map((id) => all[clean(id, 64)]).filter(Boolean),
    top: (n = 5): Profile[] => Object.values(all).sort((a, b) => b.xp - a.xp).slice(0, n),
    /** Adds one round's XP, kills and win to every viewer in it; returns their new profiles. */
    applyRound(players: unknown, winner: Team): Profile[] {
      const t = now(), out: Profile[] = [];
      for (const raw of (Array.isArray(players) ? players : []).slice(0, 500) as Partial<RoundPlayer>[]) {
        const id = clean(raw?.id, 64);
        if (!id || !TEAMS.includes(raw.team as Team)) continue;
        const team = raw.team as Team, won = team === winner;
        const p = all[id] ?? { id, name: '', xp: 0, level: 1, rounds: 0, wins: 0, kills: 0, firstSeen: t, lastSeen: t };
        p.name = clean(raw.name, 16) || p.name || id;
        p.xp += roundXp({ score: count(raw.score), commanded: raw.commanded === true }, won);
        p.level = levelOf(p.xp);
        p.rounds++;
        p.wins += won ? 1 : 0;
        p.kills += Math.min(count(raw.kills), 500);
        p.lastTeam = team;
        p.lastSeen = t;
        all[id] = p;
        out.push(p);
      }
      if (out.length) save();
      return out;
    },
    remove(id: string): boolean { if (!all[id]) return false; delete all[id]; save(); return true; },
    clear(): void { all = {}; save(); },
  };
}
