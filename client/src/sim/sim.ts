// Simulation pure (aucune dépendance 3D) : c'est ce qui passera côté serveur plus tard.
import {
  BAC, CITY, COMMISSARIAT, DISTRICTS, GRIP, MILICE_PARK, QG_POSTS, TOWER_LEVELS, TOWER_POS, miliceVehicles, pressureLevel, roadZLine, HEAT, LAB_KEYS, LAYOUT, LINES, LabKey, LineKey, MILICE_REPEL, OPS, OpKey, PATROL, PRODUCTS, PRODUCT_KEYS,
  ProductKey, RIVAL, START_CASH, StationKey, blockCenter, roadX, stats, upgradeCost, BIZ, BIZ_KEYS, BizKey, LANDS, LandKey, LUX, LUX_KEYS, LuxKey, PRESTIGE_PER_LUX, HITS, HitKey, hitCost, VILLA, COUNTRY, COUNTRY_HIDE, COUNTRY_PRESTIGE, ROUTES, RouteKey, ROUTE_KEYS, aeroCycle, aeroCargo, shipCycle, shipCargo, STATION_LAND, SEMI_LOOP, shipBoxes, QUAY_MAX,
} from './config';

export interface Vec { x: number; z: number }
export interface Plant extends Vec { id: number; g: number; reserved: boolean }
export interface Agent extends Vec {
  id: number;
  kind: 'harvester' | 'packer' | 'chemist' | 'guard';
  lab?: LabKey;
  state: 'idle' | 'go' | 'work' | 'back' | 'patrol' | 'op';
  t: number;
  carry: number;
  target: number;      // plante (harvester) / point de ronde (guard)
  slot: number;
  facing: number;
  moving: boolean;
  firing?: boolean;
  dir?: number;
  path?: Vec[];
  elevated?: boolean;  // soldat posté en haut d'un mirador
}
export interface Van extends Vec {
  id: number;
  state: 'wait' | 'out' | 'back';
  load: number;
  cargo: Partial<Record<ProductKey, number>>;
  wp: number; wait: number; dest: number; slot: number; facing: number;
}
export interface Forklift extends Vec { id: number; lab: LabKey; idx: number; state: 'wait' | 'out' | 'back'; load: number; wp: number; facing: number }
export interface DistrictState { unlocked: boolean; active: boolean; sat: number; rival: number; fear?: number; hostile?: number }
/** Poids lourd : t = 0 au parc, 0.5 au port ; load = valeur du conteneur chargé (0 = à vide). */
export interface Semi { t: number; load: number; color: number }
export interface Police { phase: 'coming' | 'waiting' | 'leaving'; x: number; z: number; t: number; facing: number; gign?: boolean }
export interface ConvoyCar extends Vec { id: number; slot: number; facing: number; path: Vec[]; back: Vec[]; firing: boolean }
export interface Patrol extends Vec { id: number; from: [number, number]; to: [number, number]; t: number; facing: number }
export interface OpResult { win: boolean; cops: number; rivals: number; ours: number }
export interface Op { key: OpKey; target: number; phase: 'go' | 'fight' | 'back'; t: number; result?: OpResult; pos?: Vec; asked?: boolean; tpower?: number }

export type SimEvent =
  | { type: 'raidArrived'; target: number }
  | { type: 'ship'; boxes: number; lost: number }
  | { type: 'sale'; amount: number; x: number; z: number; district: number }
  | { type: 'robbed'; district: number }
  | { type: 'controlled'; district: number; lost: number }
  | { type: 'raid'; gign: boolean }
  | { type: 'repelled' }
  | { type: 'seized'; cash: number }
  | { type: 'arrested' }
  | { type: 'opResult'; key: OpKey; win: boolean; target: number; cops: number; rivals: number; ours: number }
  | { type: 'desert' }
  | { type: 'rivalBack'; district: number }
  | { type: 'biz'; key: BizKey | 'conteneurs'; amount: number; x: number; z: number }
  | { type: 'hit'; key: HitKey; target: number; win: boolean }
  | { type: 'saved' };

export interface GameState {
  cash: number;
  levels: Record<StationKey, number>;
  plants: Plant[];
  agents: Agent[];
  vans: Van[];
  forklifts: Forklift[];
  dryer: { input: number; output: number; busy: boolean; t: number; amt: number };
  stock: Record<ProductKey, number>;
  /** Marchandise rangée à l'entrepôt : à l'abri des saisies, part à l'export. */
  ware: Record<ProductKey, number>;
  /** Conteneurs : sur le quai du port, dans les hangars du parc (nombre et valeur totale). */
  cont: { quayN: number; quayV: number; yardN: number; yardV: number };
  semis: Semi[];
  contT: number;
  labs: Record<LabKey, { out: number }>;
  selected: Record<LineKey, ProductKey>;
  owned: Record<ProductKey, boolean>;
  time: number;
  districts: DistrictState[];
  heat: number;
  police: Police | null;
  patrols: Patrol[];
  convoy: ConvoyCar[];
  grip: number;
  cartel: string;
  kills: { cops: number; rivals: number; ours: number };
  comDamage: number;   // 0 = intact, 1 = en ruines
  op: Op | null;
  cooldowns: Record<OpKey, number>;
  unpaid: number;
  rivalTimer: number;
  over: boolean;
  totalEarned: number;
  land: Record<LandKey, boolean>;
  bizT: Record<BizKey, number>;
  boss: string;
  lux: Record<LuxKey, boolean>;
  hit: Hit | null;
  hitCd: Record<HitKey, number>;
  immunity: boolean;
  country: boolean[];
  route: RouteKey;
  routes: Record<RouteKey, boolean>;
  /** Ventes par quartier depuis le dernier envoi au serveur (concurrence entre joueurs). */
  satOut: number[];
  /** Idem, pour le calcul local du contrôle des quartiers (vidé chaque seconde). */
  satCtl: number[];
}
export interface Hit extends Vec { key: HitKey; target: number; phase: 'go' | 'act' | 'gone'; t: number; facing: number; path: Vec[]; win: boolean }

let nextId = 1;
const lineOfLab = (k: LabKey): LineKey => k;

export function createGame(): GameState {
  const p = LAYOUT.plants;
  const plants: Plant[] = [];
  for (let r = 0; r < p.rows; r++) for (let c = 0; c < p.cols; c++)
    plants.push({ id: nextId++, x: p.x0 + c * p.dx, z: p.z0 + r * p.dz, g: Math.random(), reserved: false });
  const zero = Object.fromEntries(PRODUCT_KEYS.map(k => [k, 0])) as Record<ProductKey, number>;
  const s: GameState = {
    cash: START_CASH,
    levels: { field: 1, dryer: 1, packer: 1, garage: 1, office: 1, labo: 0, pharma: 0, milice: 0, villa: 1, clopes: 0, armes: 0, casse: 0, aero: 0, port: 0, transport: 0, entrepot: 0, conteneurs: 0 },
    plants, agents: [], vans: [], forklifts: [],
    dryer: { input: 0, output: 0, busy: false, t: 0, amt: 0 },
    stock: { ...zero }, ware: { ...zero }, cont: { quayN: 0, quayV: 0, yardN: 0, yardV: 0 }, semis: [], contT: 0,
    labs: { labo: { out: 0 }, pharma: { out: 0 } },
    selected: { cannabis: 'beuh', labo: 'ecsta', pharma: 'pregabaline' },
    owned: Object.fromEntries(PRODUCT_KEYS.map(k => [k, PRODUCTS[k].unlock === 0])) as Record<ProductKey, boolean>,
    time: 0,
    districts: DISTRICTS.map(d => ({ unlocked: d.unlock === 0, active: d.unlock === 0, sat: 0, rival: d.rival })),
    heat: 0, police: null, patrols: [], convoy: [], grip: 0, cartel: 'Sans Nom', kills: { cops: 0, rivals: 0, ours: 0 }, comDamage: 0, op: null,
    cooldowns: { intimidate: 0, killcop: 0, rival: 0, carnage: 0, raid: 0 },
    unpaid: 0, rivalTimer: 0, over: false, totalEarned: 0,
    land: { ouest: false, nord: false, est: false, aero: false, port: false }, bizT: { clopes: 0, armes: 1, casse: 2, aero: 0, port: 0 },
    boss: 'Le Boss', lux: Object.fromEntries(LUX_KEYS.map(k => [k, false])) as Record<LuxKey, boolean>,
    hit: null, hitCd: { boss: 0, planque: 0, commissaire: 0, journaliste: 0, temoin: 0, joueur: 0 }, immunity: false, country: COUNTRY.map(() => false), satOut: DISTRICTS.map(() => 0), satCtl: DISTRICTS.map(() => 0), route: 'maroc', routes: Object.fromEntries(ROUTE_KEYS.map(k => [k, ROUTES[k].unlock === 0])) as Record<RouteKey, boolean>,
  };
  syncUnits(s);
  return s;
}

function mkAgent(kind: Agent['kind'], x: number, z: number, slot: number): Agent {
  return { id: nextId++, kind, x, z, state: 'idle', t: 0, carry: 0, target: -1, slot, facing: 0, moving: false };
}

/** Ajoute / retire ouvriers, véhicules et soldats selon les niveaux. */
export function syncUnits(s: GameState) {
  const F = stats.field(s.levels.field), P = stats.packer(s.levels.packer), G = stats.garage(s.levels.garage);
  const count = (f: (a: Agent) => boolean) => s.agents.filter(f).length;
  while (count(a => a.kind === 'harvester') < F.workers) {
    const n = count(a => a.kind === 'harvester'), h = harvestHome(n);
    const a = mkAgent('harvester', h.x, h.z, n); a.facing = -Math.PI / 2; s.agents.push(a);
  }
  while (count(a => a.kind === 'packer') < P.workers) {
    const n = count(a => a.kind === 'packer'), sl = tableSlot(n);
    const a = mkAgent('packer', sl.x, sl.z, n); a.facing = sl.facing; s.agents.push(a);
  }
  while (s.vans.length < G.vans) {
    const n = s.vans.length;
    s.vans.push({ id: nextId++, x: LAYOUT.vanPark.x + n * LAYOUT.vanGap, z: LAYOUT.vanPark.z, state: 'wait', load: 0, cargo: {}, wp: 0, wait: n * 0.7, facing: Math.PI, dest: 0, slot: n });
  }
  for (const k of LAB_KEYS) {
    const Lb = stats.lab(s.levels[k]);
    while (count(a => a.kind === 'chemist' && a.lab === k) < Lb.workers) {
      const n = count(a => a.kind === 'chemist' && a.lab === k), b = benchPos(k, n);
      const a = mkAgent('chemist', b.x, b.z + 0.85, n); a.lab = k; a.state = 'work'; a.t = Lb.time * (0.5 + Math.random() * 0.5); a.facing = Math.PI;
      s.agents.push(a);
    }
    // transpalettes : 1 à 3 par labo selon les Transporteurs
    const nf = s.levels[k] > 0 ? stats.transport(s.levels.transport).forks : 0;
    while (s.forklifts.filter(f => f.lab === k).length < nf) {
      const idx = s.forklifts.filter(f => f.lab === k).length, w = forkRoute(k, idx)[0];
      s.forklifts.push({ id: nextId++, lab: k, idx, x: w.x, z: w.z, state: 'wait', load: 0, wp: 0, facing: Math.PI });
    }
  }
  // soldats : un par mirador construit, les autres autour du QG. Ils ne bougent pas.
  const M = stats.milice(s.levels.milice);
  s.agents = s.agents.filter(a => a.kind !== 'guard');
  const posts: (Vec & { facing: number; elevated: boolean })[] = [];
  TOWER_POS.forEach(([x, z], i) => { if (s.levels.milice >= TOWER_LEVELS[i]) posts.push({ x, z, facing: Math.atan2(x - 0, z - (-8)), elevated: true }); });
  for (const [x, z, f] of QG_POSTS) posts.push({ x, z, facing: f, elevated: false });
  for (let n = 0; n < Math.min(M.soldiers, posts.length); n++) {
    const p = posts[n], a = mkAgent('guard', p.x, p.z, n);
    a.state = 'patrol'; a.facing = p.facing; a.elevated = p.elevated; a.target = -1;
    s.agents.push(a);
  }
  // véhicules armés, garés au QG
  const nv = miliceVehicles(s.levels.milice);
  if (!s.op) {
    while (s.convoy.length < nv) { const k = s.convoy.length, p = MILICE_PARK[k]; s.convoy.push({ id: nextId++, slot: k, x: p.x, z: p.z, facing: 0, path: [], back: [], firing: false }); }
    if (s.convoy.length > nv) s.convoy.length = nv;
  }
}

export function harvestHome(i: number): Vec { const P = LAYOUT.plants; return { x: LAYOUT.harvestHomeX, z: P.z0 + (i % P.rows) * P.dz + P.dz / 2 }; }
/** Place fixe d'un emballeur autour de la table. */
export function tableSlot(i: number): Vec & { facing: number } {
  const t = LAYOUT.table;
  const slots = [{ x: t.x - 0.6, z: t.z - 1.05, facing: 0 }, { x: t.x + 0.6, z: t.z - 1.05, facing: 0 }, { x: t.x - 0.6, z: t.z + 1.05, facing: Math.PI }, { x: t.x + 0.6, z: t.z + 1.05, facing: Math.PI }];
  return slots[i % slots.length];
}
export function benchPos(k: LabKey, i: number): Vec { const L = LAYOUT.labs[k]; return { x: L.x - 3 + i * 2, z: L.z + 3.9 }; }
export function labPile(k: LabKey): Vec { const L = LAYOUT.labs[k]; return { x: L.x + 5, z: L.z + 3.9 }; }
/** Chariot : place d'attente devant le labo -> allée nord -> allée est -> stock. */
export function forkRoute(k: LabKey, idx = 0): Vec[] {
  const p = labPile(k), st = LAYOUT.stock[k];
  // chaque transpalette a sa place d'attente et sa voie, décalées : ils ne se rentrent pas dedans
  const lz = LAYOUT.laneZ - (k === 'labo' ? 0.8 : 0) + idx * 0.35, lx = LAYOUT.forkX[k] - idx * 0.35, uz = st.z + 1.5 + (k === 'labo' ? 0.7 : 0) - idx * 0.3;
  const px = p.x - idx * 1.5;
  return [{ x: px, z: p.z + 1.3 }, { x: px, z: lz }, { x: lx, z: lz }, { x: lx, z: uz }, { x: st.x - idx * 0.4, z: uz }];
}
export function parkSlot(slot: number): Vec { return { x: LAYOUT.vanPark.x + slot * LAYOUT.vanGap, z: LAYOUT.vanPark.z }; }
/** Aller sur la voie nord de la route, retour sur la voie sud : les pick-up ne se croisent jamais. */
export function routeTo(dest: number, slot = 0, back = false): Vec[] {
  const d = DISTRICTS[dest], c = blockCenter(d.r, d.c), x = roadX(d.c) + (back ? -0.9 : 0.9);
  const park = parkSlot(slot), rz = LAYOUT.roadZ + (back ? 0.9 : -0.9);
  return [park, { x: park.x, z: rz }, { x, z: rz }, { x, z: c.z }];
}
// ---- ronde des soldats (aller-retour sur PATROL, chacun tient sa droite) ----
const segLen = (i: number) => Math.hypot(PATROL[i + 1].x - PATROL[i].x, PATROL[i + 1].z - PATROL[i].z);
export const patrolLength = () => PATROL.slice(1).reduce((a, _, i) => a + segLen(i), 0);
function placeOnPatrol(a: Agent, dist: number, dir: number) {
  let i = 0;
  while (i < PATROL.length - 2 && dist > segLen(i)) { dist -= segLen(i); i++; }
  const t = Math.min(1, dist / segLen(i)), p0 = PATROL[i], p1 = PATROL[i + 1];
  a.x = p0.x + (p1.x - p0.x) * t; a.z = p0.z + (p1.z - p0.z) * t;
  a.dir = dir; a.target = dir > 0 ? i + 1 : i;
}
/** Point de ronde décalé à droite selon le sens de marche. */
function patrolPoint(i: number, dir: number): Vec {
  const p = PATROL[i], q = PATROL[Math.max(0, Math.min(PATROL.length - 1, i - dir))];
  let dx = p.x - q.x, dz = p.z - q.z; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
  return { x: p.x - dz * 0.45, z: p.z + dx * 0.45 };
}
/** Sortie des soldats en opération : bout de la ronde -> portail -> trottoir de la route. */
export const OP_EXIT: Vec[] = [{ x: LAYOUT.eastX, z: 0.6 }, { x: LAYOUT.eastX, z: LAYOUT.roadZ + 1.6 }, { x: 30, z: LAYOUT.roadZ + 1.6 }];
const routeLength = (r: Vec[]) => r.slice(1).reduce((L, p, i) => L + Math.abs(p.x - r[i].x) + Math.abs(p.z - r[i].z), 0);
/** Trajet des soldats en opération : sortie par le portail, puis la route. */

/** Puissance de la milice, armes de l'armurerie comprises. */
export function power(s: GameState) {
  const M = stats.milice(s.levels.milice);
  return M.power + (s.levels.milice > 0 ? stats.biz('armes', s.levels.armes).power : 0);
}
/** Prestige : chaque folie achetée au repaire fait grimper les prix (+4 %). */
export function prestige(s: GameState) { return LUX_KEYS.filter(k => s.lux[k]).length * PRESTIGE_PER_LUX + s.country.filter(Boolean).length * COUNTRY_PRESTIGE; }
/** Part du cash à l'abri des perquisitions : repaire + maisons de campagne. */
export function hidden(s: GameState) { return Math.min(0.8, stats.villa(s.levels.villa).hide + s.country.filter(Boolean).length * COUNTRY_HIDE); }
export function buyCountry(s: GameState, i: number): boolean { if (s.country[i] || s.cash < COUNTRY[i].price) return false; s.cash -= COUNTRY[i].price; s.country[i] = true; return true; }
/** Les business annexes tournent tout seuls : argent toutes les 3 s, un peu de pression. */
const BIZ_CYCLE = 3;
function stepBiz(s: GameState, dt: number, events: SimEvent[]) {
  for (const k of BIZ_KEYS) {
    const L = s.levels[k]; if (!L) continue;
    const B = stats.biz(k, L);
    s.heat = Math.max(0, s.heat + B.heat * dt);
    s.bizT[k] += dt;
    if (k === 'aero') {
      // un avion par rotation : la cargaison est payée quand les camions l'ont rentrée au hangar
      if (s.bizT.aero >= aeroCycle(L)) {
        s.bizT.aero = 0;
        const amount = aeroCargo(L, s.route) + exportWare(s);
        s.cash += amount; s.totalEarned += amount; s.heat = Math.min(99, s.heat + 2 * ROUTES[s.route].heat);
        events.push({ type: 'biz', key: 'aero', amount, x: BIZ.aero.x, z: BIZ.aero.z });
      }
      continue;
    }
    if (k === 'port') {
      // un cargo par rotation : payé quand les conteneurs sont déchargés
      if (s.bizT.port >= shipCycle(L)) {
        s.bizT.port = 0;
        // la came reste dans les conteneurs : il faut que les poids lourds les ramènent au parc
        const n = shipBoxes(L), each = shipCargo(L, s.route) / n, room = Math.max(0, QUAY_MAX - s.cont.quayN), put = Math.min(n, room);
        s.cont.quayN += put; s.cont.quayV += put * each;
        s.heat = Math.min(99, s.heat + 3 * ROUTES[s.route].heat);
        events.push({ type: 'ship', boxes: put, lost: n - put });
        const amount = exportWare(s);
        if (amount > 0) { s.cash += amount; s.totalEarned += amount; events.push({ type: 'biz', key: 'port', amount, x: BIZ.port.x, z: BIZ.port.z }); }
      }
      continue;
    }
    if (s.bizT[k] >= BIZ_CYCLE) {
      s.bizT[k] -= BIZ_CYCLE;
      const amount = B.income * BIZ_CYCLE;
      s.cash += amount; s.totalEarned += amount;
      events.push({ type: 'biz', key: k, amount, x: BIZ[k].x, z: BIZ[k].z });
    }
  }
}

// ---------------- Prix ----------------
export function productPrice(s: GameState, p: ProductKey) {
  const d = PRODUCTS[p];
  const mult = d.line === 'cannabis' ? stats.packer(s.levels.packer).priceMult : stats.lab(s.levels[d.line as LabKey]).priceMult;
  return d.price * mult * (1 + prestige(s));
}
export function districtFactor(s: GameState, i: number) {
  const st = s.districts[i];
  return DISTRICTS[i].mult * (1 - 0.7 * st.sat) * (st.rival > 0 ? RIVAL.pricePenalty : 1) * (st.fear ? 1.3 : 1) * (st.hostile ? 0.6 : 1);
}
export const totalStock = (s: GameState) => PRODUCT_KEYS.reduce((a, p) => a + s.stock[p], 0);
const byValue = (s: GameState) => PRODUCT_KEYS.slice().sort((a, b) => productPrice(s, b) - productPrice(s, a));

function chooseDest(s: GameState, speed: number): number {
  let best = -1, bestV = -1;
  s.districts.forEach((d, i) => {
    if (!d.unlocked || !d.active) return;
    const trip = (2 * routeLength(routeTo(i))) / speed + 2;
    const v = districtFactor(s, i) * (d.rival > 0 ? 1 - RIVAL.robChance : 1) / trip;
    if (v > bestV) { bestV = v; best = i; }
  });
  return best;
}

function moveTo(o: Vec & { facing: number }, tx: number, tz: number, speed: number, dt: number): boolean {
  const dx = tx - o.x, dz = tz - o.z, d = Math.hypot(dx, dz);
  if (d <= speed * dt || d < 1e-4) { o.x = tx; o.z = tz; return true; }
  o.x += (dx / d) * speed * dt; o.z += (dz / d) * speed * dt;
  o.facing = Math.atan2(dx, dz);
  return false;
}

// ---------------- Boucle ----------------
export function step(s: GameState, dt: number): SimEvent[] {
  const events: SimEvent[] = [];
  if (s.over) return events;
  s.time += dt;
  const F = stats.field(s.levels.field), D = stats.dryer(s.levels.dryer);
  const P = stats.packer(s.levels.packer), G = stats.garage(s.levels.garage), M = stats.milice(s.levels.milice);
  const canna = PRODUCTS[s.selected.cannabis];

  for (const pl of s.plants) if (pl.g < 1) pl.g = Math.min(1, pl.g + dt / (F.growTime * canna.time));

  for (const a of s.agents) {
    a.moving = false; a.firing = false;
    if (a.kind === 'harvester') {
      const home = harvestHome(a.slot), P0 = LAYOUT.plants, row = a.slot % P0.rows;
      if (a.state === 'idle') {
        // ne récolte que SA rangée : jamais deux jardiniers au même endroit
        const free = s.plants.map((_, i) => i).filter(i => Math.floor(i / P0.cols) === row && s.plants[i].g >= 1 && !s.plants[i].reserved);
        if (free.length) { a.target = free[0]; s.plants[a.target].reserved = true; a.state = 'go'; }
      } else if (a.state === 'go') {
        const pl = s.plants[a.target]; a.moving = true;
        if (moveTo(a, pl.x, home.z, F.speed, dt)) { a.state = 'work'; a.t = F.harvestTime; a.facing = Math.PI; }
      } else if (a.state === 'work') {
        a.t -= dt;
        if (a.t <= 0) { const pl = s.plants[a.target]; pl.g = 0; pl.reserved = false; a.carry = F.carry; a.state = 'back'; }
      } else if (a.state === 'back') {
        a.moving = true;
        if (moveTo(a, home.x, home.z, F.speed, dt)) { s.dryer.input += a.carry; a.carry = 0; a.state = 'idle'; a.facing = -Math.PI / 2; }
      }
    } else if (a.kind === 'packer') {
      // poste fixe : la récolte sèche arrive par le tapis
      if (a.state !== 'work') {
        if (s.dryer.output >= 1) {
          a.carry = Math.min(P.carry, Math.floor(s.dryer.output)); s.dryer.output -= a.carry;
          a.state = 'work'; a.t = P.packTime * canna.time;
        }
      } else {
        a.t -= dt;
        if (a.t <= 0) { s.stock[s.selected.cannabis] += a.carry; a.carry = 0; a.state = 'idle'; }
      }
    } else if (a.kind === 'chemist') {
      const Lb = stats.lab(s.levels[a.lab!]), prod = PRODUCTS[s.selected[lineOfLab(a.lab!)]];
      a.t -= dt;
      if (a.t <= 0) { s.labs[a.lab!].out += Lb.batch; a.t = Lb.time * prod.time; }
    } else {
      stepGuard(s, a, dt);
    }
  }

  // séchoir
  const dr = s.dryer;
  if (!dr.busy && dr.input >= 1) { dr.amt = Math.min(D.batch, Math.floor(dr.input)); dr.input -= dr.amt; dr.busy = true; dr.t = D.time; }
  if (dr.busy) { dr.t -= dt; if (dr.t <= 0) { dr.busy = false; dr.output += dr.amt; } }

  // chariots élévateurs : sortie labo -> stock
  const T = stats.transport(s.levels.transport);
  for (const f of s.forklifts) {
    const L0 = stats.lab(s.levels[f.lab]), route = forkRoute(f.lab, f.idx ?? 0);
    const Lb = { forkCap: Math.round(L0.forkCap * T.capMult), forkSpeed: L0.forkSpeed * T.speedMult };
    if (f.state === 'wait') {
      const o = s.labs[f.lab];
      if (o.out >= Math.min(Lb.forkCap, 3)) { f.load = Math.min(Lb.forkCap, Math.floor(o.out)); o.out -= f.load; f.state = 'out'; f.wp = 1; }
    } else if (f.state === 'out') {
      const w = route[f.wp];
      if (moveTo(f, w.x, w.z, Lb.forkSpeed, dt)) {
        if (f.wp < route.length - 1) f.wp++;
        else { s.stock[s.selected[lineOfLab(f.lab)]] += f.load; f.load = 0; f.state = 'back'; f.wp = route.length - 2; }
      }
    } else {
      const w = route[f.wp];
      if (moveTo(f, w.x, w.z, Lb.forkSpeed, dt)) { if (f.wp > 0) f.wp--; else { f.state = 'wait'; f.facing = Math.PI; } }
    }
  }

  // pick-up de livraison
  for (const v of s.vans) {
    const route = routeTo(v.dest, v.slot, v.state === 'back');
    if (v.state === 'wait') {
      v.wait -= dt;
      if (v.wait <= 0 && totalStock(s) >= 1) {
        const dest = chooseDest(s, G.speed);
        if (dest < 0) continue;
        v.dest = dest; v.load = 0; v.cargo = {};
        for (const p of byValue(s)) {
          const q = Math.min(G.capacity - v.load, Math.floor(s.stock[p]));
          if (q > 0) { v.cargo[p] = q; s.stock[p] -= q; v.load += q; }
        }
        if (v.load < 1) continue;
        v.state = 'out'; v.wp = 1;
      }
    } else if (v.state === 'out') {
      const w = route[v.wp];
      if (moveTo(v, w.x, w.z, G.speed, dt)) {
        if (v.wp < route.length - 1) v.wp++;
        else {
          const D0 = DISTRICTS[v.dest], ds = s.districts[v.dest];
          const bac = s.patrols.some(p => Math.hypot(p.x - v.x, p.z - v.z) < BAC.controlRange);
          if (bac && Math.random() < BAC.controlChance * (1 - s.grip / 100)) {
            s.heat += BAC.heatOnControl;
            events.push({ type: 'controlled', district: v.dest, lost: v.load });
          } else if (ds.rival > 0 && Math.random() < RIVAL.robChance) {
            events.push({ type: 'robbed', district: v.dest });
          } else {
            const f = districtFactor(s, v.dest);
            let amount = 0;
            for (const p of PRODUCT_KEYS) {
              const q = v.cargo[p] ?? 0; if (!q) continue;
              const def = PRODUCTS[p];
              amount += q * productPrice(s, p) * f * LINES[def.line].affinity[D0.tier];
              // pression dégressive : une grosse livraison attire plus l'attention qu'une petite, mais pas proportionnellement
              s.heat += 5 * Math.pow(q, 0.25) * Math.pow(D0.police, 0.2) * HEAT.perUnit * def.heat * (1 - 0.6 * s.grip / 100);
            }
            s.cash += amount; s.totalEarned += amount;
            ds.sat = Math.min(1, ds.sat + v.load / D0.demand); s.satOut[v.dest] += v.load / D0.demand; s.satCtl[v.dest] += v.load / D0.demand;
            events.push({ type: 'sale', amount, x: v.x + 4, z: v.z, district: v.dest });
          }
          v.cargo = {}; v.load = 0; v.state = 'back'; v.wp = route.length - 1;
        }
      }
    } else {
      const w = route[v.wp];
      if (moveTo(v, w.x, w.z, G.speed, dt)) { if (v.wp > 0) v.wp--; else { v.state = 'wait'; v.wait = 0.3; v.facing = Math.PI; } }
    }
  }

  for (const d of s.districts) d.sat = Math.max(0, d.sat - 0.03 * dt);

  // milice : solde, opérations
  if (M.soldiers > 0) {
    s.cash -= M.upkeep * dt;
    if (s.cash < 0) {
      s.cash = 0; s.unpaid += dt;
      if (s.unpaid > 10) { s.unpaid = 0; s.levels.milice = Math.max(1, s.levels.milice - 1); syncUnits(s); events.push({ type: 'desert' }); }
    } else s.unpaid = 0;
  }
  for (const k of Object.keys(s.cooldowns) as OpKey[]) s.cooldowns[k] = Math.max(0, s.cooldowns[k] - dt);
  stepConvoy(s, dt, events);
  s.comDamage = Math.max(0, s.comDamage - 0.0025 * dt);   // le commissariat se fait réparer doucement
  // emprise sur la police : monte avec la puissance de la milice, redescend doucement
  s.grip = Math.max(0, Math.min(100, s.grip + (power(s) * GRIP.perPower - GRIP.decay) * dt));

  // gangs rivaux qui reviennent
  s.rivalTimer += dt;
  if (s.rivalTimer > RIVAL.respawnEvery) {
    s.rivalTimer = 0;
    const free = s.districts.map((_, i) => i).filter(i => i !== 0 && s.districts[i].rival === 0);
    if (free.length && Math.random() < 0.6) {
      const i = free[Math.floor(Math.random() * free.length)];
      s.districts[i].rival = 3 + DISTRICTS[i].tier * 4;
      events.push({ type: 'rivalBack', district: i });
    }
  }

  stepBiz(s, dt, events);
  stepWarehouse(s, dt);
  stepContainers(s, dt, events);
  for (const d of s.districts) { if (d.fear) d.fear = Math.max(0, d.fear - dt); if (d.hostile) d.hostile = Math.max(0, d.hostile - dt); }
  stepHit(s, dt, events);
  stepPatrols(s, dt);

  // chaleur & police
  const O = stats.office(s.levels.office);
  if (s.heat >= 100 && s.immunity) { s.immunity = false; s.heat = 70; events.push({ type: 'saved' }); }
  if (s.heat >= 100) { s.heat = 100; s.over = true; events.push({ type: 'arrested' }); return events; }
  s.heat = Math.max(0, s.heat - O.decay * dt);
  const pol = s.police;
  if (!pol) {
    const fear = (1 - Math.min(0.6, power(s) * 0.05)) * (1 - s.grip / 100);
    if (s.grip < GRIP.control && s.heat > HEAT.raidFrom && Math.random() < ((s.heat - HEAT.raidFrom) / 400) * fear * dt) {
      const gign = s.heat >= 85;   // pression au max : c'est le GIGN qui débarque
      s.police = { phase: 'coming', x: COMMISSARIAT.x, z: LAYOUT.roadZ + 0.8, t: 0, facing: -Math.PI / 2, gign };
      events.push({ type: 'raid', gign });
    }
  } else if (pol.phase === 'coming') {
    if (moveTo(pol, LAYOUT.vanPark.x - 3, pol.z, 16, dt)) {
      if (power(s) >= (pol.gign ? 8 : MILICE_REPEL)) { pol.phase = 'leaving'; s.heat = Math.max(0, s.heat - 10); events.push({ type: 'repelled' }); }
      else { pol.phase = 'waiting'; pol.t = HEAT.waitTime; }
    }
  } else if (pol.phase === 'waiting') {
    pol.t -= dt;
    if (pol.t <= 0) {
      const lost = s.cash * (pol.gign ? 0.35 : HEAT.seizeCash) * (1 - hidden(s));
      s.cash -= lost;
      for (const p of PRODUCT_KEYS) s.stock[p] = Math.floor(s.stock[p] / 2);
      for (const k of LAB_KEYS) s.labs[k].out = Math.floor(s.labs[k].out / 2);
      s.dryer.input = Math.floor(s.dryer.input / 2); s.dryer.output = Math.floor(s.dryer.output / 2);
      s.heat = Math.max(0, s.heat - 25);
      pol.phase = 'leaving';
      events.push({ type: 'seized', cash: lost });
    }
  } else if (pol.phase === 'leaving') {
    if (moveTo(pol, COMMISSARIAT.x, pol.z, 16, dt)) s.police = null;
  }
  return events;
}

/** Soldat : reste à son poste (mirador ou QG). */
function stepGuard(_s: GameState, a: Agent, _dt: number) { a.moving = false; }

// ---------------- BAC : voitures banalisées qui tournent dans la ville ----------------
const N = CITY.size;
const crossing = (i: number, j: number): Vec => ({ x: roadX(i), z: roadZLine(j) });
function stepPatrols(s: GameState, dt: number) {
  const want = Math.max(0, Math.min(BAC.max, BAC.base + pressureLevel(s.heat) * BAC.perLevel) - Math.floor(s.grip / 25));
  if (s.patrols.length < want) {
    const i = Math.floor(Math.random() * (N + 1)), j = Math.random() < 0.5 ? 0 : N;
    const c = crossing(i, j);
    s.patrols.push({ id: nextId++, x: c.x, z: c.z, from: [i, j], to: [i, j], t: 1, facing: 0 });
  }
  for (const p of s.patrols) {
    const a = crossing(...p.from), b = crossing(...p.to);
    const len = Math.max(0.01, Math.hypot(b.x - a.x, b.z - a.z));
    p.t = Math.min(1, p.t + (BAC.speed * dt) / len);
    const dx = (b.x - a.x) / len, dz = (b.z - a.z) / len;
    p.x = a.x + (b.x - a.x) * p.t + dz * 0.9; p.z = a.z + (b.z - a.z) * p.t - dx * 0.9;   // roule à droite
    if (len > 0.1) p.facing = Math.atan2(dx, dz);
    if (p.t >= 1) {
      // carrefour : trop de voitures -> elle quitte la ville, sinon elle tourne au hasard (sans faire demi-tour)
      if (s.patrols.length > want && (p.to[1] === 0 || p.to[1] === N || p.to[0] === 0 || p.to[0] === N)) { p.t = -1; continue; }
      const [i, j] = p.to;
      const opts = [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]].filter(([x, y]) => x >= 0 && y >= 0 && x <= N && y <= N && !(x === p.from[0] && y === p.from[1]));
      const n = opts[Math.floor(Math.random() * opts.length)] as [number, number];
      p.from = [i, j]; p.to = n; p.t = 0;
    }
  }
  s.patrols = s.patrols.filter(p => p.t >= 0);
}

// ---------------- Milice ----------------
export function opChance(s: GameState, key: OpKey, target = -1) {
  const pw = power(s);
  const diff = key === 'rival' ? (s.districts[target]?.rival ?? 1) : key === 'carnage' ? OPS.carnage.difficulty + (DISTRICTS[target]?.police ?? 1) * 2 + (s.districts[target]?.rival ?? 0) * 0.5 : OPS[key].difficulty;
  return pw / (pw + diff);
}
export function canLaunch(s: GameState, key: OpKey, target = -1) {
  if (s.levels.milice === 0 || s.op || s.cooldowns[key] > 0) return false;
  if (key === 'rival' && (target < 0 || s.districts[target].rival <= 0)) return false;
  if (key === 'carnage' && (target < 0 || !s.districts[target])) return false;
  return true;
}
/** Chances d'un raid sur un autre joueur (estimation : c'est le serveur qui tire). */
export function raidChance(s: GameState, targetPower: number) { return Math.max(0.15, Math.min(0.85, 0.55 + (power(s) - targetPower) * 0.035)); }
/** Raid du convoi sur la base d'un autre joueur : l'issue est décidée par le serveur à l'arrivée. */
export function launchRaid(s: GameState, targetId: number, pos: Vec, targetPower: number): boolean {
  if (!canLaunch(s, 'raid') || s.convoy.length === 0) return false;
  s.op = { key: 'raid', target: targetId, phase: 'go', t: 0, pos, tpower: targetPower };
  const rz = LAYOUT.roadZ - 0.9;
  for (const c of s.convoy) {
    const p = MILICE_PARK[c.slot];
    c.path = [{ x: 9, z: 5.75 }, { x: 10.1, z: 5.75 }, { x: 10.1, z: rz }, { x: pos.x - 4 + c.slot * 4, z: rz }, { x: pos.x - 4 + c.slot * 4, z: pos.z + 13 }];
    c.back = [...c.path].reverse().slice(1).concat([{ x: p.x, z: p.z }]);
  }
  return true;
}
/** Réponse du serveur : on connaît l'issue, la fusillade peut commencer. */
export function setRaidResult(s: GameState, win: boolean) {
  const op = s.op; if (!op || op.key !== 'raid' || op.result) return;
  const r = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));
  op.result = { win, cops: 0, rivals: win ? r(3, 5) : r(1, 2), ours: win ? r(0, 1) : r(1, 3) };
}
/** Point d'arrivée du convoi : devant le commissariat, ou dans le quartier visé. */
function opTarget(key: OpKey, target: number, slot: number): Vec[] {
  if (key === 'rival' || key === 'carnage') {
    const d = DISTRICTS[target], c = blockCenter(d.r, d.c), x = roadX(d.c) + 0.9;
    return [{ x, z: LAYOUT.roadZ - 0.9 }, { x, z: c.z + slot * 4.4 }];
  }
  return [{ x: COMMISSARIAT.x - 6 + slot * 4.6, z: LAYOUT.roadZ - 0.9 }];
}
export function launchOp(s: GameState, key: OpKey, target = -1): boolean {
  if (!canLaunch(s, key, target) || s.convoy.length === 0) return false;
  s.op = { key, target, phase: 'go', t: 0 };
  for (const c of s.convoy) {
    const p = MILICE_PARK[c.slot];
    const exit = [{ x: p.x, z: p.z }, { x: 9, z: 5.75 }, { x: 10.1, z: 5.75 }, { x: 10.1, z: LAYOUT.roadZ - 0.9 }];
    c.path = [...exit.slice(1), ...opTarget(key, target, c.slot)];
    c.back = [...c.path].reverse().slice(1).concat([{ x: p.x, z: p.z }]);
  }
  return true;
}
function stepConvoy(s: GameState, dt: number, events: SimEvent[]) {
  const op = s.op; if (!op) return;
  op.t += dt;
  let arrived = true;
  for (const c of s.convoy) {
    c.firing = false;
    const list = op.phase === 'back' ? c.back : c.path;
    if (op.phase === 'fight') { c.firing = Math.random() < 0.4; continue; }
    if (!list.length) continue;
    const w = list[0];
    if (moveTo(c, w.x, w.z, 13, dt)) list.shift();
    if (list.length) arrived = false;
  }
  if (op.phase === 'go' && op.key === 'raid') {
    // arrivés devant chez lui : on attend le verdict du serveur (20 s max, sinon on rentre bredouille)
    if ((arrived || op.t > 40) && !op.asked) { op.asked = true; op.t = 0; events.push({ type: 'raidArrived', target: op.target }); }
    if (op.asked && !op.result && op.t > 20) setRaidResult(s, false);
    if (op.result) { op.phase = 'fight'; op.t = 0; }
  }
  else if (op.phase === 'go' && (arrived || op.t > 25)) { op.phase = 'fight'; op.t = 0; op.result = rollOp(s, op); }
  else if (op.phase === 'fight' && op.t > FIGHT_TIME) { resolveOp(s, events); op.phase = 'back'; op.t = 0; }
  else if (op.phase === 'back' && (arrived || op.t > 25)) {
    s.op = null;
    s.convoy.forEach(c => { const p = MILICE_PARK[c.slot]; c.x = p.x; c.z = p.z; c.facing = 0; });
    syncUnits(s);
  }
}
export const FIGHT_TIME = 9;
/** Tire le résultat dès le début de la fusillade (le rendu fait tomber les bons persos pendant le combat). */
function rollOp(s: GameState, op: Op): OpResult {
  const win = Math.random() < opChance(s, op.key, op.target);
  const r = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));
  const before = stats.milice(s.levels.milice).soldiers, after = stats.milice(Math.max(1, s.levels.milice - OPS[op.key].lossFail)).soldiers;
  const ours = win ? (Math.random() < 0.25 ? 1 : 0) : Math.max(1, before - after);
  if (op.key === 'rival') return { win, cops: 0, rivals: win ? r(3, 5) : r(0, 2), ours };
  if (op.key === 'carnage') { const rv = s.districts[op.target].rival > 0; return { win, cops: win ? r(3, 6) : r(1, 3), rivals: rv ? (win ? r(3, 5) : r(1, 2)) : 0, ours: win ? r(0, 1) : Math.max(1, before - after) }; }
  if (op.key === 'killcop') return { win, cops: win ? r(3, 5) : r(1, 2), rivals: 0, ours };
  return { win, cops: win ? r(0, 1) : r(0, 1), rivals: 0, ours: win ? 0 : 1 };
}
function resolveOp(s: GameState, events: SimEvent[]) {
  const op = s.op!, def = OPS[op.key];
  const res = op.result ?? rollOp(s, op), win = res.win;
  s.kills.cops += res.cops; s.kills.rivals += res.rivals; s.kills.ours += res.ours;
  if (op.key === 'intimidate' || op.key === 'killcop') s.comDamage = Math.min(1, s.comDamage + (op.key === 'killcop' ? 0.45 : 0.2));
  s.cooldowns[op.key] = def.cooldown;
  if (win) {
    s.heat = Math.max(0, s.heat + def.heatWin);
    if (def.grip) s.grip = Math.min(100, s.grip + def.grip);
    if (op.key === 'rival') s.districts[op.target].rival = 0;
    if (op.key === 'carnage') { const d = s.districts[op.target]; d.rival = 0; d.fear = 180; d.sat = 0; }
  } else {
    s.heat = Math.min(100, s.heat + def.heatFail);
    s.levels.milice = Math.max(1, s.levels.milice - def.lossFail);
    if (op.key === 'rival') s.districts[op.target].rival += 1;
  }
  events.push({ type: 'opResult', key: op.key, win, target: op.target, cops: res.cops, rivals: res.rivals, ours: res.ours });
}

// ---------------- Actions joueur ----------------
/** Effectif total : jardiniers, emballeurs, chimistes, soldats, chauffeurs. */
export function employees(s: GameState) {
  return s.agents.length + s.vans.length + s.forklifts.length + s.convoy.length + BIZ_KEYS.reduce((a, k) => a + stats.biz(k, s.levels[k]).workers, 0);
}
export function bribeCost(s: GameState) { return Math.ceil(HEAT.bribe(s.cash, stats.office(s.levels.office).discount)); }
export function bribe(s: GameState): number {
  if (!s.police || s.police.phase !== 'waiting') return 0;
  const c = bribeCost(s);
  if (s.cash < c) return 0;
  s.cash -= c; s.heat = Math.max(0, s.heat - 15); s.police.phase = 'leaving';
  return c;
}
export function districtAction(s: GameState, i: number): 'unlocked' | 'toggled' | 'nope' {
  const d = s.districts[i], def = DISTRICTS[i];
  if (!d.unlocked) {
    if (s.cash < def.unlock) return 'nope';
    s.cash -= def.unlock; d.unlocked = true; d.active = true; return 'unlocked';
  }
  const activeCount = s.districts.filter(x => x.unlocked && x.active).length;
  if (d.active && activeCount <= 1) return 'nope';
  d.active = !d.active; return 'toggled';
}
/** Choisit le produit d'une ligne (l'achète s'il n'est pas encore débloqué). */
export function selectProduct(s: GameState, p: ProductKey): 'selected' | 'bought' | 'nope' {
  const def = PRODUCTS[p];
  if (!s.owned[p]) {
    if (s.cash < def.unlock) return 'nope';
    s.cash -= def.unlock; s.owned[p] = true; s.selected[def.line] = p; return 'bought';
  }
  s.selected[def.line] = p; return 'selected';
}
export function totalCost(s: GameState, k: StationKey, n: number) {
  let c = 0; for (let i = 0; i < n; i++) c += upgradeCost(k, s.levels[k] + i); return c;
}
export function maxAffordable(s: GameState, k: StationKey) {
  let n = 0, c = 0;
  while (n < 500) { const next = upgradeCost(k, s.levels[k] + n); if (c + next > s.cash) break; c += next; n++; }
  return n;
}
/** Un business annexe ne se construit que sur un terrain acheté. */
export function needsLand(s: GameState, k: StationKey): LandKey | null {
  const land = BIZ[k as BizKey]?.land ?? STATION_LAND[k]; return land && !s.land[land] ? land : null;
}
export function buyLand(s: GameState, k: LandKey): boolean {
  if (s.land[k] || s.cash < LANDS[k].price) return false;
  s.cash -= LANDS[k].price; s.land[k] = true; return true;
}
export function upgrade(s: GameState, k: StationKey, n = 1): boolean {
  if (n < 1 || needsLand(s, k)) return false;
  const c = totalCost(s, k, n);
  if (s.cash < c) return false;
  s.cash -= c; s.levels[k] += n; syncUnits(s);
  return true;
}

// ---------------- Le repaire : plaisirs et tueurs à gages ----------------
export function buyLux(s: GameState, k: LuxKey): boolean {
  const d = LUX[k];
  if (s.lux[k] || s.cash < d.price || villaTier(s) < d.tier) return false;
  s.cash -= d.price; s.lux[k] = true; return true;
}
export function villaTier(s: GameState) { const L = s.levels.villa; return L >= 40 ? 3 : L >= 20 ? 2 : L >= 8 ? 1 : 0; }
export function hitPrice(s: GameState, key: HitKey, target = -1) {
  const rival = target >= 0 ? s.districts[target].rival : 0;
  return Math.ceil(hitCost(key, rival, s.cash) * (1 - stats.villa(s.levels.villa).hitDiscount));
}
export function canHit(s: GameState, key: HitKey, target = -1) {
  if (s.hit || s.hitCd[key] > 0) return false;
  if (HITS[key].perTarget && (target < 0 || s.districts[target].rival <= 0)) return false;
  if (key === 'temoin' && (s.immunity || s.heat < 40)) return false;
  return s.cash >= hitPrice(s, key, target);
}
/** Où va le tueur : le quartier du gang, le commissariat, la rédaction (Centre-ville) ou la planque du témoin (Gare). */
function hitDest(key: HitKey, target: number): Vec[] {
  const rz = LAYOUT.roadZ + 1.6;
  const start = [{ x: VILLA.x + 1, z: VILLA.z0 + 1 }, { x: VILLA.x + 1, z: rz }];
  if (key === 'commissaire') return [...start, { x: COMMISSARIAT.x + 4, z: rz }];
  const di = key === 'journaliste' ? DISTRICTS.findIndex(d => d.id === 'centre') : key === 'temoin' ? DISTRICTS.findIndex(d => d.id === 'gare') : target;
  const d = DISTRICTS[di], c = blockCenter(d.r, d.c), x = roadX(d.c) + 1.6;
  return [...start, { x, z: rz }, { x, z: c.z + 2 }];
}
export function orderHit(s: GameState, key: HitKey, target = -1): boolean {
  if (!canHit(s, key, target)) return false;
  s.cash -= hitPrice(s, key, target);
  const path = hitDest(key, target), p0 = path.shift()!;
  s.hit = { key, target, phase: 'go', t: 0, x: p0.x, z: p0.z, facing: Math.PI, path, win: Math.random() < HITS[key].chance };
  return true;
}
function stepHit(s: GameState, dt: number, events: SimEvent[]) {
  for (const k of Object.keys(s.hitCd) as HitKey[]) s.hitCd[k] = Math.max(0, s.hitCd[k] - dt);
  const h = s.hit; if (!h) return;
  h.t += dt;
  if (h.phase === 'go') {
    const w = h.path[0];
    if (!w || moveTo(h, w.x, w.z, 22, dt)) h.path.shift();
    if (!h.path.length) { h.phase = 'act'; h.t = 0; resolveHit(s, h, events); }
  } else if (h.phase === 'act' && h.t > 3) { h.phase = 'gone'; h.t = 0; }
  else if (h.phase === 'gone' && h.t > 2) s.hit = null;
}
function resolveHit(s: GameState, h: Hit, events: SimEvent[]) {
  s.hitCd[h.key] = HITS[h.key].cooldown;
  const d = h.target >= 0 ? s.districts[h.target] : null;
  if (h.win) {
    switch (h.key) {
      case 'boss': if (d) d.rival = 0; s.kills.rivals += 1; s.heat = Math.min(99, s.heat + 5); break;
      case 'planque': if (d) d.rival = Math.floor(d.rival / 2); s.kills.rivals += 2; s.heat = Math.min(99, s.heat + 8); break;
      case 'commissaire': s.kills.cops += 1; s.heat = Math.max(0, s.heat - 40); s.grip = Math.min(100, s.grip + 25); s.comDamage = Math.min(1, s.comDamage + 0.1); break;
      case 'journaliste': s.heat = Math.max(0, s.heat - 15); break;
      case 'temoin': s.immunity = true; break;
      case 'joueur': s.kills.rivals += 2; s.heat = Math.min(99, s.heat + 12); break;
    }
  } else {
    s.heat = Math.min(99, s.heat + (h.key === 'commissaire' ? 25 : 10));
  }
  events.push({ type: 'hit', key: h.key, target: h.target, win: h.win });
}

export function selectRoute(s: GameState, r: RouteKey): 'selected' | 'bought' | 'nope' {
  if (!s.routes[r]) { if (s.cash < ROUTES[r].unlock) return 'nope'; s.cash -= ROUTES[r].unlock; s.routes[r] = true; s.route = r; return 'bought'; }
  s.route = r; return 'selected';
}

// ---------------- Multijoueur ----------------
/** Contrat sur un autre joueur : la voiture file jusqu'à sa base (position dans TA vue de la carte). */
export function pvpPrice(s: GameState, targetCash: number) { return Math.ceil(hitCost('joueur', 0, targetCash) * (1 - stats.villa(s.levels.villa).hitDiscount)); }
export function pvpChance(s: GameState, targetPower: number) { return Math.max(0.15, Math.min(0.85, 0.6 + (power(s) - targetPower) * 0.03)); }
export function orderPvp(s: GameState, targetId: number, pos: Vec, targetCash: number, targetPower: number): boolean {
  const price = pvpPrice(s, targetCash);
  if (s.hit || s.hitCd.joueur > 0 || s.cash < price) return false;
  s.cash -= price;
  const rz = LAYOUT.roadZ + 1.6;
  const path = [{ x: VILLA.x + 1, z: rz }, { x: pos.x, z: rz }, { x: pos.x, z: pos.z }];
  s.hit = { key: 'joueur', target: targetId, phase: 'go', t: 0, x: VILLA.x + 1, z: VILLA.z0 + 1, facing: Math.PI, path, win: Math.random() < pvpChance(s, targetPower) };
  return true;
}
/** On se fait attaquer par un autre joueur : on perd du cash (moins si planqué) et deux gardes. Renvoie la somme volée. */
export function sufferAttack(s: GameState, win: boolean, raid = false): number {
  if (!win) { s.kills.rivals += raid ? 3 : 1; return 0; }
  if (raid && s.levels.milice > 1) s.levels.milice -= 1;
  const loss = Math.floor(s.cash * (raid ? 0.2 : 0.15) * (1 - hidden(s) * 0.6));
  s.cash -= loss; s.kills.ours += 2; s.heat = Math.min(99, s.heat + 5);
  return loss;
}
/** Ventes des autres joueurs dans les quartiers : elles saturent la demande pour tout le monde. */
export function applyExt(s: GameState, ext: number[]) { ext.forEach((v, i) => { const d = s.districts[i]; if (d) d.sat = Math.min(1, d.sat + v); }); }

// ---------------- Entrepôt ----------------
/** Le surplus que les pick-up ne peuvent pas écouler part à l'entrepôt (à l'abri des saisies). */
function stepWarehouse(s: GameState, dt: number) {
  const L = s.levels.entrepot; if (!L) return;
  const E = stats.entrepot(L, s.levels.transport), G = stats.garage(s.levels.garage);
  const keep = G.capacity * G.vans * 2;                     // ce que les pick-up écoulent : on n'y touche pas
  let room = E.capacity - wareTotal(s), budget = E.rate * dt;
  for (const p of PRODUCT_KEYS) {
    if (room <= 0 || budget <= 0) break;
    const extra = s.stock[p] - keep; if (extra <= 0) continue;
    const q = Math.min(extra, room, budget);
    s.stock[p] -= q; s.ware[p] += q; room -= q; budget -= q;
  }
}
/** Poids lourds : vont chercher les conteneurs au port, les ramènent au parc, qui les dépote un par un. */
function stepContainers(s: GameState, dt: number, events: SimEvent[]) {
  const C = stats.conteneurs(s.levels.conteneurs), K = s.cont;
  while (s.semis.length < C.trucks) s.semis.push({ t: 0, load: 0, color: s.semis.length });
  if (s.semis.length > C.trucks) s.semis.length = C.trucks;
  let goingEmpty = s.semis.filter(m => m.t > 0 && m.t < 0.5).length;
  for (const m of s.semis) {
    if (m.t === 0) {                                     // garé au parc : ne part que s'il y a un conteneur à aller chercher
      if (K.quayN - goingEmpty <= 0) continue;
      if (s.semis.some(o => o !== m && o.t > 0 && o.t < 0.035)) continue;   // un départ à la fois (pas de convoi collé)
      goingEmpty++;
    }
    const before = m.t; m.t += dt / SEMI_LOOP;
    if (before < 0.5 && m.t >= 0.5) {                    // au port : on charge
      if (K.quayN > 0) { const v = K.quayV / K.quayN; K.quayN--; K.quayV = Math.max(0, K.quayV - v); m.load = v; }
    }
    if (m.t >= 1) {                                      // retour au parc : on décharge s'il y a de la place
      if (m.load > 0 && K.yardN >= C.capacity) { m.t = 0.999; continue; }
      if (m.load > 0) { K.yardN++; K.yardV += m.load; m.load = 0; }
      m.t = 0;
    }
  }
  // on dépote : un conteneur à la fois
  if (K.yardN > 0 && C.open > 0) {
    s.contT += dt;
    if (s.contT >= C.open) {
      s.contT = 0;
      const v = K.yardV / K.yardN; K.yardN--; K.yardV = Math.max(0, K.yardV - v);
      const amount = v * C.payMult;
      s.cash += amount; s.totalEarned += amount;
      events.push({ type: 'biz', key: 'conteneurs', amount, x: CONT_DOCK_X, z: CONT_DOCK_Z });
    }
  } else s.contT = 0;
}
const CONT_DOCK_X = 35, CONT_DOCK_Z = -20;
export const wareTotal = (s: GameState) => PRODUCT_KEYS.reduce((a, p) => a + s.ware[p], 0);
/** Valeur de l'entrepôt vendu à l'étranger (prix de base × prime export × prestige). */
export function wareValue(s: GameState) {
  const E = stats.entrepot(s.levels.entrepot);
  return PRODUCT_KEYS.reduce((a, p) => a + s.ware[p] * PRODUCTS[p].price, 0) * E.exportMult * (1 + prestige(s));
}
/** Un avion (ou un bateau) repart avec tout l'entrepôt. */
export function exportWare(s: GameState) {
  if (!s.levels.entrepot) return 0;
  const v = wareValue(s); for (const p of PRODUCT_KEYS) s.ware[p] = 0; return v;
}
