// Équilibrage du jeu. Tout ce qui est chiffré est ici.

// ---------------- Bâtiments ----------------
export type StationKey = 'field' | 'dryer' | 'packer' | 'garage' | 'office' | 'labo' | 'pharma' | 'milice';
export const STATION_KEYS: StationKey[] = ['field', 'dryer', 'packer', 'garage', 'office', 'labo', 'pharma', 'milice'];
export type LabKey = 'labo' | 'pharma';
export const LAB_KEYS: LabKey[] = ['labo', 'pharma'];

export const STATIONS: Record<StationKey, { name: string; desc: string; baseCost: number; unlock?: number }> = {
  field:  { name: 'Plantation',      desc: 'Les jardiniers récoltent le cannabis',                 baseCost: 10 },
  dryer:  { name: 'Séchoir',         desc: 'Sèche la récolte',                                      baseCost: 25 },
  packer: { name: 'Conditionnement', desc: 'Pesée et mise en sachets',      baseCost: 40 },
  garage: { name: 'Livraison',       desc: 'Les charbonneurs livrent les points de deal',                          baseCost: 60 },
  office: { name: 'Avocat',          desc: 'Un bon baveux et quelques indics : la pression retombe plus vite',      baseCost: 50 },
  pharma: { name: 'Pharmacie',       desc: 'Ordonnances falsifiées et médocs détournés : discret',            baseCost: 400,  unlock: 4000 },
  labo:   { name: 'Labo',            desc: 'Synthétiques, coke, héro : très rentable, très surveillé',        baseCost: 3000, unlock: 25000 },
  milice: { name: 'QG',              desc: 'Les soldats tiennent la base et font peur aux keufs', baseCost: 600,  unlock: 3000 },
};

// ---------------- Produits ----------------
// Prix de rue indicatifs en France (€ par unité : gramme, cachet, boîte ou flacon). Juste des chiffres de jeu.
export type LineKey = 'cannabis' | 'labo' | 'pharma';
export const LINES: Record<LineKey, { name: string; color: string; affinity: number[] }> = {
  // affinity = multiplicateur de prix par richesse de quartier [pauvre, moyen, riche, très riche]
  cannabis: { name: 'Cannabis',      color: '#4ade80', affinity: [1, 1, 0.95, 0.85] },
  pharma:   { name: 'Médocs',        color: '#f472b6', affinity: [1.25, 1.1, 0.9, 0.8] },
  labo:     { name: 'Labo',          color: '#38bdf8', affinity: [0.7, 0.95, 1.2, 1.4] },
};
export type ProductKey =
  | 'shit' | 'beuh' | 'amnesia' | 'haze' | 'filtre'
  | 'pregabaline' | 'lexomil' | 'alprazolam' | 'xanax' | 'rivotril' | 'codeine' | 'tramadol' | 'subutex' | 'methadone' | 'oxycodone'
  | 'ecsta' | 'speed' | 'keta' | 'mdma' | 'crack' | 'heroine' | 'coke' | 'meth';
export interface ProductDef { name: string; line: LineKey; unit: string; price: number; heat: number; time: number; unlock: number; color: string }
export const PRODUCTS: Record<ProductKey, ProductDef> = {
  // Cannabis
  shit:        { name: 'Shit',            line: 'cannabis', unit: 'g',        price: 7,  heat: 1,   time: 1,    unlock: 0,      color: '#a16207' },
  beuh:        { name: 'Beuh',            line: 'cannabis', unit: 'g',        price: 10, heat: 1,   time: 1.15, unlock: 0,      color: '#65a30d' },
  amnesia:     { name: 'Amnesia',         line: 'cannabis', unit: 'g',        price: 12, heat: 1.1, time: 1.25, unlock: 2500,   color: '#16a34a' },
  haze:        { name: 'Haze',            line: 'cannabis', unit: 'g',        price: 14, heat: 1.1, time: 1.35, unlock: 6000,   color: '#15803d' },
  filtre:      { name: 'Filtré',          line: 'cannabis', unit: 'g',        price: 20, heat: 1.2, time: 1.6,  unlock: 15000,  color: '#ca8a04' },
  // Médocs détournés
  pregabaline: { name: 'Prégabaline',     line: 'pharma',   unit: 'plaquette', price: 4,  heat: 0.5, time: 0.8,  unlock: 0,      color: '#fbcfe8' },
  lexomil:     { name: 'Lexomil',         line: 'pharma',   unit: 'plaquette', price: 5,  heat: 0.5, time: 0.85, unlock: 1000,   color: '#f9a8d4' },
  alprazolam:  { name: 'Alprazolam',      line: 'pharma',   unit: 'plaquette', price: 5,  heat: 0.5, time: 0.85, unlock: 1500,   color: '#f5d0fe' },
  xanax:       { name: 'Xanax',           line: 'pharma',   unit: 'plaquette', price: 7,  heat: 0.6, time: 0.95, unlock: 3000,   color: '#f0abfc' },
  rivotril:    { name: 'Rivotril',        line: 'pharma',   unit: 'flacon',    price: 8,  heat: 0.6, time: 1,    unlock: 5000,   color: '#e879f9' },
  codeine:     { name: 'Sirop codéiné',   line: 'pharma',   unit: 'flacon',    price: 12, heat: 0.7, time: 1.1,  unlock: 8000,   color: '#c084fc' },
  tramadol:    { name: 'Tramadol',        line: 'pharma',   unit: 'boîte',     price: 15, heat: 0.8, time: 1.2,  unlock: 12000,  color: '#a78bfa' },
  subutex:     { name: 'Subutex',         line: 'pharma',   unit: 'boîte',     price: 18, heat: 0.9, time: 1.3,  unlock: 20000,  color: '#818cf8' },
  methadone:   { name: 'Méthadone',       line: 'pharma',   unit: 'flacon',    price: 22, heat: 1,   time: 1.4,  unlock: 35000,  color: '#6366f1' },
  oxycodone:   { name: 'Oxycodone',       line: 'pharma',   unit: 'boîte',     price: 35, heat: 1.3, time: 1.6,  unlock: 60000,  color: '#4f46e5' },
  // Labo
  ecsta:       { name: 'Ecstasy',         line: 'labo',     unit: 'cachet',    price: 10, heat: 1.6, time: 0.7,  unlock: 0,      color: '#fda4af' },
  speed:       { name: 'Speed',           line: 'labo',     unit: 'g',         price: 15, heat: 1.7, time: 0.8,  unlock: 4000,   color: '#fde68a' },
  keta:        { name: 'Kétamine',        line: 'labo',     unit: 'g',         price: 35, heat: 2,   time: 1,    unlock: 15000,  color: '#e0f2fe' },
  mdma:        { name: 'MDMA',            line: 'labo',     unit: 'g',         price: 45, heat: 2.2, time: 1.1,  unlock: 30000,  color: '#fecdd3' },
  crack:       { name: 'Crack',           line: 'labo',     unit: 'caillou',   price: 50, heat: 3,   time: 1.1,  unlock: 50000,  color: '#fef3c7' },
  heroine:     { name: 'Héroïne',         line: 'labo',     unit: 'g',         price: 55, heat: 3,   time: 1.25, unlock: 80000,  color: '#d6d3d1' },
  coke:        { name: 'Cocaïne',         line: 'labo',     unit: 'g',         price: 70, heat: 2.8, time: 1.3,  unlock: 130000, color: '#f8fafc' },
  meth:        { name: 'Meth',            line: 'labo',     unit: 'g',         price: 90, heat: 3.3, time: 1.5,  unlock: 250000, color: '#7dd3fc' },
};
export const PRODUCT_KEYS = Object.keys(PRODUCTS) as ProductKey[];
export const productsOf = (l: LineKey) => PRODUCT_KEYS.filter(p => PRODUCTS[p].line === l);
export const START_CASH = 30;

export const upgradeCost = (k: StationKey, level: number) =>
  level === 0 ? (STATIONS[k].unlock ?? 0) : Math.ceil(STATIONS[k].baseCost * Math.pow(1.15, level - 1));

const up = (L: number, pct: number) => 1 + pct * (Math.max(1, L) - 1);

export const stats = {
  field: (L: number) => ({
    workers: Math.min(5, 1 + Math.floor((L - 1) / 5)),
    speed: 2.4 * up(L, 0.04),
    harvestTime: 1.5 / up(L, 0.06),
    carry: 1 + Math.floor((L - 1) / 4),
    growTime: 5 / up(L, 0.03),
  }),
  dryer: (L: number) => ({ batch: 2 + Math.floor((L - 1) / 2), time: 3 / up(L, 0.07) }),
  packer: (L: number) => ({
    workers: Math.min(4, 1 + Math.floor((L - 1) / 6)),
    carry: 2 + Math.floor((L - 1) / 3),
    packTime: 2 / up(L, 0.06),
    speed: 2.6 * up(L, 0.03),
    priceMult: up(L, 0.1),
  }),
  garage: (L: number) => ({
    vans: Math.min(4, 1 + Math.floor((L - 1) / 7)),   // 4 places de parking
    capacity: 8 + 3 * (L - 1),
    speed: 10 * up(L, 0.04),
  }),
  lab: (L: number) => ({
    workers: L === 0 ? 0 : Math.min(4, 1 + Math.floor((L - 1) / 5)),
    batch: 2 + Math.floor(Math.max(0, L - 1) / 3),
    time: 3.2 / up(L, 0.06),
    priceMult: up(L, 0.1),
    forkCap: 6 + 2 * Math.max(0, L - 1),
    forkSpeed: 6 * up(L, 0.03),
  }),
  office: (L: number) => ({ decay: 0.15 * up(L, 0.15), discount: Math.min(0.6, 0.03 * (L - 1)) }),
  milice: (L: number) => ({
    soldiers: L === 0 ? 0 : Math.min(10, 1 + Math.floor((L - 1) / 2)),
    power: L === 0 ? 0 : Math.min(10, 1 + Math.floor((L - 1) / 2)) * up(L, 0.08),
    upkeep: L === 0 ? 0 : Math.min(10, 1 + Math.floor((L - 1) / 2)) * 0.6 * up(L, 0.05),   // $/s
  }),
};

// ---------------- Milice : opérations ----------------
export type OpKey = 'intimidate' | 'killcop' | 'rival';
export const OPS: Record<OpKey, { name: string; desc: string; cooldown: number; difficulty: number; heatWin: number; heatFail: number; lossFail: number }> = {
  intimidate: { name: 'Mettre la pression',  desc: 'Menaces sur des témoins et un flic trop curieux',          cooldown: 45,  difficulty: 3,  heatWin: -20, heatFail: 10, lossFail: 1 },
  killcop:    { name: 'Buter un flic',       desc: 'Plus personne n\'ose enquêter… si ça marche',     cooldown: 120, difficulty: 7,  heatWin: -45, heatFail: 30, lossFail: 2 },
  rival:      { name: 'Descente chez',       desc: 'Reprendre un point de deal à une bande rivale',        cooldown: 30,  difficulty: 0,  heatWin: 8,   heatFail: 5,  lossFail: 1 },
};
export const MILICE_REPEL = 4;     // puissance minimale pour faire fuir une descente de police

// ---------------- Ville : grille 3x3 ----------------
export const CITY = { x0: 72, z0: -39.5, cell: 24, block: 20, size: 3 };
export const roadX = (c: number) => CITY.x0 + c * CITY.cell;
export const roadZLine = (r: number) => CITY.z0 + r * CITY.cell;
export const blockCenter = (r: number, c: number) => ({ x: CITY.x0 + c * CITY.cell + CITY.cell / 2, z: CITY.z0 + r * CITY.cell + CITY.cell / 2 });

export const TIERS = ['Pauvre', 'Moyen', 'Riche', 'Très riche'];
export interface DistrictDef { id: string; name: string; tier: number; r: number; c: number; mult: number; police: number; demand: number; unlock: number; rival: number }
// rival = force du gang qui tient le quartier au départ (0 = personne)
export const DISTRICTS: DistrictDef[] = [
  { id: 'cite',     name: 'La Cité',             tier: 0, r: 1, c: 0, mult: 1,   police: 0.25, demand: 60,  unlock: 0,      rival: 0 },
  { id: 'tours',    name: 'Les Tours',           tier: 0, r: 0, c: 1, mult: 1.2, police: 0.3,  demand: 70,  unlock: 400,    rival: 3 },
  { id: 'zone',     name: 'La Zone',             tier: 0, r: 2, c: 1, mult: 1.2, police: 0.3,  demand: 70,  unlock: 400,    rival: 0 },
  { id: 'docks',    name: 'Les Docks',           tier: 0, r: 1, c: 2, mult: 1.4, police: 0.35, demand: 80,  unlock: 900,    rival: 4 },
  { id: 'gare',     name: 'Quartier Gare',       tier: 1, r: 0, c: 0, mult: 2.5, police: 0.8,  demand: 120, unlock: 2500,   rival: 6 },
  { id: 'marche',   name: 'Le Marché',           tier: 1, r: 2, c: 0, mult: 2.5, police: 0.8,  demand: 120, unlock: 2500,   rival: 0 },
  { id: 'centre',   name: 'Centre-ville',        tier: 2, r: 0, c: 2, mult: 6,   police: 2,    demand: 220, unlock: 30000,  rival: 10 },
  { id: 'affaires', name: "Quartier d'affaires", tier: 2, r: 2, c: 2, mult: 6,   police: 2,    demand: 220, unlock: 45000,  rival: 12 },
  { id: 'hauts',    name: 'Les Hauts',           tier: 3, r: 1, c: 1, mult: 15,  police: 4,    demand: 350, unlock: 400000, rival: 18 },
];
export const RIVAL = { pricePenalty: 0.5, robChance: 0.15, respawnEvery: 240 };
export const GANGS = ['Bande du Bloc C', 'Clan des Docks', 'Équipe du Marché', 'Les Cagoulés', 'Bande de la Gare', 'Les Frères K', 'Réseau Delta', 'Les Ritals', 'Clan Rocher'];
export const CREW = ['Momo', 'Bilel', 'Yanis', 'Karim', 'Sofiane', 'Kevin', 'Rayan', 'Nordine', 'Teddy', 'Lamine', 'Djibril', 'Enzo'];

// ---------------- Police ----------------
// Pression (0-100) en 5 niveaux ; la BAC patrouille en ville, les Stups perquisitionnent la base.
export const PRESSURE = ['Calme', 'Repéré', 'Surveillé', 'Enquête', 'Stups sur le dos', 'Perquisition imminente'];
export const pressureLevel = (h: number) => Math.min(5, Math.floor(h / 20) + (h >= 95 ? 1 : 0));
export const BAC = { base: 1, perLevel: 1, max: 6, speed: 9, controlRange: 9, controlChance: 0.35, heatOnControl: 5 };

export const HEAT = {
  perUnit: 0.1,
  raidFrom: 60,
  seizeCash: 0.2,
  waitTime: 7,
  bribe: (cash: number, discount: number) => Math.max(100, cash * 0.08) * (1 - discount),
};

// ---------------- Plan de la base (grille propre, flux gauche -> droite) ----------------
// Nord : labos. Milieu : champ -> tapis -> séchoir -> tapis -> table -> tapis -> stock. Sud : bureau, QG, parking, portail.
export const LAYOUT = {
  plants: { x0: -15.4, z0: -9.2, cols: 4, rows: 5, dx: 2.3, dz: 2.4 },
  harvestHomeX: -6.8,          // bout d'allée où les jardiniers déposent sur le tapis
  fieldConvX: -5.8,            // tapis vertical qui longe le champ
  dryer: { x: -2, z: -6.5 },
  table: { x: 6.4, z: -6.5 },
  garage: { x: 13.6, z: -7.9 },
  stock: { cannabis: { x: 12.3, z: -3 }, pharma: { x: 14.3, z: -3 }, labo: { x: 16.3, z: -3 } } as Record<'cannabis' | LabKey, { x: number; z: number }>,
  vanPark: { x: 10.6, z: 3.3 }, vanGap: 1.9,
  office: { x: -12.5, z: 4.5 },
  milice: { x: -5.5, z: 4.4 },
  labs: {
    pharma: { x: -9, z: -17.5, color: '#ec4899' },
    labo:   { x: 7,  z: -17.5, color: '#0ea5e9' },
  } as Record<LabKey, { x: number; z: number; color: string }>,
  laneZ: -10.8,                // allée nord (parapharmacie) ; le labo roule 0.8 plus au nord
  forkX: { pharma: 16.6, labo: 17.4 } as Record<LabKey, number>,   // une voie par chariot
  eastX: 18.3,                 // allée est réservée à la ronde
  walkZ: 2.6,                  // allée piétonne sud
  slab: { x0: -18, x1: 18.8, z0: -22, z1: 6.5 },
  gate: { x0: 9.4, x1: 18.8 },
  roadZ: 8.5,
};
// ronde des soldats : aller-retour sur ce chemin (chacun tient sa droite)
export const PATROL = [
  { x: 9.4, z: LAYOUT.walkZ }, { x: -17.4, z: LAYOUT.walkZ }, { x: -17.4, z: -21.2 }, { x: LAYOUT.eastX, z: -21.2 }, { x: LAYOUT.eastX, z: 0.6 },
];

// ---------------- Événements dynamiques ----------------
export type EventKey = 'power' | 'strike' | 'shortage' | 'sabotage' | 'crisis' | 'boom' | 'party';
export interface EventDef { name: string; desc: string; icon: string; dur: number; good: boolean; fix?: string }
export const EVENTS: Record<EventKey, EventDef> = {
  power:    { name: 'Panne de courant',        icon: '⚡', dur: 30, good: false, desc: 'Séchoir, labo et parapharmacie à l\'arrêt',     fix: 'Groupe électrogène' },
  strike:   { name: 'Grève des emballeurs',    icon: '✊', dur: 25, good: false, desc: 'Les gars du conditionnement ne bossent plus',   fix: 'Augmenter les gars' },
  shortage: { name: 'Rupture d\'appro',        icon: '📦', dur: 45, good: false, desc: 'Labo et parapharmacie tournent à 30%',          fix: 'Fournisseur au black' },
  sabotage: { name: 'Sabotage',                icon: '💣', dur: 0,  good: false, desc: 'Un gang rival a détruit une partie du stock' },
  crisis:   { name: 'Crise économique',        icon: '📉', dur: 60, good: false, desc: 'Tous les prix de vente -30%' },
  boom:     { name: 'Pénurie en ville',        icon: '📈', dur: 45, good: true,  desc: 'Une ligne de produits se vend 60% plus cher' },
  party:    { name: 'Grosse soirée',           icon: '🎉', dur: 45, good: true,  desc: 'Un quartier paie 50% plus cher, demande au max' },
};
export const EVENT_TIMING = { first: 90, min: 60, max: 110 };
export const eventFixCost = (cash: number) => Math.max(150, Math.round(cash * 0.06));

// ---------------- Objectifs (tuto + progression) ----------------
export type MissionKind = 'level' | 'earned' | 'district' | 'product' | 'rivals' | 'ops';
export interface Mission { text: string; reward: number; kind: MissionKind; key?: string; n: number }
export const MISSIONS: Mission[] = [
  { text: 'Améliore la Plantation au niveau 3',   reward: 40,     kind: 'level',    key: 'field',   n: 3 },
  { text: 'Améliore le Conditionnement au niv. 3', reward: 60,    kind: 'level',    key: 'packer',  n: 3 },
  { text: 'Améliore la Livraison au niveau 3',    reward: 80,     kind: 'level',    key: 'garage',  n: 3 },
  { text: 'Gagne $1 000 au total',                reward: 150,    kind: 'earned',                   n: 1000 },
  { text: 'Débloque le quartier La Zone',         reward: 200,    kind: 'district', key: 'zone',    n: 1 },
  { text: 'Débloque l\'Amnesia',                  reward: 500,    kind: 'product',  key: 'amnesia', n: 1 },
  { text: 'Construis le QG Milice',               reward: 600,    kind: 'level',    key: 'milice',  n: 1 },
  { text: 'Construis la Parapharmacie',           reward: 800,    kind: 'level',    key: 'pharma',  n: 1 },
  { text: 'Élimine un gang rival',                reward: 2000,   kind: 'rivals',                   n: 1 },
  { text: 'Débloque le Quartier Gare',            reward: 1500,   kind: 'district', key: 'gare',    n: 1 },
  { text: 'Réussis 3 opérations de milice',       reward: 3000,   kind: 'ops',                      n: 3 },
  { text: 'Construis le Labo',                    reward: 5000,   kind: 'level',    key: 'labo',    n: 1 },
  { text: 'Gagne $250 000 au total',              reward: 15000,  kind: 'earned',                   n: 250000 },
  { text: 'Débloque la Cocaïne',                  reward: 20000,  kind: 'product',  key: 'coke',    n: 1 },
  { text: 'Débloque le Centre-ville',             reward: 25000,  kind: 'district', key: 'centre',  n: 1 },
  { text: 'Gagne $2M au total',                   reward: 100000, kind: 'earned',                   n: 2e6 },
  { text: 'Débloque Les Hauts',                   reward: 250000, kind: 'district', key: 'hauts',   n: 1 },
  { text: 'Gagne $25M au total',                  reward: 1e6,    kind: 'earned',                   n: 25e6 },
];
