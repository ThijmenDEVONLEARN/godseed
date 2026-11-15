import type { CameraTarget, Track } from '../render/Camera';
import type { World } from '../sim/types';
import { WorldView3D } from './WorldView3D';

/** The 3D view behind the same small interface the game loop uses for the 2D one. */
export async function create3DView(stage: HTMLElement, top: number, height: number) {
  const view = new WorldView3D(stage, top, height);
  return {
    positions: view.positions,
    sync: (world: World, alpha: number) => view.sync(world, alpha),
    say: (id: number, text: string, ms?: number) => view.say(id, text, ms),
    bolt: (x: number, y: number) => view.bolt(x, y),
    point: (id: number, color: string) => view.point(id, color),
    camera: (world: World, c: CameraTarget, focus: { x: number; y: number; zoomed: boolean; track?: Track }, dtMs: number) => view.camera(world, c, focus, dtMs),
    render: () => view.render(),
    info: () => `fit ${view.fitNow.toFixed(2)}`,
  };
}
