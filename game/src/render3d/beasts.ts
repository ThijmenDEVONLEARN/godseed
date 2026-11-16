import * as THREE from 'three';
import type { ActiveEffect } from '../sim/types';
import { rr, type Fx } from './fx';
import { mat } from './models';

/** A god beast from the sketchbook: model, its own animation and the particles it throws off. */
export interface Beast {
  root: THREE.Group;
  /** Half width, half height and how far above the root the middle is, for the camera framing. */
  size: { rx: number; ry: number; lift: number };
  update(t: number, dt: number, fx: Fx): void;
}

function part(geo: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0, shadow = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

const group = (parent: THREE.Object3D, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };

/** Purple dragon with orange wings: heavy wing beats, swaying neck and tail, fire breath in bursts. */
function dragon(): Beast {
  const root = new THREE.Group(), body = group(root), scale = mat(0x4a3570), belly = mat(0xe09a4a), wingM = mat(0xe0703a, { side: THREE.DoubleSide }), horn = mat(0xf2ead8), eye = new THREE.MeshBasicMaterial({ color: 0xffe14a });
  body.scale.setScalar(1.3);
  part(new THREE.IcosahedronGeometry(1, 1), scale, body).scale.set(1, 0.85, 2.1);
  part(new THREE.IcosahedronGeometry(0.8, 1), belly, body, 0, -0.3, 0.2).scale.set(0.9, 0.6, 1.7);
  const neck: THREE.Group[] = [];
  let par: THREE.Object3D = body;
  for (let i = 0; i < 4; i++) { const g = group(par, 0, i ? 0.25 : 0.4, i ? 0.5 : 1.7); part(new THREE.BoxGeometry(0.55 - i * 0.05, 0.55 - i * 0.05, 0.65), scale, g, 0, 0, 0.25); neck.push(g); par = g; }
  const head = group(par, 0, 0.1, 0.6);
  part(new THREE.BoxGeometry(0.7, 0.55, 0.9), scale, head, 0, 0, 0.3);
  const jaw = part(new THREE.BoxGeometry(0.6, 0.18, 0.8), belly, head, 0, -0.32, 0.35);
  for (const s of [-1, 1]) {
    part(new THREE.ConeGeometry(0.1, 0.55, 4), horn, head, s * 0.22, 0.45, -0.05).rotation.x = -0.6;
    part(new THREE.BoxGeometry(0.1, 0.1, 0.05), eye, head, s * 0.24, 0.12, 0.72, false);
  }
  const mouth = group(head, 0, -0.15, 0.9);
  const wingGeo = new THREE.BufferGeometry();
  wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.6, 0, 0, -0.8, 3.4, 0.2, -1.4, 0, 0, 0.6, 3.4, 0.2, -1.4, 2.4, 0.3, 0.9, 2.4, 0.3, 0.9, 3.4, 0.2, -1.4, 4.2, 0.1, 0.3], 3));
  wingGeo.computeVertexNormals();
  const wings = [1, -1].map((s) => { const g = group(body, 0.6 * s, 0.35, 0.2); part(wingGeo, wingM, g).scale.x = s; return g; });
  const tail: THREE.Group[] = [];
  par = body;
  for (let i = 0; i < 5; i++) { const g = group(par, 0, 0, i ? -0.55 : -1.9); part(new THREE.BoxGeometry(0.5 - i * 0.08, 0.45 - i * 0.07, 0.6), scale, g, 0, 0, -0.25); tail.push(g); par = g; }
  part(new THREE.ConeGeometry(0.25, 0.5, 4), belly, par, 0, 0, -0.7).rotation.x = -Math.PI / 2;
  const legs = [[0.5, 0.9], [-0.5, 0.9], [0.5, -0.9], [-0.5, -0.9]].map(([x, z]) => { const g = group(body, x, -0.5, z); part(new THREE.BoxGeometry(0.25, 0.6, 0.25), scale, g, 0, -0.3, 0); return g; });
  const mp = new THREE.Vector3(), dir = new THREE.Vector3(), q = new THREE.Quaternion();
  let roared = -10;
  return {
    root, size: { rx: 4.4, ry: 2, lift: 0 },
    update(t, dt, fx) {
      // the down stroke is quick, the up stroke slow
      const f = Math.sin(t * 3.2), breath = Math.sin(t * 0.9) > 0.25;
      wings.forEach((w, i) => { w.rotation.z = (i ? -1 : 1) * (f * 0.75 + 0.1); });
      body.position.y = -f * 0.15;
      body.rotation.z = -0.3; // banks into the circle
      neck.forEach((n, i) => { n.rotation.x = Math.sin(t * 1.6 - i * 0.5) * 0.08 + (breath ? 0.14 : 0); n.rotation.y = Math.sin(t * 0.9 - i * 0.4) * 0.08; });
      tail.forEach((n, i) => { n.rotation.y = Math.sin(t * 2 - i * 0.6) * 0.22; n.rotation.x = Math.sin(t * 1.4 - i * 0.5) * 0.08; });
      jaw.rotation.x = breath ? 0.45 : 0;
      legs.forEach((l, i) => { l.rotation.x = 0.6 + Math.sin(t * 2 + i) * 0.1; });
      if (!breath) return;
      if (t - roared > 6) { roared = t; fx.sound('roar'); }
      mouth.getWorldPosition(mp);
      root.getWorldQuaternion(q);
      for (let i = 0; i < dt * 90; i++) {
        dir.set(rr(-0.15, 0.15), -0.7, 1).applyQuaternion(q).normalize().multiplyScalar(rr(6, 9));
        fx.p.add({ x: mp.x, y: mp.y, z: mp.z, vx: dir.x, vy: dir.y, vz: dir.z, c: [0xff7b22, 0xffc53d, 0xff4d1a][(Math.random() * 3) | 0], life: rr(0.5, 0.9), s: rr(0.2, 0.38), g: 2 });
      }
    },
  };
}

/** A funnel of spinning rings with dust and debris whirling round it. */
function tornado(): Beast {
  const root = new THREE.Group(), rings: THREE.Mesh[] = [];
  for (let i = 0; i < 12; i++) {
    const m = part(new THREE.TorusGeometry(0.45 + i * 0.32, 0.18 + i * 0.025, 5, 14).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x8d8a86, transparent: true, opacity: 0.55, flatShading: true, depthWrite: false }), root, 0, 0.3 + i * 0.78, 0, false);
    rings.push(m);
  }
  let howled = -10;
  return {
    root, size: { rx: 4, ry: 4.8, lift: 4.6 },
    update(t, dt, fx) {
      rings.forEach((r, i) => { r.rotation.y += dt * (5 - i * 0.2); r.position.x = Math.sin(t * 3 + i * 0.5) * i * 0.1; r.position.z = Math.cos(t * 2.6 + i * 0.5) * i * 0.1; });
      if (t - howled > 5) { howled = t; fx.sound('wind'); }
      const { x, y, z } = root.position;
      for (let i = 0; i < dt * 60; i++) {
        const a = Math.random() * 6.28, h = Math.random() * 9, rad = 0.6 + h * 0.4;
        fx.p.add({ x: x + Math.cos(a) * rad, y: y + h, z: z + Math.sin(a) * rad, vx: -Math.sin(a) * 7, vy: rr(1, 3), vz: Math.cos(a) * 7, c: Math.random() < 0.5 ? 0x8a7b6b : 0x6b5f57, life: 0.5, s: rr(0.1, 0.22), floor: false });
      }
      fx.shake = Math.max(fx.shake, 0.12);
    },
  };
}

/** A stone giant with moss on its shoulders and glowing eyes; every step shakes the ground. */
function titan(): Beast {
  const root = new THREE.Group(), stone = mat(0x7d8577), moss = mat(0x5f7a4a), eye = new THREE.MeshBasicMaterial({ color: 0x8ff6ff });
  const torso = group(root, 0, 4.2);
  part(new THREE.BoxGeometry(3, 3.2, 1.9), stone, torso);
  part(new THREE.DodecahedronGeometry(0.9, 0), moss, torso, 1.4, 1.5, 0);
  part(new THREE.DodecahedronGeometry(0.8, 0), moss, torso, -1.5, 1.4, 0.1);
  const head = group(torso, 0, 2.2);
  part(new THREE.BoxGeometry(1.4, 1.3, 1.4), stone, head);
  for (const s of [-1, 1]) part(new THREE.BoxGeometry(0.32, 0.16, 0.05), eye, head, s * 0.35, 0.1, 0.71, false);
  part(new THREE.BoxGeometry(1.5, 0.3, 1.5), moss, head, 0, 0.7, 0);
  const limb = (x: number, y: number, w: number, h: number) => {
    const g = group(torso, x, y);
    part(new THREE.BoxGeometry(w, h * 0.5, w), stone, g, 0, -h * 0.25, 0);
    part(new THREE.BoxGeometry(w * 1.1, h * 0.5, w * 1.1), stone, g, 0, -h * 0.72, 0);
    return g;
  };
  const armL = limb(-1.9, 1.2, 0.9, 3.6), armR = limb(1.9, 1.2, 0.9, 3.6), legL = limb(-0.8, -1.4, 1.1, 2.8), legR = limb(0.8, -1.4, 1.1, 2.8);
  let ph = 0, lastStep = 0;
  return {
    root, size: { rx: 2.6, ry: 3.9, lift: 3.8 },
    update(t, dt, fx) {
      ph += dt * 2.2;
      const s = Math.sin(ph);
      legL.rotation.x = s * 0.55; legR.rotation.x = -s * 0.55; armL.rotation.x = -s * 0.45; armR.rotation.x = s * 0.45;
      torso.position.y = 4.2 + Math.abs(Math.cos(ph)) * 0.25;
      torso.rotation.z = s * 0.05;
      head.rotation.y = Math.sin(t * 0.4) * 0.3;
      const step = Math.floor(ph / Math.PI);
      if (step === lastStep) return;
      lastStep = step;
      const { x, z } = root.position, gy = fx.ground(x, z);
      fx.shake = Math.max(fx.shake, 0.55);
      fx.shock(x, gy, z, 4, 0xcbb28a);
      fx.p.burst(x, gy + 0.2, z, 24, [0xcbb28a, 0x8a7b6b], 4, 3, 1, 0.26, 8);
      if (gy <= 0.05) fx.p.burst(x, 0.2, z, 30, [0xbfe3ff, 0xffffff], 3.5, 7, 1, 0.18, 12);
      fx.sound('stomp');
    },
  };
}

export function makeBeast(kind: Extract<ActiveEffect['kind'], 'dragon' | 'tornado' | 'titan'>): Beast {
  return kind === 'dragon' ? dragon() : kind === 'tornado' ? tornado() : titan();
}
