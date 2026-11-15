import * as THREE from 'three';

import type { CameraTarget, Track } from '../render/Camera';
import { CAMERA } from '../config/camera';
import { Deposit, Tile, type ActiveEffect, type Mover, type Unit, type World } from '../sim/types';
import { SCREEN } from '../ui/layout';
import { dist, fit, frame, guard, mix, type Shot, type Subject, type Vec3 } from './frame';
import { BUILDING_SIZE, TEAM_COLOR, VILLAGER, makeBeast, makeBuilding, mat } from './models';
import { Terrain } from './terrain';

const MAX_UNITS = 420, MAX_ANIMALS = 140, MAX_FIRE = 360, FOV = 46;
const HAIR = [0x3b2a1a, 0x6b4423, 0xd9a441, 0x1f1f24, 0xb5651d, 0xe8e2d0];
const SKY = { day: 0xa9d6f0, rain: 0x7d8a98, storm: 0x4a3436, eclipse: 0x18213a };
/** Villagers are small next to a one-tile hut; chiefs and heroes stand out by size. */
const unitScale = (u: Unit) => (u.role === 'hero' ? 1.15 : u.role === 'leader' ? 0.85 : 0.62);
/** The overview may use nearly the whole view; the HUD sits outside the 3D view for now. */
const WIDE = { x: 0.94, y0: -0.94, y1: 0.94 };
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
  private w = 0;
  private h = 0;
  private body = instanced(VILLAGER.body, MAX_UNITS);
  private head = instanced(VILLAGER.head, MAX_UNITS);
  private hair = instanced(VILLAGER.hair, MAX_UNITS);
  private arms = instanced(VILLAGER.arm, MAX_UNITS * 2);
  private legs = instanced(VILLAGER.leg, MAX_UNITS * 2, 0x2b2d38);
  private crowns = instanced(VILLAGER.crown, 8, 0xffcf3a);
  private sheep = instanced(new THREE.BoxGeometry(0.5, 0.36, 0.7).translate(0, 0.32, 0), MAX_ANIMALS);
  private animalHeads = instanced(new THREE.BoxGeometry(0.22, 0.22, 0.26).translate(0, 0.42, 0.42), MAX_ANIMALS);
  private trunks = instanced(new THREE.CylinderGeometry(0.07, 0.1, 0.5, 5).translate(0, 0.25, 0), 1, 0x7a4e2a);
  private leaves = instanced(new THREE.ConeGeometry(0.42, 1.5, 6).translate(0, 1.15, 0), 1);
  private rocks = instanced(new THREE.DodecahedronGeometry(0.3, 0).translate(0, 0.2, 0), 1);
  private fire = instanced(new THREE.TetrahedronGeometry(0.16, 0), MAX_FIRE, 0xffffff, false);
  private rain = instanced(new THREE.BoxGeometry(0.03, 0.7, 0.03), 500, 0xbfe3ff, false);
  private flood = new THREE.Mesh(new THREE.CircleGeometry(7.5, 24).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3f8fd8, transparent: true, opacity: 0.75, roughness: 0.3 }));
  private buildings = new Map<number, THREE.Group>();
  private beasts = new Map<ActiveEffect['kind'], ReturnType<typeof makeBeast>>();
  private labels = new Map<number, { sprite: THREE.Sprite; text: string }>();
  private marks = new Map<number, { ring: THREE.Mesh; until: number }>();
  private bolts: { mesh: THREE.Mesh; until: number }[] = [];
  private faces = new Map<number, number>();
  private unitY = new Map<number, number>();
  private flash = 0;
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
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const el = this.renderer.domElement;
    el.style.cssText = `position:absolute;left:0;top:${top}px;width:${SCREEN.w}px;height:${height}px`;
    stage.prepend(el);
    this.cam.aspect = SCREEN.w / height;
    this.cam.updateProjectionMatrix();
    this.scene.background = this.sky;
    this.scene.fog = new THREE.Fog(SKY.day, 110, 260);
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
    this.scene.add(this.sun, this.hemi, water, this.flood, this.body, this.head, this.hair, this.arms, this.legs, this.crowns, this.sheep, this.animalHeads, this.trunks, this.leaves, this.rocks, this.fire, this.rain);
  }

  get lens() { return { fovDeg: FOV, aspect: this.cam.aspect }; }

  /** `alpha` is how far (0..1) real time is between this tick and the next. */
  sync(world: World, alpha: number): void {
    const now = world.tick + alpha;
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
    if (this.terrain) { this.scene.remove(this.terrain.mesh); this.terrain.mesh.geometry.dispose(); }
    this.terrain = new Terrain(world);
    this.scene.add(this.terrain.mesh);
    for (const g of this.buildings.values()) this.scene.remove(g);
    this.buildings.clear();
    this.faces.clear();
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
    }
    for (const [id, g] of this.buildings) if (!seen.has(id)) { this.scene.remove(g); this.buildings.delete(id); }
  }

  /** Smooth position between the previous and the current tile. */
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

  private syncUnits(world: World, now: number): void {
    const t = now / 10, up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), s = new THREE.Vector3(), local = new THREE.Matrix4();
    let n = 0, crowns = 0;
    const seen = new Set<number>();
    const plague = new Set(world.effects.filter((e) => e.kind === 'plague').map((e) => e.team));
    const limb = (mesh: THREE.InstancedMesh, i: number, x: number, y: number, rx: number, rz = 0) => {
      local.makeRotationFromEuler(new THREE.Euler(rx, 0, rz)).setPosition(x, y, 0);
      mesh.setMatrixAt(i, this.m.multiplyMatrices(this.root, local));
    };
    for (const u of world.units) {
      if (!u.alive || n >= MAX_UNITS) continue;
      seen.add(u.id);
      const pl = this.place(u, now), [x, y, z] = this.at(pl.tx, pl.ty), f = this.face(u, pl.moving);
      this.positions.set(u.id, { x: pl.tx, y: pl.ty });
      const scale = unitScale(u);
      const ph = now * 0.9 + u.id, walk = pl.moving ? 1 : 0, sw = Math.sin(ph) * 0.8 * walk;
      const working = !pl.moving && (u.job.kind === 'gather' && u.job.stage === 'work' || u.job.kind === 'build'), fighting = !pl.moving && u.job.kind === 'attack', praying = u.job.kind === 'pray' && !pl.moving;
      const bob = Math.abs(Math.sin(ph)) * 0.07 * walk + (praying ? -0.22 : 0);
      this.root.compose(p.set(x, y + bob * scale, z), this.q.setFromAxisAngle(up, f), s.set(scale, scale, scale));
      this.unitY.set(u.id, y);
      // anticipation and a fast strike: slow up, quick down
      const beat = (now * (fighting ? 0.5 : 0.33) + u.id * 0.37) % 1, strike = beat < 0.7 ? -2.4 * (beat / 0.7) : -2.4 * (1 - (beat - 0.7) / 0.3);
      const armR = working || fighting ? strike : praying ? -2.8 + Math.sin(t * 2) * 0.15 : sw * 0.85, armL = praying ? -2.8 - Math.sin(t * 2) * 0.15 : -sw * 0.85;
      const tint = plague.has(u.team) ? 0x8fcf6a : u.role === 'hero' ? 0xc3cad6 : TEAM_COLOR[u.team];
      this.body.setMatrixAt(n, this.m.multiplyMatrices(this.root, local.makeTranslation(0, 0.55, 0)));
      this.body.setColorAt(n, this.c.set(tint));
      local.makeRotationY(pl.moving ? 0 : Math.sin(t * 0.6 + u.id) * 0.45).setPosition(0, 1.39, 0);
      this.head.setMatrixAt(n, this.m.multiplyMatrices(this.root, local));
      this.head.setColorAt(n, this.c.set(plague.has(u.team) ? 0xbfe0a0 : 0xf2c49b));
      local.setPosition(0, 1.42, -0.02);
      this.hair.setMatrixAt(n, this.m.multiplyMatrices(this.root, local));
      this.hair.setColorAt(n, this.c.set(u.role === 'hero' ? 0xc3cad6 : HAIR[u.id % HAIR.length]));
      limb(this.arms, n * 2, -0.31, 1.11, armL, -0.06);
      limb(this.arms, n * 2 + 1, 0.31, 1.11, armR, 0.06);
      this.arms.setColorAt(n * 2, this.c.set(tint));
      this.arms.setColorAt(n * 2 + 1, this.c);
      limb(this.legs, n * 2, -0.11, 0.55, sw);
      limb(this.legs, n * 2 + 1, 0.11, 0.55, -sw);
      if (u.role === 'leader' && crowns < 8) {
        local.makeTranslation(0, 1.7, 0);
        this.crowns.setMatrixAt(crowns++, this.m.multiplyMatrices(this.root, local));
      }
      if (u.name) this.label(u, x, y + scale * 1.75 + 0.35, z);
      n++;
    }
    for (const mesh of [this.body, this.head, this.hair]) { mesh.count = n; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; }
    for (const mesh of [this.arms, this.legs]) { mesh.count = n * 2; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; }
    this.crowns.count = crowns;
    this.crowns.instanceMatrix.needsUpdate = true;
    for (const [id, l] of this.labels) if (!seen.has(id)) { this.scene.remove(l.sprite); l.sprite.material.map?.dispose(); this.labels.delete(id); }
    for (const id of this.positions.keys()) if (!seen.has(id)) { this.positions.delete(id); this.faces.delete(id); this.unitY.delete(id); }
  }

  private label(u: Unit, x: number, y: number, z: number): void {
    let l = this.labels.get(u.id);
    if (!l || l.text !== u.name) {
      if (l) { this.scene.remove(l.sprite); l.sprite.material.map?.dispose(); }
      const cv = document.createElement('canvas');
      cv.width = 512; cv.height = 96;
      const g = cv.getContext('2d')!;
      g.font = `bold ${u.name!.length > 12 ? 44 : 54}px "Pixelify Sans", monospace`;
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 12; g.strokeStyle = '#0d1019';
      g.strokeText(u.name!, 256, 50);
      g.fillStyle = u.role === 'leader' ? '#ffd75e' : '#ffffff';
      g.fillText(u.name!, 256, 50);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false, transparent: true, sizeAttenuation: false }));
      sprite.scale.set(0.2, 0.0375, 1);
      sprite.renderOrder = 10;
      this.scene.add(sprite);
      l = { sprite, text: u.name! };
      this.labels.set(u.id, l);
    }
    l.sprite.position.set(x, y, z);
    // names only when the camera is close enough to read who is who, or when the unit is pointed at
    l.sprite.visible = this.marks.has(u.id) || dist(this.camP, [x, y, z]) < 34;
  }

  private syncAnimals(world: World, now: number): void {
    const up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), s = new THREE.Vector3();
    let n = 0;
    for (const a of world.animals) {
      if (!a.alive || n >= MAX_ANIMALS) continue;
      const pl = this.place(a, now), [x, y, z] = this.at(pl.tx, pl.ty), wolf = a.kind === 'wolf', k = wolf ? 1.15 : 1;
      this.m.compose(p.set(x, y + (pl.moving ? Math.abs(Math.sin(now * 0.9 + a.id)) * 0.08 : 0), z), this.q.setFromAxisAngle(up, this.face(a, pl.moving)), s.set(k * (wolf ? 0.8 : 1), k, k * (wolf ? 1.25 : 1)));
      this.sheep.setMatrixAt(n, this.m);
      this.sheep.setColorAt(n, this.c.set(wolf ? 0x6b7078 : 0xf4f1e8));
      this.animalHeads.setMatrixAt(n, this.m);
      this.animalHeads.setColorAt(n, this.c.set(wolf ? 0x4f545c : 0x2b2d38));
      n++;
    }
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
    const t = now / 10, active = new Set<ActiveEffect['kind']>();
    let dark = 0, flood: ActiveEffect | undefined;
    for (const e of world.effects) {
      const fade = Math.min(1, (e.until - now) / 20);
      if (e.kind === 'eclipse') dark = Math.max(dark, fade);
      if (e.kind === 'flood') flood = e;
      if (e.kind !== 'dragon' && e.kind !== 'tornado' && e.kind !== 'titan') continue;
      active.add(e.kind);
      let b = this.beasts.get(e.kind);
      if (!b) { b = makeBeast(e.kind); this.beasts.set(e.kind, b); this.scene.add(b.root); b.root.position.set(...this.at(e.x, e.y)); }
      const [x, y, z] = this.at(e.x, e.y), py = y + (e.kind === 'dragon' ? 6 + Math.sin(t * 1.3) * 0.8 : 0);
      const prev = b.root.position.clone();
      b.root.position.lerp(new THREE.Vector3(x, py, z), 0.12); // the sim moves beasts a tile at a time; this smooths it
      const dx = b.root.position.x - prev.x, dz = b.root.position.z - prev.z;
      if (e.kind !== 'tornado' && Math.hypot(dx, dz) > 0.002) b.root.rotation.y = Math.atan2(dx, dz);
      b.animate(t);
    }
    for (const [kind, b] of this.beasts) if (!active.has(kind)) { this.scene.remove(b.root); this.beasts.delete(kind); }
    this.flood.visible = !!flood;
    if (flood) { const [x, , z] = this.at(flood.x, flood.y); this.flood.position.set(x, 0.75 + Math.sin(t * 2) * 0.05, z); }
    const raining = world.tick < world.rainUntil, storm = world.round.phase === 'storm';
    this.sky.lerp(this.c.set(dark > 0.05 ? SKY.eclipse : storm ? SKY.storm : raining ? SKY.rain : SKY.day), 0.04);
    (this.scene.fog as THREE.Fog).color.copy(this.sky);
    this.flash = Math.max(0, this.flash - 0.06);
    this.sun.intensity = (storm ? 0.7 : raining ? 0.9 : 1.9) * (1 - dark * 0.92) + this.flash * 3;
    this.hemi.intensity = (storm ? 0.75 : 1.1) * (1 - dark * 0.7) + this.flash;
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
    this.bolts = this.bolts.filter((b) => { if (ms <= b.until) { b.mesh.visible = Math.floor(ms / 60) % 2 === 0; return true; } this.scene.remove(b.mesh); return false; });
  }

  /** Chat balloons are gone in the 3D game (decision D4); a unit's name label is the feedback. */
  say(unitId: number, _text: string, ms = 3000): void { this.point(unitId, '#ffffff', ms); }

  /** A lightning bolt striking tile (x, y), with a flash that is felt even off-camera. */
  bolt(tx: number, ty: number, ms = 350): void {
    const [x, y, z] = this.at(tx, ty);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.22, 34, 5).translate(0, 17, 0), new THREE.MeshBasicMaterial({ color: 0xeaf6ff }));
    mesh.position.set(x, y, z);
    mesh.rotation.z = (hash(Math.floor(performance.now())) - 0.5) * 0.3;
    this.scene.add(mesh);
    this.bolts.push({ mesh, until: performance.now() + ms });
    this.flash = 1;
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
    // overview: the whole island, as large as the view allows
    const ex = this.w * 0.46, ez = this.h * 0.46, corners: Subject[] = [[-ex, -ez], [ex, -ez], [-ex, ez], [ex, ez]].map(([cx, cz]) => ({ x: cx, y: 0, z: cz, rx: 0, ry: 0 }));
    const over = guard({ p: [Math.sin(t * 0.045) * 12, 70, 52], l: [0, 0, 0] }, corners, this.lens, WIDE);
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
  }

  render(): void { this.renderer.render(this.scene, this.cam); }
}

