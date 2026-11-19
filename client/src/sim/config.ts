// Équilibrage du jeu. Tout ce qui est chiffré est ici.

// ---------------- Bâtiments ----------------
export type BizKey = 'clopes' | 'armes' | 'casse' | 'aero';
export const BIZ_KEYS: BizKey[] = ['clopes', 'armes', 'casse', 'aero'];
export type StationKey = 'field' | 'dryer' | 'packer' | 'garage' | 'office' | 'labo' | 'pharma' | 'milice' | 'villa' | BizKey;
export const STATION_KEYS: StationKey[] = ['villa', 'field', 'dryer', 'packer', 'garage', 'office', 'labo', 'pharma', 'milice', ...BIZ_KEYS];
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
  clopes:  { name: 'Contrebande',     desc: 'Cartouches de clopes passées en Belgique et revendues sous le manteau', baseCost: 250,  unlock: 6000 },
  armes:   { name: 'Armurerie',       desc: 'Kalachs et pompes des Balkans : ça rapporte gros et ça arme la milice', baseCost: 2500, unlock: 40000 },
  casse:   { name: 'Casse auto',      desc: 'Voitures volées, désossées et revendues en pièces détachées',         baseCost: 900,  unlock: 18000 },
  aero:    { name: 'Aérodrome',       desc: 'Un avion cargo par vol : la came arrive directement de l\'étranger', baseCost: 60000, unlock: 3000000 },
  villa:   { name: 'Repaire',         desc: 'Ta maison. Elle grandit avec toi : villa, manoir, puis château. Le PC est à l\'intérieur', baseCost: 1200 },
};

// ---------------- Terrains & business annexes ----------------
export type LandKey = 'ouest' | 'nord' | 'aero';
export const LAND_KEYS: LandKey[] = ['ouest', 'nord', 'aero'];
export const LANDS: Record<LandKey, { name: string; price: number; x0: number; x1: number; z0: number; z1: number }> = {
  ouest: { name: 'Terrain ouest', price: 12000, x0: -45, x1: -22.5, z0: -22, z1: 6.5 },
  nord:  { name: 'Terrain nord',  price: 45000, x0: -18, x1: 18.8,  z0: -46, z1: -26 },
  aero:  { name: 'Terrain de l\'aérodrome', price: 1500000, x0: -132, x1: -54, z0: -42, z1: -4 },
};
/** Chaque business annexe : sur quel terrain, où, et ce qu'il rapporte. */
export const BIZ: Record<BizKey, { land: LandKey; x: number; z: number; income: number; heat: number; color: string; sign: string }> = {
  clopes:  { land: 'ouest', x: -30,  z: -2,  income: 4,  heat: 0.02, color: '#f59e0b', sign: 'TABAC EXPORT' },
  armes:   { land: 'ouest', x: -36,  z: -15, income: 26, heat: 0.04, color: '#64748b', sign: 'BALKAN IMPORT' },
  casse:   { land: 'nord',  x: 0,    z: -36, income: 10, heat: 0.03, color: '#ea580c', sign: 'CASSE DU NORD' },
  aero:    { land: 'aero',  x: -93,  z: -23, income: 0,  heat: 0.05, color: '#0ea5e9', sign: 'AÉRO-CLUB' },
};
export const inLand = (k: LandKey, x: number, z: number, m = 0) => { const l = LANDS[k]; return x > l.x0 - m && x < l.x1 + m && z > l.z0 - m && z < l.z1 + m; };

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
  /** Business annexe : €/s, pression/s, ouvriers ; l'armurerie arme aussi la milice. */
  biz: (k: BizKey, L: number) => ({
    workers: L === 0 ? 0 : Math.min(4, 1 + Math.floor((L - 1) / 6)),
    income: L === 0 ? 0 : BIZ[k].income * L * up(L, 0.04),
    heat: L === 0 ? 0 : BIZ[k].heat * Math.sqrt(L),
    power: k === 'armes' && L > 0 ? Math.min(6, 0.6 + L * 0.25) : 0,
  }),
  /** Repaire : gardes du corps, part du cash planquée (perquisitions), remise sur les contrats. */
  villa: (L: number) => ({
    guards: Math.min(8, 1 + Math.floor(L / 4)),
    hide: Math.min(0.6, 0.015 * L),
    hitDiscount: Math.min(0.4, 0.01 * L),
  }),
  office: (L: number) => ({ decay: 0.15 * up(L, 0.18), discount: Math.min(0.6, 0.03 * (L - 1)) }),
  milice: (L: number) => ({
    soldiers: L === 0 ? 0 : Math.min(10, 1 + Math.floor((L - 1) / 2)),
    power: L === 0 ? 0 : Math.min(10, 1 + Math.floor((L - 1) / 2)) * up(L, 0.08),
    upkeep: L === 0 ? 0 : Math.min(10, 1 + Math.floor((L - 1) / 2)) * 0.6 * up(L, 0.05),   // $/s
  }),
};

// ---------------- Milice : opérations ----------------
export type OpKey = 'intimidate' | 'killcop' | 'rival';
export const OPS: Record<OpKey, { name: string; desc: string; cooldown: number; difficulty: number; heatWin: number; heatFail: number; lossFail: number; grip?: number }> = {
  intimidate: { name: 'Menacer le commissariat', desc: 'Le convoi passe devant le comico, message reçu',      cooldown: 45,  difficulty: 3,  heatWin: -20, heatFail: 10, lossFail: 1, grip: 25 },
  killcop:    { name: 'Attaquer le commissariat', desc: 'Plus personne n\'ose enquêter… si ça marche',  cooldown: 120, difficulty: 7,  heatWin: -45, heatFail: 30, lossFail: 2, grip: 45 },
  rival:      { name: 'Descente chez',       desc: 'Reprendre un point de deal à une bande rivale',        cooldown: 30,  difficulty: 0,  heatWin: 8,   heatFail: 5,  lossFail: 1 },
};
export const MILICE_REPEL = 4;     // puissance minimale pour faire fuir une descente de police
/** Véhicules armés de la milice : 1 au départ, jusqu'à 3. Palier : technique (pick-up + mitrailleuse) puis blindé. */
export const miliceVehicles = (L: number) => (L === 0 ? 0 : Math.min(3, 1 + Math.floor((L - 1) / 6)));
export const miliceVehicleTier = (L: number) => (L >= 12 ? 1 : 0);
/** Emprise sur la police (0-100) : monte avec les opérations au commissariat et la puissance, redescend doucement. */
export const GRIP = { decay: 0.12, perPower: 0.012, control: 80 };

// ---------------- Ville : grille 4x4 + périphérique ----------------
export const CITY = { x0: 72, z0: -39.5, cell: 24, block: 20, size: 4 };
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
  { id: 'chinois',  name: 'Quartier chinois',    tier: 1, r: 0, c: 3, mult: 3,   police: 1,    demand: 140, unlock: 12000,  rival: 9 },
  { id: 'port',     name: 'Le Port',             tier: 0, r: 1, c: 3, mult: 1.6, police: 0.4,  demand: 90,  unlock: 4000,   rival: 8 },
  { id: 'jardins',  name: 'Les Jardins',         tier: 2, r: 2, c: 3, mult: 8,   police: 2.5,  demand: 250, unlock: 120000, rival: 14 },
  { id: 'zi',       name: 'Zone industrielle',   tier: 0, r: 3, c: 0, mult: 1.3, police: 0.3,  demand: 75,  unlock: 1500,   rival: 5 },
  { id: 'pavillons',name: 'Les Pavillons',       tier: 1, r: 3, c: 1, mult: 2.8, police: 0.9,  demand: 130, unlock: 8000,   rival: 0 },
  { id: 'fac',      name: 'Université',          tier: 1, r: 3, c: 2, mult: 3.2, police: 1,    demand: 160, unlock: 15000,  rival: 7 },
  { id: 'marina',   name: 'La Marina',           tier: 3, r: 3, c: 3, mult: 18,  police: 4.5,  demand: 380, unlock: 900000, rival: 20 },
];
/** Boulevard périphérique autour de la ville (le côté ouest évite le commissariat). */
export const RING = { x0: 66.8, x1: CITY.x0 + CITY.size * CITY.cell + 6, z0: CITY.z0 - 6, z1: CITY.z0 + CITY.size * CITY.cell + 6 };
/** Maisons de campagne : planques au vert, au bout des routes de campagne. */
export interface CountryDef { id: string; name: string; x: number; z: number; price: number }
export const COUNTRY: CountryDef[] = [
  { id: 'mas',      name: 'Mas provençal',        x: 22,  z: 76,  price: 250000 },
  { id: 'ferme',    name: 'Ferme du Bocage',      x: 128, z: -88, price: 400000 },
  { id: 'chalet',   name: 'Chalet des Pins',      x: 196, z: -70, price: 700000 },
  { id: 'domaine',  name: 'Domaine viticole',     x: 196, z: 100, price: 1200000 },
];
/** Chaque maison de campagne cache une partie du cash (perquisitions) et fait monter le prestige. */
export const COUNTRY_HIDE = 0.08, COUNTRY_PRESTIGE = 0.03;
export const RIVAL = { pricePenalty: 0.5, robChance: 0.15, respawnEvery: 240 };
export const GANGS = ['Bande du Bloc C', 'Clan des Docks', 'Équipe du Marché', 'Les Cagoulés', 'Bande de la Gare', 'Les Frères K', 'Réseau Delta', 'Les Ritals', 'Clan Rocher', 'Triade du Lotus', 'Dockers du Port', 'Clan des Jardins', 'Les Zonards', 'Les Pavillons Noirs', 'Bande de la Fac', 'Famille Marina'];
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
// postes fixes des soldats : miradors (dans l'ordre d'apparition) puis autour du QG
export const TOWER_POS = [[-19.8, 5], [20.6, 5.2], [-19.8, -23.8], [20.6, -23.8], [-19.8, -9.5], [0.5, -24.2]];
export const QG_POSTS = [[-2.4, 3.6, -1.2], [-8.6, 3.6, 1.2], [-2.4, 5.6, -1.6], [-8.6, 5.6, 1.6], [-4.2, 2.9, 0], [-6.8, 2.9, 0], [8.6, 5.6, 2.4], [-0.6, 3.4, -0.6], [-10.4, 3.2, 0.8], [8.6, 4, 2.4]];   // x, z, regard
export const MILICE_PARK = [{ x: 0.4, z: 4.5 }, { x: 3.2, z: 4.5 }, { x: 6, z: 4.5 }];   // garés en épi, nez vers la route
// le commissariat : à l'entrée de la ville, au nord de la route
export const COMMISSARIAT = { x: 58, z: 0 };
// (ancienne ronde, gardée pour référence)
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

// ---------------- Paliers visuels ----------------
// Niveau à partir duquel un bâtiment change d'apparence (3 paliers chacun).
export const VISUAL_TIERS: Record<StationKey, number[]> = {
  field: [1, 10, 25], dryer: [1, 10, 25], packer: [1, 12, 25], garage: [1, 10, 22], office: [1, 10, 25],
  labo: [1, 8, 18], pharma: [1, 8, 18], milice: [1, 6, 14],
  clopes: [1, 8, 18], armes: [1, 8, 18], casse: [1, 8, 18], aero: [1, 6, 15], villa: [1, 8, 20, 40],
};
export const VEHICLE_TIERS = [1, 5, 15, 30];          // moto -> pick-up -> utilitaire -> SUV
export const TOWER_LEVELS = [2, 4, 7, 10, 14, 18];      // miradors qui se construisent avec le QG
export const BASE_TIERS = [0, 70, 180];                 // somme des niveaux -> la place se refait
export const tierOf = (level: number, steps: number[]) => { let t = -1; steps.forEach((s, i) => { if (level >= s) t = i; }); return t; };

// ---------------- Repaire : la vie de boss ----------------
export const VILLA = { x: 0, z: 23, x0: -17, x1: 17, z0: 12, z1: 36 };
export type LuxKey = 'lambo' | 'fontaine' | 'piscine' | 'collection' | 'statue' | 'helico';
export const LUX_KEYS: LuxKey[] = ['lambo', 'fontaine', 'piscine', 'collection', 'statue', 'helico'];
/** Se faire plaisir : chaque achat se voit au repaire et fait monter le prestige (+4 % sur les prix de vente). */
export const LUX: Record<LuxKey, { name: string; desc: string; price: number; tier: number }> = {
  lambo:      { name: 'Lamborghini',             desc: 'Jaune, évidemment',                         price: 180000,  tier: 0 },
  fontaine:   { name: 'Fontaine en or',          desc: 'Devant l\'entrée, pour les invités',         price: 90000,   tier: 1 },
  piscine:    { name: 'Piscine à débordement',   desc: 'Avec les transats et le bar',               price: 300000,  tier: 1 },
  collection: { name: 'Collection de bolides',   desc: 'Ferrari, G-Class, Rolls',                   price: 650000,  tier: 2 },
  statue:     { name: 'Statue en or à ton effigie', desc: 'Trois mètres. Le message est clair',    price: 900000,  tier: 2 },
  helico:     { name: 'Hélicoptère privé',       desc: 'Avec son héliport sur la pelouse',          price: 1500000, tier: 3 },
};
export const PRESTIGE_PER_LUX = 0.04;

// ---------------- Le PC : tueurs à gages ----------------
export type HitKey = 'boss' | 'planque' | 'commissaire' | 'journaliste' | 'temoin' | 'joueur';
export const HITS: Record<HitKey, { name: string; desc: string; chance: number; cooldown: number; perTarget?: boolean }> = {
  boss:        { name: 'Buter le chef',              desc: 'Le gang lâche le quartier',                          chance: 0.75, cooldown: 60,  perTarget: true },
  planque:     { name: 'Faire sauter la planque',    desc: 'Explosion : le gang perd la moitié de ses forces',   chance: 0.85, cooldown: 40,  perTarget: true },
  commissaire: { name: 'Éliminer le commissaire',    desc: 'Pression −40, emprise +25. Si ça rate : ça va chauffer', chance: 0.55, cooldown: 300 },
  journaliste: { name: 'Faire taire le journaliste', desc: 'Il enquêtait sur toi. Pression −15',                 chance: 0.8,  cooldown: 180 },
  joueur:      { name: 'Attaquer sa base',          desc: 'Tes gars tirent dans le tas et repartent avec une partie de son cash', chance: 0.6, cooldown: 120 },
  temoin:      { name: 'Éliminer le témoin clé',     desc: 'Te sauve de la prochaine arrestation (une fois)',    chance: 0.7,  cooldown: 600 },
};
export function hitCost(key: HitKey, rival: number, cash: number) {
  switch (key) {
    case 'boss': return 6000 + rival * 4000;
    case 'planque': return 3000 + rival * 1500;
    case 'commissaire': return Math.max(60000, cash * 0.1);
    case 'journaliste': return 25000;
    case 'temoin': return 120000;
    case 'joueur': return Math.max(40000, cash * 0.05);
  }
}
/** Les chefs des bandes rivales (un par quartier) : leurs fiches s'affichent sur le PC. */
/** Emplacements des bases des autres joueurs (ta base est toujours à l'origine). */
export const OTHER_SLOTS = [
  { x: 205, z: 8 }, { x: 58, z: -100 }, { x: 112, z: 114 }, { x: -64, z: 64 }, { x: -86, z: -82 },
  { x: 250, z: -60 }, { x: 250, z: 75 }, { x: 180, z: -125 }, { x: 0, z: -120 }, { x: -40, z: 110 }, { x: 40, z: 130 }, { x: 160, z: 165 },
  { x: -110, z: 115 }, { x: -175, z: -25 }, { x: -55, z: -140 }, { x: 250, z: 170 }, { x: -175, z: 80 }, { x: 100, z: -165 }, { x: -140, z: -130 }, { x: 220, z: -160 },
];   // 20 emplacements : jusqu'à 21 joueurs (le serveur plafonne à 20)
export const BOSSES = ['Kader « le Rouquin »', 'Mehdi Z.', 'Tony Rizzo', 'Le Vieux Sam', 'Ibrahim « Ibou »', 'Les jumeaux K.', 'Dimitri V.', 'Rocco Mancini', 'Saïd « la Rafale »', 'Jo le Gitan', 'Lin Wei', 'Nabil B.', 'Marco Pinto', 'Ousmane D.', 'Le Belge', 'Vlad'];

// ---------------- Aérodrome : imports ----------------
export type RouteKey = 'maroc' | 'paysbas' | 'colombie' | 'afghan';
export const ROUTE_KEYS: RouteKey[] = ['maroc', 'paysbas', 'colombie', 'afghan'];
export const ROUTES: Record<RouteKey, { name: string; cargo: string; mult: number; unlock: number; heat: number }> = {
  maroc:    { name: 'Maroc',        cargo: 'shit premium',  mult: 1,   unlock: 0,       heat: 1 },
  paysbas:  { name: 'Pays-Bas',     cargo: 'ecsta et beuh', mult: 1.6, unlock: 1500000, heat: 1.2 },
  colombie: { name: 'Colombie',     cargo: 'cocaïne pure',  mult: 2.8, unlock: 5000000, heat: 1.8 },
  afghan:   { name: 'Afghanistan',  cargo: 'héroïne',       mult: 4,   unlock: 12000000, heat: 2.4 },
};
/** Durée d'une rotation (atterrissage, déchargement, redécollage) et valeur d'une cargaison. */
export const aeroCycle = (L: number) => Math.max(26, 48 - L * 0.8);
export const aeroCargo = (L: number, r: RouteKey) => 45000 * Math.pow(L, 0.9) * ROUTES[r].mult;
