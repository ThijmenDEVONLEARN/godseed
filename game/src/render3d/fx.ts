import * as THREE from 'three';

/** Sound hooks: the view calls these at the right moment, the sounds themselves come later (R7). */
export type Sfx =
  | 'pop' | 'rumble' | 'zing' | 'hum' | 'thunder' | 'whistle' | 'boom' | 'howl' | 'land' | 'roar' | 'wind'
  | 'cough' | 'eruption' | 'wave' | 'harp' | 'drone' | 'coins' | 'stomp' | 'chime' | 'hit' | 'crash' | 'fanfare';

/** Render-only randomness: the sim never sees it. */
const R = Math.random;
export const rr = (a: number, b: number) => a + R() * (b - a);
export const ease = {
  out: (k: number) => 1 - (1 - k) ** 3,
  in: (k: number) => k * k * k,
  io: (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2),
  back: (k: number) => 1 + 2.70158 * (k - 1) ** 3 + 1.70158 * (k - 1) ** 2,
};
const clamp01 = (k: number) => Math.max(0, Math.min(1, k));

interface Particle {
  x: number; y: number; z: number; vx: number; vy: number; vz: number;
  /** gravity, air drag, size, seconds left, start life, grow (smoke), stretch (rain-like), bounces on the ground */
  g: number; drag: number; s: number; life: number; max: number; grow: number; stretch: number; floor: boolean;
  spin: number; vs: number; c: number;
}
type ParticleInit = Partial<Particle> & { c: number };

const MAX_PER_COLOUR = 500, MAX_PARTICLES = 2600;

/** Little cubes with physics, one instanced mesh per colour (the sketchbook's FX). */
export class Particles {
  private ps: Particle[] = [];
  private meshes = new Map<number, THREE.InstancedMesh>();
  private geo = new THREE.BoxGeometry(1, 1, 1);
  private o = new THREE.Object3D();
  constructor(private scene: THREE.Scene, private ground: (x: number, z: number) => number) {}

  get count() { return this.ps.length; }

  private mesh(c: number): THREE.InstancedMesh {
    let m = this.meshes.get(c);
    if (!m) {
      m = new THREE.InstancedMesh(this.geo, new THREE.MeshBasicMaterial({ color: c }), MAX_PER_COLOUR);
      m.count = 0;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.scene.add(m);
      this.meshes.set(c, m);
    }
    return m;
  }

  add(o: ParticleInit): void {
    if (this.ps.length > MAX_PARTICLES) return;
    this.mesh(o.c);
    const p: Particle = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, g: 0, drag: 0, s: 0.2, life: 1, max: 1, grow: 0, stretch: 1, floor: true, spin: R() * 6, vs: 0, ...o };
    p.max = p.life;
    this.ps.push(p);
  }

  burst(x: number, y: number, z: number, n: number, cols: number[], speed: number, up: number, life: number, s: number, g = 14): void {
    for (let i = 0; i < n; i++) {
      const a = R() * 6.283, v = speed * (0.3 + R() * 0.7);
      this.add({ x, y, z, vx: Math.cos(a) * v, vy: up * (0.4 + R() * 0.8), vz: Math.sin(a) * v, c: cols[i % cols.length], life: life * (0.6 + R() * 0.6), s: s * (0.6 + R() * 0.7), g, vs: R() * 8 });
    }
  }

  smoke(x: number, y: number, z: number, s = 0.35, c = 0xd6d0ca): void {
    this.add({ x: x + rr(-0.2, 0.2), y, z: z + rr(-0.2, 0.2), vx: rr(-0.2, 0.2) + 0.18, vy: rr(0.9, 1.5), vz: rr(-0.2, 0.2) + 0.06, c, life: rr(1.6, 2.4), s: s * 0.6, grow: 1.6, floor: false, drag: 0.3 });
  }

  fire(x: number, y: number, z: number, r: number, k = 1): void {
    this.add({ x: x + rr(-r, r), y: y + R() * 0.3, z: z + rr(-r, r), vx: 0.15, vy: rr(1.5, 3) * k, vz: 0.05, c: [0xff7b22, 0xffc53d, 0xff4d1a][(R() * 3) | 0], life: rr(0.35, 0.7), s: rr(0.18, 0.34) * k, floor: false });
  }

  update(dt: number): void {
    const ps = this.ps;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) { ps[i] = ps[ps.length - 1]; ps.pop(); continue; }
      p.vy -= p.g * dt;
      if (p.drag) { const f = Math.max(0, 1 - p.drag * dt); p.vx *= f; p.vz *= f; if (!p.g) p.vy *= f; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.spin += p.vs * dt;
      if (p.floor) {
        const gy = Math.max(this.ground(p.x, p.z), 0);
        if (p.y < gy + p.s * 0.4) { p.y = gy + p.s * 0.4; p.vy *= -0.3; p.vx *= 0.55; p.vz *= 0.55; p.vs *= 0.5; }
      }
    }
  }

  render(): void {
    for (const m of this.meshes.values()) m.count = 0;
    const o = this.o;
    for (const p of this.ps) {
      const m = this.meshes.get(p.c)!;
      if (m.count >= MAX_PER_COLOUR) continue;
      const k = p.life / p.max, s = p.grow ? p.s * (1 + (1 - k) * p.grow) * Math.min(1, k * 3) : p.s * (0.35 + 0.65 * k);
      o.position.set(p.x, p.y, p.z);
      if (p.stretch > 1) o.rotation.set(0, 0, 0); else o.rotation.set(p.spin, p.spin * 0.7, 0);
      o.scale.set(s, s * p.stretch, s);
      o.updateMatrix();
      m.setMatrixAt(m.count++, o.matrix);
    }
    for (const m of this.meshes.values()) m.instanceMatrix.needsUpdate = true;
  }
}

interface Temp { t: number; dur: number; obj?: THREE.Object3D; upd(k: number, dt: number, t: number): void; end?(): void }

const glow = (color: number, opacity = 0.8) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });

/** Timed effect pieces (rings, shock waves, light beams, bolts) plus the particles, shake and flash they cause. */
export class Fx {
  readonly p: Particles;
  /** 0..1, read by the camera (screen shake) and by the lights (white flash). */
  shake = 0;
  flash = 0;
  /** Warm point light for impacts and lava. */
  readonly light = new THREE.PointLight(0xff8a3a, 0, 40, 1.4);
  onSound?: (id: Sfx) => void;
  private temps: Temp[] = [];

  constructor(private scene: THREE.Scene, readonly ground: (x: number, z: number) => number) {
    this.p = new Particles(scene, ground);
    scene.add(this.light);
  }

  sound(id: Sfx): void { this.onSound?.(id); }

  /** Runs `upd(k)` with k going 0 → 1 over `dur` seconds after `delay`; `obj` is removed from the scene at the end. */
  temp(dur: number, upd: Temp['upd'], obj?: THREE.Object3D, end?: () => void, delay = 0): void {
    if (obj) { obj.visible = delay <= 0; this.scene.add(obj); }
    this.temps.push({ t: -delay, dur, obj, upd, end });
  }

  /** Calls `fn` once after `delay` seconds. */
  later(delay: number, fn: () => void): void {
    let done = false;
    this.temp(0.001, () => { if (!done) { done = true; fn(); } }, undefined, undefined, delay);
  }

  ring(color: number, r: number, x: number, y: number, z: number): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.RingGeometry(r * 0.8, r, 40).rotateX(-Math.PI / 2), glow(color));
    m.position.set(x, y + 0.08, z);
    return m;
  }

  shock(x: number, y: number, z: number, maxR: number, color = 0xffffff): void {
    const m = new THREE.Mesh(new THREE.TorusGeometry(1, 0.14, 6, 40).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false }));
    m.position.set(x, y + 0.25, z);
    this.temp(0.9, (k) => { const r = 1 + ease.out(k) * maxR; m.scale.set(r, 1 + k * 2, r); (m.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - k); }, m);
  }

  /** A light pillar from the sky onto (x, z). */
  beam(x: number, z: number, color: number, w: number, dur: number): void {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(w, w, 60, 16, 1, true), glow(color, 0));
    m.position.set(x, this.ground(x, z) + 30, z);
    this.temp(dur, (k) => { (m.material as THREE.MeshBasicMaterial).opacity = Math.sin(Math.min(1, k * 1.2) * Math.PI) * 0.55; m.scale.x = m.scale.z = 1 + Math.sin(k * 30) * 0.04; }, m);
  }

  /** A jagged lightning bolt with a double flash, sparks and a jolt. */
  bolt(x: number, z: number): void {
    const gy = this.ground(x, z), n = 9, pts: THREE.Vector3[] = [], sx = x + rr(-6, 6), sz = z + rr(-6, 6);
    for (let i = 0; i <= n; i++) {
      const k = i / n, j = i && i < n ? 1 : 0;
      pts.push(new THREE.Vector3(sx + (x - sx) * k + j * rr(-1.4, 1.4), 34 + (gy - 34) * k, sz + (z - sz) * k + j * rr(-1.4, 1.4)));
    }
    const g = new THREE.Group(), core = new THREE.MeshBasicMaterial({ color: 0xeaf6ff, transparent: true }), halo = glow(0x9fd0ff, 0.35), up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[i + 1];
      for (const [w, m] of [[0.1, core], [0.4, halo]] as const) {
        const c = new THREE.Mesh(new THREE.CylinderGeometry(w, w, a.distanceTo(b), 5), m);
        c.position.copy(a).add(b).multiplyScalar(0.5);
        c.quaternion.setFromUnitVectors(up, b.clone().sub(a).normalize());
        g.add(c);
      }
    }
    this.temp(0.55, (k) => { g.visible = k < 0.25 || (k > 0.4 && k < 0.6); core.opacity = halo.opacity = 1 - k; }, g);
    this.flash = Math.max(this.flash, 0.85);
    this.shake = Math.max(this.shake, 0.5);
    this.p.burst(x, gy + 0.2, z, 24, [0xffffff, 0xbfe3ff, 0xffd75e], 5, 7, 0.6, 0.12, 10);
    this.sound('thunder');
  }

  /** Red warning ring, a burning rock coming in at an angle, then the blast. Lands after `fall` seconds. */
  meteor(x: number, z: number, fall: number): void {
    const gy = this.ground(x, z), warn = this.ring(0xff3b30, 2, x, gy, z);
    this.temp(fall + 0.4, (k, _dt, t) => { warn.scale.setScalar(1 + Math.sin(t * 8) * 0.12); (warn.material as THREE.MeshBasicMaterial).opacity = t < fall ? 0.5 + Math.sin(t * 8) * 0.3 : 0.8 * (1 - k); }, warn);
    const rock = new THREE.Group();
    rock.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 0), new THREE.MeshStandardMaterial({ color: 0x4a3a32, emissive: 0xff5a1f, emissiveIntensity: 0.6, flatShading: true })));
    rock.add(new THREE.Mesh(new THREE.IcosahedronGeometry(1.5, 1), glow(0xffa040, 0.45)));
    const from = [x + 16, 34, z - 20], start = Math.min(0.2, fall / 4);
    this.sound('whistle');
    this.temp(fall - start, (k, dt) => {
      const q = ease.in(k), mx = from[0] + (x - from[0]) * q, my = from[1] + (gy - from[1]) * q, mz = from[2] + (z - from[2]) * q;
      rock.position.set(mx, my, mz);
      rock.rotation.x += dt * 3; rock.rotation.y += dt * 2;
      this.light.position.set(mx, my, mz);
      this.light.intensity = Math.max(this.light.intensity, 2 + k * 3);
      for (let i = 0; i < 3; i++) { this.p.fire(mx, my, mz, 0.5, 1); this.p.add({ x: mx + rr(-0.4, 0.4), y: my, z: mz + rr(-0.4, 0.4), c: 0x6b5f57, life: 1.4, s: 0.3, grow: 1.5, floor: false, drag: 0.5 }); }
    }, rock, () => this.blast(x, gy, z, 8, 110), start);
  }

  /** Flash, shock wave, debris, then smoke and embers for a while. */
  blast(x: number, y: number, z: number, r: number, n: number): void {
    this.flash = 1;
    this.shake = Math.max(this.shake, 1);
    this.light.position.set(x, y + 3, z);
    this.light.intensity = 5;
    this.shock(x, y, z, r);
    this.p.burst(x, y + 0.4, z, n, [0xff7b22, 0xffc53d, 0x5b4636, 0x8a7b6b, 0x3a3430], 9, 10, 1.6, 0.2, 14);
    this.sound('boom');
    this.temp(6, (k, dt) => {
      this.light.intensity = Math.max(0, this.light.intensity - dt * 4);
      if (R() < dt * 6 * (1 - k)) this.p.smoke(x + rr(-1.2, 1.2), y, z + rr(-1.2, 1.2), 0.7, 0x5a5450);
      if (R() < dt * 10 * (1 - k)) this.p.fire(x + rr(-1.5, 1.5), this.ground(x, z) + 0.1, z + rr(-1.5, 1.5), 0.3, 0.7);
    });
  }

  update(dt: number): void {
    for (let i = this.temps.length - 1; i >= 0; i--) {
      const o = this.temps[i];
      o.t += dt;
      if (o.t < 0) continue;
      if (o.obj) o.obj.visible = true;
      o.upd(clamp01(o.t / o.dur), dt, o.t);
      if (o.t >= o.dur) {
        if (o.obj) this.scene.remove(o.obj);
        this.temps.splice(i, 1);
        o.end?.();
      }
    }
    this.p.update(dt);
    this.p.render();
    this.shake = Math.max(0, this.shake - dt * 1.8);
    this.flash = Math.max(0, this.flash - dt * 3.5);
    if (!this.temps.length) this.light.intensity = Math.max(0, this.light.intensity - dt * 4);
  }

  /** Drops everything (new world). */
  clear(): void {
    for (const o of this.temps) if (o.obj) this.scene.remove(o.obj);
    this.temps = [];
    this.light.intensity = 0;
  }
}
