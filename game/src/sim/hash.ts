/** FNV-1a over a string, as unsigned 32-bit. */
export function fnv1a(str: string, h = 0x811c9dc5): number {
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Hashes any plain data deterministically: typed arrays and objects with sorted keys. */
export function hashValue(value: unknown): number {
  return fnv1a(JSON.stringify(value, (_k, v) => {
    if (ArrayBuffer.isView(v)) return Array.from(v as Uint8Array);
    if (v && typeof v === 'object' && !Array.isArray(v)) return Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]]));
    return v;
  }));
}
