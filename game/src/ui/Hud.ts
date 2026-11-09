import { TEAMS } from '@godseed/shared';
import { BALANCE } from '../config/balance';
import { PALETTE } from '../render/palette';
import type { SimEvent, World } from '../sim/types';

const COMMANDS = ['!join red', '!build hut', '!attack blue', '!chop', '!build farm', '!attack @name', '!mine', '!build wall', '!burn', '!farm', '!build tower', '!defend', '!pray', '!build bridge', '!march', '!me', '!rename', '!vote 1'];
const GIFTS = 'Gifts: 1 trees · 5 sword · 20 meteor · 50 dragon · 199 CHIEF · 200 volcano';
const FEED_KINDS = new Set<SimEvent['kind']>(['kill', 'raid', 'built', 'destroyed', 'join', 'fire', 'roundEnd', 'newRound', 'storm']);

const el = (tag: string, cls: string, parent: HTMLElement, text = '') => {
  const e = document.createElement(tag);
  e.className = cls;
  e.textContent = text;
  parent.append(e);
  return e;
};

function clock(ticks: number): string {
  const s = Math.max(0, Math.ceil(ticks / BALANCE.ticksPerSecond)), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60;
  const mm = String(m).padStart(h ? 2 : 1, '0'), ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** DOM overlay: round clock and scores on top, commands and event feed at the bottom, scoreboard between rounds. */
export function createHud(ui: HTMLElement) {
  el('div', 'title', ui, 'GODSEED');
  const top = el('div', 'topbar', ui);
  const time = el('div', 'clock', top);
  const scores = TEAMS.map((team) => {
    const box = el('div', 'score', top);
    el('span', 'swatch', box).style.background = PALETTE.team[team];
    return el('span', '', box);
  });
  const sub = el('div', 'sub', top);

  const bottom = el('div', 'bottom', ui);
  el('div', 'heading', bottom, 'COMMANDS');
  const grid = el('div', 'commands', bottom);
  for (const c of COMMANDS) el('span', '', grid, c);
  el('div', 'gifts', bottom, GIFTS);
  const feed = el('div', 'feed', bottom);

  const board = el('div', 'board', ui);
  board.hidden = true;

  return {
    update(world: World): void {
      const r = world.round;
      const left = r.startTick + BALANCE.round.roundTicks - world.tick;
      time.textContent = r.phase === 'scoreboard' ? 'ROUND OVER' : clock(left);
      time.classList.toggle('storm', r.phase === 'storm');
      sub.textContent = r.phase === 'storm' ? 'FINAL STORM! Survive until the end' : 'Type !join red / blue / yellow / green to get your own villager';
      TEAMS.forEach((team, i) => { scores[i].textContent = String(world.teams[team].score); });
      board.hidden = r.phase !== 'scoreboard';
    },
    events(world: World, events: SimEvent[]): void {
      for (const e of events) {
        if (!FEED_KINDS.has(e.kind) || (e.kind === 'storm' && e.x !== undefined)) continue;
        const line = el('div', '', feed, e.text);
        if (e.team) line.style.color = PALETTE.team[e.team];
        while (feed.childElementCount > 3) feed.firstElementChild!.remove();
        if (e.kind === 'roundEnd') showBoard(world);
      }
    },
  };

  function showBoard(world: World): void {
    board.replaceChildren();
    el('div', 'board-title', board, `${world.round.winner?.toUpperCase()} WINS!`).style.color = PALETTE.team[world.round.winner ?? 'red'];
    for (const team of [...TEAMS].sort((a, b) => world.teams[b].score - world.teams[a].score)) {
      const row = el('div', 'board-row', board);
      el('span', '', row, team.toUpperCase()).style.color = PALETTE.team[team];
      el('span', '', row, String(world.teams[team].score));
    }
    el('div', 'sub', board, 'A new world is coming...');
  }
}
