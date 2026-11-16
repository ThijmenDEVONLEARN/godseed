import { Application, Graphics, TextureStyle } from 'pixi.js';
import type { SimEvent, World } from '../sim/types';
import { MAP_TILES, SCREEN, TILE, ZONES } from '../ui/layout';
import { createArt, T } from './art';
import type { CameraTarget } from './Camera';
import { WorldView } from './WorldView';

/** The old 2D pixel view, kept behind ?r=pixi until the 3D view covers everything. */
export async function createPixiView(stage: HTMLElement) {
  TextureStyle.defaultOptions.scaleMode = 'nearest';
  const app = new Application();
  await app.init({ width: SCREEN.w, height: SCREEN.h, antialias: false, roundPixels: true, backgroundAlpha: 0 });
  stage.prepend(app.canvas);
  const view = new WorldView(createArt(), MAP_TILES.w, MAP_TILES.h);
  const mapMask = new Graphics().rect(ZONES.map.x, ZONES.map.y, ZONES.map.w, ZONES.map.h).fill('#fff');
  view.root.mask = mapMask;
  app.stage.addChild(view.root, mapMask);
  return {
    positions: view.positions,
    sync: (world: World, alpha: number) => view.sync(world, alpha),
    say: (id: number, text: string, ms?: number) => view.say(id, text, ms),
    bolt: (x: number, y: number) => view.bolt(x, y),
    point: (id: number, color: string) => view.point(id, color),
    gesture: (() => {}) as (id: number, name: string, ticks?: number) => void, // poses only exist in 3D
    event: (e: SimEvent) => { if (e.kind === 'storm' && e.x !== undefined && e.y !== undefined) view.bolt(e.x, e.y); },
    /** Puts the camera's tile (x, y) in the middle of the map zone at the given zoom, never showing past the map edge. */
    camera(_world: World, c: CameraTarget): void {
      const scale = (TILE / T) * c.zoom, tile = TILE * c.zoom;
      const half = { x: ZONES.map.w / 2 / tile, y: ZONES.map.h / 2 / tile };
      const cx = Math.min(MAP_TILES.w - half.x, Math.max(half.x, c.x + 0.5)), cy = Math.min(MAP_TILES.h - half.y, Math.max(half.y, c.y + 0.5));
      view.root.scale.set(scale);
      view.labelScale = Math.min(1, 1.5 / c.zoom);
      view.root.position.set(ZONES.map.x + ZONES.map.w / 2 - cx * tile, ZONES.map.y + ZONES.map.h / 2 - cy * tile);
    },
    render(): void { /* Pixi draws itself */ },
    info: () => '2d',
  };
}
