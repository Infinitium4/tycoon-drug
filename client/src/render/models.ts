// Modèles procéduraux au style Kenney (formes arrondies, couleurs douces) + modèles GLB.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { model } from './assets';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ---------- helpers ----------
const matCache = new Map<string, THREE.MeshStandardMaterial>();
export function mat(color: string | number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  const key = String(color) + JSON.stringify(opts);
  let m = matCache.get(key);
  if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...opts }); matCache.set(key, m); }
  return m;
}
const geoCache = new Map<string, THREE.BufferGeometry>();
function rgeo(w: number, h: number, d: number, r: number) {
  const k = `${w}|${h}|${d}|${r}`;
  let g = geoCache.get(k);
  if (!g) { g = new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2)); geoCache.set(k, g); }
  return g;
}
/** Boîte arrondie posée au sol (y = base). */
export function box(w: number, h: number, d: number, color: string | number, y = 0, r = 0.08) {
  const m = new THREE.Mesh(r > 0 ? rgeo(w, h, d, r) : new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.y = y + h / 2; m.castShadow = true; m.receiveShadow = true;
  return m;
}
/** Boîte arrondie centrée. */
function cbox(w: number, h: number, d: number, color: string | number, r = 0.06) {
  const m = new THREE.Mesh(rgeo(w, h, d, r), mat(color)); m.castShadow = true; m.receiveShadow = true; return m;
}
function cyl(rt: number, rb: number, h: number, color: string | number, seg = 12) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(color)); m.castShadow = true; m.receiveShadow = true; return m;
}
function at<T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T { o.position.set(x, y, z); return o; }

/** Bâtiment façon Kenney : murs arrondis, toit plat clair avec rebord, fenêtres encadrées. */
export function kBuilding(w: number, h: number, d: number, wall: string, opts: { roof?: string; windows?: number; door?: boolean; band?: string } = {}) {
  const g = new THREE.Group();
  g.add(box(w, h, d, wall, 0, 0.18));
  const roof = opts.roof ?? '#d7d9e0';
  g.add(box(w + 0.25, 0.22, d + 0.25, roof, h - 0.05, 0.1));
  const inner = box(w - 0.5, 0.1, d - 0.5, '#bfc2cc', h + 0.12, 0.05); g.add(inner);
  if (opts.band) g.add(box(w + 0.04, 0.35, d + 0.04, opts.band, h - 0.75, 0.04));
  const nWin = opts.windows ?? Math.max(1, Math.floor(w / 1.6));
  const floors = Math.max(1, Math.floor((h - 0.6) / 1.4));
  for (let f = 0; f < floors; f++) for (let i = 0; i < nWin; i++) {
    const x = -w / 2 + (w / nWin) * (i + 0.5);
    if (opts.door !== false && f === 0 && i === Math.floor(nWin / 2)) continue;
    const frame = at(cbox(0.75, 0.75, 0.08, '#f8fafc', 0.03), x, 0.9 + f * 1.4, d / 2 + 0.02);
    const glass = at(new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.05), mat('#7dd3fc', { roughness: 0.2, metalness: 0.1 })), x, 0.9 + f * 1.4, d / 2 + 0.05);
    g.add(frame, glass);
  }
  if (opts.door !== false) {
    g.add(at(cbox(0.9, 1.35, 0.1, '#475569', 0.04), 0, 0.68, d / 2 + 0.03));
    g.add(at(cbox(1.2, 0.08, 0.45, '#cbd5e1', 0.03), 0, 1.45, d / 2 + 0.2));
  }
  return g;
}

// ---------- marquages au sol ----------
export function paint(x0: number, z0: number, x1: number, z1: number, color = '#facc15', w = 0.14) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.02, w), mat(color));
  m.position.set((x0 + x1) / 2, 0.235, (z0 + z1) / 2);
  m.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
  m.receiveShadow = true;
  return m;
}
export function paintRect(x0: number, z0: number, x1: number, z1: number, color = '#facc15', w = 0.14) {
  const g = new THREE.Group();
  g.add(paint(x0, z0, x1, z0, color, w), paint(x1, z0, x1, z1, color, w), paint(x1, z1, x0, z1, color, w), paint(x0, z1, x0, z0, color, w));
  return g;
}

// ---------- personnages (style blocs Kenney) ----------
export type Role = 'harvester' | 'packer' | 'chemist' | 'guard' | 'rival' | 'cop';
const ROLE: Record<Role, { top: string; legs: string; hat?: string; mask?: string; skin?: string }> = {
  harvester: { top: '#22c55e', legs: '#334155', hat: '#eab308' },
  packer:    { top: '#f97316', legs: '#1e293b', hat: '#1f2937' },
  chemist:   { top: '#f8fafc', legs: '#e2e8f0', mask: '#1f2937' },
  guard:     { top: '#27272a', legs: '#3f3f46', mask: '#18181b' },
  rival:     { top: '#b91c1c', legs: '#1f2937', hat: '#dc2626' },
  cop:       { top: '#1e3a8a', legs: '#172554', hat: '#0f172a' },
};
export function character(role: Role) {
  const c = ROLE[role];
  const g = new THREE.Group();
  const skin = '#e8b48a';
  const hips = new THREE.Group(); hips.position.y = 0.62; g.add(hips);
  const legL = new THREE.Group(); legL.position.set(-0.13, 0, 0); hips.add(legL);
  const legR = new THREE.Group(); legR.position.set(0.13, 0, 0); hips.add(legR);
  legL.add(at(cbox(0.2, 0.55, 0.22, c.legs), 0, -0.3, 0)); legL.add(at(cbox(0.22, 0.12, 0.3, '#18181b'), 0, -0.56, 0.04));
  legR.add(at(cbox(0.2, 0.55, 0.22, c.legs), 0, -0.3, 0)); legR.add(at(cbox(0.22, 0.12, 0.3, '#18181b'), 0, -0.56, 0.04));
  const torso = new THREE.Group(); torso.position.y = 0.62; g.add(torso);
  torso.add(at(cbox(0.52, 0.58, 0.32, c.top, 0.1), 0, 0.3, 0));
  if (role === 'guard') torso.add(at(cbox(0.56, 0.4, 0.36, '#4d5d3a', 0.08), 0, 0.33, 0));   // gilet tactique
  if (role === 'chemist') torso.add(at(cbox(0.3, 0.3, 0.05, '#facc15', 0.02), 0, 0.35, 0.17)); // logo danger
  if (role === 'cop') { torso.add(at(cbox(0.54, 0.08, 0.34, '#111827', 0.02), 0, 0.05, 0)); torso.add(at(cbox(0.12, 0.12, 0.04, '#facc15', 0.02), -0.13, 0.42, 0.17)); }
  const head = new THREE.Group(); head.position.y = 0.66; torso.add(head);
  head.add(at(cbox(0.4, 0.4, 0.38, c.mask && role === 'guard' ? c.mask : skin, 0.1), 0, 0.2, 0));
  if (role === 'guard') head.add(at(cbox(0.3, 0.08, 0.05, skin, 0.02), 0, 0.24, 0.19));          // cagoule : fente des yeux
  head.add(at(cbox(0.06, 0.06, 0.03, '#111827', 0.01), -0.08, 0.24, 0.205));
  head.add(at(cbox(0.06, 0.06, 0.03, '#111827', 0.01), 0.08, 0.24, 0.205));
  if (role === 'chemist') { head.add(at(cbox(0.3, 0.16, 0.12, c.mask!, 0.05), 0, 0.12, 0.2)); head.add(at(cbox(0.42, 0.42, 0.4, '#e2e8f0', 0.12), 0, 0.22, -0.03)); }
  if (c.hat) {
    head.add(at(cbox(0.44, 0.12, 0.42, c.hat, 0.05), 0, 0.42, 0));
    if (role !== 'rival') head.add(at(cbox(0.36, 0.05, 0.22, c.hat, 0.02), 0, 0.38, 0.26));
  }
  const armL = new THREE.Group(); armL.position.set(-0.33, 0.55, 0); torso.add(armL);
  const armR = new THREE.Group(); armR.position.set(0.33, 0.55, 0); torso.add(armR);
  armL.add(at(cbox(0.15, 0.48, 0.17, c.top), 0, -0.22, 0)); armL.add(at(cbox(0.14, 0.12, 0.14, role === 'chemist' ? '#facc15' : skin), 0, -0.5, 0));
  armR.add(at(cbox(0.15, 0.48, 0.17, c.top), 0, -0.22, 0)); armR.add(at(cbox(0.14, 0.12, 0.14, role === 'chemist' ? '#facc15' : skin), 0, -0.5, 0));
  let gun: THREE.Object3D | null = null, flash: THREE.Mesh | null = null;
  if (role === 'guard' || role === 'rival') {
    gun = new THREE.Group();
    gun.add(at(cbox(0.1, 0.14, 0.75, '#1f2937', 0.03), 0, 0, 0.2));
    gun.add(at(cbox(0.08, 0.2, 0.1, '#1f2937', 0.02), 0, -0.13, 0.05));
    gun.add(at(cbox(0.06, 0.06, 0.3, '#52525b', 0.02), 0, 0.03, 0.6));
    flash = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), new THREE.MeshBasicMaterial({ color: '#fde047' }));
    flash.position.set(0, 0.03, 0.85); flash.visible = false; gun.add(flash);
    gun.position.set(0.12, 0.42, 0.22); torso.add(gun);
  }
  const crate = at(cbox(0.48, 0.36, 0.4, '#b07a45', 0.05), 0, 0.3, 0.42); crate.visible = false; torso.add(crate);
  g.scale.setScalar(1.05);
  g.userData = { legL, legR, armL, armR, torso, crate, gun, flash, role };
  return g;
}
/** Anime un perso : marche, travail, port de caisse, tir. */
export function animateCharacter(g: THREE.Group, t: number, moving: boolean, working: boolean, carrying: boolean, firing = false) {
  const u = g.userData;
  const sw = moving ? Math.sin(t * 11) : 0;
  u.legL.rotation.x = sw * 0.7; u.legR.rotation.x = -sw * 0.7;
  u.torso.position.y = 0.62 + (moving ? Math.abs(Math.sin(t * 11)) * 0.05 : 0);
  u.crate.visible = carrying;
  if (u.gun) {
    // arme tenue à deux mains
    u.armR.rotation.x = -1.2; u.armL.rotation.x = -1.1; u.armL.rotation.z = -0.4;
    u.flash.visible = firing && Math.sin(t * 60) > 0;
    u.gun.position.z = 0.22 + (firing ? Math.sin(t * 60) * 0.03 : 0);
  } else if (carrying) {
    u.armL.rotation.x = u.armR.rotation.x = -1.3;
  } else if (working) {
    const k = Math.sin(t * 9);
    u.armL.rotation.x = -0.9 + k * 0.5; u.armR.rotation.x = -0.9 - k * 0.5;
    u.torso.rotation.x = 0.15;
  } else {
    u.armL.rotation.x = -sw * 0.7; u.armR.rotation.x = sw * 0.7; u.torso.rotation.x = 0;
  }
  if (!working) u.torso.rotation.x = 0;
}

// ---------- végétation ----------
/** Plant de cannabis : feuilles en éventail ; `leaves` mis à l'échelle selon la pousse. */
let plantGeo: [THREE.BufferGeometry, THREE.BufferGeometry] | null = null;
function plantGeometry() {
  if (plantGeo) return plantGeo;
  const leafGeo = new THREE.SphereGeometry(0.1, 6, 4); leafGeo.scale(0.6, 2.6, 0.25);
  const a: THREE.BufferGeometry[] = [], b: THREE.BufferGeometry[] = [];
  const tmp = new THREE.Object3D();
  for (let tier = 0; tier < 3; tier++) {
    const y = 0.25 + tier * 0.28, sc = 1 - tier * 0.22;
    for (let i = 0; i < 7; i++) {
      const ang = (i / 7) * Math.PI * 2 + tier * 0.4;
      tmp.position.set(Math.cos(ang) * 0.2 * sc, y, Math.sin(ang) * 0.2 * sc);
      tmp.rotation.set(0, -ang, 0); tmp.rotateZ(1.0); tmp.scale.setScalar(sc); tmp.updateMatrix();
      (i % 2 ? a : b).push(leafGeo.clone().applyMatrix4(tmp.matrix));
    }
  }
  const stem = new THREE.CylinderGeometry(0.03, 0.04, 1, 5); stem.translate(0, 0.5, 0);
  a.push(stem.toNonIndexed().toNonIndexed());
  const fix = (l: THREE.BufferGeometry[]) => mergeGeometries(l.map(g => (g.index ? g.toNonIndexed() : g)), false)!;
  plantGeo = [fix(a), fix(b)];
  return plantGeo;
}
/** Plant de cannabis : feuilles en éventail ; `leaves` mis à l'échelle selon la pousse. */
export function plant() {
  const g = new THREE.Group();
  const [ga, gb] = plantGeometry();
  const leaves = new THREE.Group();
  const m1 = new THREE.Mesh(ga, mat('#3f9b3a')), m2 = new THREE.Mesh(gb, mat('#4fb34a'));
  m1.castShadow = m2.castShadow = true;
  leaves.add(m1, m2); g.add(leaves);
  const bud = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 0), mat('#a3e635', { emissive: '#65a30d', emissiveIntensity: 0.4 }));
  bud.position.y = 1.15; g.add(bud);
  g.userData = { leaves, ripe: bud };
  return g;
}
export function tree() {
  const g = model('tree', 2.2 + Math.random() * 0.8);
  g.rotation.y = Math.random() * Math.PI * 2;
  return g;
}
export function bush() {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42 + i * 0.05, 1), mat('#4f9e45')); b.position.set((i - 1) * 0.45, 0.38, (i % 2) * 0.2); b.castShadow = true; g.add(b); }
  return g;
}

// ---------- installations de la base ----------
export function bed(len: number) {
  const g = new THREE.Group();
  g.add(box(len, 0.4, 1.35, '#a0693a', 0, 0.08));
  g.add(box(len - 0.25, 0.06, 1.1, '#5b3a1e', 0.36, 0.03));
  const pipe = cyl(0.04, 0.04, len, '#334155', 6); pipe.rotation.z = Math.PI / 2; pipe.position.set(0, 0.48, -0.52); g.add(pipe);
  return g;
}
export function waterTank() {
  const g = new THREE.Group();
  g.add(at(cyl(0.9, 0.9, 2, '#60a5fa', 16), 0, 1.3, 0));
  g.add(at(cyl(0.95, 0.95, 0.15, '#2563eb', 16), 0, 2.35, 0));
  for (const [x, z] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) g.add(at(box(0.14, 0.3, 0.14, '#475569'), x, 0, z));
  return g;
}
export function barrel(color = '#2563eb') {
  const g = new THREE.Group();
  g.add(at(cyl(0.35, 0.35, 0.95, color, 14), 0, 0.48, 0));
  g.add(at(cyl(0.37, 0.37, 0.06, '#1f2937', 14), 0, 0.25, 0));
  g.add(at(cyl(0.37, 0.37, 0.06, '#1f2937', 14), 0, 0.7, 0));
  return g;
}
export function lamp() {
  const g = new THREE.Group();
  g.add(at(cyl(0.07, 0.1, 3.2, '#475569', 8), 0, 1.6, 0));
  g.add(at(box(0.8, 0.08, 0.1, '#475569'), 0.35, 3.1, 0));
  g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.3), mat('#fef9c3', { emissive: '#fde047', emissiveIntensity: 0.9 })), 0.65, 3.05, 0));
  return g;
}
export function booth() {
  const g = kBuilding(1.7, 2.1, 1.7, '#f1f5f9', { windows: 1, door: false });
  return g;
}
export function barrier() {
  const g = new THREE.Group();
  g.add(box(0.4, 1, 0.4, '#facc15'));
  for (let i = 0; i < 6; i++) g.add(at(cbox(0.6, 0.12, 0.12, i % 2 ? '#ef4444' : '#f8fafc', 0.03), 0.5 + i * 0.6, 0.9, 0));
  return g;
}
export function table() {
  const g = new THREE.Group();
  g.add(box(2.4, 0.12, 1.2, '#e2e8f0', 0.8, 0.04));
  for (const [x, z] of [[-1.05, -0.5], [1.05, -0.5], [-1.05, 0.5], [1.05, 0.5]]) g.add(at(box(0.1, 0.8, 0.1, '#64748b', 0, 0.02), x, 0, z));
  g.add(at(box(0.4, 0.1, 0.3, '#334155'), -0.6, 0.92, 0));
  for (let i = 0; i < 3; i++) g.add(at(box(0.22, 0.12, 0.22, '#65a30d', 0, 0.03), 0.2 + i * 0.3, 0.92, 0.1));
  return g;
}
export function shed(w: number, d: number) {
  const g = new THREE.Group();
  g.add(at(box(w, 2.6, 0.3, '#fb923c', 0, 0.1), 0, 0, -d / 2));
  const roof = box(w + 0.4, 0.18, 1.3, '#c2410c', 2.65, 0.06); roof.position.z = -d / 2 + 0.55; g.add(roof);
  for (const x of [-w / 2 + 0.15, w / 2 - 0.15]) g.add(at(box(0.18, 2.7, 0.18, '#57534e'), x, 0, -d / 2 + 1.1));
  return g;
}
export function conveyor(len: number) {
  const g = new THREE.Group();
  g.add(box(len, 0.12, 0.8, '#1f2937', 0.7, 0.04));
  g.add(box(len, 0.08, 0.95, '#94a3b8', 0.62, 0.03));
  const n = Math.max(1, Math.floor(len));
  for (let i = 0; i <= n; i++) g.add(at(box(0.1, 0.65, 0.1, '#64748b', 0, 0.02), -len / 2 + i * (len / n), 0, 0));
  const boxes: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) { const b = box(0.35, 0.28, 0.35, '#b07a45', 0.82, 0.04); g.add(b); boxes.push(b); }
  g.userData = { boxes, len };
  return g;
}
export function pile(color: string, max = 16) {
  const g = new THREE.Group();
  const items: THREE.Mesh[] = [];
  for (let i = 0; i < max; i++) {
    const m = cbox(0.42, 0.32, 0.42, color, 0.05);
    const layer = Math.floor(i / 4), k = i % 4;
    m.position.set((k % 2) * 0.46 - 0.23, 0.28 + layer * 0.33, Math.floor(k / 2) * 0.46 - 0.23);
    m.rotation.y = (Math.random() - 0.5) * 0.25;
    m.visible = false; items.push(m); g.add(m);
  }
  g.add(box(1.05, 0.12, 1.05, '#a07a4f', 0, 0.02));
  g.position.y = 0.2;
  g.userData = { items };
  return g;
}
export function setPile(p: THREE.Group, n: number) {
  const items = p.userData.items as THREE.Mesh[];
  const shown = Math.min(items.length, Math.ceil(n));
  items.forEach((m, i) => (m.visible = i < shown));
}

// ---------- bâtiments de la base ----------
export function dryer() {
  const g = new THREE.Group();
  g.add(kBuilding(4.2, 2.6, 3, '#d9a066', { roof: '#9a3412', windows: 2 }));
  g.add(at(box(0.55, 1.6, 0.55, '#78716c', 0, 0.06), 1.3, 2.7, -0.7));
  const winMat = mat('#fde68a', { emissive: '#f59e0b', emissiveIntensity: 0 });
  for (const x of [-1.25, 1.25]) g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.56, 0.06), winMat), x, 0.9, 1.56));
  g.userData = { winMat, chimneyTop: new THREE.Vector3(1.3, 4.4, -0.7) };
  return g;
}
export function office() {
  const g = model('bA', 3.2);
  return g;
}
export function garage() {
  const g = model('bGarage', 4.6);
  return g;
}
/** QG de la milice : bunker kaki, sacs de sable, drapeau, tour de guet. */
export function miliceHQ() {
  const g = new THREE.Group();
  g.add(kBuilding(3.6, 2.2, 2.6, '#6b7a4b', { roof: '#4d5d3a', windows: 2 }));
  for (let i = 0; i < 6; i++) g.add(at(cbox(0.7, 0.35, 0.4, '#c8b48a', 0.12), -1.75 + i * 0.7, 0.2, 1.75));
  for (let i = 0; i < 5; i++) g.add(at(cbox(0.7, 0.35, 0.4, '#bfa97e', 0.12), -1.4 + i * 0.7, 0.53, 1.75));
  g.add(at(cyl(0.05, 0.05, 2.4, '#334155', 6), 1.6, 3.3, -1));
  const flag = at(box(0.9, 0.55, 0.04, '#111827', 0, 0.01), 2.05, 3.85, -1); g.add(flag);
  g.add(at(box(0.5, 0.2, 0.05, '#dc2626', 0, 0.01), 2.05, 4.0, -0.97));
  return g;
}
/** Labo / parapharmacie : bâtiment moderne. */
export function lab(color: string, kind: 'labo' | 'pharma') {
  const g = new THREE.Group();
  g.add(kBuilding(7, 3, 4.2, kind === 'pharma' ? '#f8fafc' : '#e2e8f0', { band: color, windows: 4 }));
  if (kind === 'pharma') {
    const cross = new THREE.Group();
    cross.add(cbox(0.9, 0.3, 0.1, '#22c55e', 0.04)); cross.add(cbox(0.3, 0.9, 0.1, '#22c55e', 0.04));
    cross.position.set(2.6, 2.4, 2.18); g.add(cross);
    for (let i = 0; i < 3; i++) g.add(at(box(1.6, 0.8, 0.5, '#f1f5f9', 0, 0.05), -2.3 + i * 0.1, 3.2, -1 + i * 0.6));
  } else {
    for (let i = 0; i < 3; i++) g.add(at(cyl(0.3, 0.3, 0.6, '#94a3b8', 10), -2 + i * 2, 3.3, -0.8));
    for (let i = 0; i < 2; i++) { g.add(at(cyl(0.6, 0.6, 2.4, '#cbd5e1', 16), 4.2, 1.2, -1 + i * 1.5)); g.add(at(cyl(0.62, 0.62, 0.15, color, 16), 4.2, 1.9, -1 + i * 1.5)); }
  }
  g.userData = { winMat: mat('#bae6fd', { emissive: color, emissiveIntensity: 0.4 }) };
  return g;
}
export function bench(color: string) {
  const g = new THREE.Group();
  g.add(box(1.5, 0.9, 0.8, '#e2e8f0', 0, 0.05));
  g.add(box(1.6, 0.08, 0.9, '#475569', 0.9, 0.02));
  const flask = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.35, 10), mat(color, { emissive: color, emissiveIntensity: 0.6, transparent: true, opacity: 0.9 }));
  flask.position.set(-0.35, 1.15, 0); g.add(flask);
  g.add(at(box(0.5, 0.06, 0.4, '#f8fafc', 0, 0.02), 0.3, 0.97, 0));
  return g;
}
export function plot(w: number, d: number) {
  const g = new THREE.Group();
  g.add(box(w, 0.06, d, '#c7b89a', 0.2, 0));
  for (let i = 0; i < 6; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.5, 10), mat(i % 2 ? '#f97316' : '#f8fafc')); c.position.set(-w / 2 + 0.4 + (i * (w - 0.8)) / 5, 0.5, d / 2 - 0.3); c.castShadow = true; g.add(c); }
  g.add(at(box(0.1, 1.6, 0.1, '#57534e'), 0, 0, 0));
  g.add(at(box(1.8, 1, 0.1, '#facc15', 1.3, 0.04), 0, 0, 0));
  return g;
}
export function forklift() {
  const g = new THREE.Group();
  g.add(box(0.9, 0.5, 1.3, '#f59e0b', 0.2, 0.1));
  g.add(at(box(0.5, 0.3, 0.4, '#1f2937'), 0, 0.7, -0.2));
  g.add(at(box(0.8, 0.06, 0.9, '#1f2937', 0, 0.02), 0, 1.6, -0.1));
  for (const x of [-0.35, 0.35]) for (const z of [-0.5, 0.3]) g.add(at(box(0.05, 0.9, 0.05, '#1f2937', 0, 0.01), x, 0.7, z));
  g.add(at(box(0.7, 1.6, 0.08, '#374151', 0, 0.02), 0, 0, 0.72));
  for (const x of [-0.22, 0.22]) g.add(at(box(0.08, 0.05, 0.8, '#9ca3af', 0, 0.01), x, 0.22, 1.15));
  for (const [x, z] of [[-0.45, -0.4], [0.45, -0.4], [-0.45, 0.45], [0.45, 0.45]]) { const w = cyl(0.2, 0.2, 0.15, '#111827', 10); w.rotation.z = Math.PI / 2; w.position.set(x, 0.2, z); g.add(w); }
  g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), mat('#e8b48a')), 0, 1.25, -0.2));
  const crate = at(box(0.7, 0.55, 0.7, '#b07a45', 0, 0.05), 0, 0.3, 1.15); crate.visible = false; g.add(crate);
  g.userData = { crate };
  return g;
}

// ---------- véhicules ----------
const TRUCKS = ['truckRed', 'truckYellow', 'truckGreen', 'truckPurple'] as const;
export function pickup(i: number) {
  const g = model(TRUCKS[i % TRUCKS.length], 1.25);
  const cargo = new THREE.Group();
  for (let k = 0; k < 4; k++) cargo.add(at(cbox(0.42, 0.34, 0.42, '#b07a45', 0.05), (k % 2 - 0.5) * 0.5, 1.05, -0.9 - Math.floor(k / 2) * 0.5));
  cargo.visible = false; g.add(cargo);
  g.userData = { cargo };
  return g;
}
export function policeCar() {
  const g = new THREE.Group();
  g.add(box(1.4, 0.6, 2.8, '#f8fafc', 0.25, 0.22));
  g.add(box(1.42, 0.22, 2.82, '#1e3a8a', 0.45, 0.08));
  g.add(at(box(1.2, 0.55, 1.4, '#f8fafc', 0, 0.2), 0, 0.82, -0.15));
  g.add(at(box(1.22, 0.36, 1.2, '#1e293b', 0, 0.12), 0, 0.92, -0.15));
  const red = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.28), new THREE.MeshStandardMaterial({ color: '#ef4444', emissive: '#ef4444', emissiveIntensity: 1 }));
  const blue = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.28), new THREE.MeshStandardMaterial({ color: '#3b82f6', emissive: '#3b82f6', emissiveIntensity: 1 }));
  red.position.set(-0.22, 1.47, -0.15); blue.position.set(0.22, 1.47, -0.15); g.add(red, blue);
  for (const [x, z] of [[-0.68, -0.9], [0.68, -0.9], [-0.68, 0.9], [0.68, 0.9]]) { const w = cyl(0.3, 0.3, 0.22, '#111827', 14); w.rotation.z = Math.PI / 2; w.position.set(x, 0.3, z); g.add(w); }
  g.userData = { red, blue };
  return g;
}

// ---------- ville ----------
const POOR = ['bB', 'bC', 'bD'] as const, MID = ['bA', 'bB', 'bD', 'bGarage'] as const;
/** Contenu d'un quartier (≈18x18) selon sa richesse. */
export function districtBlock(tier: number, rnd: () => number) {
  const g = new THREE.Group();
  const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];
  if (tier === 0 || tier === 1) {
    const list = tier === 0 ? POOR : MID;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      if (r === 1 && c === 1) { if (tier === 1) { const f = model('fountain', 4.5); f.position.set(0, 0, 0); g.add(f); } continue; }
      const k = pick(list);
      const b = model(k, tier === 0 ? 4.6 : 4.8);
      b.position.set(-6 + c * 6, 0, -6 + r * 6);
      b.rotation.y = r === 2 ? 0 : r === 0 ? Math.PI : c === 0 ? -Math.PI / 2 : Math.PI / 2;
      if (tier === 0) b.scale.y = 1.6 + rnd() * 0.8;   // barres d'immeubles
      g.add(b);
    }
  } else if (tier === 2) {
    const glass = ['#7aa7c7', '#5f8fb0', '#94b8d0', '#4c7a9c'];
    for (let i = 0; i < 4; i++) {
      const h = 10 + rnd() * 12, tower = new THREE.Group();
      tower.add(box(4.6, h, 4.6, glass[i], 0, 0.3));
      for (let f = 1; f < h / 1.6; f++) tower.add(at(new THREE.Mesh(new THREE.BoxGeometry(4.7, 0.12, 4.7), mat('#e2e8f0')), 0, f * 1.6, 0));
      tower.add(box(4.9, 0.4, 4.9, '#e2e8f0', h, 0.12));
      tower.position.set(-4.5 + (i % 2) * 9, 0, -4.5 + Math.floor(i / 2) * 9); g.add(tower);
    }
  } else {
    for (let i = 0; i < 4; i++) {
      const v = new THREE.Group();
      v.add(kBuilding(4.2, 2.2, 3, '#fafaf9', { roof: '#a8a29e', windows: 3 }));
      v.add(at(box(2.6, 0.08, 1.6, '#38bdf8', 0, 0.04), 0, 0.02, 3));
      v.add(at(box(5, 0.7, 0.4, '#3f8f3a', 0, 0.15), 0, 0, 4.3));
      v.position.set(-4.5 + (i % 2) * 9, 0, -5 + Math.floor(i / 2) * 8); g.add(v);
    }
    for (let k = 0; k < 6; k++) { const t = tree(); t.position.set(-8 + rnd() * 16, 0, -8 + rnd() * 16); g.add(t); }
  }
  return g;
}

/** Voiture banalisée de la BAC : gris foncé, gyrophare bleu derrière le pare-brise. */
export function bacCar() {
  const g = new THREE.Group();
  g.add(box(1.35, 0.55, 2.7, '#3f4651', 0.25, 0.22));
  g.add(at(box(1.2, 0.5, 1.4, '#3f4651', 0, 0.2), 0, 0.78, -0.1));
  g.add(at(box(1.22, 0.34, 1.2, '#111827', 0, 0.12), 0, 0.86, -0.1));
  const blue = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.1, 0.15), new THREE.MeshStandardMaterial({ color: '#3b82f6', emissive: '#3b82f6', emissiveIntensity: 1 }));
  blue.position.set(0, 1.1, 0.45); g.add(blue);
  for (const [x, z] of [[-0.66, -0.9], [0.66, -0.9], [-0.66, 0.9], [0.66, 0.9]]) { const w = cyl(0.3, 0.3, 0.22, '#111827', 14); w.rotation.z = Math.PI / 2; w.position.set(x, 0.3, z); g.add(w); }
  g.userData = { blue };
  return g;
}
