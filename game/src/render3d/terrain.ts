import * as THREE from 'three';
import { Tile, type World } from '../sim/types';

/** Ground height per tile kind; water sits at y = 0. One tile is one world unit. */
const LEVEL: Record<Tile, number> = {
  [Tile.DeepWater]: -1.7, [Tile.Water]: -0.7, [Tile.Sand]: 0.14, [Tile.Grass]: 0.45, [Tile.Forest]: 0.5, [Tile.Hills]: 1.3,
  [Tile.Mountain]: 3.6, [Tile.Farmland]: 0.45, [Tile.Road]: 0.42, [Tile.Ruins]: 0.45, [Tile.Burnt]: 0.45, [Tile.Bridge]: -0.7, [Tile.Plinth]: 0.75,
};
const COLOR: Record<Tile, number> = {
  [Tile.DeepWater]: 0x2f78c4, [Tile.Water]: 0x7fb4dc, [Tile.Sand]: 0xead58a, [Tile.Grass]: 0x6cc24a, [Tile.Forest]: 0x56a83c, [Tile.Hills]: 0x9cb35a,
  [Tile.Mountain]: 0x9a9da6, [Tile.Farmland]: 0xb98d42, [Tile.Road]: 0xc79d6a, [Tile.Ruins]: 0x8f927f, [Tile.Burnt]: 0x3a3530, [Tile.Bridge]: 0x7fb4dc, [Tile.Plinth]: 0xc9c4b6,
};
const hash = (i: number) => (Math.imul(i ^ 0x9e3779b9, 2654435761) >>> 0) / 4294967296;

/** Low-poly ground built from the sim's tile grid: flat-shaded, one colour per tile, heights averaged at the corners. */
export class Terrain {
  readonly mesh: THREE.Mesh;
  private heights: Float32Array;
  private colors: Float32Array;
  private w = 0;
  private h = 0;

  constructor(world: World) {
    this.w = world.w; this.h = world.h;
    const { w, h } = this;
    this.heights = new Float32Array((w + 1) * (h + 1));
    const level = (x: number, y: number) => {
      const cx = Math.min(w - 1, Math.max(0, x)), cy = Math.min(h - 1, Math.max(0, y)), t = world.tiles[cy * w + cx] as Tile;
      return LEVEL[t] + (t === Tile.Mountain ? hash(cy * w + cx) * 2.2 : t === Tile.Hills ? hash(cy * w + cx) * 0.6 : 0);
    };
    for (let y = 0; y <= h; y++) for (let x = 0; x <= w; x++) {
      const v = (level(x - 1, y - 1) + level(x, y - 1) + level(x - 1, y) + level(x, y)) / 4;
      this.heights[y * (w + 1) + x] = v + (v > 0.2 ? (hash(y * 977 + x) - 0.5) * 0.18 : 0);
    }
    const pos = new Float32Array(w * h * 18);
    this.colors = new Float32Array(w * h * 18);
    const corner = (x: number, y: number): [number, number, number] => [x - w / 2, this.heights[y * (w + 1) + x], y - h / 2];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const a = corner(x, y), b = corner(x + 1, y), c = corner(x, y + 1), d = corner(x + 1, y + 1);
      pos.set([...a, ...c, ...b, ...b, ...c, ...d], (y * w + x) * 18);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    for (let i = 0; i < w * h; i++) this.paint(world, i);
    geo.computeVertexNormals();
    this.mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 }));
    this.mesh.receiveShadow = true;
  }

  private paint(world: World, i: number): void {
    const c = new THREE.Color(COLOR[world.tiles[i] as Tile]);
    c.offsetHSL(0, 0, (hash(i) - 0.5) * 0.06);
    for (let k = 0; k < 6; k++) { // the second triangle a touch darker, for the faceted look
      const s = k < 3 ? 1 : 0.94;
      this.colors.set([c.r * s, c.g * s, c.b * s], i * 18 + k * 3);
    }
  }

  /** Recolours tiles the sim changed (burnt forest, new farmland, ruins). */
  repaint(world: World, tiles: number[]): void {
    for (const i of tiles) this.paint(world, i);
    (this.mesh.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }

  /** Ground height at a tile position (tile centre = integer + 0.5), bilinear between the corners. */
  heightAt(tx: number, ty: number): number {
    const x = Math.min(this.w - 0.001, Math.max(0, tx)), y = Math.min(this.h - 0.001, Math.max(0, ty));
    const i = Math.floor(x), j = Math.floor(y), u = x - i, v = y - j, W = this.w + 1, H = this.heights;
    return H[j * W + i] * (1 - u) * (1 - v) + H[j * W + i + 1] * u * (1 - v) + H[(j + 1) * W + i] * (1 - u) * v + H[(j + 1) * W + i + 1] * u * v;
  }
}
