// Interface HTML par-dessus la 3D.
import * as THREE from 'three';
import type { Net, PlayerInfo } from '../net';
import {
  GRIP, miliceVehicles, CITY, CREW, DISTRICTS, GANGS, HEAT, PRESSURE, pressureLevel, LAB_KEYS, LINES, LabKey, LineKey, MILICE_REPEL, OPS, OpKey, PRODUCTS, PRODUCT_KEYS, ProductKey,
  STATIONS, STATION_KEYS, StationKey, TIERS, productsOf, stats, BIZ, BizKey, LANDS, LAND_KEYS, LandKey, LUX, LUX_KEYS, LuxKey, HITS, HitKey, BOSSES, VILLA, COUNTRY, OTHER_SLOTS, ROUTES, ROUTE_KEYS, RouteKey, aeroCycle, aeroCargo,
} from '../sim/config';
import {
  GameState, SimEvent, employees, bribe, bribeCost, canLaunch, districtAction, districtFactor, launchOp, maxAffordable, opChance,
  productPrice, selectProduct, totalCost, upgrade, power, needsLand, buyLand, buyLux, villaTier, hitPrice, canHit, orderHit, prestige, buyCountry, selectRoute, pvpPrice, pvpChance, orderPvp,
} from '../sim/sim';
import { World } from '../render/scene';
import { gameHour, nightFactor, DAY_LENGTH } from '../render/fx';

/** Montants en euros, à la française : 950 €, 12,4 k€, 3,2 M€. */
export const fmt = (n: number) => {
  n = Math.floor(n);
  if (n < 10000) return n.toLocaleString('fr-FR') + ' €';
  const u = ['k€', 'M€', 'Md€', 'T€']; let i = -1;
  while (n >= 1000 && i < u.length - 1) { n /= 1000; i++; }
  return n.toLocaleString('fr-FR', { maximumFractionDigits: n < 10 ? 2 : n < 100 ? 1 : 0 }) + ' ' + u[i];
};
const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const unitPrice = (v: number, unit: string) => `${v < 100 ? v.toFixed(v < 10 ? 1 : 0).replace('.', ',') + ' €' : fmt(v)}/${unit}`;
/** « à La Cité », « aux Hauts », « au Marché ». */
const a = (name: string) => name.startsWith('Les ') ? 'aux ' + name.slice(4) : name.startsWith('Le ') ? 'au ' + name.slice(3) : 'à ' + name;
const crew = () => CREW[Math.floor(Math.random() * CREW.length)];
type Mult = 1 | 10 | 'max';
const LINE_OF_STATION: Partial<Record<StationKey, LineKey>> = { field: 'cannabis', dryer: 'cannabis', packer: 'cannabis', labo: 'labo', pharma: 'pharma' };

export class Hud {
  private root: HTMLElement;
  private q = <T extends HTMLElement>(sel: string) => this.root.querySelector(sel) as T;
  private labels = new Map<StationKey, HTMLElement>();
  private dLabels: HTMLElement[] = [];
  private lLabels = {} as Record<LandKey, HTMLElement>;
  private cLabels: HTMLElement[] = [];
  private oLabels = new Map<number, HTMLElement>();
  net: Net | null = null;
  private pileLabels: Record<string, HTMLElement> = {};
  private copBtn!: HTMLButtonElement;
  private comLabel!: HTMLElement;
  selected: StationKey | null = 'field';
  private mult: Mult = 1;
  private earned: { t: number; v: number }[] = [];
  private lastPanel = '';

  constructor(parent: HTMLElement, private s: GameState, private world: World) {
    this.root = document.createElement('div'); this.root.className = 'hud';
    this.root.innerHTML = `
      <div class="topbar">
        <div class="logo">TYCOON <span>DRUG</span></div>
        <div class="cash" id="cash">$0</div>
        <div class="rate" id="rate">$0 /min</div>
        <div class="clock" id="clock"></div>
        <div class="online" id="online"></div>
        <div class="heat"><small>Pression policière</small><div class="lvls" id="lvls">${'<i></i>'.repeat(5)}</div><b id="heatTxt">Calme</b></div>
        <div class="grip" id="grip"><small>Emprise sur la police</small><div class="gbar"><i id="gripFill"></i></div><b id="gripTxt">0 %</b></div>
      </div>
      <div class="stockbar" id="stock"></div>
      <div class="nav"><button data-go="villa">Le repaire</button><button data-go="base">La base</button><button data-go="city">La ville</button></div>
      <div class="pc" id="pc"></div>
      <div class="cartel" id="cartel"></div>
      <div class="labels" id="labels"></div>
      <div class="floats" id="floats"></div>
      <div class="phone" id="toasts"></div>
      <div class="panel" id="panel"></div>
      <div class="overlay" id="overlay"></div>
      <div class="help">Glisser : déplacer · Molette : zoom · Clic sur un bâtiment : améliorer · Clic sur un quartier : l'ouvrir ou le couper · Panneaux « À vendre » : agrandir la base · G : graphismes réalistes on/off · P : +10 000 € (test, solo)</div>`;
    parent.appendChild(this.root);
    const labels = this.q('#labels');
    for (const k of STATION_KEYS) {
      const el = document.createElement('div'); el.className = 'slabel';
      el.onclick = () => this.select(k);
      labels.appendChild(el); this.labels.set(k, el);
    }
    DISTRICTS.forEach((_, i) => {
      const el = document.createElement('div'); el.className = 'dlabel';
      el.onclick = () => {
        const r = districtAction(this.s, i);
        if (r === 'unlocked') this.sms(crew(), `C'est bon, on a un point de deal ${a(DISTRICTS[i].name)}. On commence à charbonner.`, 'good');
        if (r === 'nope' && !this.s.districts[i].unlocked) this.sms('Toi', `Pas assez de liquide pour ouvrir un point ${a(DISTRICTS[i].name)}.`, 'bad');
        this.tick();
      };
      labels.appendChild(el); this.dLabels.push(el);
    });
    for (const lk of LAND_KEYS) {
      const el = document.createElement('div'); el.className = 'dlabel land';
      el.onclick = () => {
        if (buyLand(this.s, lk)) { this.sms('Notaire', `${LANDS[lk].name} : c'est signé, payé cash. Personne ne posera de questions.`, 'good'); this.world.goTo((LANDS[lk].x0 + LANDS[lk].x1) / 2, (LANDS[lk].z0 + LANDS[lk].z1) / 2, 0.8); }
        else if (!this.s.land[lk]) this.sms('Toi', `Pas assez de liquide pour le ${LANDS[lk].name.toLowerCase()}.`, 'bad');
        this.tick();
      };
      labels.appendChild(el); this.lLabels[lk] = el;
    }
    COUNTRY.forEach((c, i) => {
      const el = document.createElement('div'); el.className = 'dlabel land country';
      el.onclick = () => {
        if (buyCountry(this.s, i)) { this.sms('Notaire', `${c.name} : les clés sont à toi. Planque au vert, personne ne viendra te chercher ici.`, 'good'); this.ticker(`Immobilier : ${this.s.boss} rachète le ${c.name.toLowerCase()}`); }
        else if (!this.s.country[i]) this.sms('Toi', `Pas assez de liquide pour le ${c.name.toLowerCase()}.`, 'bad');
        this.tick();
      };
      labels.appendChild(el); this.cLabels.push(el);
    });
    for (const key of Object.keys(world.pilePos)) { const e = document.createElement('div'); e.className = 'pcount'; labels.appendChild(e); this.pileLabels[key] = e; }
    this.copBtn = document.createElement('button'); this.copBtn.className = 'cop'; labels.appendChild(this.copBtn);
    this.comLabel = document.createElement('div'); this.comLabel.className = 'dlabel com'; labels.appendChild(this.comLabel);
    this.comLabel.onclick = () => this.select('milice');
    this.copBtn.onclick = () => { const c = bribe(this.s); if (c) this.sms('Avocat', `C'est arrangé. Ils repartent, ça t'a coûté ${fmt(c)}.`, 'good'); };

    const TIER_MSG: Record<string, string[]> = {
      field: ['', 'Les filets d\'ombrage sont posés, l\'arrosage tourne.', 'La serre est montée. Lampes de culture allumées H24.'],
      dryer: ['', 'Nouveau séchoir en brique, deux fois plus grand.', 'Séchoir industriel installé, avec les silos.'],
      packer: ['', 'On a fermé l\'atelier d\'emballage.', 'Atelier pro : charpente métal, filmeuse automatique.'],
      garage: ['', 'Nouveau dépôt, deux portes de garage.', 'Le dépôt « Transports Momo » est ouvert. Couverture parfaite.'],
      office: ['', 'L\'avocat a pris un vrai cabinet.', 'Avocats associés : on a les meilleurs.'],
      labo: ['', 'On a quitté le conteneur, vrai labo maintenant.', 'Hangar 3 opérationnel. Production à l\'échelle.'],
      pharma: ['', 'La pharmacie a un vrai local.', 'Entrepôt Pharma Distrib ouvert.'],
      milice: ['', 'Le QG est renforcé.', 'Le QG est une forteresse.'],
      clopes: ['', 'Vrai entrepôt pour les cartouches. On charge des semi-remorques.', 'Entrepôt « Tabac Export » : on fournit la moitié de la région.'],
      armes: ['', 'Le bunker est monté. Les caisses arrivent des Balkans.', 'Hangar camouflé : on arme les gars et on revend le reste.'],
      casse: ['', 'Atelier monté, avec le pont et la grue.', 'La casse tourne à plein : compacteur et trois équipes.'],
      villa: ['', 'On a emménagé dans la villa. Piscine possible, gardes au portail.', 'Le manoir est à toi. Les voisins font semblant de rien voir.', 'Le château. T\'es plus un dealer, t\'es un seigneur.'],
      base: ['', 'On a refait toute la place : dalle neuve, clôture opaque.', 'La base est blindée : murs béton et barbelés.'],
    };
    world.onTierUp = (k, t) => { const m = TIER_MSG[k]?.[t]; if (m) this.sms(k === 'milice' || k === 'base' ? 'Chef d\'équipe' : crew(), m, 'good'); };
    this.q('.nav').addEventListener('click', e => {
      const b = (e.target as HTMLElement).closest('[data-go]') as HTMLElement | null; if (!b) return;
      if (b.dataset.go === 'base') world.goTo(2, -6, 0.8); else if (b.dataset.go === 'villa') world.goTo(VILLA.x, VILLA.z, 0.9); else world.goTo(CITY.x0 + CITY.cell * CITY.size / 2, CITY.z0 + CITY.cell * CITY.size / 2, 0.3);
    });
    this.q('#panel').addEventListener('click', e => this.onPanelClick(e.target as HTMLElement));
    this.q('#pc').addEventListener('click', e => this.onPcClick(e.target as HTMLElement));
  }

  private onPanelClick(t: HTMLElement) {
    const s = this.s, k = this.selected;
    const m = t.closest('[data-mult]') as HTMLElement | null;
    if (m) { this.mult = m.dataset.mult === 'max' ? 'max' : (Number(m.dataset.mult) as Mult); this.renderPanel(true); return; }
    if (t.closest('[data-close]')) { this.select(null); return; }
    if (t.closest('[data-buy]') && k && needsLand(s, k)) { this.sms('Toi', `Il faut d'abord acheter le ${LANDS[needsLand(s, k)!].name.toLowerCase()}.`, 'bad'); }
    else if (t.closest('[data-buy]') && k) {
      const n = s.levels[k] === 0 ? 1 : this.mult === 'max' ? maxAffordable(s, k) : this.mult;
      const wasBuilt = s.levels[k] > 0;
      if (upgrade(s, k, n)) { this.bounce(k); this.world.pulse(k, !wasBuilt); if (n && s.levels[k] === 1 && STATIONS[k].unlock) this.sms(crew(), `${STATIONS[k].name} : c'est monté, on est opérationnels.`, 'good'); }
    }
    const pr = t.closest('[data-product]') as HTMLElement | null;
    if (pr) {
      const p = pr.dataset.product as ProductKey, r = selectProduct(s, p);
      if (r === 'bought') this.sms('Fournisseur', `J'ai ce qu'il te faut pour la ${PRODUCTS[p].name.toLowerCase()}. Tu peux lancer.`, 'good');
      if (r === 'nope') this.sms('Toi', `Pas assez de liquide pour ${PRODUCTS[p].name}.`, 'bad');
    }
    if (t.closest('[data-pc]')) { this.openPc('profils'); return; }
    const rt = t.closest('[data-route]') as HTMLElement | null;
    if (rt && !(rt as HTMLButtonElement).disabled) {
      const r = rt.dataset.route as RouteKey, res = selectRoute(s, r);
      if (res === 'bought') this.sms('Le pilote', `Contact pris en ${ROUTES[r].name}. Prochain vol : ${ROUTES[r].cargo}.`, 'good');
    }
    const lx = t.closest('[data-lux]') as HTMLElement | null;
    if (lx && !(lx as HTMLButtonElement).disabled) {
      const k2 = lx.dataset.lux as LuxKey;
      if (buyLux(s, k2)) { this.sms('Toi', `${LUX[k2].name} : c'est à moi. ${LUX[k2].desc}.`, 'good'); this.world.luxBought(k2); this.ticker(`Train de vie : ${s.boss} s'offre ${LUX[k2].name.toLowerCase()}`); }
    }
    const op = t.closest('[data-op]') as HTMLElement | null;
    if (op && !(op as HTMLButtonElement).disabled) {
      const key = op.dataset.op as OpKey, target = Number(op.dataset.target ?? -1);
      if (launchOp(s, key, target)) this.sms('Chef d\'équipe', key === 'rival' ? `Le convoi part. ${GANGS[target]}, ${DISTRICTS[target].name}.` : key === 'killcop' ? 'Le convoi part pour le comico. Ça va parler fort.' : 'On passe devant le comico, qu\'ils comprennent qui commande.', 'good');
    }
    this.renderPanel(true);
  }

  select(k: StationKey | null) { this.selected = k; this.renderPanel(true); }

  onEvent(ev: SimEvent) {
    switch (ev.type) {
      case 'sale': {
        this.earned.push({ t: performance.now(), v: ev.amount });
        this.world.burst('money', ev.x, ev.z, 10);
        const p = this.world.project(new THREE.Vector3(ev.x, 2, ev.z));
        const el = document.createElement('div'); el.className = 'float'; el.textContent = '+' + fmt(ev.amount);
        el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
        this.q('#floats').appendChild(el); setTimeout(() => el.remove(), 1400);
        break;
      }
      case 'biz': {
        if (ev.key === 'aero') this.sms('Le pilote', `Vol de ${ROUTES[this.s.route].name} posé et déchargé : ${ROUTES[this.s.route].cargo}. +${fmt(ev.amount)}.`, 'good');
        this.earned.push({ t: performance.now(), v: ev.amount });
        if (Math.random() < 0.5) this.world.burst('money', ev.x, ev.z + 3, 5);
        const p = this.world.project(new THREE.Vector3(ev.x, 4, ev.z));
        const el = document.createElement('div'); el.className = 'float biz'; el.textContent = '+' + fmt(ev.amount);
        el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
        this.q('#floats').appendChild(el); setTimeout(() => el.remove(), 1400);
        break;
      }
      case 'hit': {
        const tgt = ev.target >= 0 ? `${BOSSES[ev.target]} (${GANGS[ev.target]})` : '';
        if (ev.key === 'joueur') {
          const pl = this.net?.player(ev.target);
          this.sms('Le Tueur', ev.win ? `On a retourné la base de ${pl?.cartel ?? 'l\'autre'}. Le butin arrive.` : `Leurs gars nous attendaient. On s'est replié.`, ev.win ? 'good' : 'bad');
          this.net?.hit(ev.target, ev.win);
          break;
        }
        const ok: Record<Exclude<HitKey, 'joueur'>, string> = { boss: `C'est fait. ${tgt} ne se relèvera pas.`, planque: `Boum. La planque de ${GANGS[ev.target]} est partie en fumée.`, commissaire: 'Le commissaire a eu un « accident ». Personne ne viendra fouiner.', journaliste: 'Le journaliste a arrêté son enquête. Définitivement.', temoin: 'Le témoin ne témoignera pas. T\'es couvert pour la prochaine fois.' };
        if (ev.win) this.sms('Le Tueur', ok[ev.key as Exclude<HitKey, 'joueur'>], 'good'); else this.sms('Le Tueur', 'Ça a foiré. Je me suis tiré, mais ils vont chercher qui a payé.', 'bad');
        const news: Record<Exclude<HitKey, 'joueur'>, string> = { boss: `Règlement de comptes : ${tgt} abattu en pleine rue`, planque: `Explosion dans un immeuble, la piste criminelle privilégiée`, commissaire: `Un commissaire de police tué, émoi dans la profession`, journaliste: `Un journaliste d'investigation retrouvé mort`, temoin: `Le témoin clé d'un procès pour trafic introuvable` };
        if (ev.win) { const k2 = ev.key as Exclude<HitKey, 'joueur'>; setTimeout(() => this.ticker(news[k2]), 1500); this.net?.news(news[k2]); }
        break;
      }
      case 'saved': this.sms('Avocat', 'Sans le témoin, le dossier s\'écroule. Tu ressors libre. Profites-en.', 'good'); this.ticker('Coup de théâtre : le parquet abandonne les poursuites'); break;
      case 'controlled': this.sms(crew(), `Contrôle de la BAC ${a(DISTRICTS[ev.district].name)}. Ils ont tout pris (${ev.lost} unités), je me suis tiré.`, 'bad'); break;
      case 'robbed': this.sms(crew(), `On s'est fait braquer ${a(DISTRICTS[ev.district].name)}. C'est ${GANGS[ev.district]}.`, 'bad'); break;
      case 'raid': this.sms('Guetteur', ev.gign ? 'C\'est le GIGN !! Fourgon noir, ils sont lourdement armés. Il faut une milice de puissance 8 pour les repousser.' : 'Ça arrive ! Deux voitures des Stups sur la route, ils viennent à la base.', 'bad'); if (ev.gign) this.ticker('Opération du GIGN en cours contre un réseau de trafic'); break;
      case 'repelled': this.sms('Chef d\'équipe', 'Les Stups ont vu les gars au portail. Ils ont fait demi-tour.', 'good'); break;
      case 'seized': this.sms('Avocat', `Perquisition. Ils ont saisi ${fmt(ev.cash)} et la moitié du stock.`, 'bad'); break;
      case 'desert': this.sms('Chef d\'équipe', 'Les gars sont pas payés. Y en a qui se barrent.', 'bad'); break;
      case 'rivalBack': this.sms(crew(), `${GANGS[ev.district]} s'est réinstallé ${a(DISTRICTS[ev.district].name)}.`, 'bad'); break;
      case 'opResult': {
        const o = OPS[ev.key];
        const morts = ev.cops + ev.rivals + ev.ours;
        setTimeout(() => this.ticker(ev.key === 'rival'
          ? `Règlement de comptes ${a(DISTRICTS[ev.target].name)} : ${morts} mort${morts > 1 ? 's' : ''}`
          : `Attaque armée contre le commissariat : ${ev.cops} policier${ev.cops > 1 ? 's' : ''} tué${ev.cops > 1 ? 's' : ''}, le GIGN est sur place`), 2500);
        const bilan = [ev.cops ? `${ev.cops} flic${ev.cops > 1 ? 's' : ''} à terre` : '', ev.rivals ? `${ev.rivals} gars d'en face au tapis` : '', ev.ours ? `on a perdu ${ev.ours} des nôtres` : ''].filter(Boolean).join(', ');
        if (bilan) setTimeout(() => this.sms('Chef d\'équipe', `Bilan : ${bilan}.` + (ev.key === 'killcop' ? ' Le comico est criblé de balles.' : ''), ev.ours && !ev.win ? 'bad' : 'good'), 900);
        if (ev.win) this.sms('Chef d\'équipe', ev.key === 'rival' ? `C'est fait. ${DISTRICTS[ev.target].name} est à nous.` : ev.key === 'killcop' ? 'Le comico est retourné. Les keufs vont filer droit.' : 'Message passé. Le commissaire a compris.', 'good');
        else this.sms('Chef d\'équipe', `Ça a mal tourné (${o.name.toLowerCase()}). On a perdu des gars, et ça va chauffer.`, 'bad');
        break;
      }
      case 'arrested': this.gameOver(); break;
    }
  }

  /** Bandeau « FLASH INFO » des chaînes d'info. */
  ticker(text: string) {
    let el = this.root.querySelector('.ticker') as HTMLElement | null;
    if (!el) { el = document.createElement('div'); el.className = 'ticker'; this.root.appendChild(el); }
    el.innerHTML = `<b>FLASH INFO</b><span>${esc(text)}</span>`;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  }
  /** Notification façon SMS d'un membre de l'équipe. */
  sms(from: string, msg: string, cls: 'good' | 'bad' = 'good') {
    const box = this.q('#toasts');
    const t = this.s.time, h = gameHour(t), day = 1 + Math.floor((t / DAY_LENGTH + 9 / 24)), hh = Math.floor(h), mm = Math.floor((h % 1) * 60);
    const el = document.createElement('div'); el.className = 'sms ' + cls;
    el.innerHTML = `<div class="av">${from[0]}</div><div><div class="from">${from}<span>Jour ${day} · ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}</span></div><div class="msg"></div></div>`;
    (el.querySelector('.msg') as HTMLElement).textContent = msg;
    box.prepend(el);
    while (box.children.length > 4) box.lastElementChild!.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, 7000);
  }
  private gameOver() {
    const s = this.s, m = Math.floor(s.time / 60), sec = Math.floor(s.time % 60);
    const ov = this.q('#overlay');
    ov.innerHTML = `<div class="go-card">
      <h2>T'ES TOMBÉ</h2>
      <p>Les Stups ont tout perquisitionné. Garde à vue, saisie totale. Il faut repartir de zéro.</p>
      <div class="go-stats"><div><small>Cartel</small><b>${esc(s.cartel)}</b></div><div><small>Temps</small><b>${m}min ${sec}s</b></div><div><small>Gagné</small><b>${fmt(s.totalEarned)}</b></div><div><small>Morts</small><b>${s.kills.cops + s.kills.rivals + s.kills.ours}</b></div></div>
      <button class="go" id="restart">RECOMMENCER À ZÉRO</button></div>`;
    ov.classList.add('show');
    ov.querySelector('#restart')!.addEventListener('click', () => location.reload());
  }
  private bounce(k: StationKey) { const el = this.labels.get(k)!; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }

  /** Chaque frame : positionne les étiquettes. */
  frame() {
    const far = this.world.camera.zoom < 0.32; if (far !== this.root.classList.contains('far')) this.root.classList.toggle('far', far);
    const place = (el: HTMLElement, v: THREE.Vector3) => { const p = this.world.project(v); el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`; };
    for (const st of this.world.stations) place(this.labels.get(st.key)!, st.pos);
    this.dLabels.forEach((el, i) => place(el, this.world.districtAnchors[i]));
    place(this.comLabel, this.world.comAnchor);
    for (const lk of LAND_KEYS) place(this.lLabels[lk], this.world.lands[lk].anchor);
    this.cLabels.forEach((el, i) => place(el, this.world.country[i].anchor));
    for (const [id, el] of this.oLabels) { const a = this.world.otherAnchors.get(id); if (a) place(el, a); }
    for (const k in this.pileLabels) { const v = this.world.pilePos[k].clone(); v.y = 1.8; place(this.pileLabels[k], v); }
    const pol = this.s.police;
    if (pol && pol.phase === 'waiting') { this.copBtn.style.display = ''; place(this.copBtn, new THREE.Vector3(pol.x, 3.4, pol.z)); }
    else this.copBtn.style.display = 'none';
  }

  /** ~5x/s : textes. */
  tick() {
    const s = this.s;
    this.q('#cash').textContent = fmt(s.cash);
    const k = s.kills, dead = k.cops + k.rivals + k.ours;
    const ch = `<div class="cname">Cartel ${esc(s.cartel)}</div><div class="cboss">Boss : <b>${esc(s.boss)}</b>${s.immunity ? ' · <span class="imm">couvert</span>' : ''}</div>
      <div class="cstats"><div><small>Employés</small><b>${employees(s)}</b></div><div class="kc"><small>Morts</small><b>${dead}</b></div></div>
      <div class="cdetail"><span>Flics <b>${k.cops}</b></span><span>Rivaux <b>${k.rivals}</b></span><span>Nos gars <b>${k.ours}</b></span></div>`;
    const ce = this.q('#cartel'); if (ce.innerHTML !== ch) ce.innerHTML = ch;
    this.tickOnline();
    { const h = gameHour(s.time), day = 1 + Math.floor(s.time / DAY_LENGTH + 9 / 24);
      this.q('#clock').innerHTML = `<span class="${nightFactor(s.time) > 0.5 ? 'moon' : 'sun'}"></span>Jour ${day} · ${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60 / 10) * 10).padStart(2, '0')}`; }
    const now = performance.now();
    this.earned = this.earned.filter(e => now - e.t < 60000);
    const span = Math.max(15, Math.min(60, (now - (this.earned[0]?.t ?? now)) / 1000));
    this.q('#rate').textContent = fmt((this.earned.reduce((a, e) => a + e.v, 0) * 60) / span) + ' /min';
    this.q('#gripFill').style.width = s.grip + '%';
    this.q('#gripTxt').textContent = s.grip >= GRIP.control ? 'Sous contrôle' : Math.floor(s.grip) + ' %';
    this.q('#grip').classList.toggle('owned', s.grip >= GRIP.control);
    const comHtml = `<div class="dname">Commissariat</div><div class="dtier">${s.grip >= GRIP.control ? 'Les flics bossent pour toi' : 'Emprise ' + Math.floor(s.grip) + ' %'}</div>`;
    if (this.comLabel.innerHTML !== comHtml) this.comLabel.innerHTML = comHtml;
    this.comLabel.classList.toggle('owned', s.grip >= GRIP.control);
    const lv = pressureLevel(s.heat);
    this.q('#lvls').querySelectorAll('i').forEach((el, i) => { el.className = s.heat >= (i + 1) * 20 ? 'on' : s.heat > i * 20 ? 'half' : ''; });
    const ht = this.q('#heatTxt'); ht.textContent = PRESSURE[lv];
    ht.className = s.heat > 80 ? 'hot' : s.heat > HEAT.raidFrom ? 'warm' : '';

    for (const k of STATION_KEYS) {
      const el = this.labels.get(k)!;
      const can = s.cash >= totalCost(s, k, 1);
      const land = needsLand(s, k);
      el.style.display = land ? 'none' : '';
      const html = land
        ? `${STATIONS[k].name} <b class="lockd">${LANDS[land].name} requis</b>`
        : s.levels[k] === 0
        ? `${STATIONS[k].name} <b>${fmt(totalCost(s, k, 1))}</b>${can ? '<i>▲</i>' : ''}`
        : `${STATIONS[k].name} <b>niv.${s.levels[k]}</b>${can ? '<i>▲</i>' : ''}`;
      if (el.innerHTML !== html) el.innerHTML = html;
      el.classList.toggle('sel', this.selected === k);
      el.classList.toggle('can', can && !land);
    }
    COUNTRY.forEach((c, i) => {
      const el = this.cLabels[i], own = s.country[i];
      const html = own ? `<div class="dname">${c.name}</div><div class="dtier">Planque au vert · à toi</div>` : `<div class="dname">${c.name}</div><div class="dtier">Maison de campagne · planque +8 % · prestige +3 %</div><div class="lock ${s.cash >= c.price ? 'ok' : ''}">Acheter : ${fmt(c.price)}</div>`;
      if (el.innerHTML !== html) el.innerHTML = html;
      el.classList.toggle('owned', own);
    });
    for (const lk of LAND_KEYS) {
      const el = this.lLabels[lk], own = s.land[lk], L = LANDS[lk];
      el.style.display = own ? 'none' : '';
      const html = `<div class="dname">${L.name}</div><div class="dtier">À vendre · ${lk === 'ouest' ? 'contrebande, armes' : lk === 'nord' ? 'casse auto' : 'aérodrome, imports par avion'}</div><div class="lock ${s.cash >= L.price ? 'ok' : ''}">Acheter : ${fmt(L.price)}</div>`;
      if (el.innerHTML !== html) el.innerHTML = html;
    }
    DISTRICTS.forEach((d, i) => {
      const st = s.districts[i], el = this.dLabels[i];
      const rival = st.rival > 0 ? `<div class="rival">Tenu par ${GANGS[i]} (${st.rival})</div>` : '';
      const pol = d.police < 0.5 ? 'faible' : d.police < 1.5 ? 'moyenne' : d.police < 3 ? 'forte' : 'très forte';
      const status = !st.unlocked
        ? `<div class="lock ${s.cash >= d.unlock ? 'ok' : ''}">Ouvrir un point : ${fmt(d.unlock)}</div>`
        : `<div class="dstat">${st.active ? 'Point actif' : 'Point fermé'} · prix ×${districtFactor(s, i).toFixed(1).replace('.', ',')}</div><div class="dbar"><i style="width:${(1 - st.sat) * 100}%"></i></div>`;
      const dm = this.net?.online ? this.net.dom[i] : 0, dp = dm && dm !== this.net!.id ? this.net!.player(dm) : null;
      const domHtml = dm === this.net?.id && dm ? '<div class="dom me">Tu domines le quartier</div>' : dp ? `<div class="dom">Dominé par ${esc(dp.cartel)}</div>` : '';
      const html = `<div class="dname">${d.name}</div><div class="dtier">${TIERS[d.tier]} · police ${pol}</div>${rival}${domHtml}${status}`;
      if (el.innerHTML !== html) el.innerHTML = html;
      el.classList.toggle('off', st.unlocked && !st.active);
      el.classList.toggle('locked', !st.unlocked);
      el.classList.toggle('hasrival', st.rival > 0);
    });
    const lineStock = (l: LineKey) => productsOf(l).reduce((a, p) => a + s.stock[p], 0);
    const pv: Record<string, number> = { raw: s.dryer.input, dry: s.dryer.output, cannabis: lineStock('cannabis') };
    for (const k of LAB_KEYS) { pv[k + 'Out'] = s.labs[k].out; pv[k] = lineStock(k); }
    for (const k in this.pileLabels) {
      const lab = LAB_KEYS.find(l => k === l || k === l + 'Out') as LabKey | undefined;
      const el = this.pileLabels[k];
      el.style.display = lab && s.levels[lab] === 0 ? 'none' : '';
      el.textContent = String(Math.floor(pv[k] ?? 0));
    }
    const shown = PRODUCT_KEYS.filter(p => s.stock[p] >= 1 || s.selected[PRODUCTS[p].line] === p && (PRODUCTS[p].line === 'cannabis' || s.levels[PRODUCTS[p].line as LabKey] > 0));
    const stockHtml = shown.map(p => `<span style="--c:${PRODUCTS[p].color}">${PRODUCTS[p].name} <b>${Math.floor(s.stock[p])}</b> <small>${unitPrice(productPrice(s, p), PRODUCTS[p].unit)}</small></span>`).join('');
    const sb = this.q('#stock'); if (sb.innerHTML !== stockHtml) sb.innerHTML = stockHtml;
    if (s.police && s.police.phase === 'waiting') {
      const c = bribeCost(s);
      this.copBtn.innerHTML = `Arranger avec les Stups · ${fmt(c)}<small>${Math.ceil(s.police.t)} s avant la fouille</small>`;
      this.copBtn.disabled = s.cash < c;
    }
    this.renderPanel(false);
    if (this.pcTab) this.renderPc();
  }

  // ---------------- multijoueur ----------------
  private tickOnline() {
    const n = this.net, el = this.q('#online');
    const html = n?.online ? `<span class="dot on"></span>En ligne · ${n.players.length + 1} joueur${n.players.length ? 's' : ''}` : n ? '<span class="dot"></span>Hors ligne' : '<span class="dot"></span>Solo';
    if (el.innerHTML !== html) el.innerHTML = html;
    const labels = this.q('#labels'), seen = new Set<number>();
    for (const p of n?.online ? n.players : []) {
      seen.add(p.id);
      let lb = this.oLabels.get(p.id);
      if (!lb) { lb = document.createElement('div'); lb.className = 'dlabel other'; lb.onclick = () => this.openPc('contrats'); labels.appendChild(lb); this.oLabels.set(p.id, lb); }
      const html2 = `<div class="dname">Cartel ${esc(p.cartel)}</div><div class="dtier">Boss : ${esc(p.boss)} · ${['Maison', 'Villa', 'Manoir', 'Château'][p.villa] ?? ''}</div><div class="dstat">Fortune ${fmt(p.cash)} · milice ${p.power.toFixed(0)}</div><div class="lock">Contrat sur sa base</div>`;
      if (lb.innerHTML !== html2) lb.innerHTML = html2;
    }
    for (const [id, lb] of this.oLabels) if (!seen.has(id)) { lb.remove(); this.oLabels.delete(id); }
  }
  /** Un autre joueur nous attaque. */
  onAttacked(cartel: string, boss: string, win: boolean, loss: number) {
    if (win) { this.sms('Guetteur', `On se fait allumer ! C'est le cartel ${cartel} (${boss}). Ils sont repartis avec ${fmt(loss)}.`, 'bad'); this.ticker(`Fusillade à la base de ${this.s.cartel} : le cartel ${cartel} revendique l'attaque`); }
    else this.sms('Chef d\'équipe', `Le cartel ${cartel} a tenté un raid. Les gars les ont repoussés.`, 'good');
  }

  // ---------------- le PC du boss ----------------
  private pcTab: '' | 'profils' | 'contrats' = '';
  private pcHtml = '';
  private openPc(tab: 'profils' | 'contrats') { this.pcTab = tab; this.pcHtml = ''; this.renderPc(); this.q('#pc').classList.add('open'); }
  private onPcClick(t: HTMLElement) {
    if (t.closest('[data-pcclose]') || t === this.q('#pc')) { this.pcTab = ''; this.q('#pc').classList.remove('open'); return; }
    const tab = t.closest('[data-tab]') as HTMLElement | null;
    if (tab) { this.openPc(tab.dataset.tab as 'profils' | 'contrats'); return; }
    const pv = t.closest('[data-pvp]') as HTMLElement | null;
    if (pv && !(pv as HTMLButtonElement).disabled && this.net) {
      const p = this.net.player(Number(pv.dataset.pvp)), pos = p ? OTHER_SLOTS[this.net.relSlot(p)] : null;
      if (p && pos && orderPvp(this.s, p.id, { x: pos.x, z: pos.z + 14 }, p.cash, p.power)) {
        this.sms('Le Tueur', `Reçu. On monte chez ${p.cartel}. Suis la voiture.`, 'good');
        this.pcTab = ''; this.q('#pc').classList.remove('open'); this.world.follow = true;
      }
      return;
    }
    const h = t.closest('[data-hit]') as HTMLElement | null;
    if (h && !(h as HTMLButtonElement).disabled) {
      const key = h.dataset.hit as HitKey, target = Number(h.dataset.target ?? -1);
      if (orderHit(this.s, key, target)) {
        this.sms('Le Tueur', 'Reçu. L\'argent est arrivé, je m\'en occupe. Tu peux suivre la voiture noire.', 'good');
        this.pcTab = ''; this.q('#pc').classList.remove('open');
        const hh = this.s.hit; if (hh) this.world.follow = true;
      }
      return;
    }
  }
  private othersHtml(ava: (n: string, c: string) => string) {
    const n = this.net;
    if (!n?.online) return '<p class="muted">Tu joues en solo. Lance le serveur et joue en ligne pour voir les autres cartels.</p>';
    if (!n.players.length) return '<p class="muted">Personne d\'autre en ville pour l\'instant.</p>';
    return n.players.map((p: PlayerInfo) => `<div class="prof">${ava(p.cartel, '#a855f7')}<div><b>${esc(p.boss)}</b><small>Cartel ${esc(p.cartel)} · ${['Maison', 'Villa', 'Manoir', 'Château'][p.villa] ?? ''}${p.aero ? ' · aérodrome' : ''}</small>
      <div class="pstats"><span>Fortune <b>${fmt(p.cash)}</b></span><span>Gagné <b>${fmt(p.earned)}</b></span><span>Employés <b>${p.employees}</b></span><span>Morts <b>${p.kills}</b></span><span>Milice <b>${p.power.toFixed(0)}</b></span><span>Pression <b>${p.heat}</b></span><span>Folies <b>${p.lux}</b></span></div></div>
      <button class="mini" data-tab="contrats">Contrat</button></div>`).join('');
  }
  private renderPc() {
    const s = this.s, el = this.q('#pc');
    const rivals = s.districts.map((d, i) => ({ d, i })).filter(x => x.d.rival > 0);
    const gone = s.districts.filter((d, i) => DISTRICTS[i].rival > 0 && d.rival === 0).length;
    const T = ['Maison', 'Villa', 'Manoir', 'Château'][villaTier(s)];
    const ava = (n: string, c: string) => `<div class="ava" style="--c:${c}">${esc(n.replace(/[«»"]/g, '').trim()[0] ?? '?')}</div>`;
    let body = '';
    if (this.pcTab === 'profils') {
      body = `<div class="prof me">${ava(s.boss, '#facc15')}<div><b>${esc(s.boss)}</b><small>Cartel ${esc(s.cartel)} · ${T}</small>
          <div class="pstats"><span>Fortune <b>${fmt(s.cash)}</b></span><span>Gagné <b>${fmt(s.totalEarned)}</b></span><span>Employés <b>${employees(s)}</b></span><span>Morts <b>${s.kills.cops + s.kills.rivals + s.kills.ours}</b></span><span>Prestige <b>+${Math.round(prestige(s) * 100)} %</b></span></div></div></div>
        <h4>Chefs rivaux en ville <span>${gone} éliminé${gone > 1 ? 's' : ''}</span></h4>
        ${rivals.map(({ d, i }) => `<div class="prof">${ava(BOSSES[i], '#ef4444')}<div><b>${BOSSES[i]}</b><small>${GANGS[i]} · ${DISTRICTS[i].name}</small>
            <div class="pstats"><span>Force <b>${d.rival}</b></span><span>Menace <b>${d.rival >= 10 ? 'élevée' : d.rival >= 5 ? 'moyenne' : 'faible'}</b></span><span>Prime <b>${fmt(hitPrice(s, 'boss', i))}</b></span></div></div>
            <button class="mini" data-tab="contrats">Contrat</button></div>`).join('') || '<p class="muted">Plus aucun chef rival en ville. La ville est à toi.</p>'}
        <h4>Autres cartels ${this.net?.online ? `<span>${this.net.players.length} en ville</span>` : ''}</h4>${this.othersHtml(ava)}`;
    } else {
      const hb = (key: HitKey, target = -1, label?: string) => {
        const ok = canHit(s, key, target), cd = s.hitCd[key];
        const why = s.hit ? 'un contrat est en cours' : cd > 0 ? `dispo dans ${Math.ceil(cd)} s` : key === 'temoin' && s.immunity ? 'déjà couvert' : key === 'temoin' && s.heat < 40 ? 'pas de procès en vue' : `${Math.round(HITS[key].chance * 100)} % de réussite`;
        return `<button class="opbtn hit" data-hit="${key}" data-target="${target}" ${ok ? '' : 'disabled'}>${label ?? HITS[key].name} · ${fmt(hitPrice(s, key, target))}<small>${HITS[key].desc} — ${why}</small></button>`;
      };
      body = `${s.hit ? `<div class="live">Contrat en cours : ${s.hit.phase === 'go' ? 'le tueur est en route' : 'c\'est en train de se passer'}…</div>` : ''}
        <h4>Cibles</h4><div class="hits">${hb('commissaire')}${hb('journaliste')}${hb('temoin')}</div>
        <h4>Les autres cartels</h4><div class="hits">${(this.net?.online ? this.net.players : []).map(p => {
          const price = pvpPrice(s, p.cash), ok = !s.hit && s.hitCd.joueur <= 0 && s.cash >= price;
          const why = s.hit ? 'un contrat est en cours' : s.hitCd.joueur > 0 ? `dispo dans ${Math.ceil(s.hitCd.joueur)} s` : `${Math.round(pvpChance(s, p.power) * 100)} % de réussite (sa milice : ${p.power.toFixed(0)})`;
          return `<button class="opbtn hit" data-pvp="${p.id}" ${ok ? '' : 'disabled'}>Attaquer ${esc(p.cartel)} · ${fmt(price)}<small>${HITS.joueur.desc} — ${why}</small></button>`;
        }).join('') || `<p class="muted">${this.net?.online ? 'Personne d\'autre en ville pour l\'instant.' : 'Joue en ligne pour viser les autres joueurs.'}</p>`}</div>
        <h4>Les gangs rivaux</h4><div class="hits">${rivals.map(({ i }) => hb('boss', i, `Buter ${BOSSES[i]}`) + hb('planque', i, `Planque de ${GANGS[i]}`)).join('') || '<p class="muted">Aucun gang à viser.</p>'}</div>`;
    }
    const html = `<div class="pcwin"><div class="pcbar"><span>💻 PC du boss — ${esc(s.boss)}</span><button data-pcclose>✕</button></div>
      <div class="tabs"><button data-tab="profils" class="${this.pcTab === 'profils' ? 'on' : ''}">Profils</button><button data-tab="contrats" class="${this.pcTab === 'contrats' ? 'on' : ''}">Tueurs à gages</button></div>
      <div class="pcbody">${body}</div></div>`;
    if (html !== this.pcHtml) { el.innerHTML = html; this.pcHtml = html; }
  }

  private renderPanel(force: boolean) {
    const panel = this.q('#panel'), k = this.selected;
    if (!k) { if (this.lastPanel !== '') { panel.innerHTML = ''; panel.classList.remove('open'); this.lastPanel = ''; } return; }
    const s = this.s, L = s.levels[k];
    const n = L === 0 ? 1 : this.mult === 'max' ? Math.max(1, maxAffordable(s, k)) : this.mult;
    const rows = statRows(k, L, L + n, s);
    const cost = totalCost(s, k, n);
    const line = LINE_OF_STATION[k];
    let extra = '';
    if (line && (line === 'cannabis' || L > 0)) {
      extra += `<div class="products"><small>Ce qu'on fabrique — ${LINES[line].name}</small><div>` + productsOf(line).map(p => {
        const d = PRODUCTS[p], sel = s.selected[line] === p, own = s.owned[p];
        return `<button data-product="${p}" class="prod ${sel ? 'on' : ''} ${own ? '' : 'locked'}" style="--c:${d.color}" ${!own && s.cash < d.unlock ? 'disabled' : ''}>
          ${d.name}<small>${own ? unitPrice(productPrice(s, p), d.unit) : 'Débloquer · ' + fmt(d.unlock)}</small></button>`;
      }).join('') + `</div></div>`;
    }
    if (k === 'aero' && L > 0) {
      extra += `<div class="products"><small>Route d'import — un vol toutes les ${Math.round(aeroCycle(L))} s</small><div>` + ROUTE_KEYS.map(r => {
        const d = ROUTES[r], own = s.routes[r], sel = s.route === r;
        return `<button data-route="${r}" class="prod ${sel ? 'on' : ''} ${own ? '' : 'locked'}" style="--c:#38bdf8" ${!own && s.cash < d.unlock ? 'disabled' : ''}>${d.name}<small>${own ? d.cargo + ' · ' + fmt(aeroCargo(L, r)) + '/vol' : 'Contact · ' + fmt(d.unlock)}</small></button>`;
      }).join('') + `</div></div>`;
    }
    if (k === 'villa') {
      const vt = villaTier(s);
      extra += `<div class="ops"><small>Le bureau du boss</small><div><button class="opbtn pcbtn" data-pc>💻 Allumer le PC<small>Profils des chefs rivaux · tueurs à gages${s.hit ? ' · contrat en cours' : ''}</small></button></div></div>`;
      extra += `<div class="products"><small>Se faire plaisir — prestige +${Math.round(prestige(s) * 100)} % sur les prix</small><div>` + LUX_KEYS.map(lk => {
        const d = LUX[lk], own = s.lux[lk], lockedT = vt < d.tier;
        return `<button data-lux="${lk}" class="prod ${own ? 'on' : 'locked'}" style="--c:#facc15" ${own || lockedT || s.cash < d.price ? 'disabled' : ''}>${d.name}<small>${own ? 'À toi' : lockedT ? ['', 'Villa requise', 'Manoir requis', 'Château requis'][d.tier] : fmt(d.price)}</small></button>`;
      }).join('') + `</div></div>`;
    }
    if (k === 'milice' && L > 0) {
      const M = stats.milice(L);
      const opBtn = (key: OpKey, target = -1, label?: string) => {
        const cd = s.cooldowns[key], ok = canLaunch(s, key, target);
        const pct = Math.round(opChance(s, key, target) * 100);
        return `<button data-op="${key}" data-target="${target}" class="opbtn ${key}" ${ok && s.convoy.length ? '' : 'disabled'}>${label ?? OPS[key].name}
          <small>${s.op ? 'équipe déjà dehors' : cd > 0 ? `dispo dans ${Math.ceil(cd)} s` : `${pct} % de chances`}</small></button>`;
      };
      const rivals = s.districts.map((d, i) => ({ d, i })).filter(x => x.d.rival > 0);
      extra += `<div class="ops"><small>Opérations — ${power(s) >= MILICE_REPEL ? 'les Stups n\'osent plus entrer' : `les Stups reculent à partir d'une puissance de ${MILICE_REPEL}`}</small><div>
        ${opBtn('intimidate')}${opBtn('killcop')}
        ${rivals.map(x => opBtn('rival', x.i, `Descente : ${GANGS[x.i]}`)).join('') || '<span class="muted">Aucune bande rivale en ville</span>'}
      </div></div>`;
    }
    const html = `
      <button class="x" data-close>✕</button>
      <div class="ptitle"><h3>${STATIONS[k].name}</h3><span class="lvl">${L === 0 ? 'À construire' : 'Niv. ' + L}</span><p>${STATIONS[k].desc}</p></div>
      <div class="stats">${rows.map(([lab, a, b]) => `<div class="st"><small>${lab}</small><b>${a}</b>${a !== b ? `<i>→ ${b}</i>` : ''}</div>`).join('')}</div>
      <div class="buy">
        ${L === 0 ? '' : `<div class="mults">${([1, 10, 'max'] as Mult[]).map(m => `<button data-mult="${m}" class="${this.mult === m ? 'on' : ''}">${m === 'max' ? 'MAX' : 'x' + m}</button>`).join('')}</div>`}
        ${needsLand(s, k) ? `<button class="go" disabled>TERRAIN REQUIS<small>Achète le ${LANDS[needsLand(s, k)!].name.toLowerCase()} (${fmt(LANDS[needsLand(s, k)!].price)})</small></button>` : `<button class="go" data-buy ${s.cash >= cost ? '' : 'disabled'}>${L === 0 ? 'CONSTRUIRE' : 'AMÉLIORER +' + n}<small>${fmt(cost)}</small></button>`}
      </div>${extra}`;
    if (force || html !== this.lastPanel) { panel.innerHTML = html; panel.classList.add('open'); this.lastPanel = html; }
  }
}

function statRows(k: StationKey, a: number, b: number, s: GameState): [string, string | number, string | number][] {
  if (k === 'field') { const x = stats.field(a), y = stats.field(b);
    return [['Jardiniers', x.workers, y.workers], ['Récolte', x.harvestTime.toFixed(2) + 's', y.harvestTime.toFixed(2) + 's'], ['Porte', x.carry, y.carry], ['Pousse', x.growTime.toFixed(1) + 's', y.growTime.toFixed(1) + 's']]; }
  if (k === 'dryer') { const x = stats.dryer(a), y = stats.dryer(b);
    return [['Lot', x.batch, y.batch], ['Durée', x.time.toFixed(2) + 's', y.time.toFixed(2) + 's']]; }
  if (k === 'packer') { const x = stats.packer(a), y = stats.packer(b);
    return [['Ouvriers', x.workers, y.workers], ['Porte', x.carry, y.carry], ['Emballage', x.packTime.toFixed(2) + 's', y.packTime.toFixed(2) + 's'], ['Bonus prix', 'x' + x.priceMult.toFixed(1), 'x' + y.priceMult.toFixed(1)]]; }
  if (k === 'labo' || k === 'pharma') { const x = stats.lab(a), y = stats.lab(b);
    return [['Chimistes', x.workers, y.workers], ['Lot', a ? x.batch : 0, y.batch], ['Durée', x.time.toFixed(2) + 's', y.time.toFixed(2) + 's'], ['Bonus prix', 'x' + x.priceMult.toFixed(1), 'x' + y.priceMult.toFixed(1)]]; }
  if (k === 'office') { const x = stats.office(a), y = stats.office(b);
    return [['Pression −/s', x.decay.toFixed(2), y.decay.toFixed(2)], ['Remise arrangements', Math.round(x.discount * 100) + '%', Math.round(y.discount * 100) + '%']]; }
  if (k === 'milice') { const x = stats.milice(a), y = stats.milice(b);
    return [['Soldats', x.soldiers, y.soldiers], ['Véhicules armés', miliceVehicles(a), miliceVehicles(b)], ['Puissance', x.power.toFixed(1), y.power.toFixed(1)], ['Solde', fmt(x.upkeep * 60) + '/min', fmt(y.upkeep * 60) + '/min']]; }
  if (k === 'villa') { const x = stats.villa(a), y = stats.villa(b), T = ['Maison', 'Villa', 'Manoir', 'Château'], ti = (L: number) => (L >= 40 ? 3 : L >= 20 ? 2 : L >= 8 ? 1 : 0);
    return [['Demeure', T[ti(a)], T[ti(b)]], ['Gardes du corps', x.guards, y.guards], ['Cash planqué', Math.round(x.hide * 100) + '%', Math.round(y.hide * 100) + '%'], ['Remise contrats', Math.round(x.hitDiscount * 100) + '%', Math.round(y.hitDiscount * 100) + '%']]; }
  if (k === 'aero') { const r = s.route;
    return [['Ouvriers', stats.biz('aero', a).workers, stats.biz('aero', b).workers], ['Par vol', fmt(a ? aeroCargo(a, r) : 0), fmt(aeroCargo(b, r))], ['Rotation', Math.round(aeroCycle(Math.max(1, a))) + ' s', Math.round(aeroCycle(b)) + ' s'], ['Origine', ROUTES[r].name, ROUTES[r].name]]; }
  if (k in BIZ) { const bk = k as BizKey, x = stats.biz(bk, a), y = stats.biz(bk, b);
    const rows: [string, string | number, string | number][] = [['Ouvriers', x.workers, y.workers], ['Revenu', fmt(x.income * 60) + '/min', fmt(y.income * 60) + '/min'],
      ['Pression +/min', (x.heat * 60).toFixed(1), (y.heat * 60).toFixed(1)]];
    if (bk === 'armes') rows.push(['Puissance milice', '+' + x.power.toFixed(1), '+' + y.power.toFixed(1)]);
    return rows; }
  const x = stats.garage(a), y = stats.garage(b);
  void s;
  return [['Charbonneurs', x.vans, y.vans], ['Capacité', x.capacity, y.capacity], ['Vitesse', x.speed.toFixed(1), y.speed.toFixed(1)]];
}
