import * as THREE from 'three';
import type { Team } from '@godseed/shared';
import { BALANCE } from '../config/balance';
import type { SimEvent } from '../sim/types';
import type { Vec3 } from './frame';
import { ease, rr, type Fx } from './fx';
import { TEAM_COLOR, mat } from './models';
import type { PoseName } from './poses';

/** What an event animation may ask of the 3D view. */
export interface Stage {
  at(tx: number, ty: number): Vec3;
  /** Feet of a unit as drawn now. */
  unit(id: number): Vec3 | undefined;
  gesture(id: number, name: PoseName, ticks: number): void;
  /** Lets a unit fall out of the sky (hero landing). */
  drop(id: number, seconds: number): void;
  /** Every unit of `team` (or everyone) cheers. */
  cheer(team?: Team): void;
  /** Where the camera looks now, so rain of gold falls in view. */
  look(): Vec3;
  /** The sun disc and moon of the eclipse, kept in the sky in front of the camera. */
  eclipse(seconds: number): void;
}

const S_PER_TICK = 1 / BALANCE.ticksPerSecond;
const around = (fx: Fx, s: Stage, tx: number, ty: number, r: number): Vec3 => {
  const a = Math.random() * 6.283, d = r * Math.sqrt(Math.random());
  const [x, , z] = s.at(tx, ty), px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
  return [px, Math.max(0, fx.ground(px, pz)), pz];
};

function sword(): THREE.Group {
  const g = new THREE.Group(), gold = mat(0xffcf3a, { emissive: 0x6a4a00 }), blade = mat(0xeaf2ff, { emissive: 0x9fb4d0 });
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, y: number) => { const p = new THREE.Mesh(geo, m); p.position.y = y; g.add(p); };
  add(new THREE.BoxGeometry(0.1, 1.1, 0.03), blade, 0.75);
  add(new THREE.BoxGeometry(0.42, 0.08, 0.08), gold, 0.18);
  add(new THREE.BoxGeometry(0.07, 0.3, 0.07), gold, 0);
  return g;
}

function chest(): { root: THREE.Group; lid: THREE.Group } {
  const root = new THREE.Group(), wood = mat(0x8a5a2b), gold = mat(0xffcf3a, { metalness: 0.5, emissive: 0x4a3200 });
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, p: THREE.Object3D, x: number, y: number, z: number) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; p.add(o); };
  add(new THREE.BoxGeometry(0.95, 0.55, 0.62), wood, root, 0, 0.28, 0);
  add(new THREE.BoxGeometry(1, 0.1, 0.66), gold, root, 0, 0.5, 0);
  for (const x of [-0.3, 0.3]) add(new THREE.BoxGeometry(0.12, 0.58, 0.66), gold, root, x, 0.28, 0);
  const lid = new THREE.Group();
  lid.position.set(0, 0.56, -0.31);
  root.add(lid);
  add(new THREE.BoxGeometry(0.95, 0.26, 0.62), wood, lid, 0, 0.13, 0.31);
  add(new THREE.BoxGeometry(0.16, 0.2, 0.08), gold, lid, 0, 0.05, 0.64);
  return { root, lid };
}

/** Plays the one-off animation of a sim event; lasting effects (beasts, flood, plague mist) are drawn from world.effects. */
export function playEvent(fx: Fx, e: SimEvent, s: Stage): void {
  if (e.x === undefined || e.y === undefined) return;
  const [x, y, z] = s.at(e.x, e.y);
  switch (e.kind) {
    case 'kill': fx.p.burst(x, y + 0.5, z, 8, [0xffffff, 0xe5484d], 2.5, 3, 0.4, 0.08, 10); fx.sound('hit'); return;
    case 'destroyed': fx.p.burst(x, y + 0.4, z, 30, [0x8a7b6b, 0x5b4636, 0xcbb28a], 3.5, 5, 1.2, 0.2, 12); fx.shake = Math.max(fx.shake, 0.3); fx.sound('crash'); return;
    case 'built': fx.p.burst(x, y + 0.2, z, 16, [0xcbb28a, 0xffffff], 2.5, 2, 0.8, 0.16, 6); return;
    case 'birth': fx.p.burst(x, y + 0.6, z, 10, [0xffc0d8, 0xffffff], 1.5, 2.5, 0.9, 0.08, 3); return;
    case 'storm': fx.bolt(x, z); return;
    case 'leader': fx.beam(x, z, 0xffd75e, 0.6, 1.8); fx.p.burst(x, y + 1.6, z, 24, [0xffcf3a, 0xffffff], 2, 3, 1, 0.08, 4); fx.sound('fanfare'); return;
    case 'roundEnd': {
      // fireworks over the winning village
      const c = e.team ? TEAM_COLOR[e.team] : 0xffffff;
      for (let i = 0; i < 8; i++) fx.later(i * 0.45, () => { const [px, , pz] = around(fx, s, e.x!, e.y!, 6); fx.p.burst(px, y + rr(7, 10), pz, 40, [c, 0xffffff, 0xffcf3a], 5, 3, 1.4, 0.14, 3); fx.sound('pop'); });
      return;
    }
    case 'god': break;
    default: return;
  }
  const spots = e.spots ?? [{ x: e.x, y: e.y }];
  switch (e.god) {
    case 'spawnTrees': case 'spawnSheep': case 'spawnStone': {
      const cols = e.god === 'spawnTrees' ? [0x7cc95a, 0x4fa043] : e.god === 'spawnSheep' ? [0xffffff, 0xf3f1ea] : [0xcbb28a, 0x8f8c80];
      for (let i = 0; i < 6; i++) fx.later(0.2 + i * 0.3, () => { const [px, py, pz] = around(fx, s, e.x!, e.y!, 6); fx.p.burst(px, py + 0.4, pz, 14, cols, 2, 3, 0.9, 0.16, 4); fx.sound(e.god === 'spawnStone' ? 'rumble' : 'pop'); });
      if (e.god === 'spawnStone') fx.temp(2, () => { fx.shake = Math.max(fx.shake, 0.12); });
      return;
    }
    case 'weapon': {
      // a glowing sword spins down a beam of light into the giver's hand
      const p = (e.unitId !== undefined && s.unit(e.unitId)) || [x, y, z], top = p[1] + 1.4, sw = sword();
      sw.scale.setScalar(1.4);
      fx.beam(p[0], p[2], 0xfff0a0, 0.35, 2.2);
      fx.temp(1.6, (k, _dt, t) => {
        const q = (e.unitId !== undefined && s.unit(e.unitId)) || p;
        sw.position.set(q[0], top + (1 - ease.io(k)) * 12, q[2]);
        sw.rotation.set(Math.PI, t * 8, 0);
        if (Math.random() < 0.6) fx.p.add({ x: q[0] + rr(-0.2, 0.2), y: sw.position.y, z: q[2] + rr(-0.2, 0.2), c: 0xfff0a0, life: 0.6, s: 0.07, floor: false });
      }, sw, () => {
        fx.p.burst(p[0], top, p[2], 20, [0xfff0a0, 0xffffff], 2.5, 3, 0.8, 0.08, 4);
        fx.sound('zing');
        if (e.unitId !== undefined) s.gesture(e.unitId, 'rally', 25);
      });
      return;
    }
    case 'shield': {
      // a shimmering bubble round the giver and a wave of light over the village that mends it
      const bubble = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), new THREE.MeshBasicMaterial({ color: 0x9fe6ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      fx.sound('hum');
      fx.shock(x, y, z, 7, 0x9fe6ff);
      fx.temp(6, (k, _dt, t) => {
        const q = (e.unitId !== undefined && s.unit(e.unitId)) || [x, y, z];
        bubble.position.set(q[0], q[1] + 0.6, q[2]);
        bubble.scale.setScalar(ease.back(Math.min(1, t / 0.6)) * (1 + Math.sin(t * 5) * 0.03));
        (bubble.material as THREE.MeshBasicMaterial).opacity = (0.22 + Math.sin(t * 5) * 0.06) * Math.min(1, (1 - k) * 5);
        if (t > 1 && Math.random() < 0.05) { const a = Math.random() * 6.28; fx.p.burst(q[0] + Math.cos(a), q[1] + 0.8, q[2] + Math.sin(a), 6, [0xffffff, 0x9fe6ff], 2, 1.5, 0.4, 0.06, 6); }
      }, bubble);
      return;
    }
    case 'lightning': for (const p of spots) { const [bx, , bz] = s.at(p.x, p.y); fx.bolt(bx, bz); fx.later(0.6, () => fx.bolt(bx + 0.3, bz - 0.3)); } return;
    case 'meteor': case 'meteorShower':
      spots.forEach((p, i) => { const [mx, , mz] = s.at(p.x, p.y); fx.later(i * 0.08, () => fx.meteor(mx, mz, BALANCE.god.meteorFallTicks * S_PER_TICK - i * 0.08)); });
      return;
    case 'wolfPack':
      // the pack comes out of a puff of dark dust at the edge of the village and howls
      for (let i = 0; i < 6; i++) { const [px, py, pz] = around(fx, s, e.x, e.y, 4); fx.p.burst(px, py + 0.3, pz, 10, [0x3a3430, 0x6f7480], 1.5, 2, 1, 0.2, 4); }
      fx.later(0.4, () => fx.sound('howl'));
      return;
    case 'hero': {
      // golden beam, the hero falls out of the sky and lands with a shock wave
      const fall = 1.2;
      fx.beam(x, z, 0xffd75e, 0.9, 2.4);
      if (e.unitId !== undefined) s.drop(e.unitId, fall);
      fx.later(fall, () => {
        const p = (e.unitId !== undefined && s.unit(e.unitId)) || [x, y, z];
        fx.shake = Math.max(fx.shake, 1);
        fx.shock(p[0], p[1], p[2], 6, 0xffd75e);
        fx.p.burst(p[0], p[1] + 0.2, p[2], 40, [0xcbb28a, 0xffd75e], 5, 3.5, 1, 0.22, 8);
        fx.sound('land');
        if (e.unitId !== undefined) s.gesture(e.unitId, 'rally', 30);
      });
      return;
    }
    case 'dragon': fx.sound('roar'); return;
    case 'tornado': fx.sound('wind'); return;
    case 'titanWalk': fx.sound('stomp'); return;
    case 'plague': fx.sound('cough'); return;
    case 'flood': fx.sound('wave'); return;
    case 'goldenAge': fx.sound('harp'); if (e.team) s.cheer(e.team); return;
    case 'eclipse': fx.sound('drone'); s.eclipse(20); return;
    case 'rain': fx.sound('rumble'); return;
    case 'volcano': {
      // eruption: blast at the top, lava bombs arcing onto the nearest buildings, a smoke column for a while
      const top = y + 1.6;
      fx.shake = Math.max(fx.shake, 0.9);
      fx.flash = Math.max(fx.flash, 0.5);
      fx.p.burst(x, top, z, 60, [0xff5a1f, 0xffc53d, 0x3a3430], 5, 13, 2.2, 0.32, 12);
      fx.sound('eruption');
      fx.temp(10, (k, dt, t) => {
        const f = 1 - k;
        fx.shake = Math.max(fx.shake, t < 3 ? 0.25 : 0.08 * f);
        for (let i = 0; i < dt * 14 * f; i++) fx.p.add({ x: x + rr(-0.8, 0.8), y: top, z: z + rr(-0.8, 0.8), vx: rr(-4, 4), vy: rr(8, 13), vz: rr(-4, 4), c: Math.random() < 0.6 ? 0xff5a1f : 0xffc53d, life: 2.2, s: rr(0.2, 0.4), g: 12 });
        for (let i = 0; i < dt * 12 * f; i++) fx.p.add({ x: x + rr(-0.8, 0.8), y: top + 1, z: z + rr(-0.8, 0.8), vx: 0.6 + rr(-0.5, 0.5), vy: rr(3, 5), vz: rr(-0.5, 0.5), c: Math.random() < 0.5 ? 0x3a3430 : 0x5a5450, life: rr(4, 6), s: rr(0.6, 1), grow: 2.5, floor: false, drag: 0.2 });
        fx.light.position.set(x, top + 2, z);
        fx.light.intensity = Math.max(fx.light.intensity, (2.5 + Math.sin(t * 7) * 0.8) * f);
      });
      (e.spots ?? []).forEach((b, i) => {
        const [bx, by, bz] = s.at(b.x, b.y), rock = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35, 0), new THREE.MeshBasicMaterial({ color: 0xff7b22 }));
        fx.temp(1.1, (k) => {
          rock.position.set(x + (bx - x) * k, top + (by - top) * k + Math.sin(k * Math.PI) * 7, z + (bz - z) * k);
          fx.p.smoke(rock.position.x, rock.position.y, rock.position.z, 0.3, 0x3a3430);
        }, rock, () => { fx.p.burst(bx, by + 0.3, bz, 18, [0xff5a1f, 0xffc53d], 2.5, 4, 0.8, 0.14, 10); fx.sound('boom'); }, 0.3 + i * 0.25);
      });
      return;
    }
    case 'rainOfGold':
      fx.sound('coins');
      s.cheer();
      fx.temp(7, (k, dt) => {
        const [lx, , lz] = s.look();
        for (let i = 0; i < dt * 140 * (1 - k * 0.6); i++) fx.p.add({ x: lx + rr(-18, 18), y: rr(14, 22), z: lz + rr(-18, 18), vy: -rr(4, 8), c: 0xffcf3a, life: 4, s: 0.2, g: 9, vs: 14 });
      });
      return;
    case 'baby': {
      const p = (e.unitId !== undefined && s.unit(e.unitId)) || [x, y, z], r = fx.ring(0xffc0d8, 0.9, p[0], p[1], p[2]);
      fx.p.burst(p[0], p[1] + 0.8, p[2], 24, [0xffc0d8, 0xffffff, 0xffe27a], 1.5, 3, 1.2, 0.08, 3);
      fx.temp(1.6, (k) => { r.scale.setScalar(1 + k); (r.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - k); }, r);
      fx.sound('chime');
      return;
    }
    case 'goldChest': {
      // a chest pops up in the village, the lid flies open and coins spill out
      const c = chest(), cx = x + 1.2, cz = z + 1.2, cy = Math.max(0.28, fx.ground(cx, cz));
      c.root.position.set(cx, cy, cz);
      c.root.rotation.y = rr(-0.5, 0.5);
      fx.p.burst(cx, cy + 0.5, cz, 14, [0xffffff, 0xffe27a], 2, 2.5, 0.8, 0.18, 3);
      fx.sound('chime');
      fx.temp(5, (_k, _dt, t) => {
        c.root.scale.setScalar(t < 0.5 ? Math.max(0.01, ease.back(t / 0.5)) : t > 4.5 ? Math.max(0.01, (5 - t) * 2) : 1);
        c.lid.rotation.x = -1.9 * ease.back(Math.min(1, Math.max(0, (t - 0.8) / 0.4)));
        if (t > 1 && t < 3 && Math.random() < 0.5) fx.p.add({ x: cx + rr(-0.2, 0.2), y: cy + 0.7, z: cz + rr(-0.2, 0.2), vx: rr(-1.5, 1.5), vy: rr(4, 6), vz: rr(-1.5, 1.5), c: 0xffcf3a, life: 1.5, s: 0.14, g: 12, vs: 10 });
      }, c.root);
      fx.later(1, () => fx.sound('coins'));
      return;
    }
  }
}
