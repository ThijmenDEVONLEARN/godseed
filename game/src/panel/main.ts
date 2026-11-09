import { TEAMS } from '@godseed/shared';
import { COMMANDS } from '../config/commands';

const BRIDGE = new URLSearchParams(location.search).get('bridge') ?? `http://${location.hostname || 'localhost'}:8765`;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const log = $('log');

async function send(body: Record<string, unknown>): Promise<void> {
  try {
    const res = await fetch(`${BRIDGE}/fake`, { method: 'POST', body: JSON.stringify(body) });
    log.textContent = `${res.ok ? 'sent' : `error ${res.status}`} ${JSON.stringify(body)}\n${log.textContent}`.slice(0, 4000);
  } catch {
    log.textContent = `bridge not reachable at ${BRIDGE}\n${log.textContent}`.slice(0, 4000);
  }
}

const viewer = () => {
  const name = $<HTMLInputElement>('name').value.trim() || 'Alice';
  return { id: name.toLowerCase(), name };
};
const chat = (text: string, v = viewer()) => send({ type: 'chat', viewer: v, text });

$('chat').onclick = () => chat($<HTMLInputElement>('text').value);
$<HTMLInputElement>('text').onkeydown = (e) => { if (e.key === 'Enter') void chat($<HTMLInputElement>('text').value); };
for (const c of COMMANDS) {
  const b = document.createElement('button');
  b.textContent = c.usage;
  b.title = c.help;
  b.onclick = () => chat(c.usage === '!rename' ? `!rename ${viewer().name}2` : c.usage);
  $('quick').append(b);
}
document.querySelector<HTMLButtonElement>('[data-like]')!.onclick = () => send({ type: 'like', viewer: viewer(), count: 100 });
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-social]')) b.onclick = () => send({ type: b.dataset.social, viewer: viewer() });
$('sendGift').onclick = () => {
  const sel = $<HTMLSelectElement>('gift');
  send({ type: 'gift', viewer: viewer(), giftId: Number(sel.value), giftName: sel.selectedOptions[0].text.split(' · ')[0], coins: Number(sel.value), repeat: 1 });
};

// spam: N fake viewers each send a random command every 500 ms
const SPAM = ['!chop', '!mine', '!farm', '!defend', '!march', '!pray', '!burn', '!build hut', '!build farm', '!build wall', '!attack red', '!attack blue', '!attack yellow', '!attack green', 'hello!', 'gg', '!me', '!vote 1', '!vote 2'];
let timer: number | undefined;
$('spam').onclick = () => {
  const btn = $('spam');
  if (timer) { clearInterval(timer); timer = undefined; btn.textContent = 'Start spam'; btn.className = ''; return; }
  const n = Number($<HTMLInputElement>('spamN').value) || 20;
  const bots = Array.from({ length: n }, (_, i) => ({ id: `bot${i}`, name: `bot_${i}` }));
  bots.forEach((v, i) => chat(`!join ${TEAMS[i % 4]}`, v));
  timer = window.setInterval(() => {
    const v = bots[Math.floor(Math.random() * n)];
    void chat(SPAM[Math.floor(Math.random() * SPAM.length)], v);
  }, 500);
  btn.textContent = 'Stop spam';
  btn.className = 'stop';
};
