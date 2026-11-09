import { ZONES } from './layout';

/** F3 toggles the stats box, F4 the TikTok safe-zone lines. */
export function createDebug(ui: HTMLElement): { set(text: string): void } {
  const box = document.createElement('div');
  box.className = 'debug';
  box.hidden = true;
  ui.append(box);

  const zones = document.createElement('div');
  zones.hidden = true;
  for (const [name, z] of Object.entries(ZONES)) {
    const d = document.createElement('div');
    d.className = 'zone';
    d.style.top = `${z.y}px`;
    d.style.height = `${z.h}px`;
    d.textContent = name;
    zones.append(d);
  }
  ui.append(zones);

  window.addEventListener('keydown', (e) => {
    if (e.key === 'F3') box.hidden = !box.hidden;
    if (e.key === 'F4') zones.hidden = !zones.hidden;
  });
  return { set: (text) => (box.textContent = text) };
}
