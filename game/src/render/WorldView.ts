import { Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import type { Animal, Building, Mover, Unit, World } from '../sim/types';
import { T, drawTile, type Art } from './art';
import { PALETTE } from './palette';

const variation = (i: number) => (Math.imul(i, 2654435761) >>> 0) / 4294967296;

/** Map, buildings, units and fire, in art space (32 px per tile). Scale the root to zoom. */
export class WorldView {
  readonly root = new Container();
  private ground: Sprite;
  private canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private things = new Container({ sortableChildren: true });
  private labels = new Container();
  private sprites = new Map<number, Sprite>();
  private names = new Map<number, Text>();
  private fires: Sprite[] = [];
  private bubbles = new Map<number, { box: Container; until: number }>();
  private arrows = new Map<number, { g: Graphics; until: number }>();
  private seed = NaN;

  constructor(private art: Art, w: number, h: number) {
    this.canvas.width = w * T;
    this.canvas.height = h * T;
    this.ctx = this.canvas.getContext('2d')!;
    this.ground = new Sprite(Texture.from(this.canvas));
    this.root.addChild(this.ground, this.things, this.labels);
  }

  /** `alpha` is how far (0..1) real time is between this tick and the next. */
  sync(world: World, alpha: number): void {
    this.syncGround(world);
    const now = world.tick + alpha;
    const seen = new Set<number>();
    for (const b of world.buildings) if (b.alive) { seen.add(b.id); this.building(b); }
    for (const u of world.units) if (u.alive) { seen.add(u.id); this.unit(u, now); }
    for (const a of world.animals) if (a.alive) { seen.add(a.id); this.animal(a, now); }
    for (const [id, s] of this.sprites) if (!seen.has(id)) { s.destroy(); this.sprites.delete(id); }
    for (const [id, t] of this.names) if (!seen.has(id)) { t.destroy(); this.names.delete(id); }
    const ms = performance.now();
    for (const [id, b] of this.bubbles) if (!seen.has(id) || ms > b.until) { b.box.destroy({ children: true }); this.bubbles.delete(id); }
    for (const [id, a] of this.arrows) if (!seen.has(id) || ms > a.until) { a.g.destroy(); this.arrows.delete(id); }
    this.syncFires(world, now);
  }

  /** Speech bubble above a unit for a few seconds. */
  say(unitId: number, text: string, ms = 3000): void {
    this.bubbles.get(unitId)?.box.destroy({ children: true });
    const t = new Text({ text, style: { fontFamily: PALETTE.font, fontWeight: '700', fontSize: 34, fill: PALETTE.outline } });
    t.anchor.set(0.5, 1);
    t.y = -10;
    const bg = new Graphics()
      .roundRect(-t.width / 2 - 12, -t.height - 18, t.width + 24, t.height + 12, 8).fill('#ffffff').stroke({ color: PALETTE.outline, width: 4 })
      .poly([-8, -7, 8, -7, 0, 6]).fill('#ffffff');
    const box = new Container();
    box.addChild(bg, t);
    this.labels.addChild(box);
    this.bubbles.set(unitId, { box, until: performance.now() + ms });
  }

  /** Blinking arrow above a unit, for !me and right after a join. */
  point(unitId: number, color: string, ms = 3000): void {
    this.arrows.get(unitId)?.g.destroy();
    const g = new Graphics().poly([-16, -24, 16, -24, 0, 0]).fill(color).stroke({ color: PALETTE.outline, width: 4 });
    this.labels.addChild(g);
    this.arrows.set(unitId, { g, until: performance.now() + ms });
  }

  private syncGround(world: World): void {
    let dirty = world.dirtyTiles;
    if (world.seed !== this.seed) {
      this.seed = world.seed;
      dirty = Array.from(world.tiles.keys());
    }
    if (!dirty.length) return;
    for (const i of dirty) {
      const x = i % world.w, y = (i - x) / world.w;
      drawTile(this.ctx, world.tiles[i], world.deposits[i], x * T, y * T, variation(i));
    }
    world.dirtyTiles = [];
    this.ground.texture.source.update();
  }

  private sprite(id: number, tex: Texture, ax: number, ay: number): Sprite {
    let s = this.sprites.get(id);
    if (!s) {
      s = new Sprite(tex);
      s.anchor.set(ax, ay);
      this.sprites.set(id, s);
      this.things.addChild(s);
    }
    s.texture = tex;
    return s;
  }

  private building(b: Building): void {
    const s = this.sprite(b.id, this.art.building(b.type, b.team), 0.5, 1);
    s.position.set(b.x * T + T / 2, b.y * T + T);
    s.zIndex = b.y * T + T;
    s.alpha = b.progress >= 1 ? 1 : 0.35 + 0.5 * b.progress;
  }

  private place(m: Mover, now: number): { x: number; y: number; moving: boolean } {
    const k = Math.min(1, Math.max(0, (now - m.moveStartTick) / m.moveTicks));
    return { x: (m.px + (m.x - m.px) * k) * T + T / 2, y: (m.py + (m.y - m.py) * k) * T + T * 0.8, moving: k < 1 && (m.px !== m.x || m.py !== m.y) };
  }

  private unit(u: Unit, now: number): void {
    const p = this.place(u, now);
    const frame = p.moving && Math.floor(now / 2) % 2 ? 1 : 0;
    const s = this.sprite(u.id, this.art.unit(u.team, u.role, frame), 0.5, 49.5 / 60);
    s.position.set(p.x, p.y);
    s.zIndex = p.y + 1;
    const bubble = this.bubbles.get(u.id), arrow = this.arrows.get(u.id);
    bubble?.box.position.set(p.x, p.y - (u.name ? 104 : 56));
    if (arrow) { arrow.g.position.set(p.x, p.y - (u.name ? 104 : 56) - (bubble ? 64 : 0)); arrow.g.visible = Math.floor(performance.now() / 250) % 2 === 0; }
    if (!u.name) return;
    let label = this.names.get(u.id);
    if (!label) {
      label = new Text({ text: u.name, style: { fontFamily: PALETTE.font, fontWeight: '700', fontSize: 44, fill: PALETTE.team[u.team], stroke: { color: PALETTE.outline, width: 8 } } });
      label.anchor.set(0.5, 1);
      this.names.set(u.id, label);
      this.labels.addChild(label);
    }
    if (label.text !== u.name) label.text = u.name;
    label.position.set(p.x, p.y - 56);
  }

  private animal(a: Animal, now: number): void {
    const p = this.place(a, now);
    const s = this.sprite(a.id, this.art.animal(a.kind, p.moving && Math.floor(now / 2) % 2 ? 1 : 0), 0.5, 12.5 / 14);
    s.position.set(p.x, p.y);
    s.zIndex = p.y;
  }

  private syncFires(world: World, now: number): void {
    const spots: [number, number][] = [];
    for (const b of world.buildings) if (b.alive && b.burning) spots.push([b.x, b.y]);
    for (const i of world.burningTiles.keys()) spots.push([i % world.w, Math.floor(i / world.w)]);
    while (this.fires.length < spots.length) {
      const f = new Sprite(this.art.fire(0));
      f.anchor.set(0.5, 1);
      this.fires.push(f);
      this.things.addChild(f);
    }
    this.fires.forEach((f, n) => {
      f.visible = n < spots.length;
      if (!f.visible) return;
      const [x, y] = spots[n];
      f.texture = this.art.fire((Math.floor(now / 2) + n) % 2);
      f.position.set(x * T + T / 2, y * T + T * 0.9);
      f.zIndex = y * T + T + 2;
    });
  }
}
