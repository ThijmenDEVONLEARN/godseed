import { TEAMS, type RoundEnd, type Team } from '@godseed/shared';
import { BALANCE } from '../config/balance';
import { COMMANDS } from '../config/commands';
import { VOTES } from '../config/votes';
import { GIFTS } from '../config/gifts';
import { PALETTE } from '../render/palette';
import type { SimEvent, World } from '../sim/types';

const FEED_KINDS = new Set<SimEvent['kind']>(['kill', 'raid', 'built', 'destroyed', 'join', 'fire', 'roundEnd', 'newRound', 'storm', 'info']);

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
  const dot = el('span', 'dot', top);
  dot.title = 'bridge';
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
  for (const c of COMMANDS) el('span', '', grid, c.usage).title = c.help;
  el('div', 'heading', bottom, 'GIFTS');
  const gifts = el('div', 'gifts', bottom);
  const rows: [string, string][] = GIFTS.tiers.map((t) => [`${t.minCoins}${t.minCoins > 1 ? '+' : ''}`, t.label]);
  rows.push([String(GIFTS.leaderPrice), GIFTS.leaderLabel]);
  for (const [coins, label] of rows) {
    const row = el('div', coins === String(GIFTS.leaderPrice) ? 'gift chief' : 'gift', gifts);
    el('span', 'coins', row, coins);
    el('span', '', row, label);
  }
  el('div', 'social', bottom, GIFTS.social.join('   ·   '));
  const feed = el('div', 'feed', bottom);

  const board = el('div', 'board', ui);
  board.hidden = true;

  function line(text: string, team?: Team): void {
    const l = el('div', '', feed, text);
    if (team) l.style.color = PALETTE.team[team];
    while (feed.childElementCount > 2) feed.firstElementChild!.remove();
  }

  let highscores: RoundEnd[] = [];
  return {
    feed: line,
    connected(up: boolean): void { dot.classList.toggle('up', up); },
    setHighscores(rounds: RoundEnd[]): void { highscores = rounds; },
    update(world: World): void {
      const r = world.round;
      const left = r.startTick + BALANCE.round.roundTicks - world.tick;
      time.textContent = r.phase === 'scoreboard' ? 'ROUND OVER' : clock(left);
      time.classList.toggle('storm', r.phase === 'storm');
      const v = world.vote;
      sub.classList.toggle('vote', !!v);
      if (v) {
        const counts = [1, 2, 3].map((n) => Object.values(v.ballots).filter((b) => b === n).length);
        sub.textContent = `VOTE ${clock(v.until - world.tick)}  ${v.options.map((o, i) => `!vote ${i + 1} ${VOTES.options[o]} (${counts[i]})`).join('  ')}`;
      } else sub.textContent = r.phase === 'storm' ? 'FINAL STORM! Survive until the end' : 'Type !join red / blue / yellow / green to get your own villager';
      TEAMS.forEach((team, i) => { scores[i].textContent = String(world.teams[team].score); });
      board.hidden = r.phase !== 'scoreboard';
    },
    events(world: World, events: SimEvent[]): void {
      for (const e of events) {
        if (!FEED_KINDS.has(e.kind) || (e.kind === 'storm' && e.x !== undefined)) continue;
        line(e.text, e.team);
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
    const best = highscores.flatMap((r) => r.topPlayers).sort((a, b) => b.score - a.score).slice(0, 5);
    if (best.length) {
      el('div', 'sub', board, 'ALL-TIME BEST PLAYERS');
      for (const p of best) {
        const row = el('div', 'board-row small', board);
        el('span', '', row, p.name).style.color = PALETTE.team[p.team];
        el('span', '', row, String(p.score));
      }
    }
    el('div', 'sub', board, 'A new world is coming...');
  }
}
