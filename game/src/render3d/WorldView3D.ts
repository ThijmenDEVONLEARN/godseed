import * as THREE from 'three';

import type { CameraTarget, Track } from '../render/Camera';
import { BALANCE } from '../config/balance';
import { CAMERA } from '../config/camera';
import type { Team } from '@godseed/shared';
import { Deposit, Tile, type ActiveEffect, type BuildingType, type Mover, type Resource, type SimEvent, type Unit, type World } from '../sim/types';
import { isLand } from '../sim/grid';
import { SCREEN } from '../ui/layout';
import { centre, dist, fit, frame, guard, mix, type Shot, type Subject, type Vec3 } from './frame';
import { makeBeast, type Beast } from './beasts';
import { playEvent, type Stage } from './events3d';
import { Fx, rr } from './fx';
import { BUILDING_SIZE, TEAM_COLOR, VILLAGER, makeBuilding, makeRuin, makeScaffold, mat } from './models';
import { TOOL, pose, poseOf, type PoseName, type Tool } from './poses';
import { Terrain } from './terrain';

const MAX_UNITS = 420, MAX_ANIMALS = 140, MAX_FIRE = 360, FOV = 46;
const HAIR = [0x3b2a1a, 0x6b4423, 0xd9a441, 0x1f1f24, 0xb5651d, 0xe8e2d0];
const SKY = { day: 0xa9d6f0, rain: 0x7d8a98, storm: 0x4a3436, eclipse: 0x18213a };
/** Villagers are small next to a one-tile hut; chiefs and heroes stand out by size. */
const unitScale = (u: Unit) => (u.role === 'hero' ? 1.15 : u.role === 'leader' ? 0.85 : 0.62);
/** The overview may use nearly the whole view; the HUD sits outside the 3D view for now. */
const WIDE = { x: 0.985, y0: -0.985, y1: 0.985 };
/** How much nearer than "the whole coast just fits" the overview flies. */
const OVERVIEW_CLOSER = 0.15;
const LOAD: Record<Resource, number> = { wood: 0x8a5a2b, stone: 0x9aa0aa, food: 0xe2c044, gold: 0xffcf3a, iron: 0x7f8fa6 };
/** Head of each tool at the end of the handle: size and colour. The sword turns the handle into the blade. */
const TOOL_HEAD: Record<Tool, { size: [number, number, number]; z: number; color: number }> = {
  axe: { size: [0.04, 0.22, 0.15], z: 0.4, color: 0xb8bec8 }, pick: { size: [0.05, 0.4, 0.06], z: 0.43, color: 0x5d6470 }, hoe: { size: [0.16, 0.15, 0.04], z: 0.44, color: 0x9aa0aa },
  hammer: { size: [0.13, 0.15, 0.13], z: 0.42, color: 0x6f6a64 }, sword: { size: [0.22, 0.05, 0.05], z: 0.06, color: 0xffcf3a },
};
const DEATH_TICKS = 26, RUIN_TICKS = 600, STATUE_LABEL = -1;
/** Level look of a viewer: 0 Villager, 1 Warrior (headband and feather), 2 Elder (pointed hat), 3 Legend (hat and cape). */
export interface Cosmetic { tier: 0 | 1 | 2 | 3; top3?: boolean; level?: number }
interface Figure { x: number; y: number; z: number; face: number; scale: number; name: PoseName; t: number; seed: number; team: Team; tint: number; skin: number; hair: number; tool?: Tool; load?: number; crown?: boolean; cos?: Cosmetic; trousers?: number }
const UP = new THREE.Vector3(0, 1, 0);
const REDUCED_MOTION = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const ease3 = (k: number) => k * k * (3 - 2 * k);
const hash = (i: number) => (Math.imul(i ^ 0x9e3779b9, 2654435761) >>> 0) / 4294967296;

function instanced(geo: THREE.BufferGeometry, count: number, color = 0xffffff, shadow = true): THREE.InstancedMesh {
  const m = new THREE.InstancedMesh(geo, mat(color), count);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.castShadow = shadow;
  m.receiveShadow = true;
  m.frustumCulled = false;
  m.count = 0;
  return m;
}

/** The 3D world (style A, diorama): reads the sim state every frame, never writes to it. */
export class WorldView3D {
  /** Smooth tile positions of units drawn this frame, for the camera. */
  readonly positions = new Map<number, { x: number; y: number }>();
  /** How well the current subject fits the safe frame (<= 1 is good), for the debug box and tests. */
  fitNow = 0;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(FOV, SCREEN.w / SCREEN.h, 0.3, 600);
  private sun = new THREE.DirectionalLight(0xfff0d4, 1.9);
  private hemi = new THREE.HemisphereLight(0xdcefff, 0x56663a, 1.1);
  private terrain?: Terrain;
  private seed = NaN;
  /** The coast, two points per map row, so the overview frames the land and not the sea around it. */
  private coast: Subject[] = [];
  private w = 0;
  private h = 0;
  private body = instanced(VILLAGER.body, MAX_UNITS);
  private head = instanced(VILLAGER.head, MAX_UNITS);
  private hair = instanced(VILLAGER.hair, MAX_UNITS);
  private arms = instanced(VILLAGER.arm, MAX_UNITS * 2);
  private legs = instanced(VILLAGER.leg, MAX_UNITS * 2);
  private crowns = instanced(VILLAGER.crown, 8, 0xffcf3a);
  private cubes = instanced(VILLAGER.cube, MAX_UNITS * 3);
  private bands = instanced(VILLAGER.band, 64);
  private feathers = instanced(VILLAGER.feather, 64);
  private hats = instanced(VILLAGER.hat, 64, 0x5b4636);
  private capes = instanced(VILLAGER.cape, 64);
  private stars = instanced(VILLAGER.star, 8, 0xffcf3a);
  private animalLegs = instanced(VILLAGER.animalLeg, MAX_ANIMALS * 5);
  private n = { unit: 0, cube: 0, band: 0, feather: 0, hat: 0, cape: 0, star: 0, crown: 0 };
  private cosmetics = new Map<string, Cosmetic>();
  private gestures = new Map<number, { name: PoseName; until: number }>();
  private last = new Map<number, Figure>();
  private dying: { fig: Figure; at: number }[] = [];
  private ruins: { g: THREE.Group; at: number }[] = [];
  private sites = new Map<number, { type: BuildingType; scaffold?: THREE.Group }>();
  private tick = 0;
  private sheep = instanced(new THREE.BoxGeometry(0.5, 0.36, 0.7).translate(0, 0.32, 0), MAX_ANIMALS);
  private animalHeads = instanced(new THREE.BoxGeometry(0.22, 0.22, 0.26).translate(0, 0.42, 0.42), MAX_ANIMALS);
  private trunks = instanced(new THREE.CylinderGeometry(0.07, 0.1, 0.5, 5).translate(0, 0.25, 0), 1, 0x7a4e2a);
  private leaves = instanced(new THREE.ConeGeometry(0.42, 1.5, 6).translate(0, 1.15, 0), 1);
  private rocks = instanced(new THREE.DodecahedronGeometry(0.3, 0).translate(0, 0.2, 0), 1);
  private fire = instanced(new THREE.TetrahedronGeometry(0.16, 0), MAX_FIRE, 0xffffff, false);
  private rain = instanced(new THREE.BoxGeometry(0.03, 0.7, 0.03), 500, 0xbfe3ff, false);
  private flood = new THREE.Mesh(new THREE.CircleGeometry(7.5, 24).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3f8fd8, transparent: true, opacity: 0.75, roughness: 0.3 }));
  private buildings = new Map<number, THREE.Group>();
  private beasts = new Map<ActiveEffect['kind'], Beast>();
  /** Particles, shock waves, beams and bolts of the god effects (port of the sketchbook FX). */
  readonly fx: Fx;
  private wolfEars = instanced(new THREE.ConeGeometry(0.08, 0.2, 4), MAX_ANIMALS * 2);
  private wolfEyes = instanced(new THREE.BoxGeometry(0.06, 0.06, 0.03), MAX_ANIMALS * 2, 0xffffff, false);
  private drops = new Map<number, { until: number; dur: number }>();
  private eclipseSky = new THREE.Group();
  private moon!: THREE.Mesh;
  private lastRender = 0;
  private frameDt = 0;
  private labels = new Map<number, { sprite: THREE.Sprite; text: string }>();
  private marks = new Map<number, { ring: THREE.Mesh; until: number }>();
  private faces = new Map<number, number>();
  private unitY = new Map<number, number>();
  private sky = new THREE.Color(SKY.day);
  private m = new THREE.Matrix4();
  private root = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private c = new THREE.Color();
  private camP: Vec3 = [0, 116, 80];
  private camL: Vec3 = [0, 0, 6];
  private prevShot?: Shot;
  private prevZoomed = false;

  constructor(stage: HTMLElement, private top: number, private height: number) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(SCREEN.w, height, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    const el = this.renderer.domElement;
    el.style.cssText = `position:absolute;left:0;top:${top}px;width:${SCREEN.w}px;height:${height}px`;
    stage.prepend(el);
    this.cam.aspect = SCREEN.w / height;
    this.cam.updateProjectionMatrix();
    this.scene.background = this.sky;
    this.scene.fog = new THREE.Fog(SKY.day, 150, 300);
    this.sun.position.set(-40, 70, 30);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -62, right: 62, top: 62, bottom: -62, near: 1, far: 200 });
    this.sun.shadow.bias = -0.0015;
    const water = new THREE.Mesh(new THREE.PlaneGeometry(600, 600).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3f8fe0, roughness: 0.35, transparent: true, opacity: 0.9 }));
    water.receiveShadow = true;
    this.flood.visible = false;
    this.fire.material = new THREE.MeshBasicMaterial();
    this.rain.material = new THREE.MeshBasicMaterial({ color: 0xbfe3ff, transparent: true, opacity: 0.6 });
    for (const m of [this.bands, this.capes]) (m.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    (this.stars.material as THREE.MeshStandardMaterial).emissive.set(0x8a6000);
    this.fx = new Fx(this.scene, (x, z) => Math.max(0, this.terrain?.heightAt(x + this.w / 2, z + this.h / 2) ?? 0));
    this.wolfEyes.material = new THREE.MeshBasicMaterial();
    this.buildEclipseSky();
    this.scene.add(this.cam, this.wolfEars, this.wolfEyes);
    this.scene.add(this.sun, this.hemi, water, this.flood, this.body, this.head, this.hair, this.arms, this.legs, this.crowns, this.cubes, this.bands, this.feathers, this.hats, this.capes, this.stars, this.animalLegs, this.sheep, this.animalHeads, this.trunks, this.leaves, this.rocks, this.fire, this.rain);
  }

  get lens() { return { fovDeg: FOV, aspect: this.cam.aspect }; }

  /** `alpha` is how far (0..1) real time is between this tick and the next. */
  sync(world: World, alpha: number): void {
    const now = world.tick + alpha;
    this.tick = now;
    if (world.seed !== this.seed) this.rebuild(world);
    else if (world.dirtyTiles.length) {
      this.terrain!.repaint(world, world.dirtyTiles);
      this.scatter(world);
      world.dirtyTiles = [];
    }
    this.syncBuildings(world);
    this.syncUnits(world, now);
    this.syncAnimals(world, now);
    this.syncFire(world, now);
    this.syncEffects(world, now);
    this.syncMarks();
  }

  private rebuild(world: World): void {
    this.seed = world.seed;
    this.w = world.w; this.h = world.h;
    this.coast = [];
    for (let y = 0; y < world.h; y++) {
      let x0 = -1, x1 = -1;
      for (let x = 0; x < world.w; x++) if (isLand(world.tiles[y * world.w + x])) { if (x0 < 0) x0 = x; x1 = x; }
      if (x0 >= 0) for (const x of [x0, x1 + 1]) this.coast.push({ x: x - world.w / 2, y: 0, z: y + 0.5 - world.h / 2, rx: 0, ry: 0 });
    }
    if (this.terrain) { this.scene.remove(this.terrain.mesh); this.terrain.mesh.geometry.dispose(); }
    this.terrain = new Terrain(world);
    this.scene.add(this.terrain.mesh);
    for (const g of this.buildings.values()) this.scene.remove(g);
    this.buildings.clear();
    this.sites.clear();
    for (const r of this.ruins) this.scene.remove(r.g);
    this.ruins = [];
    this.dying = [];
    this.last.clear();
    this.gestures.clear();
    this.faces.clear();
    this.drops.clear();
    this.fx.clear();
    this.scatter(world);
    world.dirtyTiles = [];
  }

  /** World position of a tile coordinate (tile centre = integer). */
  private at(tx: number, ty: number): Vec3 {
    return [tx + 0.5 - this.w / 2, Math.max(0.28, this.terrain!.heightAt(tx + 0.5, ty + 0.5)), ty + 0.5 - this.h / 2];
  }

  /** Trees and rocks from the sim's deposits; rebuilt when tiles change (a few thousand instances, cheap). */
  private scatter(world: World): void {
    const trees: number[] = [], rocks: number[] = [];
    world.deposits.forEach((d, i) => { if (d === Deposit.Tree && world.tiles[i] === Tile.Forest) trees.push(i); else if (d !== Deposit.None && d !== Deposit.Tree) rocks.push(i); });
    const grow = (mesh: THREE.InstancedMesh, n: number) => {
      if (mesh.instanceMatrix.count >= n) return mesh;
      const bigger = instanced(mesh.geometry, Math.ceil(n * 1.3), 0xffffff);
      bigger.material = mesh.material;
      this.scene.remove(mesh);
      this.scene.add(bigger);
      return bigger;
    };
    this.trunks = grow(this.trunks, trees.length);
    this.leaves = grow(this.leaves, trees.length);
    this.rocks = grow(this.rocks, rocks.length);
    const s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    trees.forEach((i, n) => {
      const x = i % world.w, y = (i - x) / world.w, k = 0.8 + hash(i) * 0.6;
      const [wx, wy, wz] = this.at(x + (hash(i * 3) - 0.5) * 0.5, y + (hash(i * 7) - 0.5) * 0.5);
      this.m.compose(p.set(wx, wy, wz), this.q.setFromAxisAngle(up, hash(i * 5) * 6.28), s.set(k, k, k));
      this.trunks.setMatrixAt(n, this.m);
      this.leaves.setMatrixAt(n, this.m);
      this.leaves.setColorAt(n, this.c.setHSL(0.33 + hash(i * 11) * 0.05, 0.5, 0.3 + hash(i * 13) * 0.1));
    });
    rocks.forEach((i, n) => {
      const x = i % world.w, y = (i - x) / world.w, k = 0.9 + hash(i) * 0.7, d = world.deposits[i];
      const [wx, wy, wz] = this.at(x, y);
      this.m.compose(p.set(wx, wy, wz), this.q.setFromAxisAngle(up, hash(i * 5) * 6.28), s.set(k, k * 0.8, k));
      this.rocks.setMatrixAt(n, this.m);
      this.rocks.setColorAt(n, this.c.set(d === Deposit.Gold ? 0xffcf3a : d === Deposit.Iron ? 0x7f8fa6 : 0x8f8c80));
    });
    for (const [mesh, n] of [[this.trunks, trees.length], [this.leaves, trees.length], [this.rocks, rocks.length]] as const) {
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  private syncBuildings(world: World): void {
    const seen = new Set<number>();
    for (const b of world.buildings) {
      if (!b.alive) continue;
      seen.add(b.id);
      let g = this.buildings.get(b.id);
      if (!g) {
        g = makeBuilding(b.type, b.team);
        const [x, y, z] = this.at(b.x, b.y);
        g.position.set(x, b.type === 'bridge' ? 0 : y - 0.05, z);
        g.rotation.y = b.type === 'bridge' || b.type === 'wall' ? 0 : Math.floor(hash(b.id) * 4) * (Math.PI / 2);
        g.scale.setScalar(b.type === 'bridge' || b.type === 'wall' || b.type === 'farm' ? 1 : 1.2);
        this.buildings.set(b.id, g);
        this.scene.add(g);
      }
      g.scale.y = b.progress >= 1 ? 1 : 0.15 + 0.85 * b.progress; // rises out of the ground while being built
      const site = this.sites.get(b.id) ?? { type: b.type };
      this.sites.set(b.id, site);
      if (b.progress < 1 && !site.scaffold && b.type !== 'farm' && b.type !== 'bridge') {
        site.scaffold = makeScaffold(b.type);
        site.scaffold.position.copy(g.position);
        this.scene.add(site.scaffold);
      } else if (b.progress >= 1 && site.scaffold) {
        this.scene.remove(site.scaffold);
        site.scaffold = undefined;
      }
      // damage chars the building, so a village under attack reads at a glance
      const char = Math.min(0.75, (1 - b.hp / b.maxHp) * 0.9 + (b.burning ? 0.15 : 0));
      if (char !== g.userData.char) {
        g.userData.char = char;
        g.traverse((o) => {
          const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
          if (!m?.color) return;
          m.userData.base ??= m.color.getHex();
          m.color.set(m.userData.base).lerp(this.c.set(0x241f1c), char);
        });
      }
    }
    for (const [id, g] of this.buildings) {
      if (seen.has(id)) continue;
      const site = this.sites.get(id);
      if (site?.scaffold) this.scene.remove(site.scaffold);
      if (site && site.type !== 'bridge') {
        const ruin = makeRuin(site.type, id);
        ruin.position.copy(g.position);
        this.scene.add(ruin);
        this.ruins.push({ g: ruin, at: this.tick });
      }
      this.scene.remove(g);
      this.buildings.delete(id);
      this.sites.delete(id);
    }
    // ruins stay a minute, then sink away
    this.ruins = this.ruins.filter((r) => {
      const age = this.tick - r.at;
      if (age > RUIN_TICKS) { this.scene.remove(r.g); return false; }
      if (age > RUIN_TICKS - 50) r.g.position.y -= 0.01;
      return true;
    });
  }

  private place(mv: Mover, now: number): { tx: number; ty: number; moving: boolean } {
    const k = Math.min(1, Math.max(0, (now - mv.moveStartTick) / mv.moveTicks));
    return { tx: mv.px + (mv.x - mv.px) * k, ty: mv.py + (mv.y - mv.py) * k, moving: k < 1 && (mv.px !== mv.x || mv.py !== mv.y) };
  }

  private face(mv: Mover, moving: boolean): number {
    let f = this.faces.get(mv.id) ?? hash(mv.id) * 6.28;
    if (moving) {
      const want = Math.atan2(mv.x - mv.px, mv.y - mv.py);
      f += Math.atan2(Math.sin(want - f), Math.cos(want - f)) * 0.25;
    }
    this.faces.set(mv.id, f);
    return f;
  }

  /** Draws one villager in the next free instance slots; live units, the dying and the catalogue all go through here. */
  private villager(v: Figure): void {
    const n = this.n.unit++, ps = pose(v.name, v.t, v.seed), down = v.name === 'die', k = this.figK;
    const p = this.figP, sc = this.figS.set(v.scale, v.scale, v.scale), local = this.figL, upper = this.figU, part = this.figPart, e = this.figE;
    this.root.compose(p.set(v.x, v.y + (down ? -ps.y * 0.7 : ps.y) * v.scale, v.z), this.q.setFromAxisAngle(UP, v.face + ps.twist), sc);
    // a fallen villager turns over the feet; everyone else leans from the hips so the feet stay planted
    if (down) upper.multiplyMatrices(this.root, local.makeRotationX(ps.lean));
    else upper.multiplyMatrices(this.root, local.makeRotationX(ps.lean).setPosition(0, 0.55 - 0.55 * Math.cos(ps.lean), -0.55 * Math.sin(ps.lean)));
    const legs = down ? upper : this.root;
    const put = (mesh: THREE.InstancedMesh, i: number, base: THREE.Matrix4, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) => {
      local.compose(p.set(x, y, z), this.q.setFromEuler(e.set(rx, ry, rz)), k.set(sx, sy, sz));
      mesh.setMatrixAt(i, this.m.multiplyMatrices(base, local));
    };
    put(this.body, n, upper, 0, 0.55, 0);
    this.body.setColorAt(n, this.c.set(v.tint));
    put(this.head, n, upper, 0, 1.39, 0, ps.headX, ps.headY);
    const head = part.copy(this.m);
    this.head.setColorAt(n, this.c.set(v.skin));
    put(this.hair, n, upper, 0, 1.42, -0.02, ps.headX, ps.headY);
    this.hair.setColorAt(n, this.c.set(v.hair));
    put(this.arms, n * 2, upper, -0.31, 1.11, 0, ps.armL, 0, ps.armLz);
    this.arms.setColorAt(n * 2, this.c.set(v.tint));
    put(this.arms, n * 2 + 1, upper, 0.31, 1.11, 0, ps.armR, 0, ps.armRz);
    const hand = this.figHand.copy(this.m);
    this.arms.setColorAt(n * 2 + 1, this.c);
    put(this.legs, n * 2, legs, -0.11, 0.55, 0, ps.legL);
    put(this.legs, n * 2 + 1, legs, 0.11, 0.55, 0, ps.legR);
    for (const i of [n * 2, n * 2 + 1]) this.legs.setColorAt(i, this.c.set(v.trousers ?? 0x2b2d38));
    const cube = (base: THREE.Matrix4, x: number, y: number, z: number, sx: number, sy: number, sz: number, color: number) => {
      if (this.n.cube >= this.cubes.instanceMatrix.count) return;
      put(this.cubes, this.n.cube, base, x, y, z, 0, 0, 0, sx, sy, sz);
      this.cubes.setColorAt(this.n.cube++, this.c.set(color));
    };
    if (v.tool) {
      const h = TOOL_HEAD[v.tool], sword = v.tool === 'sword';
      cube(hand, 0, -0.44, sword ? 0.4 : 0.2, 0.05, sword ? 0.03 : 0.05, sword ? 0.74 : 0.5, sword ? 0xdfe6ee : 0x8a5a2b);
      cube(hand, 0, -0.44, h.z, ...h.size, h.color);
    }
    if (v.load !== undefined) cube(upper, 0, 0.98, 0.36, 0.26, 0.22, 0.26, v.load);
    if (v.crown && this.n.crown < 8) put(this.crowns, this.n.crown++, head, 0, 0.31, 0);
    const cos = v.cos;
    if (cos?.tier === 1 && this.n.band < 64) {
      put(this.feathers, this.n.feather++, head, 0, 0, 0);
      put(this.bands, this.n.band, head, 0, 0.08, 0);
      this.bands.setColorAt(this.n.band++, this.c.set(TEAM_COLOR[v.team]));
    }
    if (cos && cos.tier >= 2 && this.n.hat < 64 && this.n.band < 64) {
      put(this.hats, this.n.hat++, head, 0, 0, 0);
      put(this.bands, this.n.band, head, 0, 0.26, 0, 0, 0, 0, 0.84);
      this.bands.setColorAt(this.n.band++, this.c.set(TEAM_COLOR[v.team]));
    }
    if (cos?.tier === 3 && this.n.cape < 64) {
      const moving = v.name === 'walk' || v.name === 'carry';
      put(this.capes, this.n.cape, upper, 0, 1.15, -0.27, -(0.12 + (moving ? 0.45 : 0) + Math.sin(v.t * 5 + v.seed) * 0.08));
      this.capes.setColorAt(this.n.cape++, this.c.set(TEAM_COLOR[v.team]).multiplyScalar(0.7));
    }
    if (cos?.top3 && this.n.star < 8) put(this.stars, this.n.star++, this.root, 0, 2.95 + Math.sin(v.t * 3) * 0.06, 0, 0, v.t * 2.2);
  }

  private figP = new THREE.Vector3();
  private figS = new THREE.Vector3();
  private figK = new THREE.Vector3();
  private figE = new THREE.Euler();
  private figL = new THREE.Matrix4();
  private figU = new THREE.Matrix4();
  private figPart = new THREE.Matrix4();
  private figHand = new THREE.Matrix4();

  private syncUnits(world: World, now: number): void {
    const t = now / 10, seen = new Set<number>();
    const plague = new Set(world.effects.filter((e) => e.kind === 'plague').map((e) => e.team));
    this.n = { unit: 0, cube: 0, band: 0, feather: 0, hat: 0, cape: 0, star: 0, crown: 0 };
    for (const u of world.units) {
      if (!u.alive || this.n.unit >= MAX_UNITS) continue;
      seen.add(u.id);
      const pl = this.place(u, now), [x, ground, z] = this.at(pl.tx, pl.ty), sick = plague.has(u.team), scale = unitScale(u);
      const drop = this.drops.get(u.id), falling = drop ? Math.max(0, (drop.until - performance.now()) / drop.dur) : 0, y = ground + falling * falling * 24;
      if (drop && !falling) this.drops.delete(u.id);
      this.positions.set(u.id, { x: pl.tx, y: pl.ty });
      this.unitY.set(u.id, y);
      const g = this.gestures.get(u.id);
      if (g && now > g.until) this.gestures.delete(u.id);
      const name = g && now <= g.until && !pl.moving ? g.name : poseOf(u, pl.moving, sick);
      const fig: Figure = {
        x, y, z, face: this.face(u, pl.moving), scale, name, t, seed: u.id, team: u.team,
        tint: sick ? 0x8fcf6a : u.role === 'hero' ? 0xc3cad6 : TEAM_COLOR[u.team], skin: sick ? 0xbfe0a0 : 0xf2c49b, hair: u.role === 'hero' ? 0xc3cad6 : HAIR[u.id % HAIR.length],
        tool: TOOL[name] ?? (u.role === 'hero' || u.role === 'warrior' ? 'sword' : undefined),
        load: u.carrying && name !== 'fight' ? LOAD[u.carrying.res] : undefined,
        crown: u.role === 'leader', cos: u.viewerId ? this.cosmetics.get(u.viewerId) : undefined,
      };
      this.villager(fig);
      this.last.set(u.id, fig);
      const level = u.viewerId ? this.cosmetics.get(u.viewerId)?.level : undefined;
      if (u.name) this.label(u.id, level ? `${u.name} · Lv ${level}` : u.name, u.role === 'leader', x, y + scale * 1.75 + 0.35, z);
    }
    // last round's MVP as a stone statue on its plinth, with a sign
    const st = world.statue;
    if (st && this.n.unit < MAX_UNITS) {
      const [sx, sy, sz] = this.at(st.x + 0.5, st.y + 0.5), stone = 0xb3aea2;
      this.villager({ x: sx, y: sy, z: sz, face: 0, scale: 1.9, name: 'rally', t: 0, seed: 1, team: st.team, tint: stone, skin: stone, hair: 0x9d988c, tool: 'sword', trousers: stone, cos: this.cosmetics.get(st.viewerId) });
      seen.add(STATUE_LABEL);
      this.label(STATUE_LABEL, `${st.name} · MVP`, true, sx, sy + 3.9, sz);
    }
    // a unit that was here last frame and is gone now falls over where it stood
    for (const [id, fig] of this.last) if (!seen.has(id)) { this.dying.push({ fig, at: now }); this.last.delete(id); }
    this.dying = this.dying.filter((d) => now - d.at < DEATH_TICKS && now >= d.at);
    for (const d of this.dying) {
      if (this.n.unit >= MAX_UNITS) break;
      const age = now - d.at;
      this.villager({ ...d.fig, name: 'die', t: age / 10, tool: undefined, load: undefined, y: d.fig.y - Math.max(0, age - (DEATH_TICKS - 8)) * 0.06 });
    }
    const n = this.n;
    const flush = (mesh: THREE.InstancedMesh, count: number) => { mesh.count = count; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; };
    for (const mesh of [this.body, this.head, this.hair]) flush(mesh, n.unit);
    for (const mesh of [this.arms, this.legs]) flush(mesh, n.unit * 2);
    flush(this.cubes, n.cube); flush(this.bands, n.band); flush(this.feathers, n.feather); flush(this.hats, n.hat); flush(this.capes, n.cape); flush(this.stars, n.star); flush(this.crowns, n.crown);
    for (const [id, l] of this.labels) if (!seen.has(id)) { this.scene.remove(l.sprite); l.sprite.material.map?.dispose(); this.labels.delete(id); }
    for (const id of this.positions.keys()) if (!seen.has(id)) { this.positions.delete(id); this.faces.delete(id); this.unitY.delete(id); }
  }

  /** Plays a pose on a standing unit for a while: a wave on joining, a cheer on a win. */
  gesture(id: number, name: PoseName, ticks = 30): void { this.gestures.set(id, { name, until: this.tick + ticks }); }

  /** Level look per viewer; fed from the player profiles. */
  setCosmetic(viewerId: string, cos: Cosmetic): void { this.cosmetics.set(viewerId, cos); }

  private label(id: number, text: string, gold: boolean, x: number, y: number, z: number): void {
    let l = this.labels.get(id);
    if (!l || l.text !== text) {
      if (l) { this.scene.remove(l.sprite); l.sprite.material.map?.dispose(); }
      const cv = document.createElement('canvas');
      cv.width = 512; cv.height = 96;
      const g = cv.getContext('2d')!;
      g.font = `bold ${text.length > 18 ? 36 : text.length > 12 ? 44 : 54}px "Pixelify Sans", monospace`;
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 12; g.strokeStyle = '#0d1019';
      g.strokeText(text, 256, 50);
      g.fillStyle = gold ? '#ffd75e' : '#ffffff';
      g.fillText(text, 256, 50);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false, transparent: true, sizeAttenuation: false }));
      sprite.scale.set(0.2, 0.0375, 1);
      sprite.renderOrder = 10;
      this.scene.add(sprite);
      l = { sprite, text };
      this.labels.set(id, l);
    }
    l.sprite.position.set(x, y, z);
    // names only when the camera is close enough to read who is who, or when the unit is pointed at
    l.sprite.visible = this.marks.has(id) || dist(this.camP, [x, y, z]) < 34;
  }

  private syncAnimals(world: World, now: number): void {
    const up = UP, p = new THREE.Vector3(), s = new THREE.Vector3();
    let n = 0, legs = 0, ears = 0;
    const night = world.effects.some((e) => e.kind === 'eclipse');
    for (const a of world.animals) {
      if (!a.alive || n >= MAX_ANIMALS) continue;
      const pl = this.place(a, now), [x, y, z] = this.at(pl.tx, pl.ty), wolf = a.kind === 'wolf', k = wolf ? 0.72 : 0.62; // same scale as the villagers next to them
      this.m.compose(p.set(x, y + (pl.moving ? Math.abs(Math.sin(now * 0.9 + a.id)) * 0.08 : 0), z), this.q.setFromAxisAngle(up, this.face(a, pl.moving)), s.set(k * (wolf ? 0.8 : 1), k, k * (wolf ? 1.25 : 1)));
      this.sheep.setMatrixAt(n, this.m);
      this.sheep.setColorAt(n, this.c.set(wolf ? 0x6b7078 : 0xf4f1e8));
      this.animalHeads.setMatrixAt(n, this.m);
      this.animalHeads.setColorAt(n, this.c.set(wolf ? 0x4f545c : 0x2b2d38));
      // four legs trot in diagonal pairs; a wolf's fifth 'leg' is its tail
      const body = this.root.copy(this.m), swing = pl.moving ? Math.sin(now * 0.9 + a.id) * 0.7 : 0, local = this.figL, e = this.figE;
      for (let i = 0; i < (wolf ? 5 : 4) && legs < this.animalLegs.instanceMatrix.count; i++) {
        if (i < 4) local.makeRotationX(i % 3 === 0 ? swing : -swing).setPosition(i % 2 ? 0.17 : -0.17, 0.28, i < 2 ? 0.24 : -0.24);
        else local.makeRotationFromEuler(e.set(-1.9 + Math.sin(now * 0.6 + a.id) * 0.25, 0, 0)).setPosition(0, 0.46, -0.36);
        this.animalLegs.setMatrixAt(legs, this.m.multiplyMatrices(body, local));
        this.animalLegs.setColorAt(legs++, this.c.set(wolf ? 0x4f545c : 0x2b2d38));
      }
      // wolves get pointed ears and eyes that glow in the dark of an eclipse
      if (wolf) for (const sx of [-1, 1]) {
        local.makeTranslation(sx * 0.07, 0.58, 0.36);
        this.wolfEars.setMatrixAt(ears, this.m.multiplyMatrices(body, local));
        this.wolfEars.setColorAt(ears, this.c.set(0x4f545c));
        local.makeTranslation(sx * 0.06, 0.46, 0.555);
        this.wolfEyes.setMatrixAt(ears, this.m.multiplyMatrices(body, local));
        this.wolfEyes.setColorAt(ears++, this.c.set(night ? 0xffd23a : 0x222222));
      }
      n++;
    }
    this.animalLegs.count = legs;
    this.animalLegs.instanceMatrix.needsUpdate = true;
    if (this.animalLegs.instanceColor) this.animalLegs.instanceColor.needsUpdate = true;
    for (const mesh of [this.wolfEars, this.wolfEyes]) { mesh.count = ears; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; }
    for (const mesh of [this.sheep, this.animalHeads]) { mesh.count = n; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; }
  }

  private syncFire(world: World, now: number): void {
    const spots: [number, number, number][] = [];
    for (const b of world.buildings) if (b.alive && b.burning) spots.push([b.x, b.y, BUILDING_SIZE[b.type].h * 0.7]);
    for (const i of world.burningTiles.keys()) spots.push([i % world.w, Math.floor(i / world.w), 0.8]);
    const p = new THREE.Vector3(), s = new THREE.Vector3(), per = Math.max(2, Math.min(7, Math.floor(MAX_FIRE / Math.max(1, spots.length))));
    let n = 0;
    for (const [tx, ty, h] of spots) for (let k = 0; k < per && n < MAX_FIRE; k++) {
      const life = (now * 0.12 + hash(n * 31 + k)) % 1, [x, y, z] = this.at(tx + (hash(n * 7 + k) - 0.5) * 0.7, ty + (hash(n * 13 + k) - 0.5) * 0.7), size = (1 - life) * 1.6 + 0.3;
      this.m.compose(p.set(x, y + h * 0.4 + life * 1.3, z), this.q.setFromAxisAngle(p.clone().normalize(), now + k), s.set(size, size * 1.4, size));
      this.fire.setMatrixAt(n, this.m);
      this.fire.setColorAt(n, this.c.set(life < 0.35 ? 0xffe28a : life < 0.7 ? 0xff9a2e : 0xd9441a));
      n++;
    }
    this.fire.count = n;
    this.fire.instanceMatrix.needsUpdate = true;
    if (this.fire.instanceColor) this.fire.instanceColor.needsUpdate = true;
  }

  private syncEffects(world: World, now: number): void {
    const t = now / 10, dt = Math.min(0.1, this.frameDt), active = new Set<ActiveEffect['kind']>();
    let dark = 0, flood: ActiveEffect | undefined;
    for (const e of world.effects) {
      const fade = Math.min(1, (e.until - now) / 20);
      if (e.kind === 'eclipse') dark = Math.max(dark, fade);
      if (e.kind === 'flood') flood = e;
      // lasting clouds over a village: green plague mist, golden glitter
      if (e.kind === 'plague' || e.kind === 'goldenAge') {
        const [cx, cy, cz] = this.at(e.x, e.y), plague = e.kind === 'plague';
        for (let i = 0; i < dt * (plague ? 30 : 40); i++) {
          const px = cx + rr(-6, 6), pz = cz + rr(-6, 6);
          this.fx.p.add(plague
            ? { x: px, y: cy + rr(0, 1.2), z: pz, vx: rr(-0.3, 0.3), vy: rr(0.1, 0.4), vz: rr(-0.3, 0.3), c: Math.random() < 0.5 ? 0x8fcf6a : 0x6aa84a, life: rr(2, 3), s: rr(0.14, 0.28), grow: 1.5, floor: false }
            : { x: px, y: cy + rr(0, 1), z: pz, vy: rr(1, 2.5), c: Math.random() < 0.5 ? 0xffd75e : 0xfff3b0, life: 2, s: 0.08, floor: false });
        }
      }
      if (e.kind !== 'dragon' && e.kind !== 'tornado' && e.kind !== 'titan') continue;
      active.add(e.kind);
      let b = this.beasts.get(e.kind);
      if (!b) { b = makeBeast(e.kind); this.beasts.set(e.kind, b); this.scene.add(b.root); b.root.position.set(...this.at(e.x, e.y)); }
      const [x, y, z] = this.at(e.x, e.y), py = e.kind === 'dragon' ? y + 6 + Math.sin(t * 1.3) * 0.8 : e.kind === 'titan' ? Math.max(-1.5, y - 0.3) : Math.max(0, y);
      const prev = b.root.position.clone();
      b.root.position.lerp(new THREE.Vector3(x, py, z), 0.12); // the sim moves beasts a tile at a time; this smooths it
      const dx = b.root.position.x - prev.x, dz = b.root.position.z - prev.z;
      if (e.kind !== 'tornado' && Math.hypot(dx, dz) > 0.002) b.root.rotation.y = Math.atan2(dx, dz);
      b.update(t, dt, this.fx);
    }
    for (const [kind, b] of this.beasts) if (!active.has(kind)) { this.scene.remove(b.root); this.beasts.delete(kind); }
    // flood water rises over the village in two seconds and drains in the last two
    if (flood) {
      const [x, , z] = this.at(flood.x, flood.y), level = Math.min(1, (now - (flood.until - BALANCE.god.floodTicks)) / 20, (flood.until - now) / 20);
      this.flood.position.set(x, -0.3 + Math.max(0, level) * 1.05 + Math.sin(t * 2) * 0.05, z);
      if (Math.random() < dt * 8) { const a = Math.random() * 6.28; this.fx.p.burst(x + Math.cos(a) * 7, 0.6, z + Math.sin(a) * 7, 6, [0xffffff, 0xbfe3ff], 1.5, 3, 0.6, 0.1, 10); }
    }
    this.flood.visible = !!flood;
    const raining = world.tick < world.rainUntil, storm = world.round.phase === 'storm';
    this.sky.lerp(this.c.set(dark > 0.05 ? SKY.eclipse : storm ? SKY.storm : raining ? SKY.rain : SKY.day), 0.04);
    (this.scene.fog as THREE.Fog).color.copy(this.sky);
    const flash = this.fx.flash;
    this.sun.intensity = (storm ? 0.7 : raining ? 0.9 : 1.9) * (1 - dark * 0.92) + flash * 3;
    this.hemi.intensity = (storm ? 0.75 : 1.1) * (1 - dark * 0.7) + flash;
    const p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1), tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -0.25);
    const drops = raining || storm ? 500 : 0;
    for (let i = 0; i < drops; i++) {
      const fall = (now * (0.25 + hash(i) * 0.1) + hash(i * 3)) % 1;
      this.m.compose(p.set(this.camL[0] + (hash(i * 5) - 0.5) * 60 + fall * 4, 22 - fall * 22, this.camL[2] + (hash(i * 7) - 0.5) * 60), tilt, s);
      this.rain.setMatrixAt(i, this.m);
    }
    this.rain.count = drops;
    this.rain.instanceMatrix.needsUpdate = true;
  }

  private syncMarks(): void {
    const ms = performance.now();
    for (const [id, mk] of this.marks) {
      const p = this.positions.get(id);
      if (ms > mk.until || !p) { this.scene.remove(mk.ring); this.marks.delete(id); continue; }
      const [x, y, z] = this.at(p.x, p.y);
      mk.ring.position.set(x, y + 0.08, z);
      mk.ring.rotation.z = ms / 300;
      mk.ring.scale.setScalar(1 + Math.sin(ms / 160) * 0.12);
    }
  }

  /** Chat balloons are gone in the 3D game (decision D4); a unit's name label is the feedback. */
  say(unitId: number, _text: string, ms = 3000): void { this.point(unitId, '#ffffff', ms); }

  /** A lightning bolt striking tile (x, y), with a flash that is felt even off-camera. */
  bolt(tx: number, ty: number): void { const [x, , z] = this.at(tx, ty); this.fx.bolt(x, z); }

  /** Plays the animation of a sim event (gifts, kills, fireworks); see events3d.ts. */
  event(e: SimEvent, world: World): void { if (this.terrain) playEvent(this.fx, e, this.stage(world)); }

  private stage(world: World): Stage {
    return {
      at: (tx, ty) => this.at(tx, ty),
      unit: (id) => { const p = this.positions.get(id); return p && world.units.some((u) => u.id === id && u.alive) ? this.at(p.x, p.y) : undefined; },
      gesture: (id, name, ticks) => this.gesture(id, name, ticks),
      drop: (id, seconds) => this.drops.set(id, { until: performance.now() + seconds * 1000, dur: seconds * 1000 }),
      cheer: (team) => { for (const u of world.units) if (u.alive && (!team || u.team === team)) this.gesture(u.id, 'cheer', 30); },
      look: () => this.camL,
      eclipse: (seconds) => this.fx.temp(seconds, (k, _dt, t) => {
        this.eclipseSky.visible = true;
        // the moon slides over the sun in three seconds and off again at the end
        const cover = Math.min(1, t / 3, (1 - k) * seconds / 2);
        this.moon.position.set((1 - ease3(cover)) * 13, (1 - ease3(cover)) * -4, 0.1);
      }, undefined, () => { this.eclipseSky.visible = false; }),
    };
  }

  /** Sun and moon for the eclipse, hung in the sky at the top of the frame (the camera mostly looks down). */
  private buildEclipseSky(): void {
    const disc = (r: number, color: number, blend = false) => new THREE.Mesh(new THREE.CircleGeometry(r, 32), new THREE.MeshBasicMaterial({ color, fog: false, depthTest: false, depthWrite: false, transparent: true, blending: blend ? THREE.AdditiveBlending : THREE.NormalBlending }));
    const corona = disc(9.5, 0xffe9a0, true), sun = disc(6.5, 0xfff2b0);
    (corona.material as THREE.MeshBasicMaterial).opacity = 0.35;
    this.moon = disc(6.7, 0x141a2a);
    corona.renderOrder = 997; sun.renderOrder = 998; this.moon.renderOrder = 999;
    this.eclipseSky.add(corona, sun, this.moon);
    this.eclipseSky.position.set(-22, 46, -150);
    this.eclipseSky.visible = false;
    this.cam.add(this.eclipseSky);
  }

  /** Gold beam on a viewer's villager: a returning player (welcome back) or a level-up with a shock wave. */
  celebrate(unitId: number, levelUp: boolean): void {
    const p = this.positions.get(unitId);
    if (!p || !this.terrain) return;
    const [x, y, z] = this.at(p.x, p.y);
    this.fx.beam(x, z, 0xffd75e, 0.7, 2.2);
    this.fx.p.burst(x, y + 1.2, z, levelUp ? 36 : 16, [0xffcf3a, 0xffffff], 2.5, 3, 1, 0.08, 4);
    if (levelUp) { this.fx.shock(x, y, z, 4, 0xffd75e); this.gesture(unitId, 'cheer', 30); }
    this.fx.sound(levelUp ? 'fanfare' : 'chime');
  }

  /** Glowing ring under a unit and its name shown, for !me, a join or a command. */
  point(unitId: number, color: string, ms = 3000): void {
    const old = this.marks.get(unitId);
    if (old) this.scene.remove(old.ring);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.75, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false }));
    this.scene.add(ring);
    this.marks.set(unitId, { ring, until: performance.now() + ms });
  }

  /** The highest thing at a world spot (ground, trees, roofs), for the camera's line of sight. */
  private topAt = (world: World) => (x: number, z: number): number => {
    const tx = Math.floor(x + this.w / 2), ty = Math.floor(z + this.h / 2);
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return 0;
    const i = ty * this.w + tx, ground = Math.max(0, this.terrain!.heightAt(tx + 0.5, ty + 0.5));
    return ground + (world.tiles[i] === Tile.Forest && world.deposits[i] === Deposit.Tree ? 2.3 : 0);
  };

  private subjects(world: World, focus: { x: number; y: number; track?: Track }): Subject[] {
    const unit = (u: Unit): Subject | undefined => {
      const p = this.positions.get(u.id);
      if (!p) return undefined;
      const [x, y, z] = this.at(p.x, p.y), k = unitScale(u);
      return { x, y: y + k * 1.05, z, rx: Math.max(0.8, k * 0.6), ry: k * 1.15 };
    };
    const t = focus.track;
    if (t && 'unitId' in t) {
      const u = world.units.find((v) => v.id === t.unitId && v.alive), s = u && unit(u);
      if (s) return [s];
    } else if (t && 'effect' in t) {
      const b = this.beasts.get(t.effect);
      if (b) return [{ x: b.root.position.x, y: b.root.position.y + b.size.lift * (t.effect === 'dragon' ? 0 : 1), z: b.root.position.z, rx: b.size.rx, ry: b.size.ry }];
    } else if (t && 'fight' in t) {
      const out: Subject[] = [];
      for (const u of world.units) {
        if (out.length >= 14 || !u.alive || u.job.kind !== 'attack' || Math.abs(u.x - focus.x) + Math.abs(u.y - focus.y) > CAMERA.fightRadius) continue;
        const s = unit(u);
        if (s) out.push(s);
      }
      if (out.length) return out;
    }
    const [x, y, z] = this.at(focus.x, focus.y);
    return [{ x, y: y + 1, z, rx: 2.2, ry: 1.6 }];
  }

  /**
   * Turns the director's choice (tile + zoom) into a 3D shot and applies the framing rule:
   * the subject always fits the safe frame, the view looks over obstacles, and the camera never trails a fast subject.
   */
  camera(world: World, c: CameraTarget, focus: { x: number; y: number; zoomed: boolean; track?: Track }, dtMs: number): void {
    if (!this.terrain) return;
    const t = performance.now() / 1000, dt = Math.min(0.1, dtMs / 1000), k = Math.min(1, Math.max(0, (c.zoom - 1) / 1.1));
    // overview: a slow flight round the island (a lap in about two minutes), seen at about 58° down.
    // The guard only backs off, so start too close and let it stop at the first fit.
    const mid = centre(this.coast), yaw = t * 0.05;
    let over = guard({ p: [mid[0] + Math.sin(yaw) * 8, 13, mid[2] + Math.cos(yaw) * 8], l: [mid[0], 0, mid[2]] }, this.coast, this.lens, WIDE);
    // the guard backs off in coarse steps; creep back in until the coast touches the edge
    for (let i = 0; i < 12; i++) {
      const nearer: Shot = { l: over.l, p: mix(over.p, over.l, 0.015) };
      if (fit(nearer, this.coast, this.lens, WIDE) > 1) break;
      over = nearer;
    }
    // Dev wants it a bit closer than the whole coast: the outer edge drifts in and out of view as the camera circles
    over = { l: over.l, p: mix(over.p, over.l, OVERVIEW_CLOSER) };
    const [x, y, z] = this.at(c.x, c.y), d = 24 / c.zoom, az = Math.sin(t * 0.12) * 0.5, el = 0.56;
    const close: Shot = { l: [x, y + 1, z], p: [x + Math.sin(az) * Math.cos(el) * d, y + 1 + Math.sin(el) * d, z + Math.cos(az) * Math.cos(el) * d] };
    const ease = k * k * (3 - 2 * k);
    let shot: Shot = { p: mix(over.p, close.p, ease), l: mix(over.l, close.l, ease) };
    const subjects = focus.zoomed ? this.subjects(world, focus) : [];
    shot = frame(shot, subjects, this.lens, this.topAt(world));
    // carry the camera along with a moving shot, so easing only works on the remainder
    if (this.prevShot && this.prevZoomed === focus.zoomed && dist(shot.l, this.prevShot.l) < 1.5 && dist(shot.p, this.prevShot.p) < 1.5) {
      for (let i = 0; i < 3; i++) { this.camL[i] += (shot.l[i] - this.prevShot.l[i]) * 0.9; this.camP[i] += (shot.p[i] - this.prevShot.p[i]) * 0.9; }
    }
    this.prevShot = shot;
    this.prevZoomed = focus.zoomed;
    const a = 1 - Math.exp(-4 * dt);
    this.camP = mix(this.camP, shot.p, a);
    this.camL = mix(this.camL, shot.l, 1 - Math.exp(-6 * dt));
    // hard rule: still outside the safe frame after easing → whip over this frame
    const want = subjects.length ? fit(shot, subjects, this.lens) : 0;
    this.fitNow = subjects.length ? fit({ p: this.camP, l: this.camL }, subjects, this.lens) : 0;
    for (let i = 0; i < 30 && this.fitNow > 1 && this.fitNow > want + 0.01; i++) {
      this.camP = mix(this.camP, shot.p, 0.3);
      this.camL = mix(this.camL, shot.l, 0.3);
      this.fitNow = fit({ p: this.camP, l: this.camL }, subjects, this.lens);
    }
    this.camP[1] = Math.max(this.camP[1], this.topAt(world)(this.camP[0], this.camP[2]) + 2);
    this.cam.position.set(...this.camP);
    this.cam.lookAt(...this.camL);
    // impacts shake the picture a little (never with reduced motion)
    const jolt = REDUCED_MOTION ? 0 : this.fx.shake * this.fx.shake * 0.35;
    if (jolt > 0.001) this.cam.position.add(new THREE.Vector3(rr(-jolt, jolt), rr(-jolt, jolt), rr(-jolt, jolt)));
  }

  /** Fixed camera in tile coordinates, for the catalogue; the game uses `camera()` with the framing rule. */
  lookFrom(from: { x: number; y: number; up: number }, at: { x: number; y: number }): void {
    const [x, y, z] = this.at(at.x, at.y), [px, , pz] = this.at(from.x, from.y);
    this.camP = [px, y + from.up, pz];
    this.camL = [x, y + 0.6, z];
    this.cam.position.set(...this.camP);
    this.cam.lookAt(...this.camL);
  }

  /** Turns a standing unit; walking units face where they go. */
  turn(id: number, angle: number): void { this.faces.set(id, angle); }

  render(): void {
    const ms = performance.now();
    this.frameDt = this.lastRender ? Math.min(0.1, (ms - this.lastRender) / 1000) : 0;
    this.lastRender = ms;
    this.fx.update(this.frameDt);
    this.renderer.render(this.scene, this.cam);
  }
}

