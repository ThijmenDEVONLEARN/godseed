import type { Rng } from '../rng';

/** Smooth value noise in [0,1) built from a random lattice, summed over octaves. */
export function createNoise(rng: Rng, w: number, h: number, octaves = 3, baseScale = 16): (x: number, y: number) => number {
  const layers = Array.from({ length: octaves }, (_, o) => {
    const scale = baseScale / 2 ** o;
    const gw = Math.ceil(w / scale) + 2, gh = Math.ceil(h / scale) + 2;
    const lattice = Float64Array.from({ length: gw * gh }, () => rng.next());
    return { scale, gw, lattice, weight: 0.5 ** o };
  });
  const total = layers.reduce((s, l) => s + l.weight, 0);
  return (x, y) => {
    let sum = 0;
    for (const { scale, gw, lattice, weight } of layers) {
      const fx = x / scale, fy = y / scale, ix = Math.floor(fx), iy = Math.floor(fy);
      const tx = fx - ix, ty = fy - iy, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const a = lattice[iy * gw + ix], b = lattice[iy * gw + ix + 1], c = lattice[(iy + 1) * gw + ix], d = lattice[(iy + 1) * gw + ix + 1];
      sum += weight * (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy);
    }
    return sum / total;
  };
}
