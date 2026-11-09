// shortcut: a short inline blocklist; swap for a full CC0 list file if names slip through on stream
const BAD = ['fuck', 'shit', 'bitch', 'cunt', 'nigg', 'fag', 'retard', 'whore', 'slut', 'rape', 'nazi', 'hitler', 'kkk', 'porn', 'dick', 'pussy', 'cock', 'kanker', 'hoer', 'tering', 'mongool'];

export const hasBadWord = (text: string) => {
  const t = text.toLowerCase().replace(/[^a-z]/g, '');
  return BAD.some((w) => t.includes(w));
};

/** A name that is safe to show on stream: max 16 of [A-Za-z0-9_], or `Villager<id>` when empty or rude. */
export function cleanName(raw: string, fallbackId: string | number): string {
  const name = raw.replace(/[^A-Za-z0-9_]/g, '').slice(0, 16);
  return !name || hasBadWord(name) ? `Villager${String(fallbackId).replace(/[^A-Za-z0-9]/g, '').slice(-4) || '0'}` : name;
}
