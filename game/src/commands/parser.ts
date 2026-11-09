import { cleanName, hasBadWord, TEAMS, type Team, type Viewer } from '@godseed/shared';
import type { SimCommand } from '../sim/Simulation';
import type { BuildingType, World } from '../sim/types';

const BUILDINGS: BuildingType[] = ['hut', 'farm', 'wall', 'tower', 'smithy', 'temple', 'bridge'];
const ORDERS = ['chop', 'mine', 'farm', 'defend', 'march', 'pray'] as const;

/** Parsed chat: a sim command, a UI-only action, an error to show, or plain chat (null). */
export type Parsed =
  | { sim: SimCommand }
  | { ui: 'me' }
  | { vote: 1 | 2 | 3 }
  | { error: string }
  | null;

const isTeam = (s: string | undefined): s is Team => TEAMS.includes(s as Team);

/** A shown name for a joining viewer, unique among living players (`_2`, `_3`, ...). */
export function uniqueName(world: World, viewer: Viewer): string {
  const base = cleanName(viewer.name, viewer.id);
  const taken = new Set(world.units.filter((u) => u.viewerId && u.viewerId !== viewer.id).map((u) => u.name?.toLowerCase()));
  let name = base;
  for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${base.slice(0, 13)}_${n}`;
  return name;
}

export function parseChat(text: string, viewer: Viewer, world: World): Parsed {
  const t = text.trim();
  if (!t.startsWith('!')) return null;
  const [cmd, arg] = t.slice(1).toLowerCase().split(/\s+/);
  const viewerId = viewer.id;
  switch (cmd) {
    case 'join':
      if (arg && !isTeam(arg)) return { error: `${viewer.name}: pick red, blue, yellow or green` };
      return { sim: { kind: 'join', viewerId, name: uniqueName(world, viewer), team: arg as Team | undefined } };
    case 'build':
      if (!BUILDINGS.includes(arg as BuildingType)) return { error: `${viewer.name}: build ${BUILDINGS.join(', ')}` };
      return { sim: { kind: 'build', viewerId, building: arg as BuildingType } };
    case 'attack':
      if (isTeam(arg)) return { sim: { kind: 'attackTeam', viewerId, team: arg } };
      if (arg?.startsWith('@') && arg.length > 1) return { sim: { kind: 'attackPlayer', viewerId, targetName: t.split(/\s+/)[1].slice(1) } };
      return { error: `${viewer.name}: try !attack blue or !attack @name` };
    case 'burn':
      return { sim: { kind: 'burn', viewerId } };
    case 'me':
      return { ui: 'me' };
    case 'rename': {
      const raw = t.split(/\s+/).slice(1).join('');
      if (!raw.replace(/[^A-Za-z0-9_]/g, '') || hasBadWord(raw)) return { error: `${viewer.name}: !rename <newname>` };
      return { sim: { kind: 'rename', viewerId, name: uniqueName(world, { id: viewerId, name: raw }) } };
    }
    case 'vote': {
      const n = Number(arg);
      return n === 1 || n === 2 || n === 3 ? { vote: n } : { error: `${viewer.name}: vote 1, 2 or 3` };
    }
    default:
      if ((ORDERS as readonly string[]).includes(cmd) && !arg) return { sim: { kind: 'order', viewerId, order: cmd as (typeof ORDERS)[number] } };
      return { error: `${viewer.name}: unknown command !${cmd}` };
  }
}
