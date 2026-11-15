import * as THREE from 'three';
import type { Team } from '@godseed/shared';
import type { BuildingType } from '../sim/types';

export const TEAM_COLOR: Record<Team, number> = { red: 0xe5484d, blue: 0x3e8ef7, yellow: 0xf5c518, green: 0x30a46c };
export const mat = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, ...extra });

function part(geo: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

/** Villager parts, each with its pivot at the origin so one matrix per instance poses it. Sizes for scale 1. */
export const VILLAGER = {
  body: new THREE.CylinderGeometry(0.2, 0.29, 0.62, 7).translate(0, 0.31, 0),
  head: new THREE.IcosahedronGeometry(0.25, 1),
  hair: new THREE.SphereGeometry(0.265, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2.3),
  arm: new THREE.BoxGeometry(0.13, 0.46, 0.13).translate(0, -0.23, 0),
  leg: new THREE.BoxGeometry(0.15, 0.55, 0.15).translate(0, -0.275, 0),
  crown: new THREE.CylinderGeometry(0.19, 0.21, 0.14, 6, 1, true),
};

/** Width (radius) and height per building, for the camera framing and the sight line. */
export const BUILDING_SIZE: Record<BuildingType, { r: number; h: number }> = {
  hut: { r: 0.6, h: 1.3 }, farm: { r: 0.6, h: 0.3 }, wall: { r: 0.5, h: 0.9 }, tower: { r: 0.5, h: 2.6 }, smithy: { r: 0.65, h: 1.5 }, temple: { r: 0.7, h: 1.9 }, bridge: { r: 0.6, h: 0.4 },
};

export function makeBuilding(type: BuildingType, team: Team): THREE.Group {
  const g = new THREE.Group(), tc = mat(TEAM_COLOR[team]), wall = mat(0xe9dcc0), stone = mat(0x9aa0aa), wood = mat(0x8a5a2b);
  switch (type) {
    case 'hut':
      part(new THREE.BoxGeometry(0.86, 0.6, 0.86), wall, g, 0, 0.3);
      part(new THREE.ConeGeometry(0.78, 0.7, 4).rotateY(Math.PI / 4), tc, g, 0, 0.95);
      part(new THREE.BoxGeometry(0.2, 0.34, 0.05), wood, g, 0, 0.17, 0.44);
      break;
    case 'farm':
      part(new THREE.BoxGeometry(0.96, 0.08, 0.96), mat(0x7a5634), g, 0, 0.04);
      for (let i = 0; i < 4; i++) part(new THREE.BoxGeometry(0.86, 0.22, 0.08), mat(0xe2c044), g, 0, 0.17, -0.33 + i * 0.22);
      break;
    case 'wall':
      part(new THREE.BoxGeometry(1, 0.8, 0.5), stone, g, 0, 0.4);
      for (const x of [-0.33, 0, 0.33]) part(new THREE.BoxGeometry(0.2, 0.18, 0.5), stone, g, x, 0.88);
      break;
    case 'tower':
      part(new THREE.CylinderGeometry(0.36, 0.45, 2, 8), stone, g, 0, 1);
      part(new THREE.CylinderGeometry(0.5, 0.42, 0.3, 8), stone, g, 0, 2.1);
      part(new THREE.ConeGeometry(0.5, 0.5, 8), tc, g, 0, 2.5);
      break;
    case 'smithy':
      part(new THREE.BoxGeometry(0.95, 0.7, 0.9), mat(0x6f6a64), g, 0, 0.35);
      part(new THREE.ConeGeometry(0.8, 0.5, 4).rotateY(Math.PI / 4), mat(0x3d3a38), g, 0, 0.95);
      part(new THREE.BoxGeometry(0.2, 0.9, 0.2), stone, g, 0.3, 1.1, -0.25);
      part(new THREE.BoxGeometry(0.3, 0.12, 0.3), tc, g, 0, 0.76, 0.5);
      break;
    case 'temple':
      part(new THREE.BoxGeometry(1, 0.16, 1), mat(0xf2efe6), g, 0, 0.08);
      for (const [x, z] of [[-0.36, -0.36], [0.36, -0.36], [-0.36, 0.36], [0.36, 0.36]]) part(new THREE.CylinderGeometry(0.07, 0.07, 1, 6), mat(0xf2efe6), g, x, 0.66, z);
      part(new THREE.ConeGeometry(0.78, 0.5, 4).rotateY(Math.PI / 4), mat(0xffcf3a, { metalness: 0.5, roughness: 0.4 }), g, 0, 1.41);
      part(new THREE.IcosahedronGeometry(0.16, 0), mat(TEAM_COLOR[team], { emissive: TEAM_COLOR[team], emissiveIntensity: 0.8 }), g, 0, 0.7);
      break;
    case 'bridge':
      part(new THREE.BoxGeometry(1.02, 0.1, 0.9), wood, g, 0, 0.3);
      for (const z of [-0.42, 0.42]) part(new THREE.BoxGeometry(1.02, 0.2, 0.06), wood, g, 0, 0.42, z);
      break;
  }
  return g;
}

/** Placeholder god beasts for R1; the full models from the sketchbook come in R2/R4. */
export function makeBeast(kind: 'dragon' | 'tornado' | 'titan'): { root: THREE.Group; animate(t: number): void; size: { rx: number; ry: number; lift: number } } {
  const root = new THREE.Group();
  if (kind === 'tornado') {
    const rings: THREE.Mesh[] = [];
    for (let i = 0; i < 10; i++) {
      const m = part(new THREE.TorusGeometry(0.4 + i * 0.3, 0.16 + i * 0.02, 5, 12).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x8d8a86, transparent: true, opacity: 0.6, flatShading: true, depthWrite: false }), root, 0, 0.4 + i * 0.8);
      m.castShadow = false;
      rings.push(m);
    }
    return { root, size: { rx: 3.4, ry: 4.4, lift: 4.2 }, animate: (t) => rings.forEach((r, i) => { r.rotation.y = t * (6 - i * 0.3); r.position.x = Math.sin(t * 3 + i * 0.5) * 0.12 * i; }) };
  }
  if (kind === 'titan') {
    const stone = mat(0x7d8577), legs: THREE.Mesh[] = [], arms: THREE.Mesh[] = [];
    part(new THREE.BoxGeometry(2.2, 2.6, 1.4), stone, root, 0, 4.3);
    part(new THREE.BoxGeometry(1.1, 1, 1), stone, root, 0, 6.2);
    part(new THREE.BoxGeometry(2.4, 0.3, 1.5), mat(0x5f7a4a), root, 0, 5.7);
    for (const x of [-0.25, 0.25]) part(new THREE.BoxGeometry(0.2, 0.14, 0.05), new THREE.MeshBasicMaterial({ color: 0x8ff6ff }), root, x, 6.3, 0.52).castShadow = false;
    for (const x of [-0.6, 0.6]) legs.push(part(new THREE.BoxGeometry(0.8, 3, 0.9).translate(0, -1.5, 0), stone, root, x, 3));
    for (const x of [-1.5, 1.5]) arms.push(part(new THREE.BoxGeometry(0.6, 2.8, 0.7).translate(0, -1.4, 0), stone, root, x, 5.4));
    return { root, size: { rx: 2, ry: 3.6, lift: 3.4 }, animate: (t) => { const s = Math.sin(t * 2.2) * 0.5; legs[0].rotation.x = s; legs[1].rotation.x = -s; arms[0].rotation.x = -s * 0.7; arms[1].rotation.x = s * 0.7; } };
  }
  const skin = mat(0x4a3570), wing = mat(0xe0703a, { side: THREE.DoubleSide }), wings: THREE.Mesh[] = [];
  part(new THREE.BoxGeometry(0.9, 0.8, 2.6), skin, root);
  part(new THREE.BoxGeometry(0.6, 0.55, 0.9), skin, root, 0, 0.5, 1.6);
  part(new THREE.ConeGeometry(0.3, 1.8, 5).rotateX(-Math.PI / 2), skin, root, 0, 0, -2.1);
  for (const s of [-1, 1]) wings.push(part(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0.9), new THREE.Vector3(0, 0, -0.9), new THREE.Vector3(s * 3.2, 0, -0.2)]), wing, root, s * 0.4, 0.3));
  wings.forEach((w) => w.geometry.computeVertexNormals());
  return { root, size: { rx: 3.4, ry: 1.6, lift: 6 }, animate: (t) => { const f = Math.sin(t * 5) * 0.6; wings[0].rotation.z = -f; wings[1].rotation.z = f; } };
}
