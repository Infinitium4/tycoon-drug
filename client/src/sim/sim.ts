// Simulation pure (aucune dépendance 3D) : c'est ce qui passera côté serveur plus tard.
import {
  BAC, CITY, DISTRICTS, pressureLevel, roadZLine, HEAT, LAB_KEYS, LAYOUT, LINES, LabKey, LineKey, MILICE_REPEL, OPS, OpKey, PATROL, PRODUCTS, PRODUCT_KEYS,
  ProductKey, RIVAL, START_CASH, StationKey, blockCenter, roadX, stats, upgradeCost,
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
  dir?: number;        // garde : sens de la ronde (+1 / -1)
  path?: Vec[];        // garde : chemin de sortie / retour en opération
}
export interface Van extends Vec {
  id: number;
  state: 'wait' | 'out' | 'back';
  load: number;
  cargo: Partial<Record<ProductKey, number>>;
  wp: number; wait: number; dest: number; slot: number; facing: number;
}
export interface Forklift extends Vec { id: number; lab: LabKey; state: 'wait' | 'out' | 'back'; load: number; wp: number; facing: number }
export interface DistrictState { unlocked: boolean; active: boolean; sat: number; rival: number }
export interface Police { phase: 'coming' | 'waiting' | 'leaving'; x: number; z: number; t: number; facing: number }
export interface Patrol extends Vec { id: number; from: [number, number]; to: [number, number]; t: number; facing: number }
export interface Op { key: OpKey; target: number; phase: 'go' | 'fight' | 'back'; t: number }

export type SimEvent =
  | { type: 'sale'; amount: number; x: number; z: number; district: number }
  | { type: 'robbed'; district: number }
  | { type: 'controlled'; district: number; lost: number }
  | { type: 'raid' }
  | { type: 'repelled' }
  | { type: 'seized'; cash: number }
  | { type: 'arrested' }
  | { type: 'opResult'; key: OpKey; win: boolean; target: number }
  | { type: 'desert' }
  | { type: 'rivalBack'; district: number };

export interface GameState {
  cash: number;
  levels: Record<StationKey, number>;
  plants: Plant[];
  agents: Agent[];
  vans: Van[];
  forklifts: Forklift[];
  dryer: { input: number; output: number; busy: boolean; t: number; amt: number };
  stock: Record<ProductKey, number>;
  labs: Record<LabKey, { out: number }>;
  selected: Record<LineKey, ProductKey>;
  owned: Record<ProductKey, boolean>;
  time: number;
  districts: DistrictState[];
  heat: number;
  police: Police | null;
  patrols: Patrol[];
  op: Op | null;
  cooldowns: Record<OpKey, number>;
  unpaid: number;
  rivalTimer: number;
  over: boolean;
  totalEarned: number;
}

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
    levels: { field: 1, dryer: 1, packer: 1, garage: 1, office: 1, labo: 0, pharma: 0, milice: 0 },
    plants, agents: [], vans: [], forklifts: [],
    dryer: { input: 0, output: 0, busy: false, t: 0, amt: 0 },
    stock: { ...zero },
    labs: { labo: { out: 0 }, pharma: { out: 0 } },
    selected: { cannabis: 'beuh', labo: 'ecsta', pharma: 'pregabaline' },
    owned: Object.fromEntries(PRODUCT_KEYS.map(k => [k, PRODUCTS[k].unlock === 0])) as Record<ProductKey, boolean>,
    time: 0,
    districts: DISTRICTS.map(d => ({ unlocked: d.unlock === 0, active: d.unlock === 0, sat: 0, rival: d.rival })),
    heat: 0, police: null, patrols: [], op: null,
    cooldowns: { intimidate: 0, killcop: 0, rival: 0 },
    unpaid: 0, rivalTimer: 0, over: false, totalEarned: 0,
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
    if (s.levels[k] > 0 && !s.forklifts.some(f => f.lab === k)) {
      const p = labPile(k);
      const w = forkRoute(k)[0];
      s.forklifts.push({ id: nextId++, lab: k, x: w.x, z: w.z, state: 'wait', load: 0, wp: 0, facing: Math.PI });
    }
  }
  // soldats
  const M = stats.milice(s.levels.milice);
  let guards = s.agents.filter(a => a.kind === 'guard');
  while (guards.length < M.soldiers) {
    const n = guards.length;
    const a = mkAgent('guard', 0, 0, n); a.state = 'patrol';
    placeOnPatrol(a, ((n * 0.37) % 1) * patrolLength(), n % 2 ? 1 : -1);
    s.agents.push(a); guards = s.agents.filter(g => g.kind === 'guard');
  }
  if (guards.length > M.soldiers) {
    const extra = new Set(guards.slice(M.soldiers).map(g => g.id));
    s.agents = s.agents.filter(a => !extra.has(a.id));
  }
}

/** Bout d'allée du jardinier n°i (une rangée de culture chacun). */
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
export function forkRoute(k: LabKey): Vec[] {
  const p = labPile(k), st = LAYOUT.stock[k];
  const lz = LAYOUT.laneZ - (k === 'labo' ? 0.8 : 0), lx = LAYOUT.forkX[k], uz = st.z + 1.5 + (k === 'labo' ? 0.7 : 0);
  return [{ x: p.x, z: p.z + 1.3 }, { x: p.x, z: lz }, { x: lx, z: lz }, { x: lx, z: uz }, { x: st.x, z: uz }];
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

// ---------------- Prix ----------------
export function productPrice(s: GameState, p: ProductKey) {
  const d = PRODUCTS[p];
  const mult = d.line === 'cannabis' ? stats.packer(s.levels.packer).priceMult : stats.lab(s.levels[d.line as LabKey]).priceMult;
  return d.price * mult;
}
export function districtFactor(s: GameState, i: number) {
  const st = s.districts[i];
  return DISTRICTS[i].mult * (1 - 0.7 * st.sat) * (st.rival > 0 ? RIVAL.pricePenalty : 1);
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
  for (const f of s.forklifts) {
    const Lb = stats.lab(s.levels[f.lab]), route = forkRoute(f.lab);
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
          if (bac && Math.random() < BAC.controlChance) {
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
              s.heat += q * HEAT.perUnit * D0.police * def.heat;
            }
            s.cash += amount; s.totalEarned += amount;
            ds.sat = Math.min(1, ds.sat + v.load / D0.demand);
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
  if (s.op) {
    const op = s.op; op.t += dt;
    if (op.phase === 'go' && op.t > 4.5) { op.phase = 'fight'; op.t = 0; }
    else if (op.phase === 'fight' && op.t > 2.5) { resolveOp(s, events); op.phase = 'back'; op.t = 0; }
    else if (op.phase === 'back' && op.t > 5) {
      s.op = null;
    }
  }

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

  stepPatrols(s, dt);

  // chaleur & police
  const O = stats.office(s.levels.office);
  if (s.heat >= 100) { s.heat = 100; s.over = true; events.push({ type: 'arrested' }); return events; }
  s.heat = Math.max(0, s.heat - O.decay * dt);
  const pol = s.police;
  if (!pol) {
    const fear = 1 - Math.min(0.6, M.power * 0.05);
    if (s.heat > HEAT.raidFrom && Math.random() < ((s.heat - HEAT.raidFrom) / 400) * fear * dt) {
      s.police = { phase: 'coming', x: CITY.x0, z: LAYOUT.roadZ + 0.8, t: 0, facing: -Math.PI / 2 };
      events.push({ type: 'raid' });
    }
  } else if (pol.phase === 'coming') {
    if (moveTo(pol, LAYOUT.vanPark.x - 3, pol.z, 16, dt)) {
      if (M.power >= MILICE_REPEL) { pol.phase = 'leaving'; s.heat = Math.max(0, s.heat - 10); events.push({ type: 'repelled' }); }
      else { pol.phase = 'waiting'; pol.t = HEAT.waitTime; }
    }
  } else if (pol.phase === 'waiting') {
    pol.t -= dt;
    if (pol.t <= 0) {
      const lost = s.cash * HEAT.seizeCash;
      s.cash -= lost;
      for (const p of PRODUCT_KEYS) s.stock[p] = Math.floor(s.stock[p] / 2);
      for (const k of LAB_KEYS) s.labs[k].out = Math.floor(s.labs[k].out / 2);
      s.dryer.input = Math.floor(s.dryer.input / 2); s.dryer.output = Math.floor(s.dryer.output / 2);
      s.heat = Math.max(0, s.heat - 25);
      pol.phase = 'leaving';
      events.push({ type: 'seized', cash: lost });
    }
  } else if (pol.phase === 'leaving') {
    if (moveTo(pol, CITY.x0, pol.z, 16, dt)) s.police = null;
  }
  return events;
}

/** Soldat : ronde (aller-retour, à droite), ou sortie en opération. */
function stepGuard(s: GameState, a: Agent, dt: number) {
  a.moving = true;
  if (a.state === 'op' && a.path) {
    const w = a.path[0];
    const last = a.path.length === 1;
    const tx = last && s.op && s.op.phase !== 'back' ? w.x + a.slot * 1.1 : w.x;
    if (moveTo(a, tx, w.z, 7, dt)) {
      if (!last) a.path.shift();
      else if (s.op && s.op.phase !== 'back') { a.moving = false; a.facing = Math.PI / 2; a.firing = s.op.phase === 'fight' && Math.random() < 0.35; }
      else { a.state = 'patrol'; a.path = undefined; a.dir = -1; a.target = PATROL.length - 2; }
    }
    return;
  }
  const dir = a.dir ?? 1;
  const w = patrolPoint(a.target, dir);
  if (moveTo(a, w.x, w.z, 2.2, dt)) {
    let n = a.target + dir;
    if (n < 0 || n >= PATROL.length) { a.dir = -dir; n = a.target - dir; }
    a.target = n;
  }
}

// ---------------- BAC : voitures banalisées qui tournent dans la ville ----------------
const N = CITY.size;
const crossing = (i: number, j: number): Vec => ({ x: roadX(i), z: roadZLine(j) });
function stepPatrols(s: GameState, dt: number) {
  const want = Math.min(BAC.max, BAC.base + pressureLevel(s.heat) * BAC.perLevel);
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
  const pw = stats.milice(s.levels.milice).power;
  const diff = key === 'rival' ? (s.districts[target]?.rival ?? 1) : OPS[key].difficulty;
  return pw / (pw + diff);
}
export function canLaunch(s: GameState, key: OpKey, target = -1) {
  if (s.levels.milice === 0 || s.op || s.cooldowns[key] > 0) return false;
  if (key === 'rival' && (target < 0 || s.districts[target].rival <= 0)) return false;
  return true;
}
export function launchOp(s: GameState, key: OpKey, target = -1): boolean {
  if (!canLaunch(s, key, target)) return false;
  s.op = { key, target, phase: 'go', t: 0 };
  s.agents.forEach(a => {
    if (a.kind !== 'guard') return;
    // rejoint la sortie en suivant la ronde vers l'allée est
    const rest = PATROL.slice(Math.max(1, a.dir === 1 ? a.target : a.target + 1)).map((_, i, arr) => arr[i]);
    a.state = 'op'; a.path = [...rest, ...OP_EXIT];
  });
  return true;
}
function resolveOp(s: GameState, events: SimEvent[]) {
  const op = s.op!, def = OPS[op.key];
  const win = Math.random() < opChance(s, op.key, op.target);
  s.cooldowns[op.key] = def.cooldown;
  if (win) {
    s.heat = Math.max(0, s.heat + def.heatWin);
    if (op.key === 'rival') s.districts[op.target].rival = 0;
  } else {
    s.heat = Math.min(100, s.heat + def.heatFail);
    s.levels.milice = Math.max(1, s.levels.milice - def.lossFail);
    if (op.key === 'rival') s.districts[op.target].rival += 1;
    syncUnits(s);
  }
  s.agents.forEach(a => { if (a.kind === 'guard') { a.state = 'op'; a.path = [...OP_EXIT].reverse(); } });
  events.push({ type: 'opResult', key: op.key, win, target: op.target });
}

// ---------------- Actions joueur ----------------
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
export function upgrade(s: GameState, k: StationKey, n = 1): boolean {
  if (n < 1) return false;
  const c = totalCost(s, k, n);
  if (s.cash < c) return false;
  s.cash -= c; s.levels[k] += n; syncUnits(s);
  return true;
}
