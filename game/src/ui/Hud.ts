import { TEAMS, type Profile, type Team } from '@godseed/shared';
import { BALANCE } from '../config/balance';
import { COMMANDS, HELP_SHOW_MS } from '../config/commands';
import { VOTES } from '../config/votes';
import { GIFTS } from '../config/gifts';
import { PALETTE } from '../render/palette';
import type { SimEvent, World } from '../sim/types';

const FEED_KINDS = new Set<SimEvent['kind']>(['kill', 'raid', 'built', 'destroyed', 'join', 'fire', 'roundEnd', 'newRound', 'storm', 'info', 'god', 'leader']);

/** A viewer's XP from the round that just ended, for the scoreboard. */
export interface Earned { name: string; team: Team; xp: number }

const el = (tag: string, cls: string, parent: HTMLElement, text = '') => {
  const e = document.createElement(tag);
  e.className = cls;
  e.textContent = text;
  parent.append(e);
  return e;
};

/** Round time as mm:ss, counted in sim ticks so it stays right when the game runs faster (?speed). */
export function clock(ticks: number): string {
  const s = Math.max(0, Math.ceil(ticks / BALANCE.ticksPerSecond));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** DOM overlay: round clock and scores on top, event feed at the bottom, !help popup, scoreboard between rounds. */
export function createHud(ui: HTMLElement) {
  el('div', 'title', ui, 'GODSEED');
  const top = el('div', 'topbar', ui);
  const dot = el('span', 'dot', top);
  dot.title = 'bridge';
  const time = el('div', 'clock', top);
  const scores = TEAMS.map((team) => {
    const box = el('div', 'score', top);
    el('span', 'swatch', box).style.background = PALETTE.team[team];
    return el('span', '', box);
  });
  const sub = el('div', 'sub', top);

  // the commands only show when a viewer types !help, so the map gets the room
  const help = el('div', 'help', ui);
  help.hidden = true;
  el('div', 'heading', help, 'COMMANDS');
  const grid = el('div', 'commands', help);
  for (const c of COMMANDS) if (!('chief' in c)) el('span', '', grid, c.usage).title = c.help;
  el('div', 'heading chief', help, `CHIEF: gift ${GIFTS.leaderPrice} coins to lead your tribe and use`);
  const chief = el('div', 'commands chief', help);
  for (const c of COMMANDS) if ('chief' in c) {
    const row = el('span', '', chief, c.usage);
    el('span', 'what', row, ` ${c.short}`);
  }
  let helpTimer: ReturnType<typeof setTimeout> | undefined;

  // the gift list lives in a pinned comment on the live now, so only the feed stays down here
  const bottom = el('div', 'bottom', ui);
  const vignette = el('div', 'vignette', ui);
  vignette.hidden = true;
  const showcase = el('div', 'showcase', ui);
  showcase.hidden = true;
  const queue: { text: string; team?: Team; big: boolean }[] = [];
  let showing = false;
  const next = () => {
    const item = queue.shift();
    if (!item) { showcase.hidden = true; showing = false; return; }
    showing = true;
    showcase.hidden = false;
    showcase.textContent = item.text;
    showcase.style.borderColor = item.team ? PALETTE.team[item.team] : '#ffe066';
    showcase.classList.toggle('big', item.big);
    showcase.classList.remove('pop');
    void showcase.offsetWidth; // restart the pop animation
    showcase.classList.add('pop');
    // shorter while more gifts wait, so the banner keeps pace with what happens on the map
    setTimeout(next, queue.length ? 2500 : item.big ? 6000 : 4000);
  };
  const feed = el('div', 'feed', bottom);

  const board = el('div', 'board', ui);
  board.hidden = true;

  function line(text: string, team?: Team): void {
    const l = el('div', '', feed, text);
    if (team) l.style.color = PALETTE.team[team];
    while (feed.childElementCount > 2) feed.firstElementChild!.remove();
  }

  let boardTimer: ReturnType<typeof setTimeout> | undefined;
  const banner = (text: string, team?: Team, big = false) => {
    queue.push({ text, team, big });
    if (queue.length > 2) queue.shift(); // gift storm: skip the oldest so the banner never lags far behind
    if (!showing) next();
  };
  return {
    banner,
    board: showBoard,
    feed: line,
    connected(up: boolean): void { dot.classList.toggle('up', up); },
    help(): void {
      help.hidden = false;
      clearTimeout(helpTimer);
      helpTimer = setTimeout(() => { help.hidden = true; }, HELP_SHOW_MS);
    },
    update(world: World): void {
      const r = world.round;
      const left = r.startTick + BALANCE.round.roundTicks - world.tick;
      time.textContent = r.phase === 'scoreboard' ? 'ROUND OVER' : clock(left);
      time.classList.toggle('storm', r.phase === 'storm');
      vignette.hidden = r.phase !== 'storm';
      const v = world.vote;
      sub.classList.toggle('vote', !!v);
      if (v) {
        const counts = [1, 2, 3].map((n) => Object.values(v.ballots).filter((b) => b === n).length);
        sub.textContent = `VOTE ${clock(v.until - world.tick)}  ${v.options.map((o, i) => `!vote ${i + 1} ${VOTES.options[o]} (${counts[i]})`).join('  ')}`;
      } else sub.textContent = r.phase === 'storm' ? 'FINAL STORM! Survive until the end' : 'Type !help for the commands  ·  !join red / blue / yellow / green to play';
      TEAMS.forEach((team, i) => { scores[i].textContent = String(world.teams[team].score); });
      board.hidden = r.phase !== 'scoreboard';
    },
    events(world: World, events: SimEvent[]): void {
      for (const e of events) {
        if (!FEED_KINDS.has(e.kind) || (e.kind === 'storm' && e.x !== undefined)) continue;
        line(e.text, e.team);
        if (e.kind === 'god' || e.kind === 'leader' || (e.kind === 'storm' && e.x === undefined)) banner(e.text, e.team, (e.durationTicks ?? 0) >= 60 || e.kind === 'leader' || e.kind === 'storm');
      }
    },
  };

  /** Team scores first; after 6 s the XP of the round and the all-time top 5 (by XP). */
  function showBoard(world: World, earned: Earned[], top: () => Profile[]): void {
    board.replaceChildren();
    el('div', 'board-title', board, `${world.round.winner?.toUpperCase()} WINS!`).style.color = PALETTE.team[world.round.winner ?? 'red'];
    for (const team of [...TEAMS].sort((a, b) => world.teams[b].score - world.teams[a].score)) {
      const row = el('div', 'board-row', board);
      el('span', '', row, team.toUpperCase()).style.color = PALETTE.team[team];
      el('span', '', row, String(world.teams[team].score));
    }
    el('div', 'sub', board, 'A new world is coming...');
    clearTimeout(boardTimer);
    boardTimer = setTimeout(() => {
      board.replaceChildren();
      const list = (title: string, rows: { name: string; team?: Team; value: string }[]) => {
        if (!rows.length) return;
        el('div', 'sub', board, title);
        for (const r of rows) {
          const row = el('div', 'board-row small', board);
          const name = el('span', '', row, r.name);
          if (r.team) name.style.color = PALETTE.team[r.team];
          el('span', '', row, r.value);
        }
      };
      list('XP EARNED THIS ROUND', earned.slice(0, 3).map((e) => ({ name: e.name, team: e.team, value: `+${e.xp} XP` })));
      list('ALL-TIME TOP 5', top().slice(0, 5).map((p) => ({ name: p.name, team: p.lastTeam, value: `Lv ${p.level} · ${p.xp} XP` })));
      el('div', 'sub', board, 'A new world is coming...');
    }, 6000);
  }
}
