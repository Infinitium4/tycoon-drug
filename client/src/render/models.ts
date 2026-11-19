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
  if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...opts }); weather(m); matCache.set(key, m); }
  return m;
}
/** Usure réaliste sur un matériau : variations de teinte (bruit en coordonnées monde), salissures en bas des murs,
 *  rugosité irrégulière. Rend les aplats de couleur moins « plastique ». */
export function weather(m: THREE.Material, strength = 1) {
  const sm = m as THREE.MeshStandardMaterial;
  if (!sm.isMeshStandardMaterial || sm.userData.weathered) return m;
  sm.userData.weathered = true;
  sm.onBeforeCompile = sh => {
    sh.uniforms.uWeather = { value: strength };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos; varying vec3 vWNrm;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vec4 wp4 = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wp4 = instanceMatrix * wp4;
        #endif
        wp4 = modelMatrix * wp4; vWPos = wp4.xyz; vWNrm = normalize(mat3(modelMatrix) * objectNormal);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWPos; varying vec3 vWNrm; uniform float uWeather;
        float wHash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float wNoise(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(wHash(i), wHash(i + vec3(1,0,0)), f.x), mix(wHash(i + vec3(0,1,0)), wHash(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(wHash(i + vec3(0,0,1)), wHash(i + vec3(1,0,1)), f.x), mix(wHash(i + vec3(0,1,1)), wHash(i + vec3(1,1,1)), f.x), f.y), f.z); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float wn = wNoise(vWPos * 1.7) * 0.6 + wNoise(vWPos * 6.0) * 0.4;
        float wl = wNoise(vWPos * 0.08);
        float up = clamp(vWNrm.y, 0.0, 1.0);
        float grime = (1.0 - up) * (1.0 - smoothstep(0.25, 1.4, vWPos.y));
        diffuseColor.rgb *= 1.0 + uWeather * ((wn - 0.5) * 0.16 + (wl - 0.5) * 0.12 - grime * 0.22);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor * (0.85 + wn * 0.3), 0.04, 1.0);`);
  };
  sm.customProgramCacheKey = () => 'weather' + strength;
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
/** Décale un objet (s'ajoute à sa position : une boîte posée au sol garde sa hauteur). */
function at<T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T { o.position.x += x; o.position.y += y; o.position.z += z; return o; }
/** Place un objet en (x, z) sans toucher à sa hauteur. */
export function at2<T extends THREE.Object3D>(o: T, x: number, z: number): T { o.position.x += x; o.position.z += z; return o; }

/** Vitres partagées : s'allument la nuit. */
export const windowMat = () => mat('#7dd3fc', { roughness: 0.2, metalness: 0.1, emissive: '#fbbf24', emissiveIntensity: 0 });
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
    const glass = at(new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.05), windowMat()), x, 0.9 + f * 1.4, d / 2 + 0.05);
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
export type Role = 'harvester' | 'packer' | 'chemist' | 'guard' | 'rival' | 'cop' | 'civil' | 'gign' | 'bac' | 'press' | 'medic' | 'pompier' | 'forensic';
const ROLE: Record<Role, { top: string; legs: string; hat?: string; mask?: string; skin?: string }> = {
  harvester: { top: '#22c55e', legs: '#334155', hat: '#eab308' },
  packer:    { top: '#f97316', legs: '#1e293b', hat: '#1f2937' },
  chemist:   { top: '#f8fafc', legs: '#e2e8f0', mask: '#1f2937' },
  guard:     { top: '#27272a', legs: '#3f3f46', mask: '#18181b' },
  rival:     { top: '#b91c1c', legs: '#1f2937', hat: '#dc2626' },
  cop:       { top: '#1e3a8a', legs: '#172554', hat: '#0f172a' },
  civil:     { top: '#64748b', legs: '#334155' },
  gign:      { top: '#111827', legs: '#111827', hat: '#0b0f17' },
  bac:       { top: '#475569', legs: '#1e3a8a' },
  press:     { top: '#e5e7eb', legs: '#1f2937' },
  medic:     { top: '#f8fafc', legs: '#1e3a8a' },
  pompier:   { top: '#1e293b', legs: '#1e293b', hat: '#d4d4d8' },
  forensic:  { top: '#f1f5f9', legs: '#f1f5f9', hat: '#f1f5f9' },
};
const CIVIL_TOPS = ['#e11d48', '#0ea5e9', '#f59e0b', '#10b981', '#8b5cf6', '#f8fafc', '#475569', '#db2777', '#84cc16'];
const CIVIL_LEGS = ['#1e3a8a', '#334155', '#78350f', '#111827', '#64748b'];
export function character(role: Role) {
  const c = role === 'civil'
    ? { top: CIVIL_TOPS[Math.floor(Math.random() * CIVIL_TOPS.length)], legs: CIVIL_LEGS[Math.floor(Math.random() * CIVIL_LEGS.length)], hat: Math.random() < 0.3 ? '#1f2937' : undefined, mask: undefined }
    : ROLE[role];
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
  if (role === 'gign') { torso.add(at(cbox(0.58, 0.42, 0.38, '#1f2937', 0.08), 0, 0.33, 0)); torso.add(at(cbox(0.36, 0.1, 0.04, '#e5e7eb', 0.01), 0, 0.42, -0.2)); }
  if (role === 'medic') torso.add(at(cbox(0.54, 0.1, 0.34, '#dc2626', 0.02), 0, 0.42, 0));
  if (role === 'pompier') { torso.add(at(cbox(0.54, 0.06, 0.34, '#facc15', 0.01), 0, 0.2, 0)); torso.add(at(cbox(0.54, 0.06, 0.34, '#e5e7eb', 0.01), 0, 0.32, 0)); }
  if (role === 'forensic') torso.add(at(cbox(0.3, 0.14, 0.05, '#60a5fa', 0.02), 0, 0.92, 0.2));
  if (role === 'bac') torso.add(at(cbox(0.17, 0.12, 0.19, '#f97316', 0.02), 0.33, 0.45, 0));
  if (role === 'cop') { torso.add(at(cbox(0.54, 0.08, 0.34, '#111827', 0.02), 0, 0.05, 0)); torso.add(at(cbox(0.12, 0.12, 0.04, '#facc15', 0.02), -0.13, 0.42, 0.17)); }
  const head = new THREE.Group(); head.position.y = 0.66; torso.add(head);
  head.add(at(cbox(0.4, 0.4, 0.38, c.mask && role === 'guard' ? c.mask : skin, 0.1), 0, 0.2, 0));
  if (role === 'guard') head.add(at(cbox(0.3, 0.08, 0.05, skin, 0.02), 0, 0.24, 0.19));          // cagoule : fente des yeux
  head.add(at(cbox(0.06, 0.06, 0.03, '#111827', 0.01), -0.08, 0.24, 0.205));
  head.add(at(cbox(0.06, 0.06, 0.03, '#111827', 0.01), 0.08, 0.24, 0.205));
  if (role === 'chemist') { head.add(at(cbox(0.3, 0.16, 0.12, c.mask!, 0.05), 0, 0.12, 0.2)); head.add(at(cbox(0.42, 0.42, 0.4, '#e2e8f0', 0.12), 0, 0.22, -0.03)); }
  if (role === 'gign') { head.add(at(cbox(0.48, 0.3, 0.46, '#0b0f17', 0.12), 0, 0.34, 0)); head.add(at(cbox(0.36, 0.1, 0.05, '#334155', 0.02), 0, 0.24, 0.21)); }
  if (c.hat && role !== 'gign') {
    head.add(at(cbox(0.44, 0.12, 0.42, c.hat, 0.05), 0, 0.42, 0));
    if (role !== 'rival') head.add(at(cbox(0.36, 0.05, 0.22, c.hat, 0.02), 0, 0.38, 0.26));
  }
  const armL = new THREE.Group(); armL.position.set(-0.33, 0.55, 0); torso.add(armL);
  const armR = new THREE.Group(); armR.position.set(0.33, 0.55, 0); torso.add(armR);
  armL.add(at(cbox(0.15, 0.48, 0.17, c.top), 0, -0.22, 0)); armL.add(at(cbox(0.14, 0.12, 0.14, role === 'chemist' ? '#facc15' : skin), 0, -0.5, 0));
  armR.add(at(cbox(0.15, 0.48, 0.17, c.top), 0, -0.22, 0)); armR.add(at(cbox(0.14, 0.12, 0.14, role === 'chemist' ? '#facc15' : skin), 0, -0.5, 0));
  let gun: THREE.Object3D | null = null, flash: THREE.Mesh | null = null;
  if (role === 'guard' || role === 'rival' || role === 'cop' || role === 'gign' || role === 'bac') {
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
  g.userData = { legL, legR, armL, armR, torso, hips, head, crate, gun, flash, role };
  return optimize(g);
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
  u.torso.scale.y = !moving && !working ? 1 + Math.sin(t * 2.2) * 0.02 : 1;   // respiration
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

/** Voiture civile. */
export function car(color: string) {
  const g = new THREE.Group();
  g.add(box(1.3, 0.5, 2.5, color, 0.25, 0.22));
  g.add(at(box(1.15, 0.45, 1.3, color, 0, 0.2), 0, 0.72, -0.15));
  g.add(at(box(1.17, 0.3, 1.1, '#1e293b', 0, 0.1), 0, 0.8, -0.15));
  for (const [x, z] of [[-0.62, -0.85], [0.62, -0.85], [-0.62, 0.85], [0.62, 0.85]]) { const w = cyl(0.28, 0.28, 0.2, '#111827', 12); w.rotation.z = Math.PI / 2; w.position.set(x, 0.28, z); g.add(w); }
  return g;
}

// =====================================================================
// Paliers visuels des bâtiments (tous construits centrés sur (0,0) local)
// =====================================================================
const glassMat = () => mat('#cfe9f5', { transparent: true, opacity: 0.22, roughness: 0.1, metalness: 0.2, depthWrite: false });
const steel = '#94a3b8', darkSteel = '#475569';
function beam(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color = steel, t = 0.1) {
  const len = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
  const m = new THREE.Mesh(new THREE.BoxGeometry(t, len, t), mat(color));
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(x1 - x0, y1 - y0, z1 - z0).normalize());
  m.castShadow = true; return m;
}
function textSign(text: string, w: number, h: number, bg = '#1f2937', fg = '#facc15') {
  const c = document.createElement('canvas'); c.width = 512; c.height = Math.round(512 * h / w);
  const g = c.getContext('2d')!; g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = fg; g.font = `bold ${Math.round(c.height * 0.6)}px Arial`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, c.width / 2, c.height / 2 + 2);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.08), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
  m.castShadow = true; return m;
}
function sandbags(n: number, w = 0.7) {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) g.add(at(cbox(w, 0.32, 0.4, i % 2 ? '#bfa97e' : '#c8b48a', 0.12), (i - (n - 1) / 2) * w, 0.16, 0));
  for (let i = 0; i < n - 1; i++) g.add(at(cbox(w, 0.32, 0.4, '#b9a274', 0.12), (i - (n - 2) / 2) * w, 0.48, 0));
  return g;
}

/** Bacs de culture (communs aux 3 paliers du champ). */
export function bedsGroup(rows: number, dz: number, len: number) {
  const g = new THREE.Group();
  for (let r = 0; r < rows; r++) { const b = bed(len); b.position.z = (r - (rows - 1) / 2) * dz; g.add(b); }
  return g;
}
/** Champ palier 2 : filets d'ombrage sur poteaux + arroseurs. */
export function shadeNet(w: number, d: number) {
  const g = new THREE.Group();
  const h = 2.6;
  for (const x of [-w / 2, 0, w / 2]) for (const z of [-d / 2, 0, d / 2]) g.add(beam(x, 0, z, x, h, z, '#57534e', 0.12));
  const net = new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, d), mat('#14532d', { transparent: true, opacity: 0.45, depthWrite: false }));
  net.position.y = h; g.add(net);
  for (const x of [-w / 2, w / 2]) g.add(beam(x, h, -d / 2, x, h, d / 2, '#57534e', 0.08));
  for (let i = 0; i < 4; i++) g.add(at(cyl(0.05, 0.05, 1, '#334155', 6), -w / 2 + 1 + i * (w - 2) / 3, 0.5, d / 2 - 0.3));
  return g;
}
/** Champ palier 3 : serre vitrée (côté est ouvert pour les jardiniers) + lampes de culture. */
export function greenhouse(w: number, d: number, rows: number, dz: number) {
  const g = new THREE.Group();
  const h = 2.5, ridge = 3.6, gm = glassMat();
  const n = 6;
  for (let i = 0; i <= n; i++) {
    const z = -d / 2 + (d * i) / n;
    g.add(beam(-w / 2, 0, z, -w / 2, h, z), beam(w / 2, 0, z, w / 2, h, z), beam(-w / 2, h, z, 0, ridge, z), beam(0, ridge, z, w / 2, h, z));
  }
  g.add(beam(-w / 2, h, -d / 2, -w / 2, h, d / 2), beam(w / 2, h, -d / 2, w / 2, h, d / 2), beam(0, ridge, -d / 2, 0, ridge, d / 2));
  // vitres : ouest, nord, sud, toit (est ouvert)
  const pane = (pw: number, ph: number) => new THREE.Mesh(new THREE.BoxGeometry(pw, ph, 0.04), gm);
  const west = pane(d, h); west.rotation.y = Math.PI / 2; west.position.set(-w / 2, h / 2, 0); g.add(west);
  for (const z of [-d / 2, d / 2]) { const p = pane(w, h); p.position.set(0, h / 2, z); g.add(p); }
  const slope = Math.hypot(w / 2, ridge - h);
  for (const s of [-1, 1]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(slope, 0.04, d), gm);
    r.position.set((s * w) / 4, (h + ridge) / 2, 0); r.rotation.z = -s * Math.atan2(ridge - h, w / 2); g.add(r);
  }
  const lampMat = mat('#f5d0fe', { emissive: '#e879f9', emissiveIntensity: 1.2 });
  for (let r = 0; r < rows; r++) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(w - 1.6, 0.06, 0.18), lampMat);
    l.position.set(-0.3, h - 0.25, (r - (rows - 1) / 2) * dz); g.add(l);
  }
  return g;
}

/** Séchoir paliers 2 et 3. */
export function dryerT2() {
  const g = new THREE.Group();
  g.add(kBuilding(5, 3.1, 3.6, '#b45309', { roof: '#7f1d1d', windows: 3 }));
  for (const x of [-1.6, 1.6]) g.add(at(box(0.6, 1.8, 0.6, '#57534e', 0, 0.06), x, 3.1, -0.9));
  const winMat = mat('#fde68a', { emissive: '#f59e0b', emissiveIntensity: 0 });
  for (const x of [-1.6, 1.6]) g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.06), winMat), x, 1.9, 1.85));
  g.userData = { winMat, chimneyTop: new THREE.Vector3(1.6, 5, -0.9) };
  return g;
}
export function dryerT3() {
  const g = new THREE.Group();
  g.add(kBuilding(5.2, 3.6, 3.8, '#cbd5e1', { roof: '#64748b', band: '#f59e0b', windows: 3 }));
  for (const [x, z] of [[3.2, -1.4], [3.2, 0.9]] as const) {
    g.add(at(cyl(0.75, 0.75, 4.4, '#e2e8f0', 16), x, 2.4, z));
    g.add(at(new THREE.Mesh(new THREE.ConeGeometry(0.8, 0.6, 16), mat('#94a3b8')), x, 4.9, z));
    for (const y of [1.2, 2.6, 3.8]) g.add(at(cyl(0.78, 0.78, 0.08, '#64748b', 16), x, y, z));
  }
  g.add(at(cyl(0.35, 0.45, 2.6, '#475569', 12), -1.6, 4.9, -1));
  g.add(at(cyl(0.6, 0.6, 0.25, '#334155', 14), 0.8, 3.75, 0));   // ventilateur de toit
  const winMat = mat('#fde68a', { emissive: '#f59e0b', emissiveIntensity: 0 });
  for (const x of [-1.7, 1.7]) g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.06), winMat), x, 2.2, 1.95));
  g.userData = { winMat, chimneyTop: new THREE.Vector3(-1.6, 6.3, -1) };
  return g;
}

/** Conditionnement : 3 paliers (la table est au centre, les emballeurs autour). */
export function packT1() { const g = new THREE.Group(); const s = shed(6, 5); s.position.z = 0.2; g.add(s, table()); return g; }
export function packT2() {
  const g = new THREE.Group();
  g.add(at(box(6.4, 2.8, 0.3, '#ea580c', 0, 0.1), 0, 0, -2.3));
  for (const x of [-3.05, 3.05]) g.add(at(box(0.3, 2.8, 2.2, '#ea580c', 0, 0.1), x, 0, -1.3));
  g.add(at(box(6.8, 0.2, 2.6, '#9a3412', 2.8, 0.06), 0, 0, -1.2));
  g.add(table());
  for (let i = 0; i < 3; i++) g.add(at(box(0.9, 0.5, 0.9, '#b07a45', i * 0.5, 0.05), 2.4, 0, -1.6));
  g.add(at(textSign('EMBALLAGE', 2.6, 0.5), 0, 2.2, -2.12));
  return g;
}
export function packT3() {
  const g = new THREE.Group();
  const H = 3.8;
  for (const x of [-3.4, 3.4]) for (const z of [-2.4, 1.8]) g.add(beam(x, 0, z, x, H, z, '#334155', 0.2));
  g.add(beam(-3.4, H, -2.4, 3.4, H, -2.4, '#334155', 0.2), beam(-3.4, H, 1.8, 3.4, H, 1.8, '#334155', 0.2));
  const roof = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.06, 4.6), mat('#e0f2fe', { transparent: true, opacity: 0.3, depthWrite: false }));
  roof.position.set(0, H, -0.3); g.add(roof);
  const lm = mat('#fef9c3', { emissive: '#fde047', emissiveIntensity: 1 });
  for (const x of [-1.5, 1.5]) { g.add(beam(x, H, 0, x, H - 0.9, 0, '#1f2937', 0.04)); g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.35, 0.25, 12), lm), x, H - 1, 0)); }
  g.add(table());
  // filmeuse automatique
  g.add(at(cyl(0.8, 0.8, 0.12, '#334155', 18), 2.5, 0.06, -1.2));
  g.add(at(box(0.2, 2.2, 0.2, '#f59e0b', 0, 0.04), 3.2, 0, -1.2));
  g.add(at(box(0.9, 0.9, 0.9, '#b07a45', 0.12, 0.05), 2.5, 0, -1.2));
  g.add(at(textSign('CONDITIONNEMENT', 3.4, 0.5), 0, H - 0.4, -2.4));
  return g;
}

/** Garage / dépôt. */
export function garageT2() {
  const g = new THREE.Group();
  g.add(kBuilding(5, 3, 4.4, '#64748b', { roof: '#cbd5e1', windows: 2, door: false }));
  for (const x of [-1.2, 1.2]) { g.add(at(box(1.9, 2.1, 0.08, '#cbd5e1', 0, 0.03), x, 0, 2.21)); for (let i = 0; i < 6; i++) g.add(at(box(1.9, 0.04, 0.06, '#94a3b8', 0.25 + i * 0.32, 0.01), x, 0, 2.26)); }
  return g;
}
export function garageT3() {
  const g = new THREE.Group();
  g.add(kBuilding(5, 3.6, 4.6, '#1f2937', { roof: '#475569', band: '#f59e0b', windows: 3, door: false }));
  for (const x of [-1.6, 0, 1.6]) {
    g.add(at(box(1.3, 2.2, 0.08, '#e5e7eb', 0, 0.03), x, 0, 2.31));
    g.add(at(box(1.5, 0.5, 0.6, '#57534e', 0, 0.04), x, 0, 2.6));   // quai de chargement
  }
  g.add(at(textSign('TRANSPORTS MOMO', 4.2, 0.6, '#f59e0b', '#111827'), 0, 3.95, 2.3));
  return g;
}

/** Avocat. */
export function officeT2() {
  const g = kBuilding(3.4, 4.2, 3.2, '#e7e5e4', { roof: '#a8a29e', band: '#1e3a8a', windows: 2 });
  g.add(at(textSign('CABINET', 2, 0.42, '#1e3a8a', '#f8fafc'), 0, 2, 1.65));
  return g;
}
export function officeT3() {
  const g = kBuilding(3.6, 5.6, 3.4, '#94a3b8', { roof: '#475569', windows: 3 });
  g.add(at(textSign('AVOCATS ASSOCIÉS', 3.2, 0.45, '#0f172a', '#e2e8f0'), 0, 1.9, 1.75));
  g.add(at(box(1.4, 0.1, 0.8, '#e5e7eb', 2.3, 0.03), 0, 0, 1.9));
  return g;
}

/** QG milice paliers 2 et 3. */
export function miliceT2() {
  const g = new THREE.Group();
  g.add(kBuilding(4.6, 2.6, 2.8, '#4d5d3a', { roof: '#3f4a2e', windows: 2 }));
  const sb = sandbags(7); sb.position.z = 1.8; g.add(sb);
  g.add(at(cyl(0.04, 0.04, 2.6, '#1f2937', 6), -1.8, 3.9, -0.8));
  g.add(at(box(1, 0.6, 0.04, '#111827', 0, 0.01), -1.3, 4.6, -0.8));
  g.add(at(box(1.2, 0.5, 0.5, '#1f2937', 0, 0.04), 1.4, 2.62, 0.3));   // projecteur
  return g;
}
export function miliceT3() {
  const g = new THREE.Group();
  g.add(kBuilding(6, 3.1, 2.8, '#3f4a2e', { roof: '#2f3a22', windows: 3 }));
  for (let i = 0; i < 9; i++) g.add(at(box(0.4, 0.45, 0.4, '#3f4a2e', 3.15, 0.04), -2.8 + i * 0.7, 0, 1.25));   // créneaux
  const sb = sandbags(9); sb.position.z = 1.85; g.add(sb);
  for (const x of [-2.7, 2.7]) {
    g.add(at(cyl(0.05, 0.05, 2.2, '#1f2937', 6), x, 4.2, -1));
    const flag = box(0.9, 0.55, 0.04, '#111827', 4.6, 0.01); flag.position.set(x + 0.45, 0, -1); g.add(flag);
  }
  g.add(at(textSign('QG', 1.2, 0.5, '#111827', '#ef4444'), 0, 2.4, 1.43));
  return g;
}
/** Mirador avec tourelle (userData.turret pivote). */
export function watchtower() {
  const g = new THREE.Group();
  const H = 3.6;
  for (const x of [-0.8, 0.8]) for (const z of [-0.8, 0.8]) g.add(beam(x, 0, z, x * 0.8, H, z * 0.8, '#57534e', 0.14));
  g.add(beam(-0.8, 1.6, -0.8, 0.8, 1.6, 0.8, '#57534e', 0.08), beam(0.8, 1.6, -0.8, -0.8, 1.6, 0.8, '#57534e', 0.08));
  g.add(box(2, 0.18, 2, '#78716c', H, 0.05));
  for (const [x, z, w, d] of [[0, -0.95, 2, 0.1], [0, 0.95, 2, 0.1], [-0.95, 0, 0.1, 2], [0.95, 0, 0.1, 2]]) g.add(at(box(w, 0.7, d, '#c8b48a', H + 0.18, 0.04), x, 0, z));
  g.add(at(box(2.2, 0.15, 2.2, '#3f4a2e', H + 1.7, 0.05), 0, 0, 0));
  for (const x of [-0.95, 0.95]) for (const z of [-0.95, 0.95]) g.add(beam(x, H + 0.2, z, x, H + 1.7, z, '#57534e', 0.07));
  const turret = new THREE.Group(); turret.position.y = H + 0.3;
  turret.add(at(cyl(0.18, 0.25, 0.5, '#1f2937', 10), 0, 0.25, 0));
  turret.add(at(cbox(0.36, 0.28, 0.6, '#27272a', 0.05), 0, 0.6, 0.1));
  const barrel = cyl(0.05, 0.05, 1.1, '#18181b', 8); barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.62, 0.8); turret.add(barrel);
  g.add(turret);
  g.userData = { turret };
  return g;
}

/** Labo / pharmacie : paliers 1 et 3 (le palier 2 est lab()). */
export function labT1(color: string, kind: 'labo' | 'pharma') {
  const g = new THREE.Group();
  if (kind === 'labo') {
    g.add(box(5, 2.5, 2.4, '#9ca3af', 0, 0.05));
    for (let i = 0; i < 12; i++) g.add(at(box(0.06, 2.4, 2.46, '#6b7280', 0.05, 0.01), -2.3 + i * 0.42, 0, 0));
    g.add(at(box(5.1, 0.12, 2.5, color, 2.5, 0.02), 0, 0, 0));
    g.add(at(box(0.8, 1.6, 0.06, '#1f2937', 0, 0.02), -1.6, 0, 1.23));
    g.add(at(cyl(0.2, 0.2, 0.5, '#64748b', 8), 1.4, 2.8, 0));
    g.add(at(box(1.6, 0.06, 1.2, '#1e40af', 1.2, 0.02), 1.4, 0, 1.5));   // bâche
  } else {
    g.add(kBuilding(4.2, 2.6, 3, '#f8fafc', { band: color, windows: 2 }));
    const cross = new THREE.Group(); cross.add(cbox(0.7, 0.24, 0.1, '#22c55e', 0.04)); cross.add(cbox(0.24, 0.7, 0.1, '#22c55e', 0.04));
    cross.position.set(1.4, 2.1, 1.56); g.add(cross);
  }
  return g;
}
export function labT3(color: string, kind: 'labo' | 'pharma') {
  const g = new THREE.Group();
  if (kind === 'labo') {
    // hangar à toit arrondi en tôle
    g.add(at(box(9, 1.2, 5, '#64748b', 0, 0.05), 0.5, 0, -0.2));
    const arch = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 9, 24, 1, false, 0, Math.PI), mat('#94a3b8', { metalness: 0.4, roughness: 0.5 }));
    arch.rotation.z = Math.PI / 2; arch.rotation.y = Math.PI / 2; arch.rotation.x = 0;
    arch.rotation.set(0, 0, Math.PI / 2); arch.position.set(0.5, 1.2, -0.2);
    arch.castShadow = true; g.add(arch);
    for (let i = 0; i < 7; i++) { const rib = new THREE.Mesh(new THREE.TorusGeometry(2.52, 0.05, 6, 24, Math.PI), mat('#475569')); rib.rotation.y = Math.PI / 2; rib.position.set(-3.8 + i * 1.45, 1.2, -0.2); g.add(rib); }
    g.add(at(box(2.4, 2.2, 0.08, '#cbd5e1', 0, 0.03), 0.5, 0, 2.31));
    g.add(at(textSign('HANGAR 3', 2.4, 0.5, '#0f172a', color), 0.5, 2.5, 2.35));
    for (let i = 0; i < 3; i++) { g.add(at(cyl(0.65, 0.65, 3, '#e2e8f0', 16), 5.6, 1.5, -1.8 + i * 1.5)); g.add(at(cyl(0.67, 0.67, 0.15, color, 16), 5.6, 2.4, -1.8 + i * 1.5)); }
  } else {
    g.add(kBuilding(9, 3.6, 4.8, '#ffffff', { band: color, windows: 5 }));
    const cross = new THREE.Group(); cross.add(cbox(1.4, 0.45, 0.12, '#22c55e', 0.05)); cross.add(cbox(0.45, 1.4, 0.12, '#22c55e', 0.05));
    cross.position.set(3.4, 2.7, 2.45); g.add(cross);
    for (let i = 0; i < 3; i++) g.add(at(box(1.6, 0.8, 1.1, '#e2e8f0', 3.6, 0.05), -2.8 + i * 2.2, 0, -0.8));
    g.add(at(textSign('PHARMA DISTRIB', 3.6, 0.5, '#f8fafc', '#be185d'), -1.2, 3, 2.45));
  }
  return g;
}

// ---------- véhicules par palier ----------
export function moto() {
  const g = model('moto', 1.6);
  const cargo = at(cbox(0.4, 0.3, 0.4, '#b07a45', 0.05), 0, 0.9, -0.5); cargo.visible = false; g.add(cargo);
  g.userData = { cargo };
  return g;
}
export function utilityVan() {
  const g = new THREE.Group();
  g.add(box(1.5, 1.7, 3.2, '#f1f5f9', 0.3, 0.2));
  g.add(at(box(1.45, 1.1, 0.9, '#f1f5f9', 0, 0.2), 0, 0.3, 2));
  g.add(at(box(1.4, 0.5, 0.06, '#1e293b', 0, 0.05), 0, 0.95, 2.46));
  g.add(at(box(1.52, 0.25, 3.22, '#2563eb', 0.9, 0.04), 0, 0, 0));
  for (const [x, z] of [[-0.72, -1], [0.72, -1], [-0.72, 1.6], [0.72, 1.6]]) { const w = cyl(0.32, 0.32, 0.22, '#111827', 12); w.rotation.z = Math.PI / 2; w.position.set(x, 0.32, z); g.add(w); }
  const cargo = new THREE.Group(); g.add(cargo); cargo.visible = false;
  g.userData = { cargo };
  return g;
}
export function suv() {
  const g = new THREE.Group();
  g.add(box(1.6, 0.85, 3.2, '#0b0f17', 0.3, 0.25));
  g.add(at(box(1.5, 0.7, 2.1, '#0b0f17', 0, 0.22), 0, 1.05, -0.2));
  g.add(at(box(1.52, 0.48, 1.9, '#020617', 0, 0.12), 0, 1.15, -0.2));
  g.add(at(box(1.0, 0.15, 0.06, '#cbd5e1', 0, 0.03), 0, 0.6, 1.62));   // calandre chromée
  for (const [x, z] of [[-0.78, -1], [0.78, -1], [-0.78, 1.05], [0.78, 1.05]]) { const w = cyl(0.36, 0.36, 0.26, '#111827', 14); w.rotation.z = Math.PI / 2; w.position.set(x, 0.36, z); g.add(w); const r = cyl(0.2, 0.2, 0.28, '#9ca3af', 10); r.rotation.z = Math.PI / 2; r.position.set(x, 0.36, z); g.add(r); }
  const cargo = new THREE.Group(); g.add(cargo); cargo.visible = false;
  g.userData = { cargo };
  return g;
}
export function vehicleForTier(tier: number, slot: number) {
  return optimize(tier <= 0 ? moto() : tier === 1 ? pickup(slot) : tier === 2 ? utilityVan() : suv());
}

// ---------- la place : clôtures par palier ----------
export function barbedWire(len: number) {
  const g = new THREE.Group();
  const n = Math.max(1, Math.floor(len / 0.5));
  for (let i = 0; i < n; i++) { const t = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.015, 4, 10), mat('#9ca3af', { metalness: 0.6 })); t.position.x = -len / 2 + (i + 0.5) * (len / n); t.rotation.y = Math.PI / 2 + 0.4; g.add(t); }
  return g;
}

// ---------- commissariat (version soignée) ----------
export function commissariat() {
  const g = new THREE.Group();
  const blue = '#1d4ed8', navy = '#1e3a8a', white = '#f8fafc', stone = '#e2e8f0';
  const glow = (c: string, i = 1.4) => mat(c, { emissive: c, emissiveIntensity: i });
  // socle + corps principal (2 étages, bandeau bleu)
  g.add(box(11.4, 0.3, 6.4, '#cbd5e1', 0, 0.08));
  const main = kBuilding(9, 4, 5, white, { roof: '#cbd5e1', band: blue, windows: 5 }); main.position.y = 0.3; g.add(main);
  for (const x of [-4.5, 4.5]) g.add(at(box(0.25, 4, 0.25, stone, 0.3, 0.04), x, 0, 2.5));      // pilastres d'angle
  g.add(at(box(9.1, 0.12, 0.16, navy, 1.6, 0.02), 0, 0, 2.55));                                  // corniche entre étages
  // ailes basses
  for (const sx of [-1, 1]) {
    const w = kBuilding(2.2, 2.6, 4, white, { roof: '#cbd5e1', band: blue, windows: 1, door: false }); w.position.set(sx * 5.6, 0.3, 0.3); g.add(w);
  }
  // tour d'entrée vitrée
  const tower = new THREE.Group(); tower.position.set(0, 0.3, 2.6); g.add(tower);
  tower.add(box(2.8, 6, 1.4, navy, 0, 0.12));
  const glassC = mat('#60a5fa', { emissive: '#1d4ed8', emissiveIntensity: 0.35, roughness: 0.1, metalness: 0.4 });
  for (let f = 0; f < 4; f++) { const gl = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 0.06), glassC); gl.position.set(0, 1.9 + f * 1.05, 0.71); tower.add(gl); }
  for (let i = -1; i <= 1; i++) tower.add(at(box(0.06, 4.2, 0.08, white, 1.5, 0.01), i * 0.74, 0, 0.74));
  const sign = textSign('POLICE', 2.4, 0.6, navy, '#ffffff'); sign.position.set(0, 5.45, 0.74); tower.add(sign);
  (sign.material as THREE.MeshStandardMaterial).emissive = new THREE.Color('#ffffff'); (sign.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.25;
  (sign.material as THREE.MeshStandardMaterial).emissiveMap = (sign.material as THREE.MeshStandardMaterial).map;
  // porte vitrée + auvent + lanterne bleue « POLICE »
  tower.add(at(new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.5, 0.06), mat('#93c5fd', { roughness: 0.1, metalness: 0.3 })), 0, 0.75, 0.73));
  tower.add(at(box(3.6, 0.16, 1.8, white, 1.75, 0.05), 0, 0, 1.4));
  for (const x of [-1.6, 1.6]) tower.add(at(cyl(0.09, 0.09, 1.75, stone, 10), x, 0.87, 2.2));
  const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.32, 0.32), glow('#3b82f6', 2)); lantern.position.set(0, 2.15, 2.15); tower.add(lantern);
  tower.add(at(textSign('POLICE NATIONALE', 3.2, 0.32, navy, '#f8fafc'), 0, 1.92, 2.31));
  // marches + rampe
  for (let i = 0; i < 3; i++) g.add(at(box(3.4 - i * 0.3, 0.12, 0.5, stone, 0.3 + i * 0.12, 0.02), 0, 0, 4.9 - i * 0.4));
  // jardinières + haies + bornes
  for (const sx of [-1, 1]) {
    g.add(at(box(2.2, 0.45, 0.8, '#94a3b8', 0.3, 0.06), sx * 3.2, 0, 4.4));
    for (let i = 0; i < 3; i++) g.add(at(new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 1), mat('#3f8f3a')), sx * 3.2 - 0.7 + i * 0.7, 0.95, 4.4));
    for (let i = 0; i < 3; i++) g.add(at(cyl(0.1, 0.12, 0.6, '#334155', 8), sx * (1.9 + i * 0.6), 0.6, 5.5));
  }
  // toit : héliport, clims, mât d'antenne avec feu rouge, parabole, caméras
  const roofY = 4.42;
  g.add(at(cyl(1.6, 1.6, 0.08, '#334155', 24), -2.4, roofY, -0.6));
  { const ring = at(new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.06, 6, 24), mat('#facc15')), -2.4, roofY + 0.06, -0.6); ring.rotation.x = Math.PI / 2; g.add(ring); }
  for (const [w, d, x, z] of [[0.14, 1.1, -0.35, 0], [0.14, 1.1, 0.35, 0], [0.7, 0.14, 0, 0]] as const) g.add(at(box(w, 0.03, d, white, 0, 0), -2.4 + x, roofY + 0.05, -0.6 + z));
  for (const x of [1.4, 2.6]) { g.add(at(box(0.9, 0.55, 0.7, '#cbd5e1', roofY, 0.05), x, 0, -1.2)); g.add(at(cyl(0.25, 0.25, 0.06, '#475569', 12), x, roofY + 0.58, -1.2)); }
  g.add(at(cyl(0.05, 0.08, 3.2, '#9ca3af', 6), 3.6, roofY + 1.6, 0.6));
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), glow('#ef4444', 2.5)); beacon.position.set(3.6, roofY + 3.25, 0.6); g.add(beacon);
  const dish = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 6, 0, Math.PI * 2, 0, Math.PI / 3), mat('#e5e7eb', { side: THREE.DoubleSide })); dish.position.set(2.3, roofY + 0.9, 1.1); dish.rotation.x = -1.1; g.add(dish);
  for (const x of [-4.4, 4.4]) { const cam = new THREE.Group(); cam.add(cbox(0.25, 0.18, 0.4, '#e5e7eb', 0.04)); cam.position.set(x, 3.7, 2.75); cam.rotation.y = x < 0 ? 0.6 : -0.6; g.add(cam); }
  // mâts : drapeau français + drapeau européen (remplacés par le nôtre quand la police est sous contrôle)
  for (const x of [5.4, 6.1]) g.add(at(cyl(0.05, 0.06, 6, '#d1d5db', 8), x, 3, 3.6));
  const fr = new THREE.Group();
  ['#1d4ed8', '#f8fafc', '#dc2626'].forEach((c, i) => fr.add(at(box(0.42, 0.85, 0.04, c, 0, 0.01), 5.62 + i * 0.42, 5.0, 3.6)));
  const eu = new THREE.Group(); eu.add(at(box(1.2, 0.85, 0.04, '#1e40af', 0, 0.01), 6.7, 5.0, 3.6));
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; eu.add(at(new THREE.Mesh(new THREE.OctahedronGeometry(0.045), glow('#facc15', 0.6)), 6.7 + Math.cos(a) * 0.26, 5.42 + Math.sin(a) * 0.26, 3.63)); }
  fr.add(eu);
  const ours = new THREE.Group(); ours.add(at(box(1.3, 0.85, 0.04, '#111827', 0, 0.01), 6.0, 5.0, 3.6)); ours.add(at(box(0.5, 0.25, 0.05, '#dc2626', 0, 0.01), 6.0, 5.28, 3.62)); ours.visible = false;
  g.add(fr, ours);
  // muret d'enceinte avec grilles bleues
  for (const sx of [-1, 1]) {
    g.add(at(box(3.4, 0.5, 0.3, stone, 0, 0.05), sx * 4.6, 0, 6.1));
    for (let i = 0; i < 6; i++) g.add(at(box(0.06, 0.9, 0.06, navy, 0.5, 0.01), sx * (3.1 + i * 0.6), 0, 6.1));
    g.add(at(box(3.4, 0.06, 0.06, navy, 1.35, 0.01), sx * 4.6, 0, 6.1));
  }
  g.userData = { frFlag: fr, ourFlag: ours, beacon };
  return g;
}

// ---------- véhicules de la milice (stylés + animés) ----------
function wheel(r: number, w: number) {
  const g = new THREE.Group();
  const tyre = cyl(r, r, w, '#111827', 16); tyre.rotation.z = Math.PI / 2; g.add(tyre);
  const rim = cyl(r * 0.55, r * 0.55, w + 0.02, '#52525b', 8); rim.rotation.z = Math.PI / 2; g.add(rim);
  for (let i = 0; i < 4; i++) { const sp = box(w + 0.04, 0.06, r * 1.1, '#a1a1aa', -0.03, 0.01); sp.rotation.x = (i * Math.PI) / 4; g.add(sp); }
  return g;
}
/** Technique : pick-up désert camouflé, arceau, rampe de gyrophares, mitrailleuse sur tourelle avec tireur. */
export function technical() {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  body.add(box(1.6, 0.6, 3.4, '#6b6a3f', 0.42, 0.22));
  for (const [x, z, c] of [[0.5, 0.6, '#4d4a2a'], [-0.4, -0.9, '#8a7f55'], [0.2, -1.4, '#4d4a2a'], [-0.5, 1.2, '#8a7f55']] as const) body.add(at(box(0.5, 0.02, 0.7, c, 0, 0.01), x, 1.03, z));
  body.add(at(box(1.5, 0.7, 1.3, '#6b6a3f', 0, 0.2), 0, 1.0, 0.85));
  body.add(at(box(1.52, 0.4, 1.12, '#0b0f17', 0, 0.1), 0, 1.12, 0.85));
  body.add(at(box(1.7, 0.45, 0.2, '#27272a', 0, 0.06), 0, 0.5, 1.8));                 // pare-buffle
  for (const x of [-0.6, 0.6]) body.add(at(box(0.12, 0.5, 0.25, '#27272a', 0, 0.03), x, 0.5, 1.82));
  const bar = new THREE.Group(); bar.position.set(0, 1.75, 0.85);                        // rampe de gyrophares
  bar.add(box(1.3, 0.12, 0.25, '#18181b', 0, 0.03));
  const amber = mat('#f59e0b', { emissive: '#f59e0b', emissiveIntensity: 0 });
  const lights: THREE.Mesh[] = [];
  for (const x of [-0.45, -0.15, 0.15, 0.45]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.22), amber.clone()); l.position.set(x, 0.14, 0); bar.add(l); lights.push(l); }
  body.add(bar);
  for (const x of [-0.75, 0.75]) { body.add(beamY(x, 1.0, -0.2, x, 1.9, -0.6)); body.add(beamY(x, 1.9, -0.6, x, 1.9, -1.4)); }   // arceau
  body.add(beamY(-0.75, 1.9, -0.6, 0.75, 1.9, -0.6));
  { const sp = at(cyl(0.38, 0.38, 0.25, '#111827', 14), 0, 1.0, -1.65); sp.rotation.x = Math.PI / 2; body.add(sp); }    // roue de secours
  for (let i = 0; i < 3; i++) body.add(at(box(0.35, 0.3, 0.45, '#3f4a2e', 0.97, 0.05), -0.5 + i * 0.5, 0, -1.4));   // caisses de munitions
  const turret = new THREE.Group(); turret.position.set(0, 1.0, -0.7);
  turret.add(at(cyl(0.32, 0.32, 0.08, '#27272a', 16), 0, 0.05, 0));
  turret.add(at(cyl(0.06, 0.08, 0.6, '#1f2937', 8), 0, 0.35, 0));
  const gun = new THREE.Group(); gun.position.y = 0.72; turret.add(gun);
  gun.add(cbox(0.22, 0.22, 0.6, '#27272a', 0.05));
  gun.add(at(box(0.36, 0.3, 0.05, '#3f3f46', -0.12, 0.02), 0, 0, 0.12));             // bouclier
  const barrel = cyl(0.045, 0.045, 1, '#09090b', 8); barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0, 0.75); gun.add(barrel);
  gun.add(at(box(0.18, 0.2, 0.26, '#4d5d3a', -0.1, 0.03), 0.2, 0, -0.05));            // boîte à bandes
  const flash = new THREE.Mesh(new THREE.OctahedronGeometry(0.25), new THREE.MeshBasicMaterial({ color: '#fde047' })); flash.position.set(0, 0, 1.35); flash.visible = false; gun.add(flash);
  const gunner = character('guard'); gunner.position.set(0, -0.6, -0.55); gunner.scale.setScalar(0.85); animateCharacter(gunner, 0, false, false, false); turret.add(gunner);
  body.add(turret);
  const wheels: THREE.Group[] = [];
  for (const [x, z] of [[-0.82, -1.1], [0.82, -1.1], [-0.82, 1.1], [0.82, 1.1]]) { const w = wheel(0.4, 0.3); w.position.set(x, 0.4, z); g.add(w); wheels.push(w); }
  g.userData = { body, turret, gun, flash, wheels, lights, kind: 'technical' };
  return g;
}
function beamY(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
  const len = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, len, 8), mat('#18181b'));
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(x1 - x0, y1 - y0, z1 - z0).normalize());
  m.castShadow = true; return m;
}
/** Blindé : coque à plaques inclinées, 6 roues, jupes, tourelle double canon, lance-fumigènes, antenne qui fouette. */
export function armored() {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const hull = '#22252d', plate = '#2f343f';
  body.add(box(1.9, 1.1, 3.8, hull, 0.45, 0.14));
  const nose = box(1.9, 0.6, 0.9, plate, 0, 0.1); nose.position.set(0, 0.95, 1.95); nose.rotation.x = -0.55; body.add(nose);
  const top = box(1.7, 0.35, 3.0, plate, 1.55, 0.1); top.position.z = -0.2; body.add(top);
  for (const x of [-1, 1]) { const sk = box(0.08, 0.5, 3.2, '#1a1d23', 0.4, 0.02); sk.position.x = x; body.add(sk); }
  body.add(at(box(1.5, 0.28, 0.06, '#020617', 0, 0.02), 0, 1.25, 1.62));               // visière
  for (const x of [-0.6, 0.6]) body.add(at(box(0.3, 0.2, 0.1, '#e5e7eb', 0, 0.03), x, 0.75, 1.92));
  for (let i = 0; i < 5; i++) body.add(at(box(1.92, 0.04, 0.05, '#3f4451', 0, 0.01), 0, 0.6 + i * 0.2, -1.91));
  for (let i = 0; i < 4; i++) { const st = at(box(0.5, 0.06, 0.02, '#facc15', 0, 0), -0.75 + i * 0.5, 0.6, 1.93); st.rotation.z = 0.6; body.add(st); }   // bande jaune/noire
  const antenna = new THREE.Group(); antenna.position.set(-0.7, 1.9, -1.3);
  antenna.add(at(cyl(0.015, 0.02, 1.8, '#111827', 4), 0, 0.9, 0)); body.add(antenna);
  const turret = new THREE.Group(); turret.position.set(0, 1.9, -0.1); body.add(turret);
  turret.add(at(cyl(0.6, 0.7, 0.45, '#2b303b', 8), 0, 0.22, 0));
  turret.add(at(cbox(0.9, 0.35, 1.1, plate, 0.06), 0, 0.55, 0.15));
  for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) { const t = cyl(0.06, 0.06, 0.3, '#3f4451', 6); t.rotation.z = Math.PI / 2 * sx; t.rotation.x = -0.6; t.position.set(sx * 0.55, 0.45 + i * 0.12, 0.35); turret.add(t); }
  const gun = new THREE.Group(); gun.position.set(0, 0.55, 0.6); turret.add(gun);
  const flashes: THREE.Mesh[] = [];
  for (const x of [-0.14, 0.14]) {
    const b = cyl(0.06, 0.06, 1.5, '#0b0d12', 8); b.rotation.x = Math.PI / 2; b.position.set(x, 0, 0.75); gun.add(b);
    const f = new THREE.Mesh(new THREE.OctahedronGeometry(0.28), new THREE.MeshBasicMaterial({ color: '#fde047' })); f.position.set(x, 0, 1.6); f.visible = false; gun.add(f); flashes.push(f);
  }
  const red = mat('#ef4444', { emissive: '#ef4444', emissiveIntensity: 0 });
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.15, 10), red.clone()); beacon.position.set(0.5, 0.82, -0.3); turret.add(beacon);
  const wheels: THREE.Group[] = [];
  for (const x of [-0.95, 0.95]) for (const z of [-1.25, 0, 1.25]) { const w = wheel(0.42, 0.32); w.position.set(x, 0.42, z); g.add(w); wheels.push(w); }
  g.userData = { body, turret, gun, flash: flashes[0], flashes, wheels, lights: [beacon], antenna, kind: 'armored' };
  return g;
}

/** Accroupi derrière un abri (k de 0 debout à 1 accroupi). À appeler après animateCharacter. */
export function crouch(g: THREE.Group, k: number) {
  const u = g.userData;
  u.hips.position.y = 0.62 - 0.3 * k;
  u.torso.position.y = Math.min(u.torso.position.y, 0.62) - 0.3 * k;
  if (k > 0.01) { u.legL.rotation.x = -1.35 * k; u.legR.rotation.x = 0.9 * k; u.torso.rotation.x = 0.25 * k; }
}
/** Mort : les genoux lâchent puis le corps tombe (en avant, en arrière ou sur le côté), membres en vrac. */
export function fallDown(g: THREE.Group, k: number) {
  const e = Math.min(1, k), u = g.userData;
  if (!u.fv) u.fv = { ax: Math.random() < 0.6 ? 'x' : 'z', s: Math.random() < 0.5 ? -1 : 1, a1: -0.4 - Math.random() * 2.4, a2: -0.2 - Math.random() * 2.6, z1: Math.random() * 0.9, z2: -Math.random() * 0.9, l1: (Math.random() - 0.5) * 0.8, l2: (Math.random() - 0.5) * 0.8, h: (Math.random() - 0.5) * 1.4 };
  const v = u.fv;
  const knee = Math.min(1, e / 0.3), f = Math.max(0, (e - 0.15) / 0.85);
  const ease = 1 - Math.pow(1 - f, 3), bounce = f > 0.75 ? Math.sin((f - 0.75) / 0.25 * Math.PI) * 0.08 : 0;
  const ang = (Math.PI / 2) * ease - bounce;
  g.rotation.x = v.ax === 'x' ? v.s * ang : 0;
  g.rotation.z = v.ax === 'z' ? v.s * ang : 0;
  g.position.y = 0.25 + 0.1 * ease;
  u.hips.position.y = 0.62 - 0.25 * knee * (1 - ease);
  u.torso.position.y = 0.62 - 0.25 * knee * (1 - ease); u.torso.rotation.x = 0;
  u.armL.rotation.x = v.a1 * ease; u.armR.rotation.x = v.a2 * ease; u.armL.rotation.z = v.z1 * ease; u.armR.rotation.z = v.z2 * ease;
  u.legL.rotation.x = v.l1 * ease - 0.6 * knee * (1 - ease); u.legR.rotation.x = v.l2 * ease - 0.3 * knee * (1 - ease);
  u.head.rotation.y = v.h * ease;
  if (u.gun) u.gun.visible = e < 0.3;
  if (u.flash) u.flash.visible = false;
}
/** Épave calcinée (voiture de police après une attaque). */
export function wreck() {
  const g = new THREE.Group();
  g.add(box(1.4, 0.5, 2.8, '#1c1917', 0.15, 0.2));
  g.add(at(box(1.2, 0.45, 1.3, '#292524', 0, 0.18), 0, 0.65, -0.1));
  g.add(at(box(1.22, 0.3, 1.1, '#0c0a09', 0, 0.08), 0, 0.72, -0.1));
  for (const [x, z] of [[-0.68, -0.9], [0.68, -0.9], [0.68, 0.9]]) { const w = cyl(0.28, 0.28, 0.2, '#0c0a09', 10); w.rotation.z = Math.PI / 2; w.position.set(x, 0.18, z); g.add(w); }
  g.rotation.z = 0.08;
  return g;
}

/** Flaque de sang irrégulière (texture), s'étale avec le temps. */
let poolTex: THREE.Texture | null = null;
export function bloodPool() {
  if (!poolTex) {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d')!;
    for (let i = 0; i < 9; i++) {
      const x = 64 + (Math.random() - 0.5) * 50, y = 64 + (Math.random() - 0.5) * 50, r = 18 + Math.random() * 26;
      const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(110,8,8,1)'); gr.addColorStop(0.7, 'rgba(90,6,6,0.95)'); gr.addColorStop(1, 'rgba(70,4,4,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    poolTex = new THREE.CanvasTexture(c); poolTex.colorSpace = THREE.SRGBColorSpace;
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8), new THREE.MeshStandardMaterial({ map: poolTex, transparent: true, depthWrite: false, roughness: 0.15, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.rotation.x = -Math.PI / 2; m.rotation.z = Math.random() * Math.PI * 2; m.scale.setScalar(0.05);
  return m;
}
/** Rubalise jaune et noire entre deux points (avec piquets). */
let tapeMat: THREE.MeshStandardMaterial | null = null;
export function tape(x0: number, z0: number, x1: number, z1: number) {
  if (!tapeMat) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 32; const g = c.getContext('2d')!;
    g.fillStyle = '#facc15'; g.fillRect(0, 0, 256, 32);
    g.fillStyle = '#111'; for (let x = -32; x < 256; x += 64) { g.beginPath(); g.moveTo(x, 32); g.lineTo(x + 16, 32); g.lineTo(x + 32, 0); g.lineTo(x + 16, 0); g.fill(); }
    g.font = 'bold 20px sans-serif'; g.textBaseline = 'middle'; g.fillStyle = '#111'; g.fillText('POLICE', 140, 17);
    const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
    tapeMat = new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide, roughness: 0.6 });
  }
  const g = new THREE.Group(), len = Math.hypot(x1 - x0, z1 - z0);
  const geo = new THREE.PlaneGeometry(len, 0.16); const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * len / 2.2);
  const band = new THREE.Mesh(geo, tapeMat); band.position.set((x0 + x1) / 2, 0.95, (z0 + z1) / 2); band.rotation.y = -Math.atan2(z1 - z0, x1 - x0); g.add(band);
  for (const [x, z] of [[x0, z0], [x1, z1]]) { g.add(at(cyl(0.05, 0.06, 1.0, '#f97316', 6), x, 0.75, z)); g.add(at(cyl(0.055, 0.055, 0.12, '#f8fafc', 6), x, 0.9, z)); }
  return g;
}
/** Drap blanc posé sur un corps. */
export function sheet() {
  const g = new THREE.Group();
  g.add(at(cbox(0.82, 0.22, 1.9, '#eef2f7', 0.1), 0, 0.12, 0));
  g.add(at(cbox(0.5, 0.18, 0.45, '#eef2f7', 0.08), 0, 0.26, 0.62));
  g.add(at(cbox(0.3, 0.02, 0.3, '#7f1d1d', 0.01), 0.15, 0.24, 0.1));   // tache qui traverse
  return g;
}
/** Cavalier jaune de la police scientifique. */
export function marker() {
  const m = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.22, 3), mat('#facc15'));
  m.position.y = 0.36; m.castShadow = true; return m;
}
/** Camion de pompiers (rouge, échelle). */
export function fireTruck() {
  const g = new THREE.Group();
  g.add(box(1.8, 1.6, 4.4, '#dc2626', 0.3, 0.2));
  g.add(at(box(1.75, 1.2, 1.1, '#dc2626', 0, 0.2), 0, 0.3, 2.75));
  g.add(at(box(1.7, 0.55, 0.06, '#0b0f17', 0, 0.05), 0, 0.98, 3.31));
  g.add(at(box(1.82, 0.12, 4.42, '#f8fafc', 0, 0.02), 0, 0.85, 0));
  for (const x of [-0.35, 0.35]) g.add(at(box(0.08, 0.1, 4.2, '#cbd5e1', 0, 0.02), x, 1.95, -0.2));
  for (let z = -2; z < 1.8; z += 0.45) g.add(at(box(0.7, 0.06, 0.06, '#cbd5e1', 0, 0.02), 0, 1.95, z));
  g.add(at(cyl(0.22, 0.22, 1.7, '#64748b', 10), 0, 0.7, -2.2));
  for (const [x, z] of [[-0.92, -1.5], [0.92, -1.5], [-0.92, 2.6], [0.92, 2.6]]) { const w = cyl(0.38, 0.38, 0.26, '#0b0f17', 12); w.rotation.z = Math.PI / 2; w.position.set(x, 0.38, z); g.add(w); }
  for (const sx of [-1, 1]) { const t = textSign('POMPIERS', 3.2, 0.5, '#dc2626', '#ffffff'); t.position.set(sx * 0.92, 1.35, -0.2); t.rotation.y = sx * Math.PI / 2; g.add(t); }
  return g;
}
/** Fourgon d'intervention : GIGN (noir) ou presse (blanc avec parabole). */
export function vanOf(kind: 'gign' | 'press' | 'samu' | 'ps') {
  const g = new THREE.Group();
  const c = kind === 'gign' ? '#111827' : '#f8fafc';
  g.add(box(1.6, 1.7, 3.6, c, 0.3, 0.2));
  g.add(at(box(1.5, 1.1, 0.9, c, 0, 0.2), 0, 0.3, 2.2));
  g.add(at(box(1.45, 0.5, 0.06, '#0b0f17', 0, 0.05), 0, 0.95, 2.66));
  for (const [x, z] of [[-0.78, -1.2], [0.78, -1.2], [-0.78, 1.8], [0.78, 1.8]]) { const w = cyl(0.34, 0.34, 0.24, '#0b0f17', 12); w.rotation.z = Math.PI / 2; w.position.set(x, 0.34, z); g.add(w); }
  const lbl = { gign: ['GIGN', '#111827', '#e5e7eb'], press: ['INFO 24', '#dc2626', '#ffffff'], samu: ['SAMU', '#f97316', '#ffffff'], ps: ['POLICE', '#1e3a8a', '#ffffff'] }[kind];
  for (const sx of [-1, 1]) { const t = textSign(lbl[0], 2.6, 0.55, lbl[1], lbl[2]); t.position.set(sx * 0.82, 1.4, 0); t.rotation.y = sx * Math.PI / 2; g.add(t); }
  if (kind === 'samu' || kind === 'ps') g.add(at(box(1.62, 0.16, 3.62, kind === 'samu' ? '#facc15' : '#1d4ed8', 0, 0.02), 0, 0.75, 0));
  if (kind === 'press') {
    const dish = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 6, 0, Math.PI * 2, 0, Math.PI / 3), mat('#e5e7eb', { side: THREE.DoubleSide }));
    dish.position.set(0, 2.5, -0.6); dish.rotation.x = -0.9; g.add(dish);
    g.add(at(cyl(0.05, 0.05, 0.6, '#9ca3af', 6), 0, 2.2, -0.6));
  } else {
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.25), new THREE.MeshStandardMaterial({ color: '#3b82f6', emissive: '#3b82f6', emissiveIntensity: 2 }));
    blue.position.set(0, 2.07, 1.5); g.add(blue); g.userData.blue = blue;
  }
  return g;
}
/** Caméra d'épaule (à poser sur un perso « press »). */
export function tvCamera() {
  const g = new THREE.Group();
  g.add(cbox(0.25, 0.28, 0.6, '#1f2937', 0.04));
  const lens = cyl(0.1, 0.12, 0.2, '#0b0f17', 10); lens.rotation.x = Math.PI / 2; lens.position.z = 0.38; g.add(lens);
  const light = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.06), new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#fff', emissiveIntensity: 2 })); light.position.set(0, 0.2, 0.25); g.add(light);
  return g;
}

// ---------- optimisation : moins d'appels de dessin ----------
let vcMat: THREE.MeshStandardMaterial | null = null;
/** Fusionne, groupe par groupe, les petites pièces opaques d'un modèle en un seul mesh à couleurs de sommets.
 *  La hiérarchie (membres, tourelles, roues…) est conservée : les animations marchent toujours. */
export function optimize<T extends THREE.Object3D>(root: T): T {
  if (!vcMat) vcMat = weather(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 })) as THREE.MeshStandardMaterial;
  const keep = new Set<THREE.Object3D>();
  const grab = (v: unknown) => { if (v instanceof THREE.Object3D) keep.add(v); else if (Array.isArray(v)) v.forEach(grab); };
  root.traverse(o => Object.values(o.userData).forEach(grab));
  const groups: THREE.Object3D[] = []; root.traverse(o => { if (!(o as THREE.Mesh).isMesh || o.children.length) groups.push(o); });
  for (const grp of groups) {
    const parts = grp.children.filter(c => {
      const m = c as THREE.Mesh; if (!m.isMesh || c.children.length || keep.has(c) || !c.visible) return false;
      const mt = m.material as THREE.MeshStandardMaterial;
      return !Array.isArray(mt) && mt.isMeshStandardMaterial && !mt.map && !mt.transparent && mt.emissive.getHex() === 0 && mt.metalness < 0.3 && (m.geometry.attributes.position.count < 3000);
    }) as THREE.Mesh[];
    if (parts.length < 2) continue;
    const geos = parts.map(m => {
      m.updateMatrix();
      let g = m.geometry.clone().applyMatrix4(m.matrix); if (g.index) g = g.toNonIndexed();
      for (const n of Object.keys(g.attributes)) if (!['position', 'normal'].includes(n)) g.deleteAttribute(n);
      if (!g.attributes.normal) g.computeVertexNormals();
      const c = (m.material as THREE.MeshStandardMaterial).color, cnt = g.attributes.position.count, arr = new Float32Array(cnt * 3);
      for (let i = 0; i < cnt; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3)); g.morphAttributes = {};
      return g;
    });
    const merged = mergeGeometries(geos, false); if (!merged) continue;
    parts.forEach(m => grp.remove(m));
    const mesh = new THREE.Mesh(merged, vcMat); mesh.castShadow = true; mesh.receiveShadow = true;
    grp.add(mesh);
  }
  return root;
}

// ---------- business annexes (3 paliers chacun) ----------
function cartons(n: number, color = '#f8fafc', band = '#dc2626') {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const x = (i % 3) * 0.62 - 0.62, z = Math.floor(i / 3) % 2 * 0.5, y = Math.floor(i / 6) * 0.36;
    g.add(at(cbox(0.58, 0.34, 0.46, color, 0.03), x, y + 0.17, z));
    g.add(at(cbox(0.6, 0.08, 0.48, band, 0.01), x, y + 0.26, z));
  }
  return g;
}
function pallet(n: number, color?: string, band?: string) { const g = new THREE.Group(); g.add(box(1.9, 0.14, 1.1, '#a07a4f', 0, 0.02)); const c = cartons(n, color, band); c.position.set(0, 0.14, -0.25); g.add(c); return g; }
function crates(n: number, color = '#4d5d3a') {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) { const c = at(cbox(1.1, 0.42, 0.5, color, 0.04), (i % 2) * 1.2 - 0.6, 0.21 + Math.floor(i / 4) * 0.44, (Math.floor(i / 2) % 2) * 0.6); g.add(c); g.add(at(cbox(0.3, 0.05, 0.52, '#d4d4d8', 0.01), c.position.x, c.position.y + 0.22, c.position.z)); }
  return g;
}
function tires(n: number) {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) { const t = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.13, 6, 12), mat('#18181b')); t.rotation.x = Math.PI / 2; t.position.set(0, 0.13 + i * 0.24, 0); t.castShadow = true; g.add(t); }
  return g;
}
function rollDoor(w: number, h: number) { const g = new THREE.Group(); for (let i = 0; i < Math.floor(h / 0.25); i++) g.add(at(box(w, 0.2, 0.06, i % 2 ? '#9ca3af' : '#a1a1aa', i * 0.25, 0.01), 0, 0, 0)); return g; }
function neon(text: string, w: number, color: string) {
  const s = textSign(text, w, w * 0.18, '#0b0f17', color);
  (s.material as THREE.MeshStandardMaterial).emissive = new THREE.Color('#ffffff'); (s.material as THREE.MeshStandardMaterial).emissiveMap = (s.material as THREE.MeshStandardMaterial).map; (s.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.6;
  return s;
}
function warehouse(w: number, h: number, d: number, wall: string, roof: string, sign: string, signBg: string) {
  const g = new THREE.Group();
  g.add(box(w, h, d, wall, 0, 0.1));
  for (let i = 0; i < Math.floor(w / 0.5); i++) g.add(at(box(0.05, h - 0.1, d + 0.04, roof, 0.05, 0.01), -w / 2 + 0.25 + i * 0.5, 0, 0));
  // toit à deux pans en tôle
  for (const sz of [-1, 1]) { const p = box(w + 0.3, 0.12, d / 2 + 0.35, roof, 0, 0.02); p.position.set(0, h + 0.35, sz * (d / 4 + 0.05)); p.rotation.x = sz * 0.28; g.add(p); }
  g.add(at(box(w + 0.32, 0.14, 0.3, roof, 0, 0.03), 0, h + 0.58, 0));
  const door = rollDoor(Math.min(2.4, w * 0.4), Math.min(2.2, h * 0.75)); door.position.set(-w * 0.18, 0, d / 2 + 0.03); g.add(door);
  const t = textSign(sign, Math.min(w * 0.8, 4.6), 0.55, signBg, '#ffffff'); t.position.set(w * 0.15, h - 0.6, d / 2 + 0.06); g.add(t);
  return g;
}
export function bizModel(kind: 'clopes' | 'armes' | 'casse' | 'blanchi' | 'aero', tier: number) {
  if (kind === 'aero') return aeroModel(tier);
  const g = new THREE.Group();
  if (kind === 'clopes') {
    if (tier === 0) {
      g.add(shed(4.4, 3.2));
      g.add(at(pallet(9), -0.8, 0, 2.6)); g.add(at(pallet(6, '#f8fafc', '#1d4ed8'), 1.4, 0, 2.6));
      const v = utilityVan(); v.position.set(4.2, 0, 1); g.add(v);
    } else {
      const w = tier === 1 ? 7 : 10, d = tier === 1 ? 5 : 6.5;
      g.add(warehouse(w, tier === 1 ? 3 : 3.8, d, '#b45309', '#78716c', 'TABAC EXPORT', '#92400e'));
      for (let i = 0; i < (tier === 1 ? 2 : 4); i++) g.add(at(pallet(12, i % 2 ? '#f8fafc' : '#fde68a', i % 2 ? '#dc2626' : '#b45309'), -w / 2 + 1.2 + i * 2.2, 0, d / 2 + 1.6));
      if (tier === 2) { g.add(at(box(3.2, 0.9, 2.4, '#57534e', 0, 0.04), w / 2 + 1.8, 0, 1)); const v = utilityVan(); v.rotation.y = Math.PI; v.position.set(w / 2 + 1.8, 0, 3.2); g.add(v); const c = box(6, 2.6, 2.4, '#1d4ed8', 0, 0.04); c.position.set(-1, 0, -d / 2 - 1.8); g.add(c); }
    }
  } else if (kind === 'armes') {
    if (tier === 0) {
      g.add(box(5, 2.5, 2.4, '#3f4a2c', 0, 0.05));
      for (let i = 0; i < 12; i++) g.add(at(box(0.06, 2.4, 2.46, '#2f3a22', 0.05, 0.01), -2.3 + i * 0.42, 0, 0));
      g.add(at(crates(6), 0, 0, 2.1));
      g.add(at(sandbags(5), -2.5, 0, 3.4));
    } else {
      const w = tier === 1 ? 6.5 : 9.5, d = tier === 1 ? 5 : 6, h = tier === 1 ? 2.8 : 3.6;
      g.add(box(w, h, d, '#6b7280', 0, 0.12));
      g.add(box(w + 0.4, 0.4, d + 0.4, '#4b5563', h, 0.06));
      g.add(at(box(2.2, 2, 0.15, '#1f2937', 0, 0.03), -w * 0.2, 0, d / 2 + 0.05));
      const t = textSign('BALKAN IMPORT', Math.min(4.2, w * 0.6), 0.5, '#111827', '#d4d4d8'); t.position.set(w * 0.2, h - 0.6, d / 2 + 0.08); g.add(t);
      g.add(at(crates(8), 1.4, 0, d / 2 + 1.6));
      g.add(at(sandbags(6), -w / 2 + 1.4, 0, d / 2 + 2.6));
      if (tier === 2) {
        const net = new THREE.Mesh(new THREE.PlaneGeometry(w + 3, d + 3, 6, 6), mat('#4d5d3a', { side: THREE.DoubleSide, roughness: 1 }));
        const pos = net.geometry.attributes.position as THREE.BufferAttribute; for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(i * 1.7) * 0.25);
        net.rotation.x = -Math.PI / 2; net.position.y = h + 0.9; net.castShadow = true; g.add(net);
        for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(at(cyl(0.06, 0.06, h + 0.9, '#3f3f46', 6), x * (w / 2 + 1.3), (h + 0.9) / 2, z * (d / 2 + 1.3)));
        const tech = technical(); tech.position.set(w / 2 + 2.2, 0, 1.5); tech.rotation.y = Math.PI; g.add(tech);
      }
    }
  } else if (kind === 'casse') {
    const w = tier === 0 ? 7 : tier === 1 ? 9 : 11;
    const d = tier === 0 ? 6 : 7.5;
    for (const [x0, z0, x1, z1] of [[-w / 2, -d / 2, w / 2, -d / 2], [-w / 2, -d / 2, -w / 2, d / 2], [w / 2, -d / 2, w / 2, d / 2]]) {
      const len = Math.hypot(x1 - x0, z1 - z0); const f = box(len, 1.8, 0.08, '#a1a1aa', 0, 0.01); f.position.x = (x0 + x1) / 2; f.position.z = (z0 + z1) / 2; f.rotation.y = -Math.atan2(z1 - z0, x1 - x0); g.add(f);
    }
    const wr = (x: number, z: number, ry: number, y = 0) => { const k = wreck(); k.position.set(x, y + 0.02, z); k.rotation.y = ry; g.add(k); };
    wr(-1.5, 1.6, 0.4); wr(1.2, 1.9, -0.3);
    const tp = tires(4); tp.position.set(w / 2 - 1, 0, 2.6); g.add(tp); const tp2 = tires(3); tp2.position.set(w / 2 - 1.8, 0, 2.9); g.add(tp2);
    if (tier >= 1) {
      g.add(at(warehouse(4.6, 3, 3.4, '#9a3412', '#57534e', 'CASSE DU NORD', '#7c2d12'), -w / 2 + 2.8, 0, -d / 2 + 2));
      wr(2.5, -1.5, 0, 0); wr(2.5, -1.5, 0.2, 0.55); wr(2.5, -1.5, -0.1, 1.1);
      g.add(at(cyl(0.12, 0.15, 4.2, '#f59e0b', 8), 4.2, 2.1, -2.6)); g.add(at(box(3, 0.2, 0.2, '#f59e0b', 4.1, 0.02), 3, 0, -2.6));
    }
    if (tier === 2) {
      g.add(at(box(2.6, 1.6, 2, '#475569', 0, 0.06), -0.4, 0, -2.6)); g.add(at(box(2.4, 0.6, 1.8, '#1f2937', 1.6, 0.04), -0.4, 0, -2.6));
      const c = car('#dc2626'); c.position.set(-0.6, 0, 3.6); c.rotation.y = Math.PI / 2; g.add(c);
      wr(-3.5, 2.3, 1.2); wr(-3.5, 2.3, 1.1, 0.55);
    }
  } else {
    // blanchiment : laverie / kebab / bar à chicha
    const wid = tier === 0 ? 4.4 : tier === 1 ? 8 : 9;
    const h = tier === 2 ? 5.6 : 2.9;
    g.add(kBuilding(wid, h, 3.6, tier === 2 ? '#e7e5e4' : '#f5f5f4', { band: '#0ea5e9', windows: tier === 0 ? 1 : 3, door: true }));
    const shop = (x: number, label: string, col: string, awn: string) => {
      g.add(at(box(3.2, 1.3, 0.08, '#0f172a', 0.4, 0.01), x, 0, 1.85));
      for (let i = 0; i < 3; i++) { const wm = cyl(0.3, 0.3, 0.1, '#e5e7eb', 12); wm.rotation.x = Math.PI / 2; wm.position.set(x - 1 + i, 1.05, 1.9); g.add(wm); }
      const n = neon(label, 3, col); n.position.set(x, 2.25, 1.9); g.add(n);
      for (let i = 0; i < 6; i++) g.add(at(box(0.55, 0.06, 0.9, i % 2 ? awn : '#f8fafc', 1.85, 0.01), x - 1.4 + i * 0.56, 0, 2.3));
    };
    shop(tier === 0 ? 0 : -2, 'LAVERIE', '#38bdf8', '#0ea5e9');
    if (tier >= 1) {
      shop(2, 'KEBAB', '#fbbf24', '#dc2626');
      for (let i = 0; i < 2; i++) { g.add(at(cyl(0.35, 0.35, 0.05, '#f8fafc', 10), 1.2 + i * 1.6, 0.75, 3.3)); g.add(at(cyl(0.05, 0.05, 0.75, '#a1a1aa', 6), 1.2 + i * 1.6, 0.37, 3.3)); }
    }
    if (tier === 2) { const n = neon('CHICHA LOUNGE', 4.5, '#e879f9'); n.position.set(0, 4.4, 1.9); g.add(n); const c = suv(); c.position.set(-4.8, 0, 3.4); c.rotation.y = Math.PI / 2; g.add(c); }
  }
  return g;
}
/** Panneau « À VENDRE » sur un terrain libre. */
export function forSale() {
  const g = new THREE.Group();
  for (const x of [-0.9, 0.9]) g.add(at(box(0.12, 1.8, 0.12, '#57534e', 0, 0.02), x, 0, 0));
  const t = textSign('À VENDRE', 2.4, 0.9, '#dc2626', '#ffffff'); t.position.y = 1.7; g.add(t);
  return g;
}

// ---------- le repaire : maison -> villa -> manoir -> château ----------
function glassPanel(w: number, h: number) { return new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.06), windowMat()); }
function windowsRow(g: THREE.Group, w: number, y: number, z: number, n: number, ww = 0.8, hh = 1, face = 1) {
  for (let i = 0; i < n; i++) { const p = glassPanel(ww, hh); p.position.set(-w / 2 + (w / n) * (i + 0.5), y, z); if (face === 0) p.rotation.y = Math.PI / 2; g.add(p); }
}
function gable(w: number, d: number, h: number, color: string) {
  const g = new THREE.Group(), sl = Math.hypot(d / 2, h) + 0.3, a = Math.atan2(h, d / 2);
  for (const sz of [-1, 1]) { const p = box(w + 0.4, 0.16, sl, color, 0, 0.03); p.position.set(0, h / 2, sz * d / 4); p.rotation.x = sz * a; g.add(p); }
  return g;
}
function hedge(x0: number, z0: number, x1: number, z1: number, h = 1.1, color = '#166534') {
  const len = Math.hypot(x1 - x0, z1 - z0), b = box(len, h, 0.7, color, 0, 0.25); b.position.x = (x0 + x1) / 2; b.position.z = (z0 + z1) / 2; b.rotation.y = -Math.atan2(z1 - z0, x1 - x0); return b;
}
function crenelWall(x0: number, z0: number, x1: number, z1: number, h: number, color: string) {
  const g = new THREE.Group(), len = Math.hypot(x1 - x0, z1 - z0), ry = -Math.atan2(z1 - z0, x1 - x0);
  const w = box(len, h, 0.8, color, 0, 0.04); g.add(w);
  for (let t = -len / 2 + 0.3; t < len / 2; t += 1.1) g.add(at(box(0.6, 0.55, 0.85, color, 0, 0.03), t, h, 0));
  g.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2); g.rotation.y = ry; return g;
}
function tower(r: number, h: number, wall: string, roof: string) {
  const g = new THREE.Group();
  const c = cyl(r, r * 1.05, h, wall, 14); c.position.y = h / 2; g.add(c);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(r * 1.25, r * 2.2, 14), mat(roof)); cone.position.y = h + r * 1.1; cone.castShadow = true; g.add(cone);
  for (let i = 0; i < 3; i++) { const p = glassPanel(0.35, 0.7); const a = (i / 3) * Math.PI + Math.PI / 4; p.position.set(Math.sin(a) * (r + 0.02), h * 0.6, Math.cos(a) * (r + 0.02)); p.rotation.y = a; g.add(p); }
  return g;
}
/** Domaine complet (repère local : centre du domaine). x -17..17, z -11..13. Façade vers +z (côté caméra = jardin). */
export function villaModel(tier: number) {
  const g = new THREE.Group();
  const put = <T extends THREE.Object3D>(o: T, x: number, z: number, ry = 0) => { o.position.x += x; o.position.z += z; o.rotation.y = ry; g.add(o); return o; };
  if (tier === 0) {
    const h = kBuilding(6.5, 2.8, 5, '#e7d8c3', { windows: 3, band: '#a16207' }); put(h, 0, 2);
    put(at(gable(6.5, 5.2, 1.6, '#9a3412'), 0, 2.8, 0), 0, 2);
    put(box(0.6, 1.4, 0.6, '#78716c', 3.2, 0.04), 1.8, 1.2);
    put(box(2.4, 1.8, 2, '#a8a29e', 0, 0.06), -6, 4.5);                     // abri de jardin
    for (let x = -14; x <= 14; x += 1.2) { put(box(0.1, 0.8, 0.1, '#f8fafc', 0, 0.02), x, 12.4); put(box(0.1, 0.8, 0.1, '#f8fafc', 0, 0.02), x, -10.6); }
    for (const z of [-10.6, 12.4]) { put(box(28.4, 0.08, 0.06, '#f8fafc', 0.6, 0.01), 0, z); }
    put(car('#7c2d12'), 4.5, -5.5, 0.2);
  } else if (tier === 1) {
    put(box(11, 3.2, 7.5, '#f8fafc', 0, 0.06), 0, 2);
    put(box(11.4, 0.25, 7.9, '#d4d4d8', 3.2, 0.04), 0, 2);
    put(box(7, 2.8, 6, '#e7e5e4', 3.4, 0.06), 1.6, 1.5);
    put(box(7.4, 0.22, 6.4, '#d4d4d8', 6.2, 0.04), 1.6, 1.5);
    const gl = new THREE.Group(); windowsRow(gl, 9, 1.5, 5.8, 4, 1.8, 2.2); windowsRow(gl, 6, 4.8, 4.55, 3, 1.6, 1.8); put(gl, 0, 0);
    put(box(11, 0.15, 3, '#a8a29e', 0.2, 0.02), 0, 7.2);                       // terrasse
    for (const [x, z] of [[-14, -9], [14, -9], [-14, 11], [14, 11], [-12, 6], [12, 6]]) { const t = cyl(0.15, 0.2, 3.2, '#92400e', 6); t.position.y = 1.6; const leaves = box(2, 0.5, 2, '#15803d', 3, 0.25); const p = new THREE.Group(); p.add(t, leaves); put(p, x, z); }
    for (const [a, b, c, d] of [[-16.5, -10.5, 16.5, -10.5], [-16.5, 12.5, 16.5, 12.5], [-16.5, -10.5, -16.5, 12.5], [16.5, -10.5, 16.5, 12.5]]) { if (b === -10.5 && d === -10.5) { g.add(hedge(-16.5, -10.5, -1.5, -10.5)); g.add(hedge(3.5, -10.5, 16.5, -10.5)); } else g.add(hedge(a, b, c, d)); }
  } else if (tier === 2) {
    put(box(14, 5, 7, '#e7e5e4', 0, 0.06), 0, 2);
    put(at(gable(14, 7.2, 2.4, '#334155'), 0, 5, 0), 0, 2);
    for (const sx of [-1, 1]) { put(box(5, 4, 8, '#d6d3d1', 0, 0.06), sx * 9, 2.5); put(at(gable(5, 8.2, 2, '#334155'), 0, 4, 0), sx * 9, 2.5); }
    const gl = new THREE.Group(); windowsRow(gl, 13, 1.5, 5.55, 6, 0.9, 1.5); windowsRow(gl, 13, 3.6, 5.55, 6, 0.9, 1.3); put(gl, 0, 0);
    for (let i = 0; i < 4; i++) put(cyl(0.3, 0.3, 4.6, '#f5f5f4', 12), -2.4 + i * 1.6, 6.3).position.y = 2.3;
    put(box(6, 0.25, 1.4, '#f5f5f4', 4.6, 0.05), 0, 6.3);
    for (let i = 0; i < 3; i++) put(box(5 - i * 0.6, 0.2, 0.6, '#d6d3d1', i * 0.2, 0.02), 0, 7.4 - i * 0.5);
    for (const [a, b, c, d] of [[-16.5, 12.5, 16.5, 12.5], [-16.5, -10.5, -16.5, 12.5], [16.5, -10.5, 16.5, 12.5], [-16.5, -10.5, -1.5, -10.5], [3.5, -10.5, 16.5, -10.5]]) { const w = box(Math.hypot(c - a, d - b), 1.8, 0.6, '#a8a29e', 0, 0.05); w.position.x = (a + c) / 2; w.position.z = (b + d) / 2; w.rotation.y = -Math.atan2(d - b, c - a); g.add(w); }
    for (const x of [-1.8, 3.8]) { put(box(1, 2.6, 1, '#a8a29e', 0, 0.05), x, -10.5); put(cyl(0.35, 0.35, 0.5, '#d4a017', 10), x, -10.5).position.y = 2.85; }
  } else {
    put(box(11, 8, 9, '#a8a29e', 0, 0.06), 0, 1.5);
    put(crenelWall(-5.5, 6, 5.5, 6, 8, '#a8a29e'), 0, 0);
    for (const [x, z] of [[-5.5, -3], [5.5, -3], [-5.5, 6], [5.5, 6]]) put(tower(1.7, 10, '#9ca3af', '#1e3a8a'), x, z);
    const gl = new THREE.Group(); windowsRow(gl, 8, 2, 6.05, 4, 0.7, 1.5); windowsRow(gl, 8, 5, 6.05, 4, 0.7, 1.5); put(gl, 0, 0);
    put(box(2.4, 3, 0.3, '#422006', 0, 0.04), 0, 6.1);
    const fl = new THREE.Group(); fl.add(at(cyl(0.06, 0.06, 3, '#52525b', 6), 0, 1.5, 0)); fl.add(at(box(1.4, 0.9, 0.04, '#7f1d1d', 0, 0.01), 0.7, 2.3, 0)); put(fl, 0, -1.5).position.y = 8;
    for (const [a, b, c, d] of [[-16.5, 12.5, 16.5, 12.5], [-16.5, -10.5, -16.5, 12.5], [16.5, -10.5, 16.5, 12.5], [-16.5, -10.5, -2, -10.5], [4, -10.5, 16.5, -10.5]]) g.add(crenelWall(a, b, c, d, 2.6, '#a8a29e'));
    for (const [x, z] of [[-16.5, -10.5], [16.5, -10.5], [-16.5, 12.5], [16.5, 12.5]]) put(tower(1.3, 5, '#9ca3af', '#1e3a8a'), x, z);
    for (const x of [-2, 4]) put(tower(1, 4.2, '#9ca3af', '#1e3a8a'), x, -10.5);
  }
  return g;
}
// ---------- folies du boss ----------
export function supercar(color: string) {
  const g = new THREE.Group();
  g.add(box(1.7, 0.42, 3.6, color, 0.22, 0.2));
  g.add(at(box(1.3, 0.38, 1.5, '#0b0f17', 0, 0.2), 0, 0.62, -0.2));
  g.add(at(box(1.5, 0.06, 0.5, color, 0, 0.02), 0, 0.82, -1.6));            // aileron
  for (const [x, z] of [[-0.82, -1.15], [0.82, -1.15], [-0.82, 1.2], [0.82, 1.2]]) { const w = cyl(0.33, 0.33, 0.28, '#111827', 14); w.rotation.z = Math.PI / 2; w.position.set(x, 0.33, z); g.add(w); }
  return g;
}
export function goldFountain() {
  const g = new THREE.Group(), gold = '#d4a017';
  g.add(cyl(2.2, 2.4, 0.5, '#e7e5e4', 24)); g.children[0].position.y = 0.25;
  const water = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 0.06, 24), mat('#38bdf8', { roughness: 0.05, metalness: 0.2 })); water.position.y = 0.48; g.add(water);
  g.add(at(cyl(0.3, 0.45, 1.6, gold, 12), 0, 1.2, 0)); g.add(at(cyl(1, 0.8, 0.25, gold, 16), 0, 2, 0)); g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), mat(gold, { metalness: 0.8, roughness: 0.25 })), 0, 2.45, 0));
  g.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh && (m.material as THREE.MeshStandardMaterial).color?.getHexString() === 'd4a017') m.material = mat('#f5c518', { metalness: 0.35, roughness: 0.3, emissive: '#7a5a00', emissiveIntensity: 0.35 }); });
  g.userData.water = water; return g;
}
export function pool() {
  const g = new THREE.Group();
  g.add(box(9, 0.3, 5.4, '#e7e5e4', 0, 0.05));
  const water = new THREE.Mesh(new THREE.BoxGeometry(8, 0.1, 4.4), new THREE.MeshStandardMaterial({ color: '#0ea5e9', roughness: 0.05, metalness: 0.1, emissive: '#0369a1', emissiveIntensity: 0.25 }));
  water.position.y = 0.3; g.add(water);
  for (let i = 0; i < 4; i++) { const l = new THREE.Group(); l.add(box(0.7, 0.2, 1.8, '#f8fafc', 0.25, 0.05)); l.add(at(box(0.7, 0.5, 0.15, '#f8fafc', 0, 0.04), 0, 0.45, -0.85)); l.position.set(-3.3 + i * 2.2, 0, 3.6); g.add(l); }
  const um = new THREE.Group(); um.add(at(cyl(0.05, 0.05, 2.2, '#a1a1aa', 6), 0, 1.1, 0)); um.add(at(new THREE.Mesh(new THREE.ConeGeometry(1.3, 0.5, 10), mat('#f97316')), 0, 2.3, 0)); um.position.set(4.6, 0, 3.4); g.add(um);
  g.userData.water = water; return g;
}
export function goldStatue() {
  const c = character('civil'); c.scale.setScalar(3);
  const gold = mat('#f5c518', { metalness: 0.35, roughness: 0.3, emissive: '#7a5a00', emissiveIntensity: 0.35 });
  c.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) m.material = gold; });
  c.userData.armR.rotation.x = -2.6; c.userData.armR.rotation.z = -0.2;   // le bras levé
  const g = new THREE.Group(); g.add(box(2, 1, 2, '#e7e5e4', 0, 0.06)); c.position.y = 1; g.add(c);
  return g;
}
export function helicopter() {
  const g = new THREE.Group();
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 0.1, 28), mat('#334155')); pad.position.y = 0.05; pad.receiveShadow = true; g.add(pad);
  g.add(at(box(0.4, 0.02, 2.2, '#f8fafc', 0.1, 0), -0.6, 0, 0)); g.add(at(box(0.4, 0.02, 2.2, '#f8fafc', 0.1, 0), 0.6, 0, 0)); g.add(at(box(0.9, 0.02, 0.4, '#f8fafc', 0.1, 0), 0, 0, 0));
  const body = new THREE.Group(); body.position.y = 0.5; g.add(body);
  body.add(at(box(1.5, 1.4, 2.6, '#111827', 0.2, 0.5), 0, 0, 0)); body.add(at(box(1.3, 0.8, 0.8, '#7dd3fc', 0.7, 0.3), 0, 0, 1.2));
  body.add(at(box(0.3, 0.35, 2.8, '#111827', 0.9, 0.1), 0, 0, -2.4)); body.add(at(box(0.08, 0.9, 0.5, '#111827', 0.9, 0.04), 0, 0, -3.7));
  for (const x of [-0.7, 0.7]) body.add(at(box(0.08, 0.08, 2.6, '#9ca3af', 0, 0.02), x, 0, 0));
  const rotor = new THREE.Group(); rotor.position.y = 1.95; body.add(rotor);
  for (let i = 0; i < 4; i++) { const b = box(5.2, 0.04, 0.22, '#1f2937', 0, 0.01); b.rotation.y = (i * Math.PI) / 4; rotor.add(b); }
  g.userData = { rotor, body };
  return g;
}
/** Maison de campagne (4 styles). */
export function countryHouse(i: number) {
  const g = new THREE.Group();
  const st = [
    { wall: '#e9d8b4', roof: '#c2410c', w: 8, d: 5.5, h: 3 },     // mas
    { wall: '#f5f5f4', roof: '#57534e', w: 9, d: 5, h: 3.2 },     // ferme
    { wall: '#92400e', roof: '#3f3f46', w: 7, d: 6, h: 3.4 },     // chalet
    { wall: '#e7e5e4', roof: '#7c2d12', w: 12, d: 7, h: 4 },      // domaine
  ][i % 4];
  g.add(kBuilding(st.w, st.h, st.d, st.wall, { windows: 3 }));
  g.add(at(gable(st.w, st.d + 0.2, 1.8, st.roof), 0, st.h, 0));
  g.add(at(box(0.7, 1.6, 0.7, '#78716c', st.h + 0.3, 0.04), st.w / 3, 0, -0.8));
  if (i === 1) { g.add(at(box(6, 4, 5, '#7f1d1d', 0, 0.05), -9, 0, -1)); g.add(at(gable(6, 5.2, 1.6, '#57534e'), -9, 4, -1)); for (let k = 0; k < 5; k++) g.add(at(cyl(0.6, 0.6, 1.1, '#fde68a', 12), -6 + k * 1.4, 0.55, 5)).rotation.set(0, 0, 0); }
  if (i === 3) { for (let r = 0; r < 4; r++) for (let k = 0; k < 8; k++) g.add(at(box(0.5, 0.9, 0.5, '#15803d', 0, 0.2), -12 + k * 1.6, 0, 7 + r * 1.8)); const p = pool(); p.position.set(9, 0, 1); p.scale.setScalar(0.7); g.add(p); }
  if (i === 2) { for (let k = 0; k < 4; k++) g.add(at(box(0.5, 0.5, 2.2, '#78350f', 0, 0.05), 5 + (k % 2) * 0.6, k * 0.5, 2)); }
  if (i === 0) { for (let k = 0; k < 6; k++) g.add(at(box(0.9, 0.7, 0.9, '#a78bfa', 0, 0.35), -6 + k * 1.2, 0, 5)); }
  // haie autour du jardin
  const W = st.w / 2 + 5, D = st.d / 2 + 5;
  for (const [a, b, c, d] of [[-W, -D, W, -D], [-W, D, -1, D], [2, D, W, D], [-W, -D, -W, D], [W, -D, W, D]]) g.add(hedge(a, b, c, d, 0.9, '#3f6212'));
  return g;
}
/** Champ cultivé (blé, colza, labour). */
export function field(w: number, d: number, kind: number) {
  const g = new THREE.Group(), cols = [['#e6c25a', '#d9b24a'], ['#facc15', '#eab308'], ['#8b5a2b', '#7a4b22'], ['#65a30d', '#4d7c0f']][kind % 4];
  g.add(box(w, 0.08, d, cols[0], 0, 0));
  for (let x = -w / 2 + 0.6; x < w / 2; x += 1.2) g.add(at(box(0.5, 0.12, d - 0.4, cols[1], 0, 0), x, 0.02, 0));
  return g;
}

// ---------- aérodrome ----------
/** Repère local : centre (-93, -23). Piste est-ouest en z = -9 (monde -32), de x -33 à +31. */
export function aeroModel(tier: number) {
  const g = new THREE.Group();
  const rwC = tier === 0 ? '#a8a29e' : '#3f434e';
  g.add(at(box(64, 0.06, 6, rwC, 0, 0), -1, 0, -9));
  if (tier >= 1) {
    for (let x = -28; x < 28; x += 4) g.add(at(box(2, 0.02, 0.25, '#f8fafc', 0.06, 0), x, 0, -9));
    for (const ex of [-31, 29]) for (let k = 0; k < 6; k++) g.add(at(box(0.25, 0.02, 1.6, '#f8fafc', 0.06, 0), ex + (ex < 0 ? 1 : -1) * 0, 0, -11.2 + k * 0.9));
    for (let x = -32; x <= 30; x += 4) for (const z of [-12.2, -5.8]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.18), new THREE.MeshStandardMaterial({ color: '#fde68a', emissive: '#fbbf24', emissiveIntensity: 1.5 })); l.position.set(x, 0.1, z); g.add(l); }
  }
  g.add(at(box(6, 0.05, 9, rwC, 0, 0), 8, 0, -1.5));            // taxiway
  g.add(at(box(22, 0.05, 9, tier === 0 ? '#b8b2a7' : '#6b7280', 0, 0), 4, 0, 6.5));   // aire de stationnement
  const hw = tier === 0 ? 8 : 11;
  g.add(at(warehouse(hw, tier === 0 ? 3.5 : 5, 8, '#64748b', '#475569', 'AÉRO-CLUB', '#0c4a6e'), -10, 0, 7));
  if (tier >= 2) g.add(at(warehouse(9, 4.5, 7.5, '#57534e', '#44403c', 'FRET', '#7c2d12'), 20, 0, 9));
  // tour de contrôle
  if (tier >= 1) {
    const t = new THREE.Group();
    t.add(box(2.4, 7, 2.4, '#e7e5e4', 0, 0.08));
    t.add(at(box(3.6, 1.6, 3.6, '#0f172a', 7, 0.08), 0, 0, 0));
    const gl = glassPanel(3.3, 1.1); gl.position.set(0, 7.8, 1.82); t.add(gl);
    t.add(at(box(4, 0.3, 4, '#d4d4d8', 8.6, 0.04), 0, 0, 0));
    t.add(at(cyl(0.05, 0.05, 2, '#9ca3af', 6), 1.3, 9.9, 1.3));
    t.position.set(30, 0, 3); g.add(t);
  }
  if (tier >= 2) {
    for (let i = 0; i < 2; i++) { const c = cyl(1.3, 1.3, 2.6, '#f8fafc', 16); c.rotation.z = Math.PI / 2; c.position.set(-26 + i * 3.4, 1.35, 10); g.add(c); }
    const rad = new THREE.Group(); rad.add(at(cyl(0.12, 0.12, 4, '#9ca3af', 6), 0, 2, 0)); rad.add(at(box(2.6, 1, 0.2, '#e5e7eb', 3.8, 0.05), 0, 0, 0)); rad.position.set(25, 0, 12); g.add(rad); g.userData.radar = rad;
  }
  // manche à air
  const ws = new THREE.Group(); ws.add(at(cyl(0.05, 0.05, 3, '#9ca3af', 6), 0, 1.5, 0)); const sock = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.6, 8, 1, true), mat('#f97316', { side: THREE.DoubleSide })); sock.rotation.z = Math.PI / 2; sock.position.set(0.8, 2.9, 0); ws.add(sock); ws.position.set(-30, 0, -2); g.add(ws);
  return g;
}
/** Avion cargo (bimoteur à hélices). Nez vers +z. */
export function cargoPlane() {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const f = cyl(0.95, 0.95, 9, '#f1f5f9', 14); f.rotation.x = Math.PI / 2; f.position.y = 1.8; body.add(f);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.95, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat('#f1f5f9')); nose.rotation.x = Math.PI / 2; nose.position.set(0, 1.8, 4.5); body.add(nose);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.95, 2.6, 14), mat('#f1f5f9')); tail.rotation.x = -Math.PI / 2; tail.position.set(0, 2.1, -5.8); body.add(tail);
  body.add(at(box(0.6, 0.4, 1.2, '#0f172a', 2.3, 0.1), 0, 0, 4.4));
  body.add(at(box(16, 0.18, 2.2, '#e2e8f0', 2.4, 0.06), 0, 0, 0.6));
  body.add(at(box(5.4, 0.12, 1.4, '#e2e8f0', 2.6, 0.04), 0, 0, -6.3));
  body.add(at(box(0.15, 2.2, 1.6, '#1d4ed8', 2.6, 0.04), 0, 0, -6.4));
  body.add(at(box(9, 0.2, 2.25, '#1d4ed8', 1.5, 0.02), 0, 0, 0)).visible = true;
  const props: THREE.Group[] = [];
  for (const x of [-3.6, 3.6]) {
    const e = cyl(0.42, 0.42, 2.2, '#cbd5e1', 12); e.rotation.x = Math.PI / 2; e.position.set(x, 2.2, 1.6); body.add(e);
    const p = new THREE.Group(); p.position.set(x, 2.2, 2.75); for (let i = 0; i < 3; i++) { const b = box(0.15, 1.9, 0.06, '#111827', -0.95, 0.02); b.rotation.z = (i * Math.PI * 2) / 3; p.add(b); } body.add(p); props.push(p);
  }
  for (const [x, z] of [[-1.2, 0.4], [1.2, 0.4], [0, 3.6]]) body.add(at(cyl(0.3, 0.3, 0.25, '#111827', 10), x, 0.35, z)).visible = true;
  g.userData = { props, body };
  return g;
}
// ---------- véhicules et détails de la base ----------
/** Camion bâché (armes : kaki, clopes : blanc, casse : dépanneuse avec épave). */
export function lorry(kind: 'armes' | 'clopes' | 'casse') {
  const g = new THREE.Group();
  const cab = kind === 'armes' ? '#3f4a2c' : kind === 'clopes' ? '#f8fafc' : '#f59e0b';
  g.add(at(box(1.7, 1.3, 1.5, cab, 0.4, 0.15), 0, 0, 1.9));
  g.add(at(box(1.5, 0.5, 0.06, '#0f172a', 1.15, 0.03), 0, 0, 2.66));
  g.add(at(box(1.8, 0.2, 4.4, '#27272a', 0.35, 0.03), 0, 0, -0.3));
  const cargo = new THREE.Group(); g.add(cargo);
  if (kind === 'casse') {
    g.add(at(box(1.8, 0.15, 3, '#52525b', 0.6, 0.02), 0, 0, -1));
    g.add(at(box(0.2, 1.2, 0.2, '#f59e0b', 0.7, 0.02), 0, 0, 0.6));
    const w = wreck(); w.scale.setScalar(0.85); w.position.set(0, 0.75, -1.1); w.rotation.z = 0; cargo.add(w);
  } else {
    g.add(at(box(1.8, 1.7, 3.2, kind === 'armes' ? '#4d5d3a' : '#e5e7eb', 0.55, 0.12), 0, 0, -0.9));
    if (kind === 'clopes') { const t = textSign('TRANSPORTS EXPRESS', 3, 0.4, '#e5e7eb', '#1d4ed8'); t.position.set(0.92, 1.5, -0.9); t.rotation.y = Math.PI / 2; g.add(t); }
    for (let i = 0; i < 4; i++) cargo.add(at(cbox(0.6, 0.45, 0.6, kind === 'armes' ? '#4d5d3a' : '#fde68a', 0.04), (i % 2 - 0.5) * 0.7, 0.85, -1.5 + Math.floor(i / 2) * 0.8));
  }
  for (const [x, z] of [[-0.88, -1.6], [0.88, -1.6], [-0.88, -0.5], [0.88, -0.5], [-0.88, 1.9], [0.88, 1.9]]) { const w = cyl(0.36, 0.36, 0.26, '#111827', 12); w.rotation.z = Math.PI / 2; w.position.set(x, 0.36, z); g.add(w); }
  g.userData = { cargo };
  return g;
}
/** Chien de garde (berger). */
export function dog() {
  const g = new THREE.Group(), c = '#78350f';
  const body = at(cbox(0.3, 0.32, 0.8, c, 0.08), 0, 0.5, 0); g.add(body);
  const head = new THREE.Group(); head.position.set(0, 0.7, 0.45); head.add(cbox(0.24, 0.24, 0.3, c, 0.06)); head.add(at(cbox(0.14, 0.12, 0.18, '#111827', 0.03), 0, -0.04, 0.2)); head.add(at(cbox(0.06, 0.12, 0.04, '#111827', 0.01), -0.08, 0.16, -0.02)); head.add(at(cbox(0.06, 0.12, 0.04, '#111827', 0.01), 0.08, 0.16, -0.02)); g.add(head);
  const legs: THREE.Mesh[] = [];
  for (const [x, z] of [[-0.1, 0.28], [0.1, 0.28], [-0.1, -0.28], [0.1, -0.28]]) { const l = cbox(0.08, 0.36, 0.08, '#451a03', 0.02); l.geometry = l.geometry.clone(); l.geometry.translate(0, -0.18, 0); l.position.set(x, 0.4, z); g.add(l); legs.push(l); }
  const tail = at(cbox(0.06, 0.06, 0.3, c, 0.02), 0, 0.62, -0.5); tail.rotation.x = 0.6; g.add(tail);
  g.userData = { legs, tail, head };
  return g;
}
/** Caméra de surveillance sur poteau, LED rouge. */
export function camPole() {
  const g = new THREE.Group();
  g.add(at(cyl(0.06, 0.08, 3.2, '#475569', 6), 0, 1.6, 0));
  const cam = new THREE.Group(); cam.position.y = 3.1; cam.add(cbox(0.22, 0.2, 0.5, '#e5e7eb', 0.04));
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), new THREE.MeshStandardMaterial({ color: '#ef4444', emissive: '#ef4444', emissiveIntensity: 2 })); led.position.set(0, 0.05, 0.26); cam.add(led);
  g.add(cam); g.userData = { cam, led };
  return g;
}
/** Groupe électrogène + bouteilles de gaz. */
export function generator() {
  const g = new THREE.Group();
  g.add(box(2.2, 1.3, 1.2, '#ca8a04', 0, 0.08)); g.add(at(box(2, 0.3, 1, '#a16207', 1.3, 0.04), 0, 0, 0));
  g.add(at(cyl(0.08, 0.08, 0.8, '#3f3f46', 6), 0.8, 1.7, -0.3));
  for (let i = 0; i < 4; i++) g.add(at(cyl(0.18, 0.18, 1, i % 2 ? '#dc2626' : '#f97316', 10), -1.6 + (i % 2) * 0.4, 0.5, 0.8 + Math.floor(i / 2) * 0.4));
  g.userData.pipe = new THREE.Vector3(0.8, 2.1, -0.3);
  return g;
}
export function bins() {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) { g.add(at(box(0.8, 1, 0.8, ['#166534', '#1d4ed8', '#a16207'][i], 0, 0.06), i * 0.95, 0, 0)); g.add(at(box(0.84, 0.08, 0.84, '#1f2937', 1, 0.02), i * 0.95, 0, 0)); }
  for (let i = 0; i < 3; i++) g.add(at(cbox(0.4, 0.35, 0.35, '#111827', 0.15), 3 + (i % 2) * 0.4, 0.18, (i - 1) * 0.35));   // sacs poubelle
  return g;
}
/** Base d'un autre joueur, vue de l'extérieur : plus il est gros, plus il y a de bâtiments, de miradors et une belle demeure. */
export function otherBase(tier: number, villaT: number, towers: number, cartel: string) {
  const g = new THREE.Group();
  const W = 30, D = 22;
  g.add(box(W, 0.2, D, '#c4bdb1', 0, 0.06));
  for (const [x0, z0, x1, z1] of [[-W / 2, -D / 2, W / 2, -D / 2], [-W / 2, -D / 2, -W / 2, D / 2], [W / 2, -D / 2, W / 2, D / 2], [-W / 2, D / 2, -3, D / 2], [3, D / 2, W / 2, D / 2]]) {
    const len = Math.hypot(x1 - x0, z1 - z0), ry = -Math.atan2(z1 - z0, x1 - x0);
    for (const y of [0.9, 1.6]) { const r = box(len, 0.08, 0.08, '#334155', y, 0.02); r.position.x = (x0 + x1) / 2; r.position.z = (z0 + z1) / 2; r.rotation.y = ry; g.add(r); }
    for (let t = 0; t <= len; t += 2) g.add(at(box(0.16, 1.7, 0.16, '#334155', 0.2, 0.04), x0 + ((x1 - x0) * t) / len, 0, z0 + ((z1 - z0) * t) / len));
  }
  // bâtiments selon la taille du cartel
  g.add(at(shed(5, 3.6), -9, 0.2, -5));
  g.add(at(warehouse(7, 3, 5, '#7c2d12', '#57534e', 'TRANSPORTS', '#431407'), 4, 0.2, -5.5));
  if (tier >= 1) { g.add(at(warehouse(8, 3.6, 6, '#e5e7eb', '#64748b', 'LABO', '#0f172a'), -7, 0.2, 4)); for (let i = 0; i < 3; i++) g.add(at(utilityVan(), 7 + i * 2.3, 0.2, 5)); }
  if (tier >= 2) { const s = sandbags(8); s.position.set(-1, 0.2, 9.2); g.add(s); g.add(at(technical(), 11, 0.2, -1)); }
  if (tier >= 3) g.add(at(armored(), 11, 0.2, 2.6));
  for (let i = 0; i < Math.min(4, towers); i++) { const t = watchtower(); const c = [[-W / 2 + 1.2, -D / 2 + 1.2], [W / 2 - 1.2, -D / 2 + 1.2], [-W / 2 + 1.2, D / 2 - 1.2], [W / 2 - 1.2, D / 2 - 1.2]][i]; t.position.set(c[0], 0.2, c[1]); g.add(t); }
  // sa demeure, à côté de la base
  const v = villaModel(villaT); v.scale.setScalar(0.5); v.position.set(0, 0.05, D / 2 + 9); g.add(v);
  // drapeau du cartel
  const pole = cyl(0.07, 0.07, 6, '#52525b', 6); pole.position.set(0, 3, D / 2 - 0.5); g.add(pole);
  const flag = textSign(cartel.toUpperCase(), 3, 1, '#7e22ce', '#ffffff'); flag.position.set(1.6, 5.3, D / 2 - 0.5); g.add(flag);
  return g;
}
