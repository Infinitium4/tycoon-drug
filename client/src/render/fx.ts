// Effets visuels : particules (un seul draw call), halos lumineux, cycle jour / nuit.
import * as THREE from 'three';

type CubeKind = 'spark' | 'money' | 'confetti' | 'debris';
type SoftKind = 'dust' | 'smoke' | 'blacksmoke' | 'steam' | 'exhaust' | 'fire' | 'blast' | 'blood' | 'water';
export type Kind = CubeKind | SoftKind;
interface P { alive: boolean; x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; size: number; grow: number; grav: number; spin: number; color: THREE.Color }

const MAX = 400;
const COLORS: Record<CubeKind, string[]> = {
  spark: ['#fde047', '#facc15', '#fef08a', '#ffffff'],
  money: ['#4ade80', '#22c55e', '#86efac'],
  confetti: ['#f43f5e', '#facc15', '#22c55e', '#3b82f6', '#a855f7', '#f97316'],
  debris: ['#334155', '#1f2937', '#64748b', '#f8fafc'],
};

// ---- particules douces (sprites ronds, transparents) : fumée, feu, sang, eau, poussière ----
interface SoftDef { add: boolean; c0: string[]; c1: string; a: number; s0: number; s1: number; life: [number, number]; grav: number; spd: number; up: number; die?: boolean }
const SOFT: Record<SoftKind, SoftDef> = {
  dust:       { add: false, c0: ['#d6cfc2', '#cbbfa9'], c1: '#e7e2d8', a: 0.45, s0: 0.35, s1: 1.4, life: [0.6, 1.0], grav: 0.3, spd: 1.2, up: 0.5 },
  smoke:      { add: false, c0: ['#e5e7eb', '#d1d5db'], c1: '#9ca3af', a: 0.5, s0: 0.6, s1: 2.6, life: [1.8, 2.6], grav: 0, spd: 0.3, up: 1.1 },
  blacksmoke: { add: false, c0: ['#3f3f46', '#27272a', '#52525b'], c1: '#6b7280', a: 0.55, s0: 0.7, s1: 3.4, life: [2.2, 3.2], grav: 0, spd: 0.35, up: 1.5 },
  steam:      { add: false, c0: ['#ffffff', '#f1f5f9'], c1: '#e2e8f0', a: 0.45, s0: 0.5, s1: 2.4, life: [1.2, 1.8], grav: 0, spd: 0.3, up: 1.7 },
  exhaust:    { add: false, c0: ['#9ca3af'], c1: '#d4d4d8', a: 0.3, s0: 0.2, s1: 0.8, life: [0.7, 1.0], grav: 0, spd: 0.2, up: 0.5 },
  fire:       { add: true, c0: ['#fff7c2', '#ffd27a', '#ffe08a'], c1: '#c2410c', a: 0.9, s0: 0.85, s1: 0.25, life: [0.45, 0.85], grav: -1.5, spd: 0.5, up: 1.6 },
  blast:      { add: true, c0: ['#fff3c4'], c1: '#ff7a1a', a: 1, s0: 1.6, s1: 6, life: [0.25, 0.35], grav: 0, spd: 0, up: 0 },
  blood:      { add: false, c0: ['#9b1111', '#7a0d0d'], c1: '#5c0909', a: 1, s0: 0.13, s1: 0.1, life: [0.7, 1.0], grav: 9, spd: 1.4, up: 2, die: true },
  water:      { add: false, c0: ['#e0f2fe', '#bfdbfe'], c1: '#93c5fd', a: 0.75, s0: 0.14, s1: 0.45, life: [0.6, 0.8], grav: 9, spd: 0.3, up: 0, die: true },
};
let puffTex: THREE.Texture | null = null;
function puff() {
  if (puffTex) return puffTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const blob = (x: number, y: number, r: number, a: number) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); };
  blob(32, 32, 30, 0.9); blob(24, 28, 16, 0.5); blob(40, 30, 15, 0.5); blob(32, 40, 14, 0.4);
  puffTex = new THREE.CanvasTexture(c); return puffTex;
}
class SoftLayer {
  pts: THREE.Points;
  private N = 1200; private cur = 0;
  private pos: Float32Array; private col: Float32Array; private size: Float32Array;
  private v: Float32Array; private life: Float32Array; private max: Float32Array; private def: (SoftDef | null)[];
  private c0: THREE.Color[]; private c1: THREE.Color[]; private tmp = new THREE.Color();
  uni = { uScale: { value: 30 }, uTex: { value: puff() } };
  constructor(scene: THREE.Scene, additive: boolean) {
    const N = this.N;
    this.pos = new Float32Array(N * 3); this.col = new Float32Array(N * 4); this.size = new Float32Array(N);
    this.v = new Float32Array(N * 3); this.life = new Float32Array(N); this.max = new Float32Array(N).fill(1); this.def = new Array(N).fill(null);
    this.c0 = Array.from({ length: N }, () => new THREE.Color()); this.c1 = Array.from({ length: N }, () => new THREE.Color());
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aCol', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uni, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: `attribute float aSize; attribute vec4 aCol; uniform float uScale; varying vec4 vCol;
        void main(){ vCol = aCol; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uScale; }`,
      fragmentShader: `uniform sampler2D uTex; varying vec4 vCol;
        void main(){ float a = texture2D(uTex, gl_PointCoord).a * vCol.a; if (a < 0.01) discard; gl_FragColor = vec4(vCol.rgb, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        }`,
    });
    this.pts = new THREE.Points(geo, mat); this.pts.frustumCulled = false; this.pts.renderOrder = additive ? 3 : 2;
    scene.add(this.pts);
  }
  emit(d: SoftDef, x: number, y: number, z: number, n: number, dir?: { x: number; y: number; z: number }) {
    const r = Math.random;
    for (let k = 0; k < n; k++) {
      const i = this.cur; this.cur = (this.cur + 1) % this.N;
      const a = r() * Math.PI * 2, sp = d.spd * (0.4 + r() * 0.8);
      this.pos[i * 3] = x + (r() - 0.5) * 0.2; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z + (r() - 0.5) * 0.2;
      this.v[i * 3] = Math.cos(a) * sp + (dir?.x ?? 0) * (0.85 + r() * 0.3);
      this.v[i * 3 + 1] = d.up * (0.7 + r() * 0.6) + (dir?.y ?? 0) * (0.85 + r() * 0.3);
      this.v[i * 3 + 2] = Math.sin(a) * sp + (dir?.z ?? 0) * (0.85 + r() * 0.3);
      this.max[i] = this.life[i] = d.life[0] + r() * (d.life[1] - d.life[0]);
      this.def[i] = d; this.c0[i].set(d.c0[Math.floor(r() * d.c0.length)]); this.c1[i].set(d.c1);
    }
  }
  update(dt: number) {
    for (let i = 0; i < this.N; i++) {
      const d = this.def[i];
      if (!d) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.def[i] = null; this.col[i * 4 + 3] = 0; this.size[i] = 0; continue; }
      this.v[i * 3 + 1] -= d.grav * dt;
      if (d.grav <= 0) { this.v[i * 3] *= 1 - dt * 0.8; this.v[i * 3 + 2] *= 1 - dt * 0.8; this.v[i * 3 + 1] *= 1 - dt * 0.3; }
      this.pos[i * 3] += this.v[i * 3] * dt; this.pos[i * 3 + 1] += this.v[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.v[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < 0.27 && d.grav > 0) { if (d.die) { this.life[i] = 0.001; } this.pos[i * 3 + 1] = 0.27; this.v[i * 3 + 1] = 0; }
      const t = 1 - this.life[i] / this.max[i];
      this.tmp.copy(this.c0[i]).lerp(this.c1[i], t);
      this.col[i * 4] = this.tmp.r; this.col[i * 4 + 1] = this.tmp.g; this.col[i * 4 + 2] = this.tmp.b;
      this.col[i * 4 + 3] = d.a * Math.min(1, t * 8) * (d.die ? 1 - t * t * t : 1 - t);
      this.size[i] = d.s0 + (d.s1 - d.s0) * Math.sqrt(t);
    }
    const g = this.pts.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.aCol.needsUpdate = true; g.attributes.aSize.needsUpdate = true;
  }
}

export class Particles {
  mesh: THREE.InstancedMesh;
  private ps: P[] = [];
  private dummy = new THREE.Object3D();
  private cursor = 0;
  private soft: SoftLayer; private glowL: SoftLayer;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.9 });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < MAX; i++) {
      this.ps.push({ alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, size: 0, grow: 0, grav: 0, spin: 0, color: new THREE.Color() });
      this.mesh.setColorAt(i, new THREE.Color('#fff'));
      this.dummy.scale.setScalar(0); this.dummy.updateMatrix(); this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    scene.add(this.mesh);
    this.soft = new SoftLayer(scene, false); this.glowL = new SoftLayer(scene, true);
  }
  /** Pixels par unité de monde (caméra orthographique) : à appeler à chaque rendu. */
  setScale(px: number) { this.soft.uni.uScale.value = px; this.glowL.uni.uScale.value = px; }

  emit(kind: Kind, x: number, y: number, z: number, n = 1, dir?: { x: number; y: number; z: number }) {
    const sd = SOFT[kind as SoftKind];
    if (sd) { (sd.add ? this.glowL : this.soft).emit(sd, x, y, z, n, dir); return; }
    const cols = COLORS[kind as CubeKind];
    for (let k = 0; k < n; k++) {
      const p = this.ps[this.cursor]; this.cursor = (this.cursor + 1) % MAX;
      const r = Math.random, a = r() * Math.PI * 2;
      p.alive = true; p.x = x; p.y = y; p.z = z;
      p.color.set(cols[Math.floor(r() * cols.length)]);
      p.spin = (r() - 0.5) * 8;
      switch (kind) {
        case 'spark':    p.vx = Math.cos(a) * (2 + r() * 2); p.vz = Math.sin(a) * (2 + r() * 2); p.vy = 3 + r() * 3; p.max = 0.6 + r() * 0.4; p.size = 0.09; p.grow = -0.05; p.grav = 9; break;
        case 'money':    p.vx = Math.cos(a) * 1.5; p.vz = Math.sin(a) * 1.5; p.vy = 3 + r() * 2; p.max = 1.4; p.size = 0.32; p.grow = 0; p.grav = 6; break;
        case 'debris':   p.vx = Math.cos(a) * (2 + r() * 4); p.vz = Math.sin(a) * (2 + r() * 4); p.vy = 4 + r() * 5; p.max = 1.6; p.size = 0.16 + r() * 0.12; p.grow = 0; p.grav = 10; break;
        case 'confetti': p.vx = Math.cos(a) * (1 + r() * 3); p.vz = Math.sin(a) * (1 + r() * 3); p.vy = 4 + r() * 4; p.max = 1.6; p.size = 0.18; p.grow = 0; p.grav = 7; break;
      }
      p.life = p.max;
    }
  }

  update(dt: number) {
    this.soft.update(dt); this.glowL.update(dt);
    let i = 0;
    for (const p of this.ps) {
      if (p.alive) {
        p.life -= dt;
        if (p.life <= 0) p.alive = false;
        p.vy -= p.grav * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.y < 0.25 && p.grav > 0) { p.y = 0.25; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; }
        const t = 1 - p.life / p.max;
        const s = Math.max(0, (p.size + p.grow * t) * Math.min(1, p.life / (p.max * 0.35)));
        this.dummy.position.set(p.x, p.y, p.z);
        this.dummy.rotation.set(t * p.spin, t * p.spin * 0.7, 0);
        const flat = p.color.g > 0.6 && p.color.r < 0.6 && p.size > 0.3 ? 0.35 : 1;   // billets : plats
        this.dummy.scale.set(s, s * flat, s * (flat < 1 ? 0.55 : 1));
        this.mesh.setColorAt(i, p.color);
      } else this.dummy.scale.setScalar(0);
      this.dummy.updateMatrix(); this.mesh.setMatrixAt(i, this.dummy.matrix);
      i++;
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

/** Halo lumineux (lampadaires, phares, gyrophares) : sprite additif. */
let glowTex: THREE.Texture | null = null;
export function glow(color: string, size = 3) {
  if (!glowTex) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d')!, gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    glowTex = new THREE.CanvasTexture(c);
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
  s.scale.setScalar(size);
  return s;
}

/** Cycle jour / nuit : renvoie 0 (plein jour) -> 1 (pleine nuit). Une journée = 240 s de jeu. */
export const DAY_LENGTH = 240;
export function nightFactor(time: number) {
  const h = ((time / DAY_LENGTH) % 1) * 24 + 9;            // la partie commence à 9h
  const hour = h % 24;
  // nuit de 21h à 6h, transitions d'1h30
  const dusk = THREE.MathUtils.smoothstep(hour, 19.5, 21), dawn = 1 - THREE.MathUtils.smoothstep(hour, 5, 6.5);
  return hour >= 12 ? dusk : dawn;
}
export function gameHour(time: number) { return ((((time / DAY_LENGTH) % 1) * 24 + 9) % 24); }
