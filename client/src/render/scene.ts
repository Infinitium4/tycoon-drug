// Scène 3D : caméra iso, décor, et synchronisation avec l'état de la simulation.
import * as THREE from 'three';
import { OTHER_SLOTS, aeroCycle, RING, COUNTRY, VILLA, LUX_KEYS, LuxKey, BOSSES, BIZ, BIZ_KEYS, BizKey, LANDS, LAND_KEYS, LandKey, inLand, stats, COMMISSARIAT, GRIP, TOWER_POS, miliceVehicleTier, BASE_TIERS, TOWER_LEVELS, VEHICLE_TIERS, VISUAL_TIERS, tierOf, CITY, DISTRICTS, LAB_KEYS, LAYOUT, LINES, LabKey, LineKey, PRODUCTS, PRODUCT_KEYS, StationKey, blockCenter, roadX, roadZLine } from '../sim/config';
import { FIGHT_TIME, GameState, benchPos, labPile } from '../sim/sim';
import * as M from './models';
import { Particles, glow, nightFactor } from './fx';
import { Post } from './post';
import type { Net } from '../net';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface StationAnchor { key: StationKey; pos: THREE.Vector3; meshes: THREE.Object3D[] }

const _unused = 0; void _unused;
const TIER_GROUND = ['#c9c4bb', '#d6cfc2', '#cfd6de', '#b9dc8f'];

export class World {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.OrthographicCamera;
  target = new THREE.Vector3(2, 0, -6);
  desired = new THREE.Vector3(2, 0, -6);
  desiredZoom: number | null = null;
  offset = new THREE.Vector3(22, 24, 22);
  /** Rotation de la vue autour de la cible (par quarts de tour, animée). */
  yaw = 0;
  desiredYaw = 0;
  /** Limites de la carte : base, aérodrome, ville, campagne, bases des autres. */
  static BOUNDS = { x0: -195, x1: 275, z0: -185, z1: 195 };
  private ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  frustum = 26;
  districtAnchors: THREE.Vector3[] = [];
  stations: StationAnchor[] = [];
  piles: Record<string, THREE.Group> = {};
  pilePos: Record<string, THREE.Vector3> = {};
  police!: THREE.Group;
  private police2!: THREE.Group;
  private cops: THREE.Group[] = [];
  private gignTeam: THREE.Group[] = [];
  private gignVan!: THREE.Group;
  private bac = new Map<number, THREE.Group>();

  private sun!: THREE.DirectionalLight;
  private labG = {} as Record<LabKey, { built: THREE.Group; plot: THREE.Group }>;
  private miliceG!: THREE.Group;
  private forks = new Map<number, THREE.Group>();
  private plants = new Map<number, THREE.Group>();
  private agents = new Map<number, THREE.Group>();
  private vans = new Map<number, THREE.Group>();
  private rivals: THREE.Group[] = [];
  private dryerG!: THREE.Group;
  private conveyors: THREE.Group[] = [];
  private smoke: THREE.Mesh[] = [];
  private raycaster = new THREE.Raycaster();
  fx!: Particles;
  private hemi!: THREE.HemisphereLight;
  private glows: THREE.Sprite[] = [];          // halos des lampadaires
  private headlights: THREE.Sprite[] = [];     // phares (s'allument la nuit)
  private polLights: THREE.PointLight[] = [];
  private pulses: { obj: THREE.Object3D; t: number; build: boolean; y: number; sx: number }[] = [];
  private walkers: { g: THREE.Group; cx: number; cz: number; t: number; speed: number }[] = [];
  private civCars: { g: THREE.Group; from: [number, number]; to: [number, number]; t: number }[] = [];
  private night = 0;
  private tierG: Partial<Record<StationKey, THREE.Group>> = {};
  private plots: Partial<Record<StationKey, THREE.Group>> = {};
  private curTier: Partial<Record<StationKey, number>> = {};
  private baseG = new THREE.Group();
  private baseTier = -1;
  private towers: { g: THREE.Group; lvl: number; shown: boolean }[] = [];
  private convoyG = new Map<number, THREE.Group>();
  private comG!: THREE.Group;
  private comCars: THREE.Group[] = [];
  comAnchor = new THREE.Vector3(COMMISSARIAT.x, 6, COMMISSARIAT.z);
  private enemies: Unit[] = [];
  private infantry: Unit[] = [];
  private arrivals: Arrival[] = [];
  private fightWrecks: THREE.Group[] = [];
  private after: Aftermath | null = null;
  private spot = { x: 0, z: 0, com: true };
  private clk = 0;
  private comFireOut = false;
  private comDmg = 0;
  private lastWin = false;
  private pools: { m: THREE.Mesh; t: number }[] = [];
  private press: THREE.Object3D[] = [];
  private pressT = 0; private pressStop = 0; private lastOpCom = true;
  private booms: number[] = [];
  private lastT = 0;
  private flash!: THREE.PointLight;
  private camShake = 0;
  private lastPhase = '';
  private bodiesTimer = 0;
  private tracers: { line: THREE.Line; life: number }[] = [];
  private comHoles: THREE.Mesh[] = [];
  private comBroken: THREE.Mesh[] = [];
  private comFire: THREE.Mesh[] = [];
  private comWrecks: THREE.Group[] = [];
  post!: Post;
  lands = {} as Record<LandKey, { g: THREE.Group; sign: THREE.Object3D; anchor: THREE.Vector3; owned: boolean }>;
  private bizCrew = {} as Record<BizKey, THREE.Group[]>;
  private plane!: THREE.Group;
  private loops: { g: THREE.Group; kind: BizKey; idx: number; out: THREE.Vector2[]; back: THREE.Vector2[]; period: number }[] = [];
  private dogs: { g: THREE.Group; path: THREE.Vector2[]; t: number; speed: number }[] = [];
  private cams: THREE.Group[] = [];
  private smoker!: THREE.Group;
  private genPipe = new THREE.Vector3();
  private aeroTrucks: THREE.Group[] = [];
  /** La caméra suit la voiture du tueur à gages. */
  follow = false;
  otherAnchors = new Map<number, THREE.Vector3>();
  private others = new Map<number, { g: THREE.Group; key: string }>();
  country: { g: THREE.Group; sign: THREE.Object3D; car: THREE.Object3D; anchor: THREE.Vector3; owned: boolean }[] = [];
  private ringCars: { g: THREE.Group; t: number; speed: number }[] = [];
  private luxG = {} as Record<LuxKey, THREE.Object3D>;
  private villaGuards: THREE.Group[] = [];
  private hitCar!: THREE.Group;
  private hitFx = { key: '', done: false, victim: null as THREE.Group | null, t: 0, pool: null as THREE.Mesh | null };
  /** Qualité adaptative : 0 = max ; monte si le PC n'arrive pas à suivre. */
  quality = 0;
  onQuality: (lvl: number) => void = () => {};
  private perf = { acc: 0, n: 0, last: 0, warm: 0, frame: 0 };
  private fireLights: THREE.PointLight[] = [];
  /** Appelé quand un bâtiment passe un palier visuel (pour les SMS). */
  onTierUp: (k: StationKey | 'base', tier: number) => void = () => {};

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 300);
    this.camera.zoom = 0.42; this.desiredZoom = 0.8;   // petite intro : la caméra plonge sur la base
    this.scene.background = new THREE.Color('#bfe3f5');
    this.scene.fog = new THREE.Fog('#bfe3f5', 150, 340);

    this.hemi = new THREE.HemisphereLight('#e8f4ff', '#8fbf6a', 1.5); this.scene.add(this.hemi);
    const sun = new THREE.DirectionalLight('#fff3dc', 2.6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 120 });
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
    this.scene.add(sun, sun.target); this.sun = sun;

    this.scene.add(this.staticG);
    this.buildStatic();
    this.buildBase();
    this.buildCity();
    this.buildOutskirts();
    bakeStatic(this.staticG);
    // les bâtiments interactifs sont aussi fusionnés (chacun dans son groupe, pour garder clic / visibilité)
    for (const c of Object.values(this.tierG)) c!.children.forEach(ch => bakeStatic(ch as THREE.Group, true));
    for (const p of Object.values(this.plots)) bakeStatic(p!, true);
    this.baseG.children.forEach(ch => bakeStatic(ch as THREE.Group, true));
    this.rivals.forEach(g => g && bakeStatic(g, true));

    this.police = this.withLights(M.optimize(M.policeCar()), 1.4); this.police.visible = false; this.scene.add(this.police);
    this.police2 = this.withLights(M.optimize(M.policeCar()), 1.4); this.police2.visible = false; this.scene.add(this.police2);
    for (const [car, col] of [[this.police, '#ef4444'], [this.police2, '#3b82f6']] as const) {
      const l = new THREE.PointLight(col, 0, 14, 1.6); l.position.set(0, 2, 0); car.add(l); this.polLights.push(l);
    }
    this.fx = new Particles(this.scene);
    this.flash = new THREE.PointLight('#ff9a3c', 0, 30, 1.5); this.scene.add(this.flash);
    for (let i = 0; i < 3; i++) { const l = new THREE.PointLight('#ff7a2a', 0, 14, 1.6); this.scene.add(l); this.fireLights.push(l); }
    this.post = new Post(this.renderer, this.scene, this.camera);
    this.buildLife();
    for (let i = 0; i < 3; i++) { const c = M.character('cop'); c.visible = false; M.animateCharacter(c, i, false, false, false); this.scene.add(c); this.cops.push(c); }
    for (let i = 0; i < 4; i++) { const c = M.character('gign'); c.visible = false; M.animateCharacter(c, i, false, false, false); this.scene.add(c); this.gignTeam.push(c); }
    this.gignVan = M.optimize(M.vanOf('gign')); this.gignVan.visible = false; this.scene.add(this.gignVan);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private staticG = new THREE.Group();
  /** Objet interactif / animé : ajouté tel quel à la scène. */
  private add<T extends THREE.Object3D>(o: T, x = 0, z = 0, ry?: number): T {
    o.position.x += x; o.position.z += z; if (ry !== undefined) o.rotation.y = ry; this.scene.add(o); return o;
  }
  /** Lampadaire + halo qui s'allume la nuit. */
  private lamp(x: number, z: number, ry = 0, y = 0) {
    const l = this.deco(M.lamp(), x, z, ry); l.position.y = y;
    const g = glow('#fde68a', 4.5); g.position.set(x + Math.cos(ry) * 0.65, y + 2.95, z - Math.sin(ry) * 0.65);
    this.scene.add(g); this.glows.push(g);
  }
  /** Ajoute deux phares (halos) à l'avant d'un véhicule. */
  private withLights<T extends THREE.Object3D>(v: T, front: number): T {
    for (const x of [-0.42, 0.42]) { const h = glow('#fff7d6', 1.6); h.position.set(x, 0.6, front); v.add(h); this.headlights.push(h); }
    return v;
  }
  /** Décor fixe : fusionné en quelques gros meshes à la fin (performances). */
  private deco<T extends THREE.Object3D>(o: T, x = 0, z = 0, ry?: number): T {
    o.position.x += x; o.position.z += z; if (ry !== undefined) o.rotation.y = ry; this.staticG.add(o); return o;
  }

  // ---------------- décor général ----------------
  private buildStatic() {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), M.weather(new THREE.MeshStandardMaterial({ color: '#8cc46a', roughness: 0.95 }), 2.2) as THREE.MeshStandardMaterial);
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; this.staticG.add(ground);
    // route principale base -> ville, avec trottoirs et lampadaires
    const rz = LAYOUT.roadZ, rx0 = -140, rx1 = CITY.x0;
    this.deco(M.box(rx1 - rx0, 0.06, 4, '#5b6170', 0, 0), (rx0 + rx1) / 2, rz);
    this.deco(M.box(rx1 - rx0, 0.12, 0.6, '#e5e7eb', 0, 0.04), (rx0 + rx1) / 2, rz - 2.3);
    this.deco(M.box(rx1 - rx0, 0.12, 0.6, '#e5e7eb', 0, 0.04), (rx0 + rx1) / 2, rz + 2.3);
    for (let x = rx0 + 1; x < rx1; x += 3) this.deco(M.box(1.4, 0.02, 0.14, '#f8fafc', 0.06, 0), x, rz);
    for (let x = 24; x < rx1; x += 12) this.lamp(x, rz + 2.6, Math.PI);
    for (let x = -130; x < -50; x += 16) this.lamp(x, rz + 2.6, Math.PI);
    // commissariat
    this.deco(M.box(14, 0.06, 9, '#9ca3af', 0, 0.02), COMMISSARIAT.x, COMMISSARIAT.z + 2);
    this.comG = M.commissariat(); this.comG.position.set(COMMISSARIAT.x, 0.06, COMMISSARIAT.z - 0.3); this.scene.add(this.comG);
    for (const dx of [-5.5, 5.8]) {
      const c = M.optimize(M.policeCar()); c.position.set(COMMISSARIAT.x + dx, 0.06, COMMISSARIAT.z + 4.6); c.rotation.y = Math.PI / 2; this.scene.add(c); this.comCars.push(c);
      const w = M.wreck(); w.position.copy(c.position); w.rotation.y = Math.PI / 2 + 0.3; w.visible = false; this.scene.add(w); this.comWrecks.push(w);
    }
    // impacts de balles, vitres explosées, flammes (révélés selon les dégâts)
    const holeMat = new THREE.MeshBasicMaterial({ color: '#111111' }), holeGeo = new THREE.CircleGeometry(0.07, 6);
    for (let i = 0; i < 70; i++) {
      const h = new THREE.Mesh(holeGeo, holeMat); const hx = Math.random() < 0.5 ? -4.3 + Math.random() * 2.8 : 1.5 + Math.random() * 2.8; h.position.set(COMMISSARIAT.x + hx, 0.7 + Math.random() * 3.4, COMMISSARIAT.z + 2.25);
      h.scale.setScalar(0.6 + Math.random() * 0.8); h.visible = false; this.scene.add(h); this.comHoles.push(h);
    }
    const brokenMat = new THREE.MeshBasicMaterial({ color: '#0b0b0b' });
    for (let f = 0; f < 2; f++) for (let i = 0; i < 5; i++) {
      if (i === 2) continue;
      const b = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.45), brokenMat); b.position.set(COMMISSARIAT.x - 4.5 + 1.8 * (i + 0.5), 1.26 + f * 1.4, COMMISSARIAT.z + 2.27);
      b.visible = false; this.scene.add(b); this.comBroken.push(b);
    }
    for (let i = 0; i < 5; i++) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.35 + Math.random() * 0.3, 1 + Math.random(), 6), new THREE.MeshBasicMaterial({ color: i % 2 ? '#f97316' : '#facc15' }));
      f.position.set(COMMISSARIAT.x - 3 + i * 1.5, 4.5, COMMISSARIAT.z - 0.5 + (i % 2) * 1.2); f.visible = false; this.scene.add(f); this.comFire.push(f);
    }
    const tm = new THREE.LineBasicMaterial({ color: '#fde047', transparent: true, opacity: 0.95 });
    for (let i = 0; i < 40; i++) { const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), tm); l.visible = false; l.frustumCulled = false; this.scene.add(l); this.tracers.push({ line: l, life: 0 }); }
    // forêt entre la base et la ville + autour
    const rf = mulberry(99);
    const plant = (x: number, z: number) => { if (OTHER_SLOTS.some(o => Math.abs(x - o.x) < 22 && Math.abs(z - o.z) < 26) || (x > VILLA.x0 - 2 && x < VILLA.x1 + 2 && z > VILLA.z0 - 2 && z < VILLA.z1 + 2) || LAND_KEYS.some(k => inLand(k, x, z, 2.5)) || (x > -34 && x < -26 && z > 5 && z < 11)) return; this.deco(M.tree(), x, z); };
    for (let k = 0; k < 160; k++) {
      const x = 24 + rf() * (CITY.x0 - 28), z = -45 + rf() * 90;
      if (Math.abs(z - rz) < 4.5) continue;
      if (Math.abs(x - COMMISSARIAT.x) < 8 && z > COMMISSARIAT.z - 6 && z < rz) continue;   // clairière du commissariat
      plant(x, z);
    }
    for (let k = 0; k < 70; k++) { const x = -45 + rf() * 66, z = -48 + rf() * 22; if (z < -25) plant(x, z); }
    for (let k = 0; k < 45; k++) plant(-48 + rf() * 26, -30 + rf() * 60);
    for (let k = 0; k < 30; k++) plant(-24 + rf() * 46, 12.5 + rf() * 18);
  }

  // ---------------- la base ----------------
  /** Conteneur de paliers : un enfant par palier, un seul visible à la fois. */
  private tiered(key: StationKey, x: number, z: number, variants: THREE.Object3D[], y = 0.2) {
    const c = new THREE.Group(); c.position.set(x, y, z);
    variants.forEach(v => { v.visible = false; c.add(v); });
    this.scene.add(c); this.tierG[key] = c;
    return c;
  }

  /** La place (dalle + clôture) : 3 versions qui se remplacent avec la taille de l'empire. */
  private buildPlace(tier: number) {
    const L = LAYOUT, S = L.slab, g = new THREE.Group();
    const W = S.x1 - S.x0, D = S.z1 - S.z0, cx = (S.x0 + S.x1) / 2, cz = (S.z0 + S.z1) / 2;
    const pal = [['#cfcac0', '#c4bfb5', '#b3ada2'], ['#a8a29e', '#b4b1ab', '#9c968c'], ['#e7e5e4', '#ddd6cc', '#c8bfb2']][tier];
    const put = (o: THREE.Object3D, x: number, z: number, ry = 0) => { o.position.x += x; o.position.z += z; o.rotation.y = ry; g.add(o); return o; };
    put(M.box(W + 1, 0.2, D + 1, pal[0], 0, 0.12), cx, cz);
    put(M.box(W, 0.02, D, pal[1], 0.2, 0), cx, cz);
    const step = tier === 2 ? 2 : 4;
    for (let x = S.x0 + step; x < S.x1; x += step) put(M.paint(x, S.z0, x, S.z1, pal[2], 0.05), 0, 0);
    for (let z = S.z0 + step; z < S.z1; z += step) put(M.paint(S.x0, z, S.x1, z, pal[2], 0.05), 0, 0);
    const fz0 = S.z0 - 0.3, fz1 = S.z1 + 0.3, fx0 = S.x0 - 0.3, fx1 = S.x1 + 0.3;
    const postC = tier === 0 ? '#475569' : tier === 1 ? '#14532d' : '#111827';
    const fence = (x0: number, z0: number, x1: number, z1: number, privacy = false) => {
      const len = Math.hypot(x1 - x0, z1 - z0), ry = -Math.atan2(z1 - z0, x1 - x0);
      for (const y of [0.85, 1.5]) put(M.box(len, 0.08, 0.08, postC, y, 0.02), (x0 + x1) / 2, (z0 + z1) / 2, ry);
      if (privacy) put(M.box(len, 1.3, 0.05, '#166534', 0.3, 0.01), (x0 + x1) / 2, (z0 + z1) / 2, ry);
      for (let t = 0; t <= len; t += 1.6) {
        const px = x0 + ((x1 - x0) * t) / len, pz = z0 + ((z1 - z0) * t) / len;
        put(M.box(0.16, 1.5, 0.16, postC, 0.2, 0.04), px, pz);
        if (tier === 2) { const tip = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.25, 6), M.mat('#d4a017', { metalness: 0.6, roughness: 0.3 })); tip.position.set(px, 1.85, pz); g.add(tip); }
      }
    };
    const wall = (x0: number, z0: number, x1: number, z1: number) => {
      const len = Math.hypot(x1 - x0, z1 - z0), ry = -Math.atan2(z1 - z0, x1 - x0);
      put(M.box(len + 0.4, 2.3, 0.4, '#d6d3d1', 0, 0.06), (x0 + x1) / 2, (z0 + z1) / 2, ry);
      const bw = M.barbedWire(len); bw.position.y = 2.5; put(bw, (x0 + x1) / 2, (z0 + z1) / 2, ry);
    };
    if (tier === 2) { wall(fx0, fz0, fx1, fz0); wall(fx0, fz0, fx0, fz1); }      // murs au nord et à l'ouest (dos à la caméra)
    else { fence(fx0, fz0, fx1, fz0, tier === 1); fence(fx0, fz0, fx0, fz1, tier === 1); }
    fence(fx1, fz0, fx1, fz1); fence(fx0, fz1, L.gate.x0, fz1);
    if (tier >= 1) for (const x of [L.gate.x0 - 0.2, L.gate.x1 + 0.2]) put(M.box(0.7, 2.4, 0.7, tier === 2 ? '#a8a29e' : '#57534e', 0, 0.08), x, fz1);
    return g;
  }

  private buildBase() {
    const L = LAYOUT, S = L.slab, P = L.plants;
    for (let t = 0; t < 3; t++) { const pl = this.buildPlace(t); pl.visible = false; this.baseG.add(pl); }
    this.scene.add(this.baseG);
    this.deco(M.box(L.gate.x1 - L.gate.x0, 0.07, L.roadZ - S.z1, '#5b6170', 0, 0), (L.gate.x0 + L.gate.x1) / 2, (S.z1 + L.roadZ) / 2);
    this.deco(M.barrier(), L.gate.x0 + 0.1, S.z1 + 0.5);

    // allées
    const dashed = (x0: number, z0: number, x1: number, z1: number, c = '#f8fafc') => {
      const len = Math.hypot(x1 - x0, z1 - z0), n = Math.floor(len / 1.4);
      for (let i = 0; i < n; i++) { const t0 = i / n, t1 = (i + 0.5) / n; this.deco(M.paint(x0 + (x1 - x0) * t0, z0 + (z1 - z0) * t0, x0 + (x1 - x0) * t1, z0 + (z1 - z0) * t1, c, 0.16)); }
    };
    dashed(S.x0 + 0.8, L.laneZ - 0.4, L.forkX.labo, L.laneZ - 0.4);
    dashed(L.forkX.pharma + 0.4, L.laneZ, L.forkX.pharma + 0.4, L.stock.cannabis.z + 1.8);
    dashed(L.eastX, S.z0 + 0.8, L.eastX, 0.6, '#facc15');
    dashed(S.x0 + 0.8, L.walkZ, L.gate.x0 - 0.5, L.walkZ, '#facc15');
    dashed(S.x0 + 0.8, S.z0 + 0.8, L.eastX, S.z0 + 0.8, '#facc15');
    dashed(S.x0 + 0.6, S.z0 + 0.8, S.x0 + 0.6, L.walkZ, '#facc15');

    // 1. champ : bacs -> filets -> serre
    const bedLen = (P.cols - 1) * P.dx + 1.6, bx = P.x0 + ((P.cols - 1) * P.dx) / 2, bz = P.z0 + ((P.rows - 1) * P.dz) / 2;
    const fw = bedLen + 1.2, fd = (P.rows - 1) * P.dz + P.dz + 0.6;
    const fieldVariants = [0, 1, 2].map(t => {
      const g = new THREE.Group(); g.add(M.bedsGroup(P.rows, P.dz, bedLen));
      if (t === 1) { const n = M.shadeNet(fw, fd); n.position.z = P.dz / 2 - 0.2; g.add(n); }
      if (t === 2) { const gh = M.greenhouse(fw, fd, P.rows, P.dz); gh.position.z = P.dz / 2 - 0.2; g.add(gh); }
      return g;
    });
    const fieldG = this.tiered('field', bx, bz, fieldVariants);
    const fx1b = L.harvestHomeX + 0.5;
    this.staticG.add(M.paintRect(P.x0 - 1.3, P.z0 - 1.0, fx1b, P.z0 + (P.rows - 1) * P.dz + P.dz / 2 + 0.5));
    const cv1 = L.fieldConvX, cTop = P.z0 + (P.rows - 1) * P.dz + P.dz / 2 + 0.4, dz = L.dryer.z;
    const conv = (x0: number, z0: number, x1: number, z1: number) => {
      const len = Math.hypot(x1 - x0, z1 - z0); const c = M.conveyor(len);
      c.position.set((x0 + x1) / 2, 0.2, (z0 + z1) / 2); c.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
      this.scene.add(c); this.conveyors.push(c); return c;
    };
    conv(cv1, cTop, cv1, dz); conv(cv1, dz, L.dryer.x - 2.1, dz);

    // 2. séchoir
    this.dryerG = this.tiered('dryer', L.dryer.x, L.dryer.z, [M.dryer(), M.dryerT2(), M.dryerT3()]);
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 1), new THREE.MeshStandardMaterial({ color: '#f1f5f9', transparent: true, opacity: 0 }));
      this.smoke.push(s); this.scene.add(s);
    }
    this.staticG.add(M.paintRect(L.dryer.x - 2.8, L.dryer.z - 2.1, L.dryer.x + 2.8, L.dryer.z + 2.1));

    // 3. conditionnement
    const T = L.table;
    conv(L.dryer.x + 2.1, T.z, T.x - 1.25, T.z);
    const packG = this.tiered('packer', T.x, T.z, [M.packT1(), M.packT2(), M.packT3()]);
    this.staticG.add(M.paintRect(T.x - 3.5, T.z - 2.6, T.x + 3.5, T.z + 2));

    // 4. stock
    const SK = L.stock, sx = 10.3;
    conv(T.x + 1.25, T.z, sx, T.z); conv(sx, T.z, sx, SK.cannabis.z); conv(sx, SK.cannabis.z, SK.cannabis.x - 0.7, SK.cannabis.z);
    this.staticG.add(M.paintRect(SK.cannabis.x - 1, SK.cannabis.z - 1.1, SK.labo.x + 1, SK.cannabis.z + 1.1, '#f8fafc'));

    // 5. garage + parking
    const garageG = this.tiered('garage', L.garage.x, L.garage.z, [M.garage(), M.garageT2(), M.garageT3()]);
    for (let i = 0; i <= 4; i++) { const x = L.vanPark.x - L.vanGap / 2 + i * L.vanGap; this.deco(M.paint(x, L.vanPark.z - 1.5, x, L.vanPark.z + 1.5, '#f8fafc', 0.12)); }

    // avocat + QG
    const officeG = this.tiered('office', L.office.x, L.office.z, [M.office(), M.officeT2(), M.officeT3()]);
    const t3 = M.miliceT3(); t3.position.z = 0.2;
    const miliceG = this.tiered('milice', L.milice.x, L.milice.z, [M.miliceHQ(), M.miliceT2(), t3]);
    const miliceLot = M.plot(5, 3.6); miliceLot.position.set(L.milice.x, 0, L.milice.z); this.scene.add(miliceLot); this.plots.milice = miliceLot;
    this.miliceG = miliceG;

    // miradors (apparaissent avec le niveau du QG), à l'extérieur de la clôture
    TOWER_POS.forEach(([x, z], i) => { const w = M.watchtower(); w.position.set(x, 0, z);
      const body = new THREE.Group(); [...w.children].forEach(ch => { if (ch !== w.userData.turret) body.add(ch); }); w.add(body); bakeStatic(body, true); w.visible = false; this.scene.add(w); this.towers.push({ g: w, lvl: TOWER_LEVELS[i], shown: false }); });

    // déco
    const dc = { x: 1.5, z: -1 };
    this.deco(M.waterTank(), dc.x - 3, dc.z).position.y = 0.2;
    for (let i = 0; i < 4; i++) this.deco(M.barrel(i % 2 ? '#16a34a' : '#2563eb'), dc.x + i * 0.85, dc.z - 0.6).position.y = 0.2;
    for (let i = 0; i < 3; i++) this.deco(M.box(1.1, 0.14, 1.1, '#a07a4f', 0.2, 0.02), dc.x + i * 1.3, dc.z + 0.9);
    for (const [x, z] of [[S.x0 + 0.6, S.z1 - 0.6], [S.x0 + 0.6, S.z0 + 0.4], [L.eastX + 0.5, S.z0 + 0.4], [L.gate.x0 - 0.6, S.z1 - 0.5], [-1.2, S.z1 - 0.5], [S.x0 + 0.6, L.laneZ], [L.eastX + 0.5, L.laneZ], [3, L.laneZ + 0.6]]) this.lamp(x, z, 0, 0.2);
    for (let x = L.milice.x + 3.4; x < -1.2; x += 1.6) this.deco(M.bush(), x, S.z1 - 0.5).position.y = 0.2;
    // parking de la milice : places marquées
    for (let i = 0; i <= 3; i++) { const x = -1 + i * 2.8; this.deco(M.paint(x, 2.95, x, 6.1, '#facc15', 0.12)); }

    const mkPile = (key: string, x: number, z: number, color: string) => {
      this.pilePos[key] = new THREE.Vector3(x, 0, z);
      const p = M.pile(color); p.position.x += x; p.position.z += z; this.scene.add(p); this.piles[key] = p;
    };
    mkPile('cannabis', SK.cannabis.x, SK.cannabis.z, LINES.cannabis.color);

    // labos : conteneur -> bâtiment -> hangar
    const labStations: StationAnchor[] = [];
    for (const k of LAB_KEYS) {
      const lb = L.labs[k];
      const withBenches = (b: THREE.Object3D) => {
        const g = new THREE.Group(); g.add(b);
        for (let i = 0; i < 4; i++) { const bp = benchPos(k, i); const be = M.bench(lb.color); be.position.set(bp.x - lb.x, 0, bp.z - lb.z); g.add(be); }
        const r = M.paintRect(-4.2, -2.6, 6.2, 5.3, lb.color); r.position.y = -0.2; g.add(r);
        return g;
      };
      const c = this.tiered(k, lb.x, lb.z, [withBenches(M.labT1(lb.color, k)), withBenches(M.lab(lb.color, k)), withBenches(M.labT3(lb.color, k))]);
      const plot = M.plot(10, 7.4); plot.position.set(lb.x + 1, 0, lb.z + 1.3); this.scene.add(plot); this.plots[k] = plot;
      const lp = labPile(k);
      mkPile(k + 'Out', lp.x, lp.z, LINES[k].color);
      mkPile(k, SK[k].x, SK[k].z, LINES[k].color);
      labStations.push({ key: k, pos: new THREE.Vector3(lb.x, 5, lb.z), meshes: [c, plot] });
    }

    // terrains à vendre + business annexes
    const bizStations: StationAnchor[] = [];
    for (const lk of LAND_KEYS) {
      const l = LANDS[lk], W = l.x1 - l.x0, D = l.z1 - l.z0, cx = (l.x0 + l.x1) / 2, cz = (l.z0 + l.z1) / 2;
      const lg = new THREE.Group();
      lg.add(M.at2(M.box(W, 0.2, D, '#c4bdb1', 0, 0.06), cx, cz));
      for (let x = l.x0 + 4; x < l.x1; x += 4) lg.add(M.paint(x, l.z0, x, l.z1, '#b3ada2', 0.05));
      for (let z = l.z0 + 4; z < l.z1; z += 4) lg.add(M.paint(l.x0, z, l.x1, z, '#b3ada2', 0.05));
      const sides: number[][] = lk === 'ouest' ? [[l.x0, l.z0, l.x1, l.z0], [l.x0, l.z0, l.x0, l.z1], [l.x0, l.z1, -33, l.z1], [-27, l.z1, l.x1, l.z1]]
        : lk === 'aero' ? [[l.x0, l.z0, l.x1, l.z0], [l.x0, l.z0, l.x0, l.z1], [l.x1, l.z0, l.x1, l.z1], [l.x0, l.z1, -73, l.z1], [-67, l.z1, l.x1, l.z1]]
        : [[l.x0, l.z0, l.x1, l.z0], [l.x0, l.z0, l.x0, l.z1], [l.x1, l.z0, l.x1, l.z1]];
      for (const [x0, z0, x1, z1] of sides) {
        const len = Math.hypot(x1 - x0, z1 - z0), ry = -Math.atan2(z1 - z0, x1 - x0);
        for (const y of [0.85, 1.5]) { const r = M.box(len, 0.08, 0.08, '#475569', y, 0.02); r.position.x = (x0 + x1) / 2; r.position.z = (z0 + z1) / 2; r.rotation.y = ry; lg.add(r); }
        for (let t = 0; t <= len; t += 1.8) lg.add(M.at2(M.box(0.16, 1.5, 0.16, '#475569', 0.2, 0.04), x0 + ((x1 - x0) * t) / len, z0 + ((z1 - z0) * t) / len));
      }
      if (lk === 'ouest') lg.add(M.at2(M.box(6, 0.07, 2.2, '#5b6170', 0, 0), -30, 7.4));
      if (lk === 'aero') lg.add(M.at2(M.box(6, 0.07, LAYOUT.roadZ - l.z1, '#5b6170', 0, 0), -70, (l.z1 + LAYOUT.roadZ) / 2));
      bakeStatic(lg, true); lg.visible = false; this.scene.add(lg);
      const sign = M.forSale(); sign.position.set(cx, 0, lk === 'ouest' ? l.z1 - 2 : l.z1 + 1.5); this.scene.add(sign);
      this.lands[lk] = { g: lg, sign, anchor: new THREE.Vector3(cx, 2.5, cz + 4), owned: false };
    }
    const crewRole: Record<BizKey, M.Role> = { clopes: 'packer', armes: 'guard', casse: 'harvester', aero: 'packer' };
    for (const k of BIZ_KEYS) {
      const b = BIZ[k];
      const c = this.tiered(k, b.x, b.z, [0, 1, 2].map(t => M.bizModel(k, t)), 0.2);
      const plot = M.plot(8, 6); plot.position.set(b.x, 0, b.z); plot.visible = false; this.scene.add(plot); this.plots[k] = plot;
      bizStations.push({ key: k, pos: new THREE.Vector3(b.x, 5.5, b.z), meshes: [c, plot] });
      this.bizCrew[k] = [0, 1, 2, 3].map(i => { const ch = M.character(crewRole[k]); ch.position.set(b.x - 2.4 + i * 1.6, 0.45, b.z + 4.2 + (i % 2) * 0.6); ch.rotation.y = Math.PI + (i - 1.5) * 0.4; ch.visible = false; this.scene.add(ch); return ch; });
    }

    // camions des business : ils partent livrer en ville et reviennent
    const V2 = (pts: number[][]) => pts.map(([x, z]) => new THREE.Vector2(x, z));
    const out = LAYOUT.roadZ - 0.9, back = LAYOUT.roadZ + 0.9, city = CITY.x0 + 3;
    const routes: Record<'armes' | 'clopes' | 'casse', [number[][], number[][], number]> = {
      armes: [[[-41, -8], [-41, 4.2], [-31.5, 4.2], [-31.5, out], [city, out]], [[city, back], [-32.5, back], [-32.5, 5], [-41.8, 5], [-41.8, -8]], 56],
      clopes: [[[-27.6, 3], [-27.6, out], [city, out]], [[city, back], [-28.6, back], [-28.6, 3]], 44],
      casse: [[[4, -30.5], [4, -25.6], [-21.3, -25.6], [-21.3, out], [city, out]], [[city, back], [-21.3, back], [-21.3, -25.6], [4, -25.6], [4, -30.5]], 64],
    };
    for (const k of ['armes', 'clopes', 'casse'] as const) for (let i = 0; i < 3; i++) {
      const g = this.withLights(M.optimize(M.lorry(k)), 1.7); g.visible = false; this.scene.add(g);
      const [o, b, P] = routes[k];
      this.loops.push({ g, kind: k, idx: i, out: V2(o), back: V2(b), period: P });
    }
    // détails de la base : chien de garde, caméras, groupe électrogène, poubelles, le gars en pause clope
    const d1 = M.optimize(M.dog()); this.scene.add(d1);
    this.dogs.push({ g: d1, path: V2([[-17, -21.3], [18, -21.3], [18.6, 0.5], [18, -21.3]]), t: 0, speed: 0.018 });
    const d2 = M.optimize(M.dog()); this.scene.add(d2);
    this.dogs.push({ g: d2, path: V2([[-17.2, 2], [-17.2, -20], [-16.6, 2]]), t: 0.5, speed: 0.026 });
    for (const [x, z, ry] of [[-17.6, 6.1, 2.4], [18.4, 6.1, -2.4], [-17.6, -21.6, 0.7], [18.4, -21.6, -0.7]]) { const c = M.camPole(); c.position.set(x, 0.2, z); c.rotation.y = ry; this.scene.add(c); this.cams.push(c); }
    const gen = M.generator(); gen.position.set(-15.8, 0.2, -12.4); this.scene.add(gen); this.genPipe.copy(gen.userData.pipe).add(gen.position);
    this.deco(M.bins(), 15.4, -20.6).position.y = 0.2;
    for (let i = 0; i < 3; i++) this.deco(M.box(1.2, 0.15, 1.2, '#a07a4f', 0.2 + i * 0.16, 0.02), -16, -16.8);
    this.smoker = M.character('packer'); this.smoker.position.set(-15.6, 0.45, 2.2); this.smoker.rotation.y = 0.9; this.scene.add(this.smoker);
    this.plane = M.optimize(M.cargoPlane()); this.plane.visible = false; this.scene.add(this.plane);
    for (let i = 0; i < 2; i++) { const t = this.withLights(M.optimize(M.utilityVan()), 1.5); t.visible = false; this.scene.add(t); this.aeroTrucks.push(t); }
    // le repaire : pelouse, allée, demeure (4 paliers), folies, gardes du corps
    const V = VILLA;
    this.deco(M.box(V.x1 - V.x0, 0.06, V.z1 - V.z0, '#7fb35e', 0, 0.02), V.x, (V.z0 + V.z1) / 2);
    this.deco(M.box(3, 0.08, 9, '#d6d3d1', 0, 0.02), V.x + 1, V.z0 + 4.5);
    this.deco(M.box(3, 0.08, 1.8, '#5b6170', 0, 0.02), V.x + 1, V.z0 - 0.8);
    const villaG = this.tiered('villa', V.x, V.z, [0, 1, 2, 3].map(t => M.villaModel(t)), 0.05);
    const luxPos: Record<LuxKey, [number, number, number]> = { lambo: [5.2, 16.5, 0.5], fontaine: [-3.5, 17, 0], piscine: [-9, 32.5, 0], collection: [11, 16, 0], statue: [1, 33, 0], helico: [10.5, 32.5, -0.6] };
    for (const k of LUX_KEYS) {
      const [x, z, ry] = luxPos[k];
      const o = k === 'lambo' ? M.optimize(M.supercar('#facc15')) : k === 'fontaine' ? M.goldFountain() : k === 'piscine' ? M.pool() : k === 'statue' ? M.goldStatue() : k === 'helico' ? M.helicopter()
        : (() => { const c = new THREE.Group(); ['#dc2626', '#111827', '#f8fafc'].forEach((col, i) => { const v = M.optimize(M.supercar(col)); v.position.set(-2.2 + i * 2.2, 0, 0); c.add(v); }); return c; })();
      o.position.set(x, 0.06, z); o.rotation.y = ry; o.visible = false; this.scene.add(o); this.luxG[k] = o;
    }
    const gpost = [[-1.2, 12.6], [3.2, 12.6], [-6, 19.5], [7, 19.5], [-15, 14], [15, 14], [-15, 34], [15, 34]];
    this.villaGuards = gpost.map(([x, z]) => { const c = M.character('guard'); c.position.set(x, 0.3, z); c.rotation.y = x < 0 ? -0.5 : 0.5; c.visible = false; this.scene.add(c); return c; });
    this.hitCar = this.withLights(M.optimize(M.car('#0b0b0b')), 1.3); this.hitCar.visible = false; this.scene.add(this.hitCar);

    this.stations = [
      { key: 'villa', pos: new THREE.Vector3(V.x, 6.5, V.z + 2), meshes: [villaG] },
      ...bizStations,
      { key: 'field', pos: new THREE.Vector3(bx, 2.6, P.z0 - 1.4), meshes: [fieldG] },
      { key: 'dryer', pos: new THREE.Vector3(L.dryer.x, 5, L.dryer.z), meshes: [this.dryerG] },
      { key: 'packer', pos: new THREE.Vector3(T.x, 3.6, T.z - 2.2), meshes: [packG] },
      { key: 'garage', pos: new THREE.Vector3(L.garage.x, 4.4, L.garage.z), meshes: [garageG] },
      { key: 'office', pos: new THREE.Vector3(L.office.x, 5, L.office.z), meshes: [officeG] },
      { key: 'milice', pos: new THREE.Vector3(L.milice.x, 4, L.milice.z), meshes: [miliceG, miliceLot] },
      ...labStations,
    ];
  }

  // ---------------- la ville ----------------
  private buildCity() {
    const n = CITY.size, x0 = CITY.x0, z0 = CITY.z0, len = n * CITY.cell;
    // dalle de la ville
    this.deco(M.box(len + 6, 0.05, len + 6, '#5b6170', 0, 0), x0 + len / 2, z0 + len / 2);
    for (let i = 0; i <= n; i++) for (let t = 2.5; t < len; t += 3) {
      this.deco(M.box(0.14, 0.02, 1.4, '#f8fafc', 0.05, 0), roadX(i), z0 + t);
      this.deco(M.box(1.4, 0.02, 0.14, '#f8fafc', 0.05, 0), x0 + t, roadZLine(i));
    }
    const rnd = mulberry(42);
    DISTRICTS.forEach((d, idx) => {
      const c = blockCenter(d.r, d.c), B = CITY.block;
      this.deco(M.box(B, 0.3, B, '#e5e7eb', 0, 0.2), c.x, c.z);
      this.deco(M.box(B - 1.2, 0.04, B - 1.2, TIER_GROUND[d.tier], 0.3, 0), c.x, c.z);
      const blk = M.districtBlock(d.tier, rnd); blk.position.y = 0.32; blk.scale.setScalar(0.95);
      this.deco(blk, c.x, c.z);
      this.districtAnchors.push(new THREE.Vector3(c.x, 3, c.z + B / 2 - 1));
      // petit groupe de dealers rivaux au coin du quartier
      const gang = new THREE.Group();
      for (let i = 0; i < 3; i++) {
        const r = M.character('rival'); r.position.set(-B / 2 + 2 + i * 0.9, 0.3, B / 2 - 2 + (i % 2) * 0.6); r.rotation.y = 0.6 + i * 0.4;
        M.animateCharacter(r, i, false, false, false); gang.add(r);
      }
      gang.position.set(c.x, 0, c.z); gang.visible = false; this.scene.add(gang);
      this.rivals[idx] = gang;
    });
  }

  /** Périphérique, routes de campagne, champs, bosquets et maisons de campagne. */
  private buildOutskirts() {
    const R = RING, rw = 3.6;
    const road = (x0: number, z0: number, x1: number, z1: number) => {
      const horiz = Math.abs(z1 - z0) < 0.01, len = horiz ? Math.abs(x1 - x0) : Math.abs(z1 - z0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      this.deco(M.box(horiz ? len + rw : rw, 0.07, horiz ? rw : len + rw, '#565c6a', 0, 0), cx, cz);
      for (let t = -len / 2 + 1; t < len / 2 - 0.5; t += 3) this.deco(M.box(horiz ? 1.4 : 0.14, 0.02, horiz ? 0.14 : 1.4, '#f8fafc', 0.07, 0), horiz ? cx + t : cx, horiz ? cz : cz + t);
    };
    // le périph'
    road(R.x0, R.z0, R.x1, R.z0); road(R.x0, R.z1, R.x1, R.z1); road(R.x1, R.z0, R.x1, R.z1);
    road(R.x0, R.z0, R.x0, -6.5); road(R.x0, 11, R.x0, R.z1);
    for (let x = R.x0 + 6; x < R.x1; x += 14) { this.lamp(x, R.z0 - 2.4, 0); this.lamp(x, R.z1 + 2.4, Math.PI); }
    for (let z = R.z0 + 6; z < R.z1; z += 14) this.lamp(R.x1 + 2.4, z, -Math.PI / 2);
    // routes de campagne vers les maisons
    const C = COUNTRY;
    road(R.x0, R.z1, C[0].x, R.z1); road(C[0].x, R.z1, C[0].x, C[0].z - 6);
    road(C[1].x, R.z0, C[1].x, C[1].z + 6);
    road(R.x1, R.z0, C[2].x, R.z0); road(C[2].x, R.z0, C[2].x, C[2].z + 6);
    road(R.x1, R.z1, C[3].x, R.z1); road(C[3].x, R.z1, C[3].x, C[3].z - 7);
    // campagne : champs et bosquets
    const rnd = mulberry(7);
    const nearRoad = (x: number, z: number) =>
      (x > R.x0 - 6 && x < R.x1 + 6 && z > R.z0 - 6 && z < R.z1 + 6) || (Math.abs(z - R.z1) < 5 && x > C[0].x - 4) || (Math.abs(x - C[0].x) < 5 && z > R.z1) ||
      (Math.abs(x - C[1].x) < 5 && z < R.z0) || (Math.abs(z - R.z0) < 5 && x > R.x1) || (Math.abs(x - C[2].x) < 5 && z < R.z0) || (Math.abs(x - C[3].x) < 5 && z > R.z1) ||
      C.some(c => Math.hypot(x - c.x, z - c.z) < 14) || OTHER_SLOTS.some(o => Math.abs(x - o.x) < 22 && Math.abs(z - o.z) < 26) || (x < 72 && z > -48 && z < 48) || (Math.abs(z - LAYOUT.roadZ) < 5 && x < 80);
    let fields = 0;
    for (let k = 0; k < 400 && fields < 14; k++) {
      const x = 30 + rnd() * 200, z = -120 + rnd() * 250, w = 12 + rnd() * 10, d = 9 + rnd() * 8;
      if ([[0, 0], [w / 2, d / 2], [-w / 2, d / 2], [w / 2, -d / 2], [-w / 2, -d / 2]].some(([a, b]) => nearRoad(x + a, z + b))) continue;
      this.deco(M.field(w, d, fields), x, z); fields++;
    }
    for (let k = 0; k < 1700; k++) {
      const x = -195 + rnd() * 470, z = -185 + rnd() * 380;
      if (nearRoad(x, z) || (x > 160 && rnd() < 0.3)) continue;
      if (rnd() < 0.55) this.deco(M.tree(), x, z);
    }
    // maisons de campagne
    C.forEach((c, i) => {
      const h = M.countryHouse(i); h.position.set(c.x, 0.05, c.z); h.rotation.y = c.z > R.z1 ? Math.PI : 0;
      bakeStatic(h, true); h.visible = false; this.scene.add(h);
      const sign = M.forSale(); sign.position.set(c.x + 3, 0, c.z + (c.z > R.z1 ? -8 : 8)); this.scene.add(sign);
      const car = M.optimize(M.suv()); car.position.set(c.x - 4, 0.05, c.z + (c.z > R.z1 ? -7 : 7)); car.visible = false; this.scene.add(car);
      this.country.push({ g: h, sign, car, anchor: new THREE.Vector3(c.x, 5, c.z), owned: false });
    });
    // voitures qui tournent sur le périph'
    const cols = ['#f8fafc', '#1d4ed8', '#b91c1c', '#111827', '#a3a3a3', '#16a34a'];
    for (let i = 0; i < 6; i++) { const g = this.withLights(M.optimize(M.car(cols[i])), 1.3); this.scene.add(g); this.ringCars.push({ g, t: i / 6, speed: (0.008 + Math.random() * 0.004) * (i % 2 ? 1 : -1) }); }
  }

  resize() {
    const p = this.renderer.domElement.parentElement!;
    const w = p.clientWidth, h = p.clientHeight;
    this.renderer.setSize(w, h);
    this.post?.setSize(w, h);
    const a = w / h;
    this.camera.left = (-this.frustum * a) / 2; this.camera.right = (this.frustum * a) / 2;
    this.camera.top = this.frustum / 2; this.camera.bottom = -this.frustum / 2;
    this.camera.updateProjectionMatrix();
  }
  /** Point du sol sous un pixel de l'écran. */
  groundAt(clientX: number, clientY: number): THREE.Vector3 | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.raycaster.ray.intersectPlane(this.ground, new THREE.Vector3());
  }
  private clampTarget(v: THREE.Vector3) {
    const B = World.BOUNDS;
    v.x = THREE.MathUtils.clamp(v.x, B.x0, B.x1); v.z = THREE.MathUtils.clamp(v.z, B.z0, B.z1);
  }
  /** Glisser : le point du sol attrapé reste sous la souris (même quand la vue est tournée). */
  pan(dxPx: number, dyPx: number, clientX?: number, clientY?: number) {
    this.follow = false;
    this.camera.updateMatrixWorld();
    const r = this.renderer.domElement.getBoundingClientRect();
    const cx = clientX ?? r.left + r.width / 2, cy = clientY ?? r.top + r.height / 2;
    const a = this.groundAt(cx - dxPx, cy - dyPx), b = this.groundAt(cx, cy);
    if (!a || !b) return;
    this.target.add(a.sub(b)); this.clampTarget(this.target);
    this.desired.copy(this.target);
    this.camera.position.copy(this.target).add(this.offset); this.camera.updateMatrixWorld();
  }
  /** Déplacement au clavier, dans le sens de l'écran (haut = vers le fond). */
  nudge(right: number, up: number, dt: number) {
    const k = (this.frustum / this.camera.zoom) * 0.9 * dt;
    const fwd = new THREE.Vector3(-this.offset.x, 0, -this.offset.z).normalize(), side = new THREE.Vector3(-fwd.z, 0, fwd.x);
    this.desired.addScaledVector(side, right * k).addScaledVector(fwd, up * k); this.clampTarget(this.desired);
    this.follow = false;
  }
  goTo(x: number, z: number, zoom?: number) { this.desired.set(x, 0, z); this.clampTarget(this.desired); if (zoom) this.desiredZoom = zoom; }
  /** Molette : zoom vers le point sous la souris. */
  zoom(delta: number, clientX?: number, clientY?: number) {
    this.desiredZoom = null;
    const before = clientX !== undefined ? this.groundAt(clientX, clientY!) : null;
    this.camera.zoom = THREE.MathUtils.clamp(this.camera.zoom * (delta > 0 ? 0.88 : 1.13), 0.12, 2.6);
    this.camera.updateProjectionMatrix(); this.camera.updateMatrixWorld();
    if (before) { const after = this.groundAt(clientX!, clientY!); if (after) { this.target.add(before.sub(after)); this.clampTarget(this.target); this.desired.copy(this.target); this.camera.position.copy(this.target).add(this.offset); } }
  }
  /** Tourne la vue d'un quart de tour (dir = 1 ou -1). */
  rotate(dir: number) { this.desiredYaw += (dir * Math.PI) / 2; }
  resetView() { this.desiredYaw = Math.round(this.yaw / (Math.PI * 2)) * Math.PI * 2; this.goTo(2, -6, 0.8); }
  /** Angle de la vue pour la minicarte (0 = vue d'origine). */
  get viewYaw() { return this.yaw; }
  pick(clientX: number, clientY: number): StationKey | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    let best: { k: StationKey; d: number } | null = null;
    for (const st of this.stations) {
      const hit = this.raycaster.intersectObjects(st.meshes.filter(m => m.visible), true)[0];
      if (hit && (!best || hit.distance < best.d)) best = { k: st.key, d: hit.distance };
    }
    return best?.k ?? null;
  }
  project(v: THREE.Vector3) {
    const p = v.clone().project(this.camera);
    const el = this.renderer.domElement;
    return { x: ((p.x + 1) / 2) * el.clientWidth, y: ((1 - p.y) / 2) * el.clientHeight };
  }

  /** Synchronise les objets 3D avec l'état de la simulation. */
  sync(s: GameState, time: number) {
    for (const p of s.plants) {
      let g = this.plants.get(p.id);
      if (!g) { g = M.plant(); g.position.set(p.x, 0.62, p.z); g.rotation.y = p.id; this.plants.set(p.id, g); this.scene.add(g); }
      const lv = g.userData.leaves as THREE.Group;
      lv.scale.setScalar(0.25 + 0.75 * p.g);
      lv.rotation.z = Math.sin(time * 1.6 + p.id * 0.7) * 0.07; lv.rotation.x = Math.cos(time * 1.3 + p.id) * 0.05;   // vent
      const ripe = g.userData.ripe as THREE.Mesh;
      ripe.visible = p.g >= 1 && !p.reserved;
      ripe.position.y = 1.15 + Math.sin(time * 3 + p.id) * 0.06;
    }
    const alive = new Set<number>();
    for (const a of s.agents) {
      alive.add(a.id);
      let g = this.agents.get(a.id);
      if (!g) { g = M.character(a.kind); this.agents.set(a.id, g); this.scene.add(g); }
      if (a.kind === 'guard') {
        const ti = TOWER_POS.findIndex(([x, z]) => x === a.x && z === a.z);
        if (a.elevated && ti >= 0) {
          // en haut du mirador, derrière la mitrailleuse
          const ang = a.facing + Math.sin(time * 0.4 + ti * 1.7) * 0.9;
          g.position.set(a.x - Math.sin(ang) * 0.45, 3.8, a.z - Math.cos(ang) * 0.45);
          g.rotation.y = ang;
          (this.towers[ti]?.g.userData.turret as THREE.Group | undefined)?.rotation.set(0, ang, 0);
        } else {
          g.position.set(a.x, 0.2, a.z);
          g.rotation.y = a.facing + Math.sin(time * 0.35 + a.id) * 0.5;   // surveille les alentours
        }
        M.animateCharacter(g, time + a.id * 0.37, false, false, false, false);
        continue;
      }
      g.position.set(a.x, 0.2, a.z);
      g.rotation.y = lerpAngle(g.rotation.y, a.facing, 0.25);
      M.animateCharacter(g, time + a.id * 0.37, a.moving, a.state === 'work', a.carry > 0, !!a.firing);
      if (a.firing && Math.random() < 0.25) this.fx.emit('spark', a.x + Math.sin(a.facing) * 1.1, 1.3, a.z + Math.cos(a.facing) * 1.1, 2);
    }
    for (const [id, g] of this.agents) if (!alive.has(id)) { this.scene.remove(g); this.agents.delete(id); }

    for (const v of s.vans) {
      let g = this.vans.get(v.id);
      const vt = Math.max(0, tierOf(s.levels.garage, VEHICLE_TIERS));
      if (g && g.userData.tier !== vt) {   // le véhicule passe au modèle supérieur
        this.scene.remove(g); g = undefined; this.fx.emit('confetti', v.x, 1.5, v.z, 16);
      }
      if (!g) {
        g = this.withLights(M.vehicleForTier(vt, v.slot), [0.9, 1.7, 2.45, 1.65][vt]);
        g.userData.tier = vt; this.vans.set(v.id, g); this.scene.add(g);
      }
      g.position.set(v.x, 0.05 + (v.state === 'wait' ? 0.15 : 0), v.z);
      g.rotation.y = lerpAngle(g.rotation.y, v.facing, 0.2);
      (g.userData.cargo as THREE.Group).visible = v.load > 0;
      if (v.state !== 'wait' && Math.random() < 0.3) this.fx.emit('exhaust', v.x - Math.sin(v.facing) * 1.9, 0.45, v.z - Math.cos(v.facing) * 1.9);
    }
    // perquisition des Stups : convoi de 2 voitures, 3 agents descendent devant le portail
    const pol = s.police;
    this.police.visible = !!pol; this.police2.visible = !!pol && !pol.gign; this.gignVan.visible = !!pol?.gign;
    const on = Math.floor(time * 6) % 2 === 0;
    if (pol) {
      const back = pol.phase === 'leaving' ? -3.4 : 3.4;
      this.police.position.set(pol.x, 0.05, pol.z);
      this.police2.position.set(pol.x + back, 0.05, pol.z);
      this.gignVan.position.set(pol.x + back * 1.3, 0.05, pol.z); this.gignVan.rotation.y = pol.facing;
      for (const car of [this.police, this.police2]) {
        car.rotation.y = lerpAngle(car.rotation.y, pol.facing, 0.2);
        (car.userData.red.material as THREE.MeshStandardMaterial).emissiveIntensity = on ? 2.5 : 0.1;
        (car.userData.blue.material as THREE.MeshStandardMaterial).emissiveIntensity = on ? 0.1 : 2.5;
      }
    }
    this.polLights[0].intensity = pol ? (on ? 25 : 0) * (0.4 + this.night) : 0;
    this.polLights[1].intensity = pol ? (on ? 0 : 25) * (0.4 + this.night) : 0;
    const waiting = pol?.phase === 'waiting';
    this.gignTeam.forEach((c, i) => {
      c.visible = !!waiting && !!pol?.gign;
      if (c.visible) { c.position.set(LAYOUT.gate.x0 + 1 + i * 1, 0.05, LAYOUT.slab.z1 + 2); c.rotation.y = Math.PI; M.animateCharacter(c, time + i, false, false, false, false); }
    });
    this.cops.forEach((c, i) => {
      c.visible = !!waiting && !pol?.gign;
      if (waiting) { c.position.set(LAYOUT.gate.x0 + 1 + i * 1.1, 0.05, LAYOUT.slab.z1 + 1.1); c.rotation.y = Math.PI; }
    });
    // convoi de la milice
    const cvTier = miliceVehicleTier(s.levels.milice), cvSeen = new Set<number>();
    for (const c of s.convoy) {
      cvSeen.add(c.id);
      let g = this.convoyG.get(c.id);
      if (g && g.userData.tier !== cvTier) { this.scene.remove(g); g = undefined; }
      if (!g) { g = this.withLights(cvTier ? M.optimize(M.armored()) : M.optimize(M.technical()), cvTier ? 1.9 : 1.7); g.userData.tier = cvTier; this.convoyG.set(c.id, g); this.scene.add(g); }
      // --- animations : roues, suspension, tourelle, recul, gyrophares, antenne ---
      const u = g.userData, moved = Math.hypot(c.x - g.position.x, c.z - g.position.z);
      g.position.set(c.x, 0.2, c.z);
      g.rotation.y = lerpAngle(g.rotation.y, c.facing, 0.2);
      for (const w of u.wheels as THREE.Group[]) w.rotation.x += moved / 0.4;
      const driving = moved > 0.01;
      (u.body as THREE.Group).position.y = driving ? Math.sin(time * 18 + c.id) * 0.04 : Math.sin(time * 2 + c.id) * 0.01;
      (u.body as THREE.Group).rotation.z = driving ? Math.sin(time * 9 + c.id) * 0.015 : 0;
      const tur = u.turret as THREE.Group, gun = u.gun as THREE.Group;
      const aim = c.firing || s.op?.phase === 'fight' ? Math.sin(time * 2.5 + c.id) * 0.7 - (c.slot - 1) * 0.3 : Math.sin(time * 0.5 + c.id * 2) * 1.2;
      tur.rotation.y += (aim - tur.rotation.y) * 0.1;
      const kick = c.firing ? Math.abs(Math.sin(time * 70 + c.id)) : 0;
      gun.position.z = (u.kind === 'armored' ? 0.6 : 0) - kick * 0.12;
      gun.rotation.x = -0.05 - kick * 0.05;
      const fls = (u.flashes as THREE.Mesh[] | undefined) ?? [u.flash as THREE.Mesh];
      fls.forEach((f, i) => { f.visible = c.firing && Math.sin(time * 70 + c.id + i * 1.6) > 0; f.rotation.z = time * 30; });
      if (c.firing) {
        const wp = new THREE.Vector3(); fls[0].getWorldPosition(wp);
        if (Math.random() < 0.5) this.fx.emit('spark', wp.x, wp.y, wp.z, 2);
      }
      const onOp = !!s.op;
      (u.lights as THREE.Mesh[]).forEach((l, i) => { ((l.material as THREE.MeshStandardMaterial).emissiveIntensity = onOp ? (Math.sin(time * 14 + i * 1.5) > 0 ? 3 : 0.1) : 0); });
      if (u.antenna) (u.antenna as THREE.Group).rotation.x = driving ? -0.35 + Math.sin(time * 11) * 0.15 : Math.sin(time * 1.5) * 0.04;
      if (driving && Math.random() < 0.25) this.fx.emit('dust', c.x - Math.sin(c.facing) * 1.8, 0.3, c.z - Math.cos(c.facing) * 1.8);
      if (s.op && s.op.phase !== 'fight' && Math.random() < 0.3) this.fx.emit('exhaust', c.x - Math.sin(c.facing) * 2, 0.5, c.z - Math.cos(c.facing) * 2);
    }
    for (const [id, g] of this.convoyG) if (!cvSeen.has(id)) { this.scene.remove(g); this.convoyG.delete(id); }
    // commissariat : sous contrôle -> notre drapeau, plus de voitures devant
    const owned = s.grip >= GRIP.control;
    ((this.comG.userData.beacon as THREE.Mesh).material as THREE.MeshStandardMaterial).emissiveIntensity = Math.sin(time * 4) > 0.6 ? 3 : 0.2;
    (this.comG.userData.frFlag as THREE.Group).visible = !owned; (this.comG.userData.ourFlag as THREE.Group).visible = owned;
    this.comCars.forEach(c => (c.visible = !owned));
    this.syncFight(s, time);
    // dégâts du commissariat
    const dmg = s.comDamage;
    this.comHoles.forEach((h, i) => (h.visible = i < dmg * this.comHoles.length * 1.2));
    this.comBroken.forEach((b, i) => (b.visible = dmg > 0.15 + i * 0.06));
    if (s.op?.phase !== 'fight') this.comCars.forEach((c, i) => { const burnt = dmg > 0.4 + i * 0.1 || this.comWrecks[i].userData.burning === 1 && dmg > 0.2; c.visible = !owned && !burnt; this.comWrecks[i].visible = burnt; });
    this.comDmg = dmg;
    const fire = dmg > 0.6 && !this.comFireOut;
    if (fire && Math.random() < 0.6) this.fx.emit('fire', COMMISSARIAT.x - 3 + Math.random() * 6, 4.6, COMMISSARIAT.z - 0.3 + Math.random(), 1);
    this.comFire.forEach((f, i) => { f.visible = fire; if (fire) { f.scale.y = 0.7 + Math.abs(Math.sin(time * 9 + i * 2)) * 0.6; f.scale.x = f.scale.z = 0.8 + Math.sin(time * 7 + i) * 0.2; } });
    if (dmg > 0.35 && Math.random() < dmg * 0.25) this.fx.emit(this.comFireOut ? 'steam' : 'blacksmoke', COMMISSARIAT.x - 3 + Math.random() * 6, 4.4, COMMISSARIAT.z + Math.random());
    if (fire && Math.random() < 0.4) this.fx.emit('spark', COMMISSARIAT.x - 3 + Math.random() * 6, 4.8, COMMISSARIAT.z, 1);

    // BAC
    const seen = new Set<number>();
    for (const p of s.patrols) {
      seen.add(p.id);
      let g = this.bac.get(p.id);
      if (!g) { g = this.withLights(M.optimize(M.bacCar()), 1.4); this.bac.set(p.id, g); this.scene.add(g); }
      g.position.set(p.x, 0.05, p.z);
      g.rotation.y = lerpAngle(g.rotation.y, p.facing, 0.3);
      (g.userData.blue.material as THREE.MeshStandardMaterial).emissiveIntensity = on ? 2 : 0.2;
    }
    for (const [id, g] of this.bac) if (!seen.has(id)) { this.scene.remove(g); this.bac.delete(id); }

    // piles
    const lineStock = (l: LineKey) => PRODUCT_KEYS.filter(p => PRODUCTS[p].line === l).reduce((a, p) => a + s.stock[p], 0);
    M.setPile(this.piles.cannabis, lineStock('cannabis'));
    this.syncTiers(s);
    this.syncBiz(s, time);
    this.syncVilla(s, time);
    for (const k of LAB_KEYS) {
      const on = s.levels[k] > 0;
      M.setPile(this.piles[k + 'Out'], on ? s.labs[k].out : 0);
      M.setPile(this.piles[k], lineStock(k));
      if (on && Math.random() < 0.08) { const lb = LAYOUT.labs[k]; this.fx.emit('smoke', lb.x - 2 + Math.floor(Math.random() * 3) * 2, 4, lb.z - 0.8); }
    }

    for (const f of s.forklifts) {
      let g = this.forks.get(f.id);
      if (!g) { g = M.forklift(); this.forks.set(f.id, g); this.scene.add(g); }
      g.position.set(f.x, 0.2, f.z);
      g.rotation.y = lerpAngle(g.rotation.y, f.facing, 0.2);
      (g.userData.crate as THREE.Mesh).visible = f.load > 0;
      if (f.state !== 'wait' && Math.random() < 0.15) this.fx.emit('dust', f.x - Math.sin(f.facing) * 0.8, 0.3, f.z - Math.cos(f.facing) * 0.8);
    }
    this.rivals.forEach((g, i) => { if (g) g.visible = s.districts[i].rival > 0; });

    const moving = s.dryer.busy || s.dryer.input > 0 || s.dryer.output > 0 || s.agents.some(a => a.kind === 'packer' && a.state === 'work');
    for (const c of this.conveyors) {
      const cv = c.userData as { boxes: THREE.Mesh[]; len: number };
      cv.boxes.forEach((b, i) => { b.position.x = -cv.len / 2 + (((time * 0.6) + i / cv.boxes.length) % 1) * cv.len; b.visible = moving; });
    }

    const busy = s.dryer.busy;
    const dv = this.dryerG.children.find(c => c.visible) ?? this.dryerG.children[0];
    (dv.userData.winMat as THREE.MeshStandardMaterial).emissiveIntensity = busy ? 0.9 : 0;
    const top = (dv.userData.chimneyTop as THREE.Vector3).clone().add(this.dryerG.position);
    this.smoke.forEach((m, i) => {
      const t = (time * 0.6 + i / this.smoke.length) % 1;
      m.position.set(top.x + Math.sin(t * 5 + i) * 0.3, top.y + t * 3, top.z - t * 0.8);
      m.scale.setScalar(0.6 + t * 1.6);
      const mm = m.material as THREE.MeshStandardMaterial;
      mm.opacity = busy ? 0.75 * (1 - t) : Math.max(0, mm.opacity - 0.02);
    });
  }

  private tracer(a: THREE.Vector3, b: THREE.Vector3) {
    const t = this.tracers.find(x => x.life <= 0); if (!t) return;
    const pos = t.line.geometry.attributes.position as THREE.BufferAttribute;
    pos.setXYZ(0, a.x, a.y, a.z); pos.setXYZ(1, b.x, b.y, b.z); pos.needsUpdate = true;
    t.line.visible = true; t.life = 0.07;
  }
  /** Explosion : boule de feu, débris, fumée noire, flash lumineux. */
  explode(x: number, y: number, z: number) {
    this.fx.emit('blast', x, y + 0.4, z, 3); this.fx.emit('fire', x, y, z, 30); this.fx.emit('spark', x, y, z, 16); this.fx.emit('debris', x, y, z, 12); this.fx.emit('blacksmoke', x, y + 1, z, 10);
    this.flash.position.set(x, y + 1.5, z); this.flash.intensity = 120; this.camShake = 0.6;
  }
  private bleed(x: number, z: number) {
    this.fx.emit('blood', x, 1.1, z, 16);
    const p = M.bloodPool(); p.position.set(x + (Math.random() - 0.5) * 0.4, 0.27, z + (Math.random() - 0.5) * 0.4); this.scene.add(p);
    this.pools.push({ m: p, t: 0 });
  }
  /** Un véhicule qui arrive sur place : accélère, freine avant l'arrêt (poussière), gyrophares. */
  private driveIn(g: THREE.Group, fx: number, fz: number, tx: number, tz: number, at: number, siren = true): Arrival {
    const b = new THREE.Box3().setFromObject(g), lights: THREE.Sprite[] = [];
    if (siren) for (const [sx, col] of [[-0.35, '#3b82f6'], [0.35, '#60a5fa']] as const) { const l = glow(col, 2.4); l.position.set(sx, b.max.y + 0.1, b.max.z * 0.45); g.add(l); lights.push(l); }
    g.position.set(fx, 0.05, fz); g.rotation.y = Math.atan2(tx - fx, tz - fz); g.visible = false; this.scene.add(g);
    const a = { g, tx, tz, at, done: false, lights };
    this.arrivals.push(a); return a;
  }
  private stepArrivals(dt: number, time: number) {
    for (const a of this.arrivals) {
      a.lights.forEach((l, i) => ((l.material as THREE.SpriteMaterial).opacity = Math.sin(time * 13 + i * Math.PI) > 0.2 ? 0.95 : 0.04));
      if (a.done || this.clk < a.at) continue;
      a.g.visible = true;
      const p = a.g.position, dx = a.tx - p.x, dz = a.tz - p.z, d = Math.hypot(dx, dz);
      const v = Math.min(24, 0.8 + d * 2.2);
      if (v * dt >= d) {
        p.x = a.tx; p.z = a.tz; a.done = true;
        const bx = Math.sin(a.g.rotation.y), bz = Math.cos(a.g.rotation.y);
        this.fx.emit('dust', p.x - bx * 1.4, 0.3, p.z - bz * 1.4, 5);
      } else {
        p.x += (dx / d) * v * dt; p.z += (dz / d) * v * dt;
        if (d < 6 && Math.random() < 0.6) this.fx.emit('dust', p.x - (dx / d) * 1.2, 0.3, p.z - (dz / d) * 1.2, 1);   // freinage
      }
      a.g.rotation.x = 0;
    }
  }
  private unit(role: M.Role, x: number, z: number, cx: number, cz: number, opt: Partial<Unit> = {}): Unit {
    const g = M.character(role); g.position.set(x, 0.25, z); g.visible = !opt.ride && !(opt.appear ?? 0); this.scene.add(g);
    return { g, x, z, cx, cz, px: cx, pz: cz, dieAt: 999, dead: 0, appear: 0, run: Math.hypot(cx - x, cz - z) > 0.2, ph: Math.random() * 1.5, up: Math.random() < 0.5, cr: 0, ...opt };
  }
  /** Déplace un perso vers (tx, tz) en courant ; renvoie true une fois arrivé. */
  private runTo(u: Unit, tx: number, tz: number, dt: number, time: number, speed = 4.6) {
    const dx = tx - u.x, dz = tz - u.z, d = Math.hypot(dx, dz);
    if (d < 0.08) { u.x = tx; u.z = tz; u.g.position.set(u.x, 0.25, u.z); return true; }
    const st = Math.min(d, speed * dt); u.x += (dx / d) * st; u.z += (dz / d) * st;
    u.g.position.set(u.x, 0.25, u.z); u.g.rotation.y = Math.atan2(dx, dz);
    M.animateCharacter(u.g, time * 1.4 + u.cx, true, false, false); M.crouch(u.g, 0);
    return false;
  }
  /** Un combattant : court se mettre à couvert, puis alterne « planqué » et « sort pour tirer ». */
  private fighter(u: Unit, foes: Unit[], fallback: THREE.Vector3 | null, dt: number, time: number) {
    if (u.ride && !u.g.visible) {
      if (!u.ride.done) return;
      u.g.visible = true; u.x = u.ride.g.position.x + (u.ride.tz === u.ride.g.position.z ? 0 : 1.1); u.z = u.ride.g.position.z + (u.ride.tz === u.ride.g.position.z ? 1.1 : 0);
      u.g.position.set(u.x, 0.25, u.z); u.run = true;
    }
    if (!u.g.visible) return;
    if (!u.dead && this.clk >= u.dieAt) { u.dead = 0.001; this.bleed(u.x, u.z); }
    if (u.dead) { u.dead += dt * 1.6; M.fallDown(u.g, u.dead); return; }
    if (u.run) { if (this.runTo(u, u.cx, u.cz, dt, time)) u.run = false; return; }
    u.ph -= dt;
    if (u.ph <= 0) { u.up = !u.up; u.ph = u.up ? 0.8 + Math.random() * 1.2 : 0.7 + Math.random() * 1.6; }
    const tx = u.up ? u.px : u.cx, tz = u.up ? u.pz : u.cz;
    u.x += (tx - u.x) * Math.min(1, dt * 6); u.z += (tz - u.z) * Math.min(1, dt * 6); u.g.position.set(u.x, 0.25, u.z);
    u.cr += ((u.up ? 0 : 1) - u.cr) * Math.min(1, dt * 8);
    const alive = foes.filter(f => !f.dead && f.g.visible && !f.run);
    const tgt = alive.length ? alive[Math.floor((time * 0.7 + u.cx) % alive.length)] : null;
    const aim = tgt ? new THREE.Vector3(tgt.x, 1, tgt.z) : fallback;
    if (aim) u.g.rotation.y = lerpAngle(u.g.rotation.y, Math.atan2(aim.x - u.x, aim.z - u.z), 0.2);
    const firing = u.up && u.cr < 0.4;
    M.animateCharacter(u.g, time + u.cx, false, false, false, firing); M.crouch(u.g, u.cr);
    if (firing && aim && Math.random() < 0.22) {
      const to = aim.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.8, 0.1 + Math.random() * 0.5, (Math.random() - 0.5) * 0.8));
      this.tracer(new THREE.Vector3(u.x, 1.15, u.z), to);
      if (Math.random() < 0.35) this.fx.emit('spark', to.x, to.y, to.z, 2);
    }
  }
  /** Fusillade : chacun se planque, les renforts débarquent toutes sirènes hurlantes, puis secours, rubalise, police scientifique et presse. */
  private syncFight(s: GameState, time: number) {
    const dt = Math.min(0.1, Math.max(0, time - this.lastT)); this.lastT = time;
    const op = s.op, phase = op?.phase ?? '';
    const atCom = !!op && op.key !== 'rival';
    if (phase === 'fight' && this.lastPhase !== 'fight' && op) {
      this.clearFight(); this.comFireOut = false;
      const res = op.result!;
      const spot = atCom ? { x: COMMISSARIAT.x, z: COMMISSARIAT.z } : (() => { const d = DISTRICTS[op.target], c = blockCenter(d.r, d.c); return { x: roadX(d.c) + 3.4, z: c.z }; })();
      this.spot = { ...spot, com: atCom };
      const rz = LAYOUT.roadZ + 0.9;
      if (atCom) {
        // les flics du commissariat se planquent derrière leurs voitures
        this.comCars.forEach(c => { for (const dx of [-0.75, 0.75]) this.enemies.push(this.unit('cop', c.position.x + dx, c.position.z - 1.3, c.position.x + dx, c.position.z - 1.25, { ph: Math.random() })); });
        // renforts : BAC puis GIGN, freinage, ils descendent et courent se mettre à couvert derrière leur véhicule
        const bac = this.driveIn(this.withLights(M.optimize(M.bacCar()), 1.4), spot.x + 42, rz, spot.x + 9, rz, 0.8);
        for (const dz of [-0.5, 0.5]) this.enemies.push(this.unit('bac', 0, 0, spot.x + 10.9, rz + dz, { ride: bac, appear: 3.2 }));
        const gv = this.driveIn(M.optimize(M.vanOf('gign')), spot.x + 55, rz, spot.x + 14, rz, 2.2);
        for (let i = 0; i < 4; i++) { const cx = spot.x + 16.4 + (i >> 1) * 0.8, cz = rz + (i % 2 ? 0.45 : -0.45); this.enemies.push(this.unit('gign', 0, 0, cx, cz, { ride: gv, appear: 5, px: spot.x + 15.6, pz: rz + (i % 2 ? 1.35 : -1.35) })); }
      } else {
        for (let i = 0; i < 6; i++) { const x = spot.x + 0.3 + (i % 2) * 1.4, z = spot.z - 3.4 + i * 1.3; this.enemies.push(this.unit('rival', x, z, x, z)); }
      }
      // notre infanterie descend des véhicules et se planque derrière, côté opposé à l'ennemi
      const ex = this.enemies.reduce((a, e) => a + e.cx, 0) / this.enemies.length, ez = this.enemies.reduce((a, e) => a + e.cz, 0) / this.enemies.length;
      s.convoy.forEach(c => {
        let ax = c.x - ex, az = c.z - ez; const n = Math.hypot(ax, az) || 1; ax /= n; az /= n;
        for (let i = 0; i < 3; i++) {
          const off = (i - 1) * 0.95, cx = c.x + ax * 1.7 - az * off, cz = c.z + az * 1.7 + ax * off;
          this.infantry.push(this.unit('guard', c.x - az * off * 0.5, c.z + ax * off * 0.5, cx, cz));
        }
      });
      // qui tombe et quand
      const nDead = Math.min(this.enemies.length, atCom ? res.cops + (res.win ? 2 : 0) : res.rivals);
      [...this.enemies].sort(() => Math.random() - 0.5).slice(0, nDead).forEach((e, i) => (e.dieAt = Math.max(e.appear + 0.8, FIGHT_TIME * (0.12 + (0.8 * i) / Math.max(1, nDead)))));
      [...this.infantry].sort(() => Math.random() - 0.5).slice(0, res.ours).forEach((u, i) => (u.dieAt = FIGHT_TIME * (0.3 + 0.4 * i)));
      this.booms = atCom ? [2.2, 4.6, 6.8] : [2.6, 5.8];
      this.clk = 0;
    }
    if (phase === 'fight' && op) this.clk = op.t; else this.clk += dt;
    if (this.lastPhase === 'fight' && phase !== 'fight') {
      this.bodiesTimer = 48;
      for (const u of [...this.enemies, ...this.infantry]) if (!u.g.visible && !u.dead) this.scene.remove(u.g);
      this.enemies = this.enemies.filter(u => u.g.visible || u.dead); this.infantry = this.infantry.filter(u => u.g.visible || u.dead);
      for (const u of [...this.enemies, ...this.infantry]) if (!u.dead && u.dieAt < 999) { u.dead = 1; u.g.visible = true; this.bleed(u.x, u.z); M.fallDown(u.g, 1); }
      for (const u of this.infantry) if (!u.dead) this.scene.remove(u.g);   // les vivants remontent dans les véhicules
      this.infantry = this.infantry.filter(u => u.dead);
      const won = !!this.lastWin;
      for (const e of this.enemies) if (!e.dead) e.flee = this.spot.com ? (won ? { x: this.spot.x + 0.2, z: this.spot.z + 2.3 } : undefined) : { x: e.x + 18, z: e.z };
      this.startAftermath();
      this.spawnPress(this.spot.com);
    }
    if (op?.result) this.lastWin = op.result.win;
    this.lastPhase = phase;
    this.stepArrivals(dt, time);
    this.stepPress(dt, time);
    for (const p of this.pools) { p.t += dt; p.m.scale.setScalar(Math.min(1, 0.05 + p.t * 0.35)); }
    // épaves : en feu (flammes + fumée noire) ou éteintes (vapeur)
    const fires: THREE.Vector3[] = [];
    if (this.comDmg > 0.6 && !this.comFireOut) fires.push(new THREE.Vector3(COMMISSARIAT.x, 5.5, COMMISSARIAT.z + 1));
    for (const w of [...this.comWrecks, ...this.fightWrecks]) if (w.visible && !w.userData.out) fires.push(new THREE.Vector3(w.position.x, 1.6, w.position.z));
    this.fireLights.forEach((l, i) => { const f = fires[i]; if (f) { l.position.copy(f); l.intensity = (18 + Math.sin(time * 23 + i * 3) * 5 + Math.sin(time * 37 + i) * 4) * (0.6 + this.night * 1.4); } else l.intensity = 0; });
    for (const w of [...this.comWrecks, ...this.fightWrecks]) if (w.visible) {
      if (w.userData.out) { if (Math.random() < 0.08) this.fx.emit('steam', w.position.x, 0.9, w.position.z); }
      else { if (Math.random() < 0.5) this.fx.emit('fire', w.position.x + (Math.random() - 0.5), 0.9, w.position.z + (Math.random() - 0.5) * 1.5, 1); if (Math.random() < 0.12) this.fx.emit('blacksmoke', w.position.x, 1.6, w.position.z); }
    }
    if (!this.enemies.length && !this.infantry.length && !this.after) return;
    if (phase !== 'fight') { this.stepAftermath(dt, time); return; }
    // explosions programmées
    while (this.booms.length && this.clk >= this.booms[0]) {
      this.booms.shift();
      const car = atCom ? this.comCars.find(c => c.visible) : null;
      if (car) { this.explode(car.position.x, 0.8, car.position.z); car.visible = false; const w = this.comWrecks[this.comCars.indexOf(car)]; w.visible = true; w.userData.burning = 1; w.userData.out = false; }
      else if (!atCom && !this.fightWrecks.length) {
        const w = M.wreck(); w.position.set(this.spot.x - 0.2, 0.06, this.spot.z + 4.8); w.rotation.y = 0.4; w.userData.burning = 1; this.scene.add(w); this.fightWrecks.push(w);
        this.explode(w.position.x, 0.8, w.position.z);
      } else { const e = this.enemies[Math.floor(Math.random() * this.enemies.length)]; if (e) this.explode(e.x + (Math.random() - 0.5) * 3, 0.6, e.z + (Math.random() - 0.5) * 2); }
    }
    const comAim = new THREE.Vector3(COMMISSARIAT.x - 4 + Math.random() * 8, 0.8 + Math.random() * 3, COMMISSARIAT.z + 2.25);
    for (const e of this.enemies) this.fighter(e, this.infantry, s.convoy[0] ? new THREE.Vector3(s.convoy[0].x, 1.4, s.convoy[0].z) : null, dt, time);
    for (const u of this.infantry) this.fighter(u, this.enemies, atCom ? comAim : null, dt, time);
    const alive = this.enemies.filter(e => !e.dead && e.g.visible);
    for (const c of s.convoy) if (c.firing && Math.random() < 0.6) {
      const tgt = alive.length && Math.random() < 0.7 ? alive[Math.floor(Math.random() * alive.length)] : null;
      const to = tgt ? new THREE.Vector3(tgt.x, 0.6 + Math.random() * 0.8, tgt.z) : atCom ? comAim : new THREE.Vector3(c.x + 6, 1.5, c.z);
      this.tracer(new THREE.Vector3(c.x, 2, c.z), to);
      if (Math.random() < 0.5) this.fx.emit(Math.random() < 0.5 ? 'spark' : 'dust', to.x, to.y, to.z, 2);
    }
  }
  /** Après la fusillade : rubalise, SAMU, pompiers, police scientifique, draps sur les corps. */
  private startAftermath() {
    const sp = this.spot, bodies = [...this.enemies, ...this.infantry].filter(u => u.dead);
    const xs = [sp.x, ...bodies.map(b => b.x)], zs = [sp.z + (sp.com ? 3 : 0), ...bodies.map(b => b.z)];
    const x0 = Math.min(...xs) - 2.6, x1 = Math.max(...xs) + 2.6, z0 = Math.min(...zs) - 2.2, z1 = Math.max(...zs) + 2.2;
    const objs: THREE.Object3D[] = [];
    const tapeG = new THREE.Group(); const corners = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
    corners.forEach(([a, b], i) => { const [c, d] = corners[(i + 1) % 4]; tapeG.add(M.tape(a, b, c, d)); });
    tapeG.visible = false; this.scene.add(tapeG); objs.push(tapeG);
    // les secours arrivent à la file sur l'autre voie
    const lane = sp.com ? { axis: 'x', c: LAYOUT.roadZ + 0.9, from: sp.x - 50, dir: -1, ref: sp.x } : { axis: 'z', c: sp.x - 4.3, from: sp.z + 50 * (sp.z >= LAYOUT.roadZ ? 1 : -1), dir: sp.z >= LAYOUT.roadZ ? 1 : -1, ref: sp.z };
    const t0 = this.clk;
    const veh = (g: THREE.Group, off: number, at: number) => { const p = lane.ref + lane.dir * off; return lane.axis === 'x' ? this.driveIn(g, lane.from, lane.c, p, lane.c, t0 + at) : this.driveIn(g, lane.c, lane.from, lane.c, p, t0 + at); };
    const fires: { x: number; z: number; y: number; w?: THREE.Group }[] = [];
    for (const w of [...this.comWrecks, ...this.fightWrecks]) if (w.visible && !w.userData.out) fires.push({ x: w.position.x, z: w.position.z, y: 0.8, w });
    if (sp.com && this.comDmg > 0.6) fires.push({ x: sp.x, z: sp.z + 0.5, y: 4.2 });
    const workers: Worker[] = [];
    const samu = veh(M.optimize(M.vanOf('samu')), sp.com ? 3 : 6, 1);
    bodies.slice(0, 2).forEach((b, i) => workers.push({ u: this.unit('medic', 0, 0, b.x + (i ? -0.8 : 0.8), b.z + 0.5, { ride: samu }), job: 'medic', tx: b.x, tz: b.z, t: 0 }));
    if (fires.length) {
      const ft = veh(M.optimize(M.fireTruck()), sp.com ? 9.5 : 12.5, 2.4);
      fires.slice(0, 3).forEach((f, i) => workers.push({ u: this.unit('pompier', 0, 0, f.x + (i % 2 ? 2.4 : -2.4), f.z + 1.8, { ride: ft }), job: 'fire', tx: f.x, tz: f.z, ty: f.y, t: 0, w: f.w }));
    }
    const ps = veh(M.optimize(M.vanOf('ps')), sp.com ? 15.5 : 19, 4);
    const pick = bodies.slice(-2);
    pick.forEach((b, i) => workers.push({ u: this.unit('forensic', 0, 0, b.x + (i ? 0.7 : -0.7), b.z - 0.6, { ride: ps }), job: 'ps', tx: b.x, tz: b.z, t: 0 }));
    this.after = { t: 0, objs, tape: tapeG, workers, fires, sheets: 0, markers: false, bodies };
  }
  private stepAftermath(dt: number, time: number) {
    this.bodiesTimer -= dt;
    // survivants : les flics rentrent au commissariat (ou restent sur place), les rivaux s'enfuient
    for (const e of this.enemies) {
      if (e.dead) { if (!e.sheet) M.fallDown(e.g, Math.max(1, e.dead)); continue; }
      if (!e.g.visible) continue;
      if (e.flee) { if (this.runTo(e, e.flee.x, e.flee.z, dt, time, 5)) e.g.visible = false; }
      else { M.animateCharacter(e.g, time + e.cx, false, false, false); M.crouch(e.g, 0); }
    }
    const A = this.after;
    if (A) {
      A.t += dt;
      if (A.t > 0.6 && !A.tape.visible) { A.tape.visible = true; this.rise(A.tape); }
      for (const w of A.workers) {
        const u = w.u;
        if (!u.g.visible) { if (!u.ride?.done) continue; u.g.visible = true; u.x = u.ride.g.position.x; u.z = u.ride.g.position.z + 1.2; u.run = true; }
        if (u.run) { if (this.runTo(u, u.cx, u.cz, dt, time, 3.6)) u.run = false; continue; }
        w.t += dt;
        u.g.rotation.y = lerpAngle(u.g.rotation.y, Math.atan2(w.tx - u.x, w.tz - u.z), 0.2);
        if (w.job === 'fire') {
          M.animateCharacter(u.g, time, false, false, true); M.crouch(u.g, 0); u.g.userData.crate.visible = false;
          const out = w.w ? !!w.w.userData.out : this.comFireOut;
          if (!out) {
            const sx = u.x + Math.sin(u.g.rotation.y) * 0.5, sz = u.z + Math.cos(u.g.rotation.y) * 0.5, d = Math.hypot(w.tx - sx, w.tz - sz);
            this.fx.emit('water', sx, 1.1, sz, 3, { x: (w.tx - sx) / d * 6, y: 2.2 + (w.ty ?? 0.8) * 0.9, z: (w.tz - sz) / d * 6 });
            if (Math.random() < 0.3) this.fx.emit('steam', w.tx, (w.ty ?? 0.8) + 0.3, w.tz);
            if (w.t > 9) { if (w.w) w.w.userData.out = true; else this.comFireOut = true; this.fx.emit('steam', w.tx, (w.ty ?? 0.8) + 0.4, w.tz, 10); }
          }
        } else {
          M.animateCharacter(u.g, time * (w.job === 'medic' ? 1 : 0.5) + u.cx, false, true, false); M.crouch(u.g, 1);
          if (w.job === 'ps' && Math.random() < 0.012) { this.fx.emit('blast', u.x, 1, u.z, 1); }   // flash photo
        }
      }
      // marqueurs de la police scientifique
      if (A.t > 9 && !A.markers) {
        A.markers = true;
        for (const b of A.bodies) for (let k = 0; k < 2; k++) { const m = M.marker(); m.position.x = b.x + (Math.random() - 0.5) * 2.4; m.position.z = b.z + (Math.random() - 0.5) * 2.4; this.scene.add(m); A.objs.push(m); }
      }
      // un drap sur chaque corps
      while (A.sheets < A.bodies.length && A.t > 8 + A.sheets * 0.9) {
        const b = A.bodies[A.sheets++];
        const tw = new THREE.Vector3(); (b.g.userData.torso as THREE.Object3D).getWorldPosition(tw);
        const dx = tw.x - b.x, dz = tw.z - b.z, len = Math.hypot(dx, dz) || 1;
        const sh = M.sheet(); sh.position.set(b.x + (dx / len) * 0.55, 0.25, b.z + (dz / len) * 0.55); sh.rotation.y = Math.atan2(dx, dz);
        this.scene.add(sh); A.objs.push(sh); b.g.visible = false; b.sheet = true;
      }
    }
    if (this.bodiesTimer <= 0) this.clearFight();
  }
  private clearFight() {
    this.enemies.forEach(e => this.scene.remove(e.g)); this.enemies = [];
    this.infantry.forEach(u => this.scene.remove(u.g)); this.infantry = [];
    this.arrivals.forEach(a => this.scene.remove(a.g)); this.arrivals = [];
    this.pools.forEach(p => this.scene.remove(p.m)); this.pools = [];
    this.fightWrecks.forEach(w => this.scene.remove(w)); this.fightWrecks = [];
    if (this.after) { this.after.objs.forEach(o => this.scene.remove(o)); this.after.workers.forEach(w => this.scene.remove(w.u.g)); this.after = null; }
  }
  /** Le camion télé arrive sur place, journaliste + caméraman filment. */
  private spawnPress(atCom: boolean) {
    this.press.forEach(o => this.scene.remove(o)); this.press = [];
    const x = (atCom ? COMMISSARIAT.x : this.spot.x) - 22, z = LAYOUT.roadZ + 2.8;
    const van = M.optimize(M.vanOf('press')); van.position.set(x - 30, 0.05, LAYOUT.roadZ + 0.9); van.rotation.y = Math.PI / 2; this.scene.add(van);
    const j = M.character('press'), cam = M.character('press');
    j.position.set(x + 1, 0.25, z); cam.position.set(x + 2.4, 0.25, z + 0.3); j.rotation.y = cam.rotation.y = Math.PI * 0.85;
    const tv = M.tvCamera(); tv.position.set(0.25, 1.35, 0.1); cam.add(tv);
    j.visible = cam.visible = false; this.scene.add(j, cam);
    this.press = [van, j, cam]; this.pressT = 0; this.pressStop = x - 2;
  }
  private stepPress(dt: number, time: number) {
    if (!this.press.length) return;
    this.pressT += dt;
    const [van, j, cam] = this.press;
    if (van.position.x < this.pressStop) van.position.x = Math.min(this.pressStop, van.position.x + Math.min(18, 1 + (this.pressStop - van.position.x) * 2.2) * dt);
    else if (!j.visible) { j.visible = cam.visible = true; }
    if (j.visible) { M.animateCharacter(j as THREE.Group, time, false, true, false); M.animateCharacter(cam as THREE.Group, time + 1, false, false, false); }
    if (this.pressT > 45) { this.press.forEach(o => this.scene.remove(o)); this.press = []; }
  }

  /** Affiche le bon palier de chaque bâtiment, de la place et des miradors ; anime les changements. */
  private syncTiers(s: GameState) {
    for (const [key, c] of Object.entries(this.tierG) as [StationKey, THREE.Group][]) {
      const lvl = s.levels[key], t = lvl > 0 ? tierOf(lvl, VISUAL_TIERS[key]) : -1;
      const prev = this.curTier[key];
      if (prev === t) continue;
      c.children.forEach((ch, i) => (ch.visible = i === t));
      const plot = this.plots[key]; if (plot) plot.visible = lvl === 0;
      this.curTier[key] = t;
      if (prev !== undefined && t >= 0) {
        this.rise(c.children[t]);
        if (t > 0) this.onTierUp(key, t);
      }
    }
    const total = Object.values(s.levels).reduce((a, b) => a + b, 0);
    const bt = tierOf(total, BASE_TIERS);
    if (bt !== this.baseTier) {
      this.baseG.children.forEach((ch, i) => (ch.visible = i === bt));
      if (this.baseTier >= 0) {
        for (let i = 0; i < 60; i++) this.fx.emit('dust', -18 + Math.random() * 37, 0.4, -22 + Math.random() * 28);
        this.fx.emit('confetti', 0, 3, -8, 60);
        this.onTierUp('base', bt);
      }
      this.baseTier = bt;
    }
    for (const tw of this.towers) {
      const show = s.levels.milice >= tw.lvl;
      if (show !== tw.shown) { tw.g.visible = show; tw.shown = show; if (show) this.rise(tw.g); }
    }
  }
  /** Camions des business, chiens, caméras, fumée du groupe électrogène. */
  private syncLoops(s: GameState, time: number) {
    const along = (pts: THREE.Vector2[], k: number) => {
      let total = 0; for (let i = 1; i < pts.length; i++) total += pts[i].distanceTo(pts[i - 1]);
      let d = k * total;
      for (let i = 1; i < pts.length; i++) { const L = pts[i].distanceTo(pts[i - 1]); if (d <= L || i === pts.length - 1) { const t = L ? Math.min(1, d / L) : 0; return { p: pts[i - 1].clone().lerp(pts[i], t), dir: Math.atan2(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y) }; } d -= L; }
      return { p: pts[pts.length - 1].clone(), dir: 0 };
    };
    for (const L of this.loops) {
      const lvl = s.levels[L.kind], n = lvl > 0 ? tierOf(lvl, VISUAL_TIERS[L.kind]) + 1 : 0;
      if (L.idx >= n) { L.g.visible = false; continue; }
      const f = (((time + (L.idx * L.period) / n) % L.period) / L.period);
      const g = L.g, cargo = g.userData.cargo as THREE.Object3D;
      const ease = (t: number) => t * t * (3 - 2 * t);
      let pos: { p: THREE.Vector2; dir: number } | null = null, moving = false;
      if (f < 0.12) { pos = along(L.out, 0); pos.dir = Math.atan2(L.out[1].x - L.out[0].x, L.out[1].y - L.out[0].y); }
      else if (f < 0.45) { pos = along(L.out, ease((f - 0.12) / 0.33)); moving = true; }
      else if (f < 0.6) pos = null;
      else if (f < 0.88) { pos = along(L.back, ease((f - 0.6) / 0.28)); moving = true; }
      else { pos = along(L.back, 1); pos.dir = Math.atan2(L.back[L.back.length - 1].x - L.back[L.back.length - 2].x, L.back[L.back.length - 1].y - L.back[L.back.length - 2].y); }
      g.visible = !!pos;
      if (!pos) continue;
      // la marchandise part pleine (armes, clopes) ; la dépanneuse revient avec une épave
      cargo.visible = L.kind === 'casse' ? f >= 0.45 : f < 0.45 || f < 0.06;
      if (L.kind !== 'casse' && f < 0.12) cargo.visible = f > 0.04;
      g.position.set(pos.p.x + (L.idx % 2 && !moving ? 2.6 : 0), 0.25, pos.p.y);
      g.rotation.y = lerpAngle(g.rotation.y, pos.dir, moving ? 0.25 : 1);
      if (moving && Math.random() < 0.15) this.fx.emit('exhaust', g.position.x - Math.sin(g.rotation.y) * 2.4, 0.5, g.position.z - Math.cos(g.rotation.y) * 2.4);
    }
    for (const d of this.dogs) {
      d.t = (d.t + d.speed * 0.016) % 1;
      const r = along(d.path, d.t); d.g.position.set(r.p.x, 0.2, r.p.y); d.g.rotation.y = lerpAngle(d.g.rotation.y, r.dir, 0.2);
      const u = d.g.userData; (u.legs as THREE.Mesh[]).forEach((l, i) => (l.rotation.x = Math.sin(time * 12 + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.5)); (u.tail as THREE.Mesh).rotation.y = Math.sin(time * 9) * 0.5;
    }
    this.cams.forEach((c, i) => { (c.userData.cam as THREE.Group).rotation.y = Math.sin(time * 0.4 + i) * 0.7; (((c.userData.led as THREE.Mesh).material) as THREE.MeshStandardMaterial).emissiveIntensity = Math.sin(time * 4) > 0 ? 2.5 : 0.2; });
    if (Math.random() < 0.25) this.fx.emit('exhaust', this.genPipe.x, this.genPipe.y, this.genPipe.z);
    M.animateCharacter(this.smoker, time * 0.3, false, false, false);
    (this.smoker.userData.armR as THREE.Group).rotation.x = -1.6 - Math.max(0, Math.sin(time * 0.7)) * 0.9;
    if (Math.sin(time * 0.7) > 0.95 && Math.random() < 0.3) this.fx.emit('exhaust', this.smoker.position.x + 0.2, 1.9, this.smoker.position.z + 0.3);
  }
  /** Une rotation d'avion cargo : approche, atterrissage, roulage, déchargement par les camions, décollage. */
  private syncPlane(s: GameState, time: number) {
    const L = s.levels.aero, P = this.plane;
    if (!L) { P.visible = false; this.aeroTrucks.forEach(t => (t.visible = false)); return; }
    const f = s.bizT.aero / aeroCycle(L), C = BIZ.aero, rz = C.z - 9;          // piste en z = -32
    const seg = (a: number, b: number) => Math.min(1, Math.max(0, (f - a) / (b - a)));
    const ease = (t: number) => t * t * (3 - 2 * t);
    const apron = { x: C.x + 4, z: C.z + 5 }, rw0 = C.x - 31, rw1 = C.x + 28;
    let x = 0, y = 0, z = rz, ry = Math.PI / 2, pitch = 0, prop = 30;
    if (f < 0.12) { const t = seg(0, 0.12); x = rw0 - 60 + t * 75; y = Math.max(0, 16 * (1 - t / 0.85)); pitch = y > 0 ? 0.05 : 0; }
    else if (f < 0.2) { const t = ease(seg(0.12, 0.2)); x = rw0 + 15 + t * (C.x + 8 - rw0 - 15); }
    else if (f < 0.27) { const t = ease(seg(0.2, 0.27)); x = C.x + 8; z = rz + t * (apron.z - rz); ry = Math.PI / 2 - t * Math.PI / 2; prop = 12; }
    else if (f < 0.55) { x = C.x + 8; z = apron.z; ry = 0; prop = f < 0.3 ? 6 : 0; }
    else if (f < 0.62) { const t = ease(seg(0.55, 0.62)); x = C.x + 8; z = apron.z - t * (apron.z - rz); ry = Math.PI - t * Math.PI / 2 ; prop = 12; }
    else if (f < 0.68) { const t = ease(seg(0.62, 0.68)); x = C.x + 8 - t * (C.x + 8 - rw0); ry = -Math.PI / 2; prop = 12; }
    else if (f < 0.72) { x = rw0; ry = Math.PI / 2 - (1 - seg(0.68, 0.72)) * Math.PI; prop = 20; }
    else if (f < 0.88) { const t = seg(0.72, 0.88); x = rw0 + t * t * 140; y = Math.max(0, (x - rw1 + 20) * 0.3); pitch = y > 0 ? -0.12 : 0; prop = 40; }
    else { P.visible = false; }
    if (f < 0.88) {
      P.visible = true; P.position.set(x, 0.05 + y, z); P.rotation.set(0, ry, 0);
      (P.userData.body as THREE.Group).rotation.x = pitch;
      for (const p of P.userData.props as THREE.Group[]) p.rotation.z += prop * 0.016;
      if (y === 0 && f > 0.11 && f < 0.14 && Math.random() < 0.6) this.fx.emit('dust', x - 2, 0.4, z, 2);   // toucher des roues
      if (f > 0.72 && f < 0.8 && y === 0 && Math.random() < 0.5) this.fx.emit('dust', x - 4, 0.4, z, 1);
    }
    // camions : hangar -> avion -> hangar, pendant que l'avion est garé
    const hangar = { x: C.x - 10, z: C.z + 12 };
    this.aeroTrucks.forEach((t, i) => {
      const k = seg(0.3 + i * 0.05, 0.98);
      t.visible = k > 0 && k < 1;
      if (!t.visible) return;
      const tx = apron.x + 4 + i * 2.2, tz = apron.z + 2.5, go = k < 0.4 ? ease(k / 0.4) : k < 0.55 ? 1 : 1 - ease((k - 0.55) / 0.45);
      const nx = hangar.x + i * 2.2 + (tx - hangar.x - i * 2.2) * go, nz = hangar.z + (tz - hangar.z) * go;
      const dx = nx - t.position.x, dz = nz - t.position.z;
      if (Math.abs(dx) + Math.abs(dz) > 0.01) t.rotation.y = lerpAngle(t.rotation.y, Math.atan2(dx, dz), 0.3);
      t.position.set(nx, 0.25, nz);
      const cargo = t.userData.cargo as THREE.Object3D | undefined; if (cargo) cargo.visible = k > 0.5;
    });
    if (this.tierG.aero) { const v = this.tierG.aero.children.find(c => c.visible); const rad = v?.userData.radar as THREE.Object3D | undefined; if (rad) rad.rotation.y = time * 1.5; }
  }
  /** Le repaire : folies achetées, gardes du corps, voiture du tueur et ses contrats. */
  private syncVilla(s: GameState, time: number) {
    this.country.forEach((c, i) => { if (c.owned !== s.country[i]) { c.owned = s.country[i]; c.g.visible = c.owned; c.car.visible = c.owned; c.sign.visible = !c.owned; if (c.owned) { this.rise(c.g); this.fx.emit('confetti', c.anchor.x, 4, c.anchor.z, 50); } } });
    for (const k of LUX_KEYS) { const o = this.luxG[k]; if (s.lux[k] !== o.visible) { o.visible = s.lux[k]; if (o.visible) this.rise(o); } }
    const h = this.luxG.helico.userData; if (this.luxG.helico.visible) (h.rotor as THREE.Group).rotation.y = time * (Math.sin(time * 0.05) > 0.3 ? 14 : 0.2);
    const n = stats.villa(s.levels.villa).guards;
    this.villaGuards.forEach((g, i) => { g.visible = i < n; if (i < n) M.animateCharacter(g, time + i, false, false, false); });
    // tueur à gages
    const hit = s.hit, car = this.hitCar;
    if (!hit) { if (car.visible) { car.visible = false; } if (this.hitFx.victim && (this.hitFx.t += 1 / 60) > 25) { this.scene.remove(this.hitFx.victim); this.hitFx.victim = null; } return; }
    car.visible = hit.phase !== 'gone';
    car.position.set(hit.x, 0.05, hit.z); car.rotation.y = lerpAngle(car.rotation.y, hit.facing, 0.25);
    if (this.follow) { this.desired.set(hit.x, 0, hit.z); }
    if (hit.phase === 'go') { this.hitFx.done = false; this.hitFx.key = hit.key; if (Math.random() < 0.3) this.fx.emit('dust', hit.x - Math.sin(hit.facing) * 1.4, 0.3, hit.z - Math.cos(hit.facing) * 1.4); return; }
    if (hit.phase === 'act') {
      const tx = hit.key === 'commissaire' ? COMMISSARIAT.x + 1 : hit.x + 2.6, tz = hit.key === 'commissaire' ? COMMISSARIAT.z + 3.2 : hit.z;
      if (!this.hitFx.done) {
        this.hitFx.done = true; this.hitFx.t = 0;
        if (this.hitFx.victim) this.scene.remove(this.hitFx.victim);
        if (hit.key === 'planque') { if (hit.win) { this.explode(tx + 2, 1, tz); setTimeout(() => this.explode(tx + 3.5, 2.5, tz - 1), 350); } }
        else {
          const v = M.character(hit.key === 'commissaire' ? 'cop' : hit.key === 'journaliste' ? 'press' : hit.key === 'boss' ? 'rival' : 'civil');
          v.position.set(tx, 0.25, tz); v.rotation.y = Math.PI / 2; this.scene.add(v); this.hitFx.victim = v;
          v.userData.dieT = hit.win ? 0.9 : 99;
        }
      }
      this.hitFx.t += 1 / 60;
      const v = this.hitFx.victim;
      if (Math.random() < 0.35) { this.tracer(new THREE.Vector3(hit.x, 1.2, hit.z), new THREE.Vector3(tx + (Math.random() - 0.5) * 0.6, 0.6 + Math.random(), tz + (Math.random() - 0.5) * 0.6)); }
      if (v) {
        if (this.hitFx.t > v.userData.dieT) { if (!v.userData.dead) { v.userData.dead = 0.001; this.bleed(tx, tz); } v.userData.dead += 1 / 30; M.fallDown(v, v.userData.dead); }
        else { M.animateCharacter(v, time, false, false, false); if (!hit.win) { v.position.x += 0.08; v.rotation.y = Math.PI / 2; M.animateCharacter(v, time * 1.4, true, false, false); } }
      }
      return;
    }
    if (this.follow) this.follow = false;
    void BOSSES;
  }
  /** Bases des autres joueurs : construites, mises à jour quand ils grossissent, effacées quand ils partent. */
  setOthers(net: Net) {
    const seen = new Set<number>();
    for (const p of net.online ? net.players : []) {
      const r = net.relSlot(p), pos = OTHER_SLOTS[r]; if (!pos) continue;
      seen.add(p.id);
      const key = `${r}|${p.tier}|${p.villa}|${Math.min(4, Math.floor(p.power / 3))}|${p.cartel}`;
      const cur = this.others.get(p.id);
      if (cur && cur.key === key) continue;
      if (cur) this.scene.remove(cur.g);
      const g = M.otherBase(p.tier, p.villa, Math.floor(p.power / 3), p.cartel);
      g.position.set(pos.x, 0, pos.z); bakeStatic(g, true); this.scene.add(g);
      if (!cur) { this.rise(g); for (let i = 0; i < 30; i++) this.fx.emit('dust', pos.x + (Math.random() - 0.5) * 30, 0.4, pos.z + (Math.random() - 0.5) * 22); }
      this.others.set(p.id, { g, key }); this.otherAnchors.set(p.id, new THREE.Vector3(pos.x, 7, pos.z));
    }
    for (const [id, o] of this.others) if (!seen.has(id)) {
      this.scene.remove(o.g); this.others.delete(id); this.otherAnchors.delete(id);
      const a = o.g.position; this.explode(a.x, 1, a.z); for (let i = 0; i < 40; i++) this.fx.emit('blacksmoke', a.x + (Math.random() - 0.5) * 28, 1, a.z + (Math.random() - 0.5) * 20);
    }
  }
  /** Notre base se fait attaquer par un autre joueur : rafales depuis la route, explosion au portail, deux gars à terre. */
  baseAttacked(win: boolean) {
    const from = new THREE.Vector3(12, 1.2, LAYOUT.roadZ + 1.5);
    let n = 0;
    const burst = () => {
      for (let i = 0; i < 4; i++) this.tracer(from.clone().add(new THREE.Vector3((Math.random() - 0.5) * 4, 0, 0)), new THREE.Vector3(4 + Math.random() * 12, 0.6 + Math.random() * 2, -2 + Math.random() * 8));
      if (++n < 14) setTimeout(burst, 120);
      else if (win) { this.explode(9.6, 1, 5); this.bleed(7.5, 4.2); this.bleed(11, 3.4); }
    };
    burst(); this.goTo(9, 3, 1);
  }
  private ctlFrames: THREE.Mesh[] = [];
  /** Liseré au sol autour de chaque quartier, à la couleur de celui qui le contrôle. */
  setControlTint(colors: (string | null)[]) {
    if (!this.ctlFrames.length) DISTRICTS.forEach(d => {
      const c = blockCenter(d.r, d.c), o = CITY.block / 2 + 1.6, i = CITY.block / 2 + 0.6;
      const sh = new THREE.Shape([new THREE.Vector2(-o, -o), new THREE.Vector2(o, -o), new THREE.Vector2(o, o), new THREE.Vector2(-o, o)]);
      sh.holes.push(new THREE.Path([new THREE.Vector2(-i, -i), new THREE.Vector2(-i, i), new THREE.Vector2(i, i), new THREE.Vector2(i, -i)]));
      const m = new THREE.Mesh(new THREE.ShapeGeometry(sh), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.position.set(c.x, 0.16, c.z); m.renderOrder = 1; this.scene.add(m); this.ctlFrames.push(m);
    });
    this.ctlFrames.forEach((m, k) => { const col = colors[k]; m.visible = !!col; if (col) (m.material as THREE.MeshBasicMaterial).color.set(col); });
  }
  /** Juste après un achat de luxe : petit feu d'artifice au repaire. */
  luxBought(k: LuxKey) { const o = this.luxG[k]; this.fx.emit('confetti', o.position.x, 3, o.position.z, 40); this.goTo(o.position.x, o.position.z, 1); }
  /** Terrains achetés (dalle + clôture qui sortent de terre) et ouvriers des business annexes. */
  private syncBiz(s: GameState, time: number) {
    for (const lk of LAND_KEYS) {
      const L = this.lands[lk], own = s.land[lk];
      if (own !== L.owned) {
        L.owned = own; L.g.visible = own; L.sign.visible = !own;
        if (own) { this.rise(L.g); const l = LANDS[lk]; for (let i = 0; i < 40; i++) this.fx.emit('dust', l.x0 + Math.random() * (l.x1 - l.x0), 0.4, l.z0 + Math.random() * (l.z1 - l.z0)); }
      }
    }
    this.syncPlane(s, time);
    this.syncLoops(s, time);
    for (const k of BIZ_KEYS) {
      const lvl = s.levels[k], plot = this.plots[k]!;
      plot.visible = lvl === 0 && s.land[BIZ[k].land];
      const n = stats.biz(k, lvl).workers;
      const truck: Partial<Record<BizKey, [number, number]>> = { armes: [-40.2, -9.6], clopes: [-26.4, 2.2] };
      this.bizCrew[k].forEach((ch, i) => {
        ch.visible = i < n; if (i >= n) return;
        const tr = truck[k];
        if (tr && i < 2) {
          // deux gars chargent le camion : caisse à l'aller, mains vides au retour
          const b = BIZ[k], hx = b.x - 2.4 + i * 1.6, hz = b.z + 4.2 + (i % 2) * 0.6, ph = (time * 0.18 + i * 0.5) % 1, k2 = ph < 0.5 ? ph * 2 : 2 - ph * 2;
          const x = hx + (tr[0] + i * 0.7 - hx) * k2, z = hz + (tr[1] - hz) * k2;
          ch.rotation.y = Math.atan2((tr[0] - hx) * (ph < 0.5 ? 1 : -1), (tr[1] - hz) * (ph < 0.5 ? 1 : -1));
          ch.position.set(x, 0.45, z);
          M.animateCharacter(ch, time * 1.2 + i, true, false, ph < 0.5);
        } else M.animateCharacter(ch, time * 0.8 + i * 1.3, false, k !== 'armes', false);
      });
    }
  }
  /** Fait sortir un objet de terre (construction). */
  private rise(o: THREE.Object3D) {
    this.pulses = this.pulses.filter(p => p.obj !== o);
    this.pulses.push({ obj: o, t: 0, build: true, y: o.userData.baseY ?? (o.userData.baseY = o.position.y), sx: 1 });
    const wp = new THREE.Vector3(); o.getWorldPosition(wp);
    this.fx.emit('confetti', wp.x, 3, wp.z, 30);
    for (let i = 0; i < 20; i++) this.fx.emit('dust', wp.x + (Math.random() - 0.5) * 6, 0.4, wp.z + (Math.random() - 0.5) * 5);
  }

  /** Rebond d'un bâtiment amélioré (ou sortie de terre s'il vient d'être construit) + étincelles. */
  pulse(key: StationKey, build: boolean) {
    const st = this.stations.find(s => s.key === key); if (!st) return;
    if (build) return;   // la construction est animée par syncTiers (rise)
    for (const m of st.meshes) {
      if (!m.visible) continue;
      this.pulses = this.pulses.filter(p => p.obj !== m);
      this.pulses.push({ obj: m, t: 0, build, y: m.userData.baseY ?? (m.userData.baseY = m.position.y), sx: 1 });
    }
    this.fx.emit(build ? 'confetti' : 'spark', st.pos.x, st.pos.y - 1, st.pos.z, build ? 40 : 18);
    if (build) for (let i = 0; i < 24; i++) this.fx.emit('dust', st.pos.x + (Math.random() - 0.5) * 6, 0.4, st.pos.z + (Math.random() - 0.5) * 5);
  }
  burst(kind: 'money' | 'spark' | 'confetti' | 'dust', x: number, z: number, n = 12) { this.fx.emit(kind, x, 1.4, z, n); }

  /** Vie en ville : passants sur les trottoirs, voitures civiles. */
  private buildLife() {
    for (let i = 0; i < 22; i++) {
      const d = DISTRICTS[i % DISTRICTS.length], c = blockCenter(d.r, d.c);
      const g = M.character('civil'); this.scene.add(g);
      this.walkers.push({ g, cx: c.x, cz: c.z, t: Math.random(), speed: (0.008 + Math.random() * 0.006) * (Math.random() < 0.5 ? 1 : -1) });
    }
    const cols = ['#e11d48', '#f8fafc', '#0ea5e9', '#facc15', '#334155', '#16a34a', '#78716c'];
    for (let i = 0; i < 11; i++) {
      const g = this.withLights(M.optimize(M.car(cols[i % cols.length])), 1.3); this.scene.add(g);
      const a = Math.floor(Math.random() * (CITY.size + 1)), b = Math.floor(Math.random() * (CITY.size + 1));
      this.civCars.push({ g, from: [a, b], to: [a, b], t: 1 });
    }
  }

  /** Animations indépendantes de la simulation (appelé chaque frame). */
  animate(dt: number, time: number, gameTime: number) {
    this.fx.update(dt);
    this.stepRing(dt);
    for (const t of this.tracers) if (t.life > 0) { t.life -= dt; if (t.life <= 0) t.line.visible = false; }
    // jour / nuit
    const n = nightFactor(gameTime); this.night = n;
    const day = new THREE.Color('#bfe3f5'), dusk = new THREE.Color('#1c2541');
    const bg = day.clone().lerp(dusk, n);
    (this.scene.background as THREE.Color).copy(bg); this.scene.fog!.color.copy(bg);
    this.sun.intensity = 2.6 * (1 - n * 0.8);
    this.sun.color.set('#fff3dc').lerp(new THREE.Color('#9db4ff'), n);
    this.hemi.intensity = 1.5 * (1 - n * 0.55);
    this.hemi.color.set('#e8f4ff').lerp(new THREE.Color('#6d7fb8'), n);
    const gk = this.post.enabled ? 0.45 : 0.85;
    for (const g of this.glows) (g.material as THREE.SpriteMaterial).opacity = n * gk;
    for (const g of this.headlights) (g.material as THREE.SpriteMaterial).opacity = n * 0.9;
    M.windowMat().emissiveIntensity = n * (this.post.enabled ? 0.6 : 1.1);
    // rebonds / constructions
    for (const p of this.pulses) {
      p.t += dt;
      if (p.build) {
        const k = Math.min(1, p.t / 0.9), e = 1 - Math.pow(1 - k, 3);
        p.obj.position.y = p.y - 5 * (1 - e);
        p.obj.scale.set(1, 0.6 + 0.4 * e + Math.sin(k * Math.PI) * 0.1, 1);
      } else {
        const k = Math.min(1, p.t / 0.45);
        const b = Math.sin(k * Math.PI) * 0.12 * (1 - k * 0.5);
        // les groupes posés à l'origine (champ, labos) sautent au lieu de gonfler, sinon ils glisseraient
        const pivot = Math.abs(p.obj.position.x) + Math.abs(p.obj.position.z) > 0.01;
        if (pivot) p.obj.scale.set(1 + b * 0.6, 1 + b, 1 + b * 0.6);
        else { p.obj.scale.set(1, 1 + b, 1); p.obj.position.y = p.y + b * 3; }
      }
    }
    this.pulses = this.pulses.filter(p => { const done = p.t > (p.build ? 0.9 : 0.45); if (done) { p.obj.scale.set(1, 1, 1); p.obj.position.y = p.y; } return !done; });
    // tourelles qui balayent

    // passants (tour du pâté de maisons)
    const half = CITY.block / 2 - 0.35;
    for (const w of this.walkers) {
      w.t = (w.t + w.speed * dt * 4 + 1) % 1;
      const u = w.t * 4, side = Math.floor(u), f = u - side;
      const pts = [[-half, -half], [half, -half], [half, half], [-half, half]];
      const [x0, z0] = pts[side], [x1, z1] = pts[(side + 1) % 4];
      w.g.position.set(w.cx + x0 + (x1 - x0) * f, 0.3, w.cz + z0 + (z1 - z0) * f);
      const dir = Math.atan2(x1 - x0, z1 - z0) + (w.speed < 0 ? Math.PI : 0);
      w.g.rotation.y = dir;
      M.animateCharacter(w.g, time * 0.8 + w.cx, true, false, false);
    }
    // voitures civiles : se baladent sur la grille
    const N = CITY.size;
    for (const c of this.civCars) {
      const a = { x: roadX(c.from[0]), z: roadZLine(c.from[1]) }, b = { x: roadX(c.to[0]), z: roadZLine(c.to[1]) };
      const len = Math.max(0.01, Math.hypot(b.x - a.x, b.z - a.z));
      c.t = Math.min(1, c.t + (7 * dt) / len);
      const dx = (b.x - a.x) / len, dz = (b.z - a.z) / len;
      c.g.position.set(a.x + (b.x - a.x) * c.t + dz * 0.9, 0.05, a.z + (b.z - a.z) * c.t - dx * 0.9);
      if (len > 0.1) c.g.rotation.y = lerpAngle(c.g.rotation.y, Math.atan2(dx, dz), 0.3);
      if (c.t >= 1) {
        const [i, j] = c.to;
        const opts = [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]].filter(([x, y]) => x >= 0 && y >= 0 && x <= N && y <= N && !(x === c.from[0] && y === c.from[1]));
        c.from = [i, j]; c.to = opts[Math.floor(Math.random() * opts.length)] as [number, number]; c.t = 0;
      }
    }
  }

  private stepRing(dt: number) {
    const R = RING, W = R.x1 - R.x0, D = R.z1 - R.z0, P = 2 * (W + D);
    for (const c of this.ringCars) {
      c.t = (c.t + c.speed * dt * 6 + 1) % 1;
      let d = c.t * P, x = 0, z = 0, dir = 0; const off = c.speed > 0 ? 0.9 : -0.9;
      if (d < W) { x = R.x0 + d; z = R.z0 - off; dir = Math.PI / 2; }
      else if ((d -= W) < D) { x = R.x1 + off; z = R.z0 + d; dir = 0; }
      else if ((d -= D) < W) { x = R.x1 - d; z = R.z1 + off; dir = -Math.PI / 2; }
      else { d -= W; x = R.x0 - off; z = R.z1 - d; dir = Math.PI; }
      if (c.speed < 0) dir += Math.PI;
      c.g.position.set(x, 0.05, z); c.g.rotation.y = lerpAngle(c.g.rotation.y, dir, 0.25);
    }
  }
  /** Mesure les FPS et baisse la qualité si ça rame (jamais en dessous du jouable). */
  private measure() {
    const now = performance.now(), P = this.perf;
    if (!P.last) { P.last = now; return; }
    const dt = now - P.last; P.last = now;
    if (document.hidden || dt > 500 || location.search.includes('hq')) { P.acc = 0; P.n = 0; return; }
    P.warm += dt; if (P.warm < 6000) return;           // on laisse le jeu se lancer
    P.acc += dt; P.n++;
    if (P.acc > 3000) {
      const fps = (1000 * P.n) / P.acc; P.acc = 0; P.n = 0;
      if (fps < 40 && this.quality < 3) this.setQuality(this.quality + 1);
    }
  }
  setQuality(lvl: number) {
    this.quality = lvl;
    if (lvl >= 1) { this.renderer.setPixelRatio(1); this.post.aoScale = 0.5; this.resize(); }
    if (lvl >= 2) this.post.ao.enabled = false;
    if (lvl >= 3) {
      this.post.bloom.enabled = false;
      this.sun.shadow.mapSize.set(1024, 1024); this.sun.shadow.map?.dispose(); (this.sun.shadow as unknown as { map: null }).map = null;
    }
    this.onQuality(lvl);
  }
  render() {
    this.target.lerp(this.desired, 0.08);
    if (this.desiredZoom) {
      this.camera.zoom += (this.desiredZoom - this.camera.zoom) * 0.08;
      this.camera.updateProjectionMatrix();
      if (Math.abs(this.camera.zoom - this.desiredZoom) < 0.005) this.desiredZoom = null;
    }
    this.sun.position.copy(this.target).add(new THREE.Vector3(20, 40, 12));
    this.sun.target.position.copy(this.target);
    this.flash.intensity *= 0.85;
    this.yaw += (this.desiredYaw - this.yaw) * 0.12;
    const R = Math.hypot(22, 22), a = Math.PI / 4 + this.yaw;
    this.offset.set(Math.sin(a) * R, 24, Math.cos(a) * R);
    this.camera.position.copy(this.target).add(this.offset);
    this.camera.lookAt(this.target);
    if (this.camShake > 0.01) { this.camera.position.x += (Math.random() - 0.5) * this.camShake; this.camera.position.y += (Math.random() - 0.5) * this.camShake; this.camShake *= 0.9; }
    const bs = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.fx.setScale(bs.y * this.camera.zoom / (this.camera.top - this.camera.bottom));
    // ombres recalculées une image sur deux
    this.perf.frame++;
    if (this.perf.frame % 2 === 0 || this.quality === 0) this.renderer.shadowMap.needsUpdate = true;
    this.measure();
    if (this.post.enabled) this.post.render(this.night, performance.now() / 1000);
    else this.renderer.render(this.scene, this.camera);
  }
}

type Arrival = { g: THREE.Group; tx: number; tz: number; at: number; done: boolean; lights: THREE.Sprite[] };
type Unit = { g: THREE.Group; x: number; z: number; cx: number; cz: number; px: number; pz: number; dieAt: number; dead: number; appear: number; ride?: Arrival; run: boolean; ph: number; up: boolean; cr: number; flee?: { x: number; z: number }; sheet?: boolean };
type Worker = { u: Unit; job: 'medic' | 'fire' | 'ps'; tx: number; tz: number; ty?: number; t: number; w?: THREE.Group };
type Aftermath = { t: number; objs: THREE.Object3D[]; tape: THREE.Group; workers: Worker[]; fires: { x: number; z: number }[]; sheets: number; markers: boolean; bodies: Unit[] };

function lerpAngle(a: number, b: number, t: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
function mulberry(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Fusionne tous les meshes d'un groupe par matériau (des milliers d'objets -> quelques draw calls). */
function bakeStatic(group: THREE.Group, local = false) {
  group.updateMatrixWorld(true);
  const inv = local ? group.matrixWorld.clone().invert() : new THREE.Matrix4();
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const keep: THREE.Mesh[] = [];
  group.traverse(o => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (Array.isArray(m.material)) { const k = new THREE.Mesh(m.geometry.clone().applyMatrix4(m.matrixWorld).applyMatrix4(inv), m.material); k.castShadow = k.receiveShadow = true; keep.push(k); return; }
    let g = m.geometry.clone().applyMatrix4(m.matrixWorld).applyMatrix4(inv);
    if (g.index) g = g.toNonIndexed();
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    g.morphAttributes = {};
    const list = buckets.get(m.material) ?? []; list.push(g); buckets.set(m.material, list);
  });
  group.clear();
  keep.forEach(k => group.add(k));
  for (const [material, geos] of buckets) {
    const merged = mergeGeometries(geos, false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh);
  }
  if (!local) { group.position.set(0, 0, 0); group.rotation.set(0, 0, 0); group.scale.set(1, 1, 1); }
}
