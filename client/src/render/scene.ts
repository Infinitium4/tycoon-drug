// Scène 3D : caméra iso, décor, et synchronisation avec l'état de la simulation.
import * as THREE from 'three';
import { CITY, DISTRICTS, LAB_KEYS, LAYOUT, LINES, LabKey, LineKey, PRODUCTS, PRODUCT_KEYS, StationKey, blockCenter, roadX, roadZLine } from '../sim/config';
import { GameState, benchPos, labPile } from '../sim/sim';
import * as M from './models';
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
  frustum = 26;
  districtAnchors: THREE.Vector3[] = [];
  stations: StationAnchor[] = [];
  piles: Record<string, THREE.Group> = {};
  pilePos: Record<string, THREE.Vector3> = {};
  police!: THREE.Group;
  private police2!: THREE.Group;
  private cops: THREE.Group[] = [];
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

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 300);
    this.camera.zoom = 0.8;
    this.scene.background = new THREE.Color('#bfe3f5');
    this.scene.fog = new THREE.Fog('#bfe3f5', 90, 170);

    this.scene.add(new THREE.HemisphereLight('#e8f4ff', '#8fbf6a', 1.5));
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
    bakeStatic(this.staticG);
    // les bâtiments interactifs sont aussi fusionnés (chacun dans son groupe, pour garder clic / visibilité)
    for (const st of this.stations) for (const m of st.meshes) if ((m as THREE.Group).isGroup) bakeStatic(m as THREE.Group, true);
    this.rivals.forEach(g => g && bakeStatic(g, true));

    this.police = M.policeCar(); this.police.visible = false; this.scene.add(this.police);
    this.police2 = M.policeCar(); this.police2.visible = false; this.scene.add(this.police2);
    for (let i = 0; i < 3; i++) { const c = M.character('cop'); c.visible = false; M.animateCharacter(c, i, false, false, false); this.scene.add(c); this.cops.push(c); }
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private staticG = new THREE.Group();
  /** Objet interactif / animé : ajouté tel quel à la scène. */
  private add<T extends THREE.Object3D>(o: T, x = 0, z = 0, ry?: number): T {
    o.position.x += x; o.position.z += z; if (ry !== undefined) o.rotation.y = ry; this.scene.add(o); return o;
  }
  /** Décor fixe : fusionné en quelques gros meshes à la fin (performances). */
  private deco<T extends THREE.Object3D>(o: T, x = 0, z = 0, ry?: number): T {
    o.position.x += x; o.position.z += z; if (ry !== undefined) o.rotation.y = ry; this.staticG.add(o); return o;
  }

  // ---------------- décor général ----------------
  private buildStatic() {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), M.mat('#8fcf6e'));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; this.staticG.add(ground);
    // route principale base -> ville, avec trottoirs et lampadaires
    const rz = LAYOUT.roadZ, rx0 = -40, rx1 = CITY.x0;
    this.deco(M.box(rx1 - rx0, 0.06, 4, '#5b6170', 0, 0), (rx0 + rx1) / 2, rz);
    this.deco(M.box(rx1 - rx0, 0.12, 0.6, '#e5e7eb', 0, 0.04), (rx0 + rx1) / 2, rz - 2.3);
    this.deco(M.box(rx1 - rx0, 0.12, 0.6, '#e5e7eb', 0, 0.04), (rx0 + rx1) / 2, rz + 2.3);
    for (let x = rx0 + 1; x < rx1; x += 3) this.deco(M.box(1.4, 0.02, 0.14, '#f8fafc', 0.06, 0), x, rz);
    for (let x = 24; x < rx1; x += 12) this.deco(M.lamp(), x, rz + 2.6, Math.PI);
    // forêt entre la base et la ville + autour
    const rf = mulberry(99);
    const plant = (x: number, z: number) => this.deco(M.tree(), x, z);
    for (let k = 0; k < 160; k++) {
      const x = 24 + rf() * (CITY.x0 - 28), z = -45 + rf() * 90;
      if (Math.abs(z - rz) < 4.5) continue;
      plant(x, z);
    }
    for (let k = 0; k < 70; k++) { const x = -45 + rf() * 66, z = -48 + rf() * 22; if (z < -25) plant(x, z); }
    for (let k = 0; k < 45; k++) plant(-48 + rf() * 26, -30 + rf() * 60);
    for (let k = 0; k < 30; k++) plant(-24 + rf() * 46, 12.5 + rf() * 18);
  }

  // ---------------- la base ----------------
  private buildBase() {
    const L = LAYOUT, S = L.slab, P = L.plants;
    const W = S.x1 - S.x0, D = S.z1 - S.z0, cx = (S.x0 + S.x1) / 2, cz = (S.z0 + S.z1) / 2;
    this.deco(M.box(W + 1, 0.2, D + 1, '#cfcac0', 0, 0.12), cx, cz);
    this.deco(M.box(W, 0.02, D, '#c4bfb5', 0.2, 0), cx, cz);
    this.deco(M.box(L.gate.x1 - L.gate.x0, 0.07, L.roadZ - S.z1, '#5b6170', 0, 0), (L.gate.x0 + L.gate.x1) / 2, (S.z1 + L.roadZ) / 2);

    // clôture (portail ouvert côté route)
    const post = (x: number, z: number) => this.deco(M.box(0.16, 1.5, 0.16, '#475569', 0.2, 0.04), x, z);
    const rail = (x0: number, z0: number, x1: number, z1: number) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      for (const y of [0.85, 1.5]) { const r = M.box(len, 0.08, 0.08, '#64748b', y, 0.02); r.rotation.y = -Math.atan2(z1 - z0, x1 - x0); this.deco(r, (x0 + x1) / 2, (z0 + z1) / 2); }
      for (let t = 0; t <= len; t += 1.6) post(x0 + ((x1 - x0) * t) / len, z0 + ((z1 - z0) * t) / len);
    };
    const fz0 = S.z0 - 0.3, fz1 = S.z1 + 0.3, fx0 = S.x0 - 0.3, fx1 = S.x1 + 0.3;
    rail(fx0, fz0, fx1, fz0); rail(fx0, fz0, fx0, fz1); rail(fx1, fz0, fx1, fz1); rail(fx0, fz1, L.gate.x0, fz1);
    this.deco(M.barrier(), L.gate.x0 + 0.1, fz1 + 0.2);

    // allées (marquage blanc) : allée nord des chariots, allée est, allée piétonne sud
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

    // ---- 1. plantation : 5 rangées, une allée par jardinier ----
    const bedLen = (P.cols - 1) * P.dx + 1.6, bx = P.x0 + ((P.cols - 1) * P.dx) / 2;
    const fieldArea = new THREE.Group();
    for (let r = 0; r < P.rows; r++) { const b = M.bed(bedLen); b.position.set(bx, 0.2, P.z0 + r * P.dz); fieldArea.add(b); }
    this.scene.add(fieldArea);
    const fx1b = L.harvestHomeX + 0.5;
    this.staticG.add(M.paintRect(P.x0 - 1.3, P.z0 - 1.0, fx1b, P.z0 + (P.rows - 1) * P.dz + P.dz / 2 + 0.5));
    // tapis : longe le champ puis entre dans le séchoir
    const cv1 = L.fieldConvX, cTop = P.z0 + (P.rows - 1) * P.dz + P.dz / 2 + 0.4, dz = L.dryer.z;
    const dryerW = L.dryer.x - 2.1;
    const conv = (x0: number, z0: number, x1: number, z1: number) => {
      const len = Math.hypot(x1 - x0, z1 - z0); const c = M.conveyor(len);
      c.position.set((x0 + x1) / 2, 0.2, (z0 + z1) / 2); c.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
      this.scene.add(c); this.conveyors.push(c); return c;
    };
    conv(cv1, cTop, cv1, dz); conv(cv1, dz, dryerW, dz);

    // ---- 2. séchoir ----
    this.dryerG = this.add(M.dryer(), L.dryer.x, L.dryer.z); this.dryerG.position.y = 0.2;
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 1), new THREE.MeshStandardMaterial({ color: '#f1f5f9', transparent: true, opacity: 0 }));
      this.smoke.push(s); this.scene.add(s);
    }
    this.staticG.add(M.paintRect(L.dryer.x - 2.7, L.dryer.z - 2.1, L.dryer.x + 2.7, L.dryer.z + 2.1));

    // ---- 3. conditionnement : table sous auvent, emballeurs à poste fixe ----
    const T = L.table;
    conv(L.dryer.x + 2.1, T.z, T.x - 1.25, T.z);
    this.deco(M.shed(6, 5), T.x, T.z + 0.2, 0).position.y = 0.2;
    const tableG = this.add(M.table(), T.x, T.z); tableG.position.y = 0.2;
    this.staticG.add(M.paintRect(T.x - 3, T.z - 2.3, T.x + 3, T.z + 2));

    // ---- 4. stock + tapis depuis la table ----
    const SK = L.stock, sx = 10.3;
    conv(T.x + 1.25, T.z, sx, T.z); conv(sx, T.z, sx, SK.cannabis.z); conv(sx, SK.cannabis.z, SK.cannabis.x - 0.7, SK.cannabis.z);
    this.staticG.add(M.paintRect(SK.cannabis.x - 1, SK.cannabis.z - 1.1, SK.labo.x + 1, SK.cannabis.z + 1.1, '#f8fafc'));

    // ---- 5. garage + parking ----
    const garageG = this.add(M.garage(), L.garage.x, L.garage.z, 0); garageG.position.y = 0.2;
    for (let i = 0; i <= 4; i++) { const x = L.vanPark.x - L.vanGap / 2 + i * L.vanGap; this.deco(M.paint(x, L.vanPark.z - 1.5, x, L.vanPark.z + 1.5, '#f8fafc', 0.12)); }

    // ---- bureau, QG milice ----
    const officeG = this.add(M.office(), L.office.x, L.office.z, 0); officeG.position.y = 0.2;
    this.miliceG = new THREE.Group(); this.miliceG.add(M.miliceHQ());
    const miliceLot = M.plot(5, 3.6);
    this.miliceG.position.set(L.milice.x, 0.2, L.milice.z); miliceLot.position.set(L.milice.x, 0, L.milice.z);
    this.scene.add(this.miliceG, miliceLot); this.miliceG.userData.lot = miliceLot;

    // déco rangée : zone vide du milieu (citerne, fûts, palettes) + lampadaires + haies
    const dc = { x: 1.5, z: -1 };
    this.deco(M.waterTank(), dc.x - 3, dc.z).position.y = 0.2;
    for (let i = 0; i < 4; i++) this.deco(M.barrel(i % 2 ? '#16a34a' : '#2563eb'), dc.x + i * 0.85, dc.z - 0.6).position.y = 0.2;
    for (let i = 0; i < 3; i++) this.deco(M.box(1.1, 0.14, 1.1, '#a07a4f', 0.2, 0.02), dc.x + i * 1.3, dc.z + 0.9);
    for (const [x, z] of [[S.x0 + 0.6, S.z1 - 0.6], [S.x0 + 0.6, S.z0 + 0.4], [L.eastX + 0.5, S.z0 + 0.4], [L.gate.x0 - 0.6, S.z1 - 0.5], [-1.2, S.z1 - 0.5]]) this.deco(M.lamp(), x, z).position.y = 0.2;
    for (let x = L.milice.x + 3.2; x < L.gate.x0 - 1.5; x += 1.6) this.deco(M.bush(), x, S.z1 - 0.5).position.y = 0.2;

    // piles de stock (une par ligne de produit) + sorties des labos
    const mkPile = (key: string, x: number, z: number, color: string) => {
      this.pilePos[key] = new THREE.Vector3(x, 0, z);
      const p = M.pile(color); p.position.x += x; p.position.z += z; this.scene.add(p); this.piles[key] = p;
    };
    mkPile('cannabis', SK.cannabis.x, SK.cannabis.z, LINES.cannabis.color);

    // ---- labos (nord) ----
    const labStations: StationAnchor[] = [];
    for (const k of LAB_KEYS) {
      const lb = L.labs[k];
      const built = new THREE.Group();
      const b = M.lab(lb.color, k); b.position.set(lb.x, 0.2, lb.z); built.add(b);
      for (let i = 0; i < 4; i++) { const bp = benchPos(k, i); const be = M.bench(lb.color); be.position.set(bp.x, 0.2, bp.z); built.add(be); }
      built.add(M.paintRect(lb.x - 4.2, lb.z - 2.6, lb.x + 6.2, lb.z + 5.3, lb.color));
      const plot = M.plot(10, 7.4); plot.position.set(lb.x + 1, 0, lb.z + 1.3);
      this.scene.add(built, plot);
      this.labG[k] = { built, plot };
      const lp = labPile(k);
      mkPile(k + 'Out', lp.x, lp.z, LINES[k].color);
      mkPile(k, SK[k].x, SK[k].z, LINES[k].color);
      labStations.push({ key: k, pos: new THREE.Vector3(lb.x, 4.6, lb.z), meshes: [built, plot] });
    }

    this.stations = [
      { key: 'field', pos: new THREE.Vector3(bx, 2.2, P.z0 - 1.4), meshes: [fieldArea] },
      { key: 'dryer', pos: new THREE.Vector3(L.dryer.x, 4.8, L.dryer.z), meshes: [this.dryerG] },
      { key: 'packer', pos: new THREE.Vector3(T.x, 3.4, T.z - 2.2), meshes: [tableG] },
      { key: 'garage', pos: new THREE.Vector3(L.garage.x, 4, L.garage.z), meshes: [garageG] },
      { key: 'office', pos: new THREE.Vector3(L.office.x, 4.4, L.office.z), meshes: [officeG] },
      { key: 'milice', pos: new THREE.Vector3(L.milice.x, 4, L.milice.z), meshes: [this.miliceG, miliceLot] },
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

  resize() {
    const p = this.renderer.domElement.parentElement!;
    const w = p.clientWidth, h = p.clientHeight;
    this.renderer.setSize(w, h);
    const a = w / h;
    this.camera.left = (-this.frustum * a) / 2; this.camera.right = (this.frustum * a) / 2;
    this.camera.top = this.frustum / 2; this.camera.bottom = -this.frustum / 2;
    this.camera.updateProjectionMatrix();
  }
  pan(dxPx: number, dyPx: number) {
    const h = this.renderer.domElement.clientHeight;
    const wpp = this.frustum / (this.camera.zoom * h);
    this.target.addScaledVector(new THREE.Vector3(1, 0, -1).normalize(), -dxPx * wpp);
    this.target.addScaledVector(new THREE.Vector3(-1, 0, -1).normalize(), dyPx * wpp * 1.5);
    this.target.x = THREE.MathUtils.clamp(this.target.x, -25, CITY.x0 + 80);
    this.target.z = THREE.MathUtils.clamp(this.target.z, -45, 40);
    this.desired.copy(this.target);
  }
  goTo(x: number, z: number, zoom?: number) { this.desired.set(x, 0, z); if (zoom) this.desiredZoom = zoom; }
  zoom(delta: number) {
    this.desiredZoom = null;
    this.camera.zoom = THREE.MathUtils.clamp(this.camera.zoom * (delta > 0 ? 0.9 : 1.1), 0.3, 2.6);
    this.camera.updateProjectionMatrix();
  }
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
      (g.userData.leaves as THREE.Group).scale.setScalar(0.25 + 0.75 * p.g);
      const ripe = g.userData.ripe as THREE.Mesh;
      ripe.visible = p.g >= 1 && !p.reserved;
      ripe.position.y = 1.15 + Math.sin(time * 3 + p.id) * 0.06;
    }
    const alive = new Set<number>();
    for (const a of s.agents) {
      alive.add(a.id);
      let g = this.agents.get(a.id);
      if (!g) { g = M.character(a.kind); this.agents.set(a.id, g); this.scene.add(g); }
      g.position.set(a.x, 0.2, a.z);
      g.rotation.y = lerpAngle(g.rotation.y, a.facing, 0.25);
      M.animateCharacter(g, time + a.id * 0.37, a.moving, a.state === 'work', a.carry > 0, !!a.firing);
    }
    for (const [id, g] of this.agents) if (!alive.has(id)) { this.scene.remove(g); this.agents.delete(id); }

    for (const v of s.vans) {
      let g = this.vans.get(v.id);
      if (!g) { g = M.pickup(v.slot); this.vans.set(v.id, g); this.scene.add(g); }
      g.position.set(v.x, 0.05 + (v.state === 'wait' ? 0.15 : 0), v.z);
      g.rotation.y = lerpAngle(g.rotation.y, v.facing, 0.2);
      (g.userData.cargo as THREE.Group).visible = v.load > 0;
    }
    // perquisition des Stups : convoi de 2 voitures, 3 agents descendent devant le portail
    const pol = s.police;
    this.police.visible = this.police2.visible = !!pol;
    const on = Math.floor(time * 6) % 2 === 0;
    if (pol) {
      const back = pol.phase === 'leaving' ? -3.4 : 3.4;
      this.police.position.set(pol.x, 0.05, pol.z);
      this.police2.position.set(pol.x + back, 0.05, pol.z);
      for (const car of [this.police, this.police2]) {
        car.rotation.y = lerpAngle(car.rotation.y, pol.facing, 0.2);
        (car.userData.red.material as THREE.MeshStandardMaterial).emissiveIntensity = on ? 2.5 : 0.1;
        (car.userData.blue.material as THREE.MeshStandardMaterial).emissiveIntensity = on ? 0.1 : 2.5;
      }
    }
    const waiting = pol?.phase === 'waiting';
    this.cops.forEach((c, i) => {
      c.visible = !!waiting;
      if (waiting) { c.position.set(LAYOUT.gate.x0 + 1 + i * 1.1, 0.05, LAYOUT.slab.z1 + 1.1); c.rotation.y = Math.PI; }
    });
    // BAC
    const seen = new Set<number>();
    for (const p of s.patrols) {
      seen.add(p.id);
      let g = this.bac.get(p.id);
      if (!g) { g = M.bacCar(); this.bac.set(p.id, g); this.scene.add(g); }
      g.position.set(p.x, 0.05, p.z);
      g.rotation.y = lerpAngle(g.rotation.y, p.facing, 0.3);
      (g.userData.blue.material as THREE.MeshStandardMaterial).emissiveIntensity = on ? 2 : 0.2;
    }
    for (const [id, g] of this.bac) if (!seen.has(id)) { this.scene.remove(g); this.bac.delete(id); }

    // piles
    const lineStock = (l: LineKey) => PRODUCT_KEYS.filter(p => PRODUCTS[p].line === l).reduce((a, p) => a + s.stock[p], 0);
    M.setPile(this.piles.cannabis, lineStock('cannabis'));
    for (const k of LAB_KEYS) {
      const on = s.levels[k] > 0;
      this.labG[k].built.visible = on; this.labG[k].plot.visible = !on;
      M.setPile(this.piles[k + 'Out'], on ? s.labs[k].out : 0);
      M.setPile(this.piles[k], lineStock(k));
    }
    const mOn = s.levels.milice > 0;
    this.miliceG.visible = mOn; (this.miliceG.userData.lot as THREE.Group).visible = !mOn;

    for (const f of s.forklifts) {
      let g = this.forks.get(f.id);
      if (!g) { g = M.forklift(); this.forks.set(f.id, g); this.scene.add(g); }
      g.position.set(f.x, 0.2, f.z);
      g.rotation.y = lerpAngle(g.rotation.y, f.facing, 0.2);
      (g.userData.crate as THREE.Mesh).visible = f.load > 0;
    }
    this.rivals.forEach((g, i) => { if (g) g.visible = s.districts[i].rival > 0; });

    const moving = s.dryer.busy || s.dryer.input > 0 || s.dryer.output > 0 || s.agents.some(a => a.kind === 'packer' && a.state === 'work');
    for (const c of this.conveyors) {
      const cv = c.userData as { boxes: THREE.Mesh[]; len: number };
      cv.boxes.forEach((b, i) => { b.position.x = -cv.len / 2 + (((time * 0.6) + i / cv.boxes.length) % 1) * cv.len; b.visible = moving; });
    }

    const busy = s.dryer.busy;
    (this.dryerG.userData.winMat as THREE.MeshStandardMaterial).emissiveIntensity = busy ? 0.9 : 0;
    const top = (this.dryerG.userData.chimneyTop as THREE.Vector3).clone().add(this.dryerG.position);
    this.smoke.forEach((m, i) => {
      const t = (time * 0.6 + i / this.smoke.length) % 1;
      m.position.set(top.x + Math.sin(t * 5 + i) * 0.3, top.y + t * 3, top.z - t * 0.8);
      m.scale.setScalar(0.6 + t * 1.6);
      const mm = m.material as THREE.MeshStandardMaterial;
      mm.opacity = busy ? 0.75 * (1 - t) : Math.max(0, mm.opacity - 0.02);
    });
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
    this.camera.position.copy(this.target).add(this.offset);
    this.camera.lookAt(this.target);
    this.renderer.render(this.scene, this.camera);
  }
}

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
