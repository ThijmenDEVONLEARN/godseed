import type { SimEvent, World } from '../sim/types';

/** Which sim events get read out, and how. Returns the spoken line or undefined to stay quiet. */
export function lineFor(world: World, e: SimEvent): string | undefined {
  switch (e.kind) {
    case 'leader': case 'roundEnd': case 'newRound': return e.text;
    case 'storm': return e.x === undefined ? 'The Final Storm begins! Survive until the end!' : undefined;
    // small gifts (trees, sheep, rain) stay quiet; anything with a real effect is announced
    case 'god': return (e.durationTicks ?? 0) >= 60 ? e.text : undefined;
    case 'join': return e.text.replace(/ joined (\w+)$/, ' joined the $1 tribe!');
    case 'kill': {
      const killer = world.units.find((u) => u.id === e.unitId);
      return killer?.viewerId ? e.text : undefined; // only kills by viewers, NPC fights are too many
    }
    default: return undefined;
  }
}

/** Names like "mila_draws" read better without underscores; shouted words are read as words. */
export const speakable = (text: string) => text.replace(/_/g, ' ').replace(/\b[A-Z]{3,}\b/g, (w) => w[0] + w.slice(1).toLowerCase()) // DRAGON would be spelled out letter by letter
  .replace(/\(([a-z]+)\)/g, 'of $1').replace(/\s+/g, ' ').trim();

export interface SpeakerOptions {
  url: string;
  voice: string;
  /** Clips start at least this far apart (ms). */
  gapMs?: number;
  /** Lines waiting beyond this are dropped, oldest first. */
  maxQueue?: number;
}

/**
 * Reads lines aloud through the local Kokoro server, one clip at a time, never overlapping.
 * When the server is not running everything stays silent and it retries now and then.
 */
export function createSpeaker({ url, voice, gapMs = 4000, maxQueue = 3 }: SpeakerOptions) {
  const queue: Promise<Blob | undefined>[] = [];
  const audio = new Audio();
  let busy = false, lastStart = -Infinity, downUntil = 0;

  const fetchClip = async (text: string): Promise<Blob | undefined> => {
    try {
      const r = await fetch(`${url}/tts?voice=${encodeURIComponent(voice)}&text=${encodeURIComponent(text)}`);
      return r.ok ? await r.blob() : undefined;
    } catch {
      downUntil = performance.now() + 30_000; // server not running: stop asking for a while
      return undefined;
    }
  };

  const pump = async (): Promise<void> => {
    if (busy || !queue.length) return;
    busy = true;
    const wait = lastStart + gapMs - performance.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    const blob = await queue.shift();
    if (blob) {
      lastStart = performance.now();
      const src = URL.createObjectURL(blob);
      audio.src = src;
      await new Promise<void>((done) => {
        audio.onended = audio.onerror = () => done();
        audio.play().catch(() => done()); // autoplay blocked or bad clip: skip it
      });
      URL.revokeObjectURL(src);
    }
    busy = false;
    void pump();
  };

  return {
    say(text: string): void {
      if (performance.now() < downUntil) return;
      // fetch now so synthesis runs while the previous clip still plays
      queue.push(fetchClip(speakable(text)));
      while (queue.length > maxQueue) queue.shift();
      void pump();
    },
  };
}
