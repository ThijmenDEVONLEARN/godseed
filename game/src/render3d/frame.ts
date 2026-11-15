/**
 * Framing rule (bouwplan-3d §4): whatever an event is about must sit fully inside the safe part
 * of the screen, clear of the HUD, banner and feed. Pure maths, no three.js, so it is unit-tested.
 */
export type Vec3 = [number, number, number];
/** A thing that must stay in view: centre plus half width and half height in world units. */
export interface Subject { x: number; y: number; z: number; rx: number; ry: number }
export interface Shot { p: Vec3; l: Vec3 }
export interface Lens { fovDeg: number; aspect: number }

/** Safe frame in normalised screen coords (-1..1): narrower than the screen, and off-centre for the banner on top. */
export const SAFE = { x: 0.8, y0: -0.66, y1: 0.52 };

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: Vec3): Vec3 => { const n = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / n, a[1] / n, a[2] / n]; };
export const mix = (a: Vec3, b: Vec3, k: number): Vec3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
export const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** How far the worst subject sticks out: <= 1 fits, 1.2 = 20% outside the safe frame, 9 = behind the camera. */
export function fit(shot: Shot, subjects: Subject[], lens: Lens): number {
  const f = norm(sub(shot.l, shot.p));
  const r = norm(cross(f, [0, 1, 0]));
  const u = cross(r, f);
  const ty = Math.tan((lens.fovDeg * Math.PI) / 360), tx = ty * lens.aspect;
  let worst = 0;
  for (const s of subjects) {
    const v = sub([s.x, s.y, s.z], shot.p);
    const dz = dot(v, f);
    if (dz < 1) return 9;
    const nx = dot(v, r) / (dz * tx), ny = dot(v, u) / (dz * ty), mx = s.rx / (dz * tx), my = s.ry / (dz * ty);
    worst = Math.max(worst, (Math.abs(nx) + mx) / SAFE.x, (ny + my) / SAFE.y1, (my - ny) / -SAFE.y0);
  }
  return worst;
}

export function centre(subjects: Subject[]): Vec3 {
  const c: Vec3 = [0, 0, 0];
  for (const s of subjects) { c[0] += s.x / subjects.length; c[1] += s.y / subjects.length; c[2] += s.z / subjects.length; }
  return c;
}

/** Keeps the shot's direction, but aims at the subjects and backs off until they all fit. */
export function guard(shot: Shot, subjects: Subject[], lens: Lens): Shot {
  if (!subjects.length || fit(shot, subjects, lens) <= 1) return shot;
  const c = centre(subjects);
  let s = shot;
  for (let i = 0; i < 40 && fit(s, subjects, lens) > 1; i++) {
    const l = mix(s.l, c, 0.45);
    s = { l, p: [l[0] + (s.p[0] - s.l[0]) * 1.13, l[1] + (s.p[1] - s.l[1]) * 1.13, l[2] + (s.p[2] - s.l[2]) * 1.13] };
  }
  return s;
}

/**
 * Looks over whatever blocks the view (hills, trees, roofs): steeper from the same distance, never further away.
 * `top(x, z)` is the height of the highest thing at that spot.
 */
export function clearSight(shot: Shot, top: (x: number, z: number) => number, maxRaise = 25): Shot {
  const { p, l } = shot;
  const flat = Math.hypot(p[0] - l[0], p[2] - l[2]), n = Math.min(40, Math.max(10, Math.round(flat / 1.2)));
  let need = p[1];
  for (let i = 1; i <= n; i++) {
    const k = i / n;
    if (k * flat <= 2.2) continue; // right next to the subject: that is the subject itself
    const h = top(l[0] + (p[0] - l[0]) * k, l[2] + (p[2] - l[2]) * k) + 0.6;
    if (h > l[1] + (need - l[1]) * k) need = Math.max(need, l[1] + (h + 0.3 - l[1]) / k);
  }
  if (need <= p[1] + 0.05) return shot;
  const y = Math.min(need, p[1] + maxRaise), q = dist(p, l) / Math.hypot(p[0] - l[0], y - l[1], p[2] - l[2]);
  return { l, p: [l[0] + (p[0] - l[0]) * q, l[1] + (y - l[1]) * q, l[2] + (p[2] - l[2]) * q] };
}

/** Guard and sight line influence each other, so run them in turns; the guard has the last word. */
export function frame(shot: Shot, subjects: Subject[], lens: Lens, top: (x: number, z: number) => number): Shot {
  let s = guard(shot, subjects, lens);
  s = guard(clearSight(s, top), subjects, lens);
  return guard(clearSight(s, top), subjects, lens);
}
