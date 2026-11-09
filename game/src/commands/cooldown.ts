import { COMMAND_COOLDOWN_MS } from '../config/commands';

/** Per-viewer cooldown for commands that cost something; returns seconds left, or 0 when allowed (and starts the cooldown). */
export function createCooldown(ms = COMMAND_COOLDOWN_MS) {
  const last = new Map<string, number>();
  return (viewerId: string, now: number): number => {
    const left = (last.get(viewerId) ?? -Infinity) + ms - now;
    if (left > 0) return Math.ceil(left / 1000);
    last.set(viewerId, now);
    return 0;
  };
}
