// Interface HTML par-dessus la 3D.
import * as THREE from 'three';
import {
  CITY, CREW, DISTRICTS, GANGS, HEAT, PRESSURE, pressureLevel, LAB_KEYS, LINES, LabKey, LineKey, MILICE_REPEL, OPS, OpKey, PRODUCTS, PRODUCT_KEYS, ProductKey,
  STATIONS, STATION_KEYS, StationKey, TIERS, productsOf, stats,
} from '../sim/config';
import {
  GameState, SimEvent, bribe, bribeCost, canLaunch, districtAction, districtFactor, launchOp, maxAffordable, opChance,
  productPrice, selectProduct, totalCost, upgrade,
} from '../sim/sim';
import { World } from '../render/scene';

/** Montants en euros, à la française : 950 €, 12,4 k€, 3,2 M€. */
export const fmt = (n: number) => {
  n = Math.floor(n);
  if (n < 10000) return n.toLocaleString('fr-FR') + ' €';
  const u = ['k€', 'M€', 'Md€', 'T€']; let i = -1;
  while (n >= 1000 && i < u.length - 1) { n /= 1000; i++; }
  return n.toLocaleString('fr-FR', { maximumFractionDigits: n < 10 ? 2 : n < 100 ? 1 : 0 }) + ' ' + u[i];
};
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
  private pileLabels: Record<string, HTMLElement> = {};
  private copBtn!: HTMLButtonElement;
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
        <div class="heat"><small>Pression policière</small><div class="lvls" id="lvls">${'<i></i>'.repeat(5)}</div><b id="heatTxt">Calme</b></div>
      </div>
      <div class="stockbar" id="stock"></div>
      <div class="nav"><button data-go="base">La base</button><button data-go="city">La ville</button></div>
      <div class="labels" id="labels"></div>
      <div class="floats" id="floats"></div>
      <div class="phone" id="toasts"></div>
      <div class="panel" id="panel"></div>
      <div class="overlay" id="overlay"></div>
      <div class="help">Glisser : déplacer · Molette : zoom · Clic sur un bâtiment : améliorer · Clic sur un quartier : l'ouvrir ou le couper · P : +10 000 € (test)</div>`;
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
    for (const key of Object.keys(world.pilePos)) { const e = document.createElement('div'); e.className = 'pcount'; labels.appendChild(e); this.pileLabels[key] = e; }
    this.copBtn = document.createElement('button'); this.copBtn.className = 'cop'; labels.appendChild(this.copBtn);
    this.copBtn.onclick = () => { const c = bribe(this.s); if (c) this.sms('Avocat', `C'est arrangé. Ils repartent, ça t'a coûté ${fmt(c)}.`, 'good'); };

    this.q('.nav').addEventListener('click', e => {
      const b = (e.target as HTMLElement).closest('[data-go]') as HTMLElement | null; if (!b) return;
      if (b.dataset.go === 'base') world.goTo(2, -6, 0.8); else world.goTo(CITY.x0 + 36, -3.5, 0.38);
    });
    this.q('#panel').addEventListener('click', e => this.onPanelClick(e.target as HTMLElement));
  }

  private onPanelClick(t: HTMLElement) {
    const s = this.s, k = this.selected;
    const m = t.closest('[data-mult]') as HTMLElement | null;
    if (m) { this.mult = m.dataset.mult === 'max' ? 'max' : (Number(m.dataset.mult) as Mult); this.renderPanel(true); return; }
    if (t.closest('[data-close]')) { this.select(null); return; }
    if (t.closest('[data-buy]') && k) {
      const n = s.levels[k] === 0 ? 1 : this.mult === 'max' ? maxAffordable(s, k) : this.mult;
      if (upgrade(s, k, n)) { this.bounce(k); if (n && s.levels[k] === 1 && STATIONS[k].unlock) this.sms(crew(), `${STATIONS[k].name} : c'est monté, on est opérationnels.`, 'good'); }
    }
    const pr = t.closest('[data-product]') as HTMLElement | null;
    if (pr) {
      const p = pr.dataset.product as ProductKey, r = selectProduct(s, p);
      if (r === 'bought') this.sms('Fournisseur', `J'ai ce qu'il te faut pour la ${PRODUCTS[p].name.toLowerCase()}. Tu peux lancer.`, 'good');
      if (r === 'nope') this.sms('Toi', `Pas assez de liquide pour ${PRODUCTS[p].name}.`, 'bad');
    }
    const op = t.closest('[data-op]') as HTMLElement | null;
    if (op && !(op as HTMLButtonElement).disabled) {
      const key = op.dataset.op as OpKey, target = Number(op.dataset.target ?? -1);
      if (launchOp(s, key, target)) this.sms('Chef d\'équipe', key === 'rival' ? `On y va. ${GANGS[target]}, ${DISTRICTS[target].name}.` : key === 'killcop' ? 'On s\'occupe du flic. Pas de témoins.' : 'On va leur faire comprendre.', 'good');
    }
    this.renderPanel(true);
  }

  select(k: StationKey | null) { this.selected = k; this.renderPanel(true); }

  onEvent(ev: SimEvent) {
    switch (ev.type) {
      case 'sale': {
        this.earned.push({ t: performance.now(), v: ev.amount });
        const p = this.world.project(new THREE.Vector3(ev.x, 2, ev.z));
        const el = document.createElement('div'); el.className = 'float'; el.textContent = '+' + fmt(ev.amount);
        el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
        this.q('#floats').appendChild(el); setTimeout(() => el.remove(), 1400);
        break;
      }
      case 'controlled': this.sms(crew(), `Contrôle de la BAC ${a(DISTRICTS[ev.district].name)}. Ils ont tout pris (${ev.lost} unités), je me suis tiré.`, 'bad'); break;
      case 'robbed': this.sms(crew(), `On s'est fait braquer ${a(DISTRICTS[ev.district].name)}. C'est ${GANGS[ev.district]}.`, 'bad'); break;
      case 'raid': this.sms('Guetteur', 'Ça arrive ! Deux voitures des Stups sur la route, ils viennent à la base.', 'bad'); break;
      case 'repelled': this.sms('Chef d\'équipe', 'Les Stups ont vu les gars au portail. Ils ont fait demi-tour.', 'good'); break;
      case 'seized': this.sms('Avocat', `Perquisition. Ils ont saisi ${fmt(ev.cash)} et la moitié du stock.`, 'bad'); break;
      case 'desert': this.sms('Chef d\'équipe', 'Les gars sont pas payés. Y en a qui se barrent.', 'bad'); break;
      case 'rivalBack': this.sms(crew(), `${GANGS[ev.district]} s'est réinstallé ${a(DISTRICTS[ev.district].name)}.`, 'bad'); break;
      case 'opResult': {
        const o = OPS[ev.key];
        if (ev.win) this.sms('Chef d\'équipe', ev.key === 'rival' ? `C'est fait. ${DISTRICTS[ev.target].name} est à nous.` : ev.key === 'killcop' ? 'C\'est réglé. Les keufs vont se calmer un moment.' : 'Message passé. Ils vont lever le pied.', 'good');
        else this.sms('Chef d\'équipe', `Ça a mal tourné (${o.name.toLowerCase()}). On a perdu des gars, et ça va chauffer.`, 'bad');
        break;
      }
      case 'arrested': this.gameOver(); break;
    }
  }

  /** Notification façon SMS d'un membre de l'équipe. */
  private sms(from: string, msg: string, cls: 'good' | 'bad' = 'good') {
    const box = this.q('#toasts');
    const t = this.s.time, day = 1 + Math.floor(t / 240), hh = Math.floor(((t % 240) / 240) * 24), mm = Math.floor((((t % 240) / 240) * 1440) % 60);
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
      <div class="go-stats"><div><small>Temps</small><b>${m}min ${sec}s</b></div><div><small>Gagné au total</small><b>${fmt(s.totalEarned)}</b></div></div>
      <button class="go" id="restart">RECOMMENCER À ZÉRO</button></div>`;
    ov.classList.add('show');
    ov.querySelector('#restart')!.addEventListener('click', () => location.reload());
  }
  private bounce(k: StationKey) { const el = this.labels.get(k)!; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }

  /** Chaque frame : positionne les étiquettes. */
  frame() {
    const place = (el: HTMLElement, v: THREE.Vector3) => { const p = this.world.project(v); el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`; };
    for (const st of this.world.stations) place(this.labels.get(st.key)!, st.pos);
    this.dLabels.forEach((el, i) => place(el, this.world.districtAnchors[i]));
    for (const k in this.pileLabels) { const v = this.world.pilePos[k].clone(); v.y = 1.8; place(this.pileLabels[k], v); }
    const pol = this.s.police;
    if (pol && pol.phase === 'waiting') { this.copBtn.style.display = ''; place(this.copBtn, new THREE.Vector3(pol.x, 3.4, pol.z)); }
    else this.copBtn.style.display = 'none';
  }

  /** ~5x/s : textes. */
  tick() {
    const s = this.s;
    this.q('#cash').textContent = fmt(s.cash);
    const now = performance.now();
    this.earned = this.earned.filter(e => now - e.t < 60000);
    const span = Math.max(15, Math.min(60, (now - (this.earned[0]?.t ?? now)) / 1000));
    this.q('#rate').textContent = fmt((this.earned.reduce((a, e) => a + e.v, 0) * 60) / span) + ' /min';
    const lv = pressureLevel(s.heat);
    this.q('#lvls').querySelectorAll('i').forEach((el, i) => { el.className = s.heat >= (i + 1) * 20 ? 'on' : s.heat > i * 20 ? 'half' : ''; });
    const ht = this.q('#heatTxt'); ht.textContent = PRESSURE[lv];
    ht.className = s.heat > 80 ? 'hot' : s.heat > HEAT.raidFrom ? 'warm' : '';

    for (const k of STATION_KEYS) {
      const el = this.labels.get(k)!;
      const can = s.cash >= totalCost(s, k, 1);
      const html = s.levels[k] === 0
        ? `${STATIONS[k].name} <b>${fmt(totalCost(s, k, 1))}</b>${can ? '<i>▲</i>' : ''}`
        : `${STATIONS[k].name} <b>niv.${s.levels[k]}</b>${can ? '<i>▲</i>' : ''}`;
      if (el.innerHTML !== html) el.innerHTML = html;
      el.classList.toggle('sel', this.selected === k);
      el.classList.toggle('can', can);
    }
    DISTRICTS.forEach((d, i) => {
      const st = s.districts[i], el = this.dLabels[i];
      const rival = st.rival > 0 ? `<div class="rival">Tenu par ${GANGS[i]} (${st.rival})</div>` : '';
      const pol = d.police < 0.5 ? 'faible' : d.police < 1.5 ? 'moyenne' : d.police < 3 ? 'forte' : 'très forte';
      const status = !st.unlocked
        ? `<div class="lock ${s.cash >= d.unlock ? 'ok' : ''}">Ouvrir un point : ${fmt(d.unlock)}</div>`
        : `<div class="dstat">${st.active ? 'Point actif' : 'Point fermé'} · prix ×${districtFactor(s, i).toFixed(1).replace('.', ',')}</div><div class="dbar"><i style="width:${(1 - st.sat) * 100}%"></i></div>`;
      const html = `<div class="dname">${d.name}</div><div class="dtier">${TIERS[d.tier]} · police ${pol}</div>${rival}${status}`;
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
    if (k === 'milice' && L > 0) {
      const M = stats.milice(L);
      const opBtn = (key: OpKey, target = -1, label?: string) => {
        const cd = s.cooldowns[key], ok = canLaunch(s, key, target);
        const pct = Math.round(opChance(s, key, target) * 100);
        return `<button data-op="${key}" data-target="${target}" class="opbtn ${key}" ${ok ? '' : 'disabled'}>${label ?? OPS[key].name}
          <small>${s.op ? 'équipe déjà dehors' : cd > 0 ? `dispo dans ${Math.ceil(cd)} s` : `${pct} % de chances`}</small></button>`;
      };
      const rivals = s.districts.map((d, i) => ({ d, i })).filter(x => x.d.rival > 0);
      extra += `<div class="ops"><small>Opérations — ${M.power >= MILICE_REPEL ? 'les Stups n\'osent plus entrer' : `les Stups reculent à partir d'une puissance de ${MILICE_REPEL}`}</small><div>
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
        <button class="go" data-buy ${s.cash >= cost ? '' : 'disabled'}>${L === 0 ? 'CONSTRUIRE' : 'AMÉLIORER +' + n}<small>${fmt(cost)}</small></button>
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
    return [['Soldats', x.soldiers, y.soldiers], ['Puissance', x.power.toFixed(1), y.power.toFixed(1)], ['Solde', fmt(x.upkeep * 60) + '/min', fmt(y.upkeep * 60) + '/min']]; }
  const x = stats.garage(a), y = stats.garage(b);
  void s;
  return [['Charbonneurs', x.vans, y.vans], ['Capacité', x.capacity, y.capacity], ['Vitesse', x.speed.toFixed(1), y.speed.toFixed(1)]];
}
