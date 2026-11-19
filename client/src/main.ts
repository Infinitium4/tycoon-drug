import './style.css';
import { createGame, step, syncUnits, applyExt, sufferAttack, setRaidResult } from './sim/sim';
import { Net, defaultServer, servedByServer } from './net';
import { Control } from './control';
import { exportSave, importSave, soloSave, soloLoad, soloClear } from './sim/save';
import { loadAssets } from './render/assets';
import { World } from './render/scene';
import { Hud } from './ui/hud';

const app = document.getElementById('app')!;
const loading = document.createElement('div');
loading.className = 'loading';
loading.innerHTML = `<div class="logo">TYCOON <span>DRUG</span></div><div class="lbar"><i></i></div>`;
document.body.appendChild(loading);

await loadAssets(p => { (loading.querySelector('.lbar i') as HTMLElement).style.width = Math.round(p * 100) + '%'; });
loading.remove();

// --- écran de départ : solo (sauvegarde dans le navigateur) ou en ligne (compte + sauvegarde sur le serveur) ---
const net = new Net();
const fmtM = (v: number) => (v >= 1e6 ? (v / 1e6).toFixed(1).replace('.', ',') + ' M€' : Math.round(v).toLocaleString('fr-FR') + ' €');
const state = await new Promise<ReturnType<typeof createGame>>(resolve => {
  const solo = soloLoad();
  const ov = document.createElement('div'); ov.className = 'start';
  ov.innerHTML = `<div class="start-card"><div class="logo">TYCOON <span>DRUG</span></div>
    <p>Une plantation, un séchoir, un charbonneur. Le reste, c'est toi qui le construis.</p>
    <label>Mode de jeu</label>
    <div class="mode"><button data-m="solo">Solo</button><button data-m="online">En ligne</button></div>
    <div class="acc online-only"><label>Pseudo (ton compte)</label><input id="uname" maxlength="20" placeholder="ex : nils" autocomplete="username">
      <label>Mot de passe</label><input id="upass" type="password" maxlength="100" autocomplete="current-password">
      <div class="hint">Pas encore de compte ? Il est créé tout seul à la première connexion.</div></div>
    <div class="cont solo-only">${solo ? `<div class="saved">Partie en cours : <b>Cartel ${String(solo.cartel ?? '').replace(/[<>&"]/g, '')}</b> · ${fmtM(Number(solo.cash) || 0)}</div>` : ''}</div>
    <div class="newg"><label>Nom de ton cartel <span class="opt">(nouvelle partie)</span></label>
      <input id="cname" maxlength="24" placeholder="ex : Los Nantes" autocomplete="off">
      <label>Ton blaze <span class="opt">(nouvelle partie)</span></label>
      <input id="bname" maxlength="20" placeholder="ex : Le Parrain" autocomplete="off"></div>
    <label class="chk"><input type="checkbox" id="fresh"> Recommencer à zéro (efface la partie sauvegardée)</label>
    <div class="srv online-only"><label>Adresse du serveur</label><input id="srv" autocomplete="off"></div>
    <div class="err" id="serr"></div>
    <button class="go" id="cgo">Jouer</button>
    <small>Ta progression est sauvegardée. Mais si tu te fais arrêter (pression à 100), ta partie est perdue pour de bon.</small></div>`;
  document.body.appendChild(ov);
  const $ = (id: string) => ov.querySelector('#' + id) as HTMLInputElement;
  $('srv').value = defaultServer();
  try { $('uname').value = localStorage.getItem('td-user') || ''; } catch { /* */ }
  let mode = servedByServer() ? 'online' : 'solo';
  const setMode = (m: string) => {
    mode = m;
    ov.querySelectorAll<HTMLButtonElement>('.mode button').forEach(b => b.classList.toggle('on', b.dataset.m === m));
    ov.querySelectorAll<HTMLElement>('.online-only').forEach(e => (e.style.display = m === 'online' ? '' : 'none'));
    ov.querySelectorAll<HTMLElement>('.solo-only').forEach(e => (e.style.display = m === 'solo' ? '' : 'none'));
    (ov.querySelector('.chk') as HTMLElement).style.display = m === 'online' || solo ? '' : 'none';
    $('cgo').textContent = m === 'solo' && solo ? 'Continuer la partie' : 'Jouer';
    (m === 'online' ? $('uname') : $('cname')).focus();
  };
  ov.querySelectorAll<HTMLButtonElement>('.mode button').forEach(b => b.addEventListener('click', () => setMode(b.dataset.m!)));
  $('fresh').addEventListener('change', () => { if (mode === 'solo' && solo) $('cgo').textContent = $('fresh').checked ? 'Nouvelle partie' : 'Continuer la partie'; });
  setMode(mode);
  const err = (t: string) => { ($('serr') as unknown as HTMLElement).textContent = t; };
  let busy = false;
  const go = async () => {
    if (busy) return;
    const cartel = $('cname').value.trim() || 'Sans Nom', boss = $('bname').value.trim() || 'Le Boss', fresh = $('fresh').checked;
    if (mode === 'solo') {
      let s;
      if (solo && !fresh) s = importSave(solo);
      else { soloClear(); s = createGame(); s.cartel = cartel; s.boss = boss; }
      ov.remove(); resolve(s); return;
    }
    busy = true; err(''); $('cgo').textContent = 'Connexion…';
    const r = await net.connect($('srv').value.trim(), { user: $('uname').value.trim(), pass: $('upass').value, cartel, boss, fresh });
    busy = false; $('cgo').textContent = 'Jouer';
    if (r === 'auth') { err(net.error); return; }
    if (r === 'full') { err('La ville est pleine. Réessaie plus tard ou joue en solo.'); return; }
    if (r === 'fail') { err('Serveur injoignable. Vérifie l\'adresse, ou joue en solo.'); return; }
    try { localStorage.setItem('td-user', net.welcome!.user); } catch { /* */ }
    const w = net.welcome!;
    const s = w.save ? importSave(w.save) : createGame();
    s.cartel = w.cartel; s.boss = w.boss;
    ov.remove(); resolve(s);
  };
  $('cgo').addEventListener('click', go);
  ov.querySelectorAll('input').forEach(el => el.addEventListener('keydown', e => { if ((e as KeyboardEvent).key === 'Enter') go(); e.stopPropagation(); }));
});

const world = new World(app);
const hud = new Hud(app, state, world);
const DEBUG = import.meta.env.DEV || location.search.includes('debug');

// --- contrôle des quartiers : recalculé chaque seconde ---
const control = new Control();
hud.control = control;
setInterval(() => { control.update(state, net); world.setControlTint(control.data.map(d => d.leader?.color ?? null)); }, 1000);

// --- sauvegarde automatique : toutes les 30 s, en quittant, et quand le serveur redémarre ---
const saveNow = () => { if (state.over) return; if (net.online) net.save(exportSave(state)); else soloSave(state); };
setInterval(saveNow, 30_000);
window.addEventListener('beforeunload', saveNow);
document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });

// --- multijoueur ---
if (net.online) {
  hud.net = net;
  const w = net.welcome!;
  hud.sms('Serveur', w.save ? `Content de te revoir, ${w.boss}. Ta partie est rechargée.` : w.isNew ? `Compte « ${w.user} » créé. Ta progression sera sauvegardée.` : 'Nouvelle partie. Bonne chance.', 'good');
  if (net.players.length) hud.sms('Serveur', `Tu es en ville avec ${net.players.length} autre${net.players.length > 1 ? 's' : ''} cartel${net.players.length > 1 ? 's' : ''}.`, 'good');
  net.onWorld = ext => { applyExt(state, ext); world.setOthers(net); };
  net.onNews = text => hud.ticker(text);
  net.onAttacked = m => { const raid = m.kind === 'raid', loss = sufferAttack(state, m.win, raid); net.loot(m.by, loss); world.baseAttacked(m.win, raid); hud.onAttacked(m.cartel, m.boss, m.win, loss, raid); };
  net.onRaidResult = m => setRaidResult(state, m.win);
  net.onCityOp = m => {
    // une opération armée d'un autre joueur en ville : ça nous retombe dessus
    if (m.kind === 'carnage') {
      const d = state.districts[m.district]; if (!d) return;
      if (m.win) { d.hostile = 150; d.sat = Math.min(1, d.sat + 0.4); if (d.unlocked && d.active) state.heat = Math.min(99, state.heat + 4); }
      world.remoteCarnage(m.district);
      hud.cityOp(m.cartel, m.kind, m.district, m.win, d.unlocked && d.active);
    } else if (m.kind === 'killcop') {
      if (m.win) state.heat = Math.min(99, state.heat + 6);
      hud.cityOp(m.cartel, m.kind, -1, m.win, true);
    } else if (m.kind === 'rival' && m.win) hud.cityOp(m.cartel, m.kind, m.district, m.win, false);
  };
  net.onLoot = m => { if (m.amount > 0) { state.cash += m.amount; state.totalEarned += m.amount; hud.sms('Le Tueur', `Butin récupéré chez ${m.cartel} : ${Math.round(m.amount).toLocaleString('fr-FR')} €.`, 'good'); } };
  net.onHitResult = m => { const pl = net.player(m.target); hud.sms('Le Tueur', m.win ? `On a retourné la base de ${pl?.cartel ?? 'l\'autre'}. Le butin arrive.` : `Leurs gars nous attendaient. On s'est replié.`, m.win ? 'good' : 'bad'); };
  net.onAllyReq = m => hud.allyRequest(m.from, m.cartel, m.boss);
  net.onGift = m => { state.cash += m.amount; hud.sms('Coursier', `${m.cartel} t'envoie ${Math.round(m.amount).toLocaleString('fr-FR')} € en liquide.`, 'good'); hud.ticker(`Le cartel ${m.cartel} fait un geste envers ${state.cartel}`); };
  net.onGave = m => { state.cash = Math.max(0, state.cash - m.amount); hud.sms('Coursier', `Valise livrée à ${m.cartel} : ${Math.round(m.amount).toLocaleString('fr-FR')} €.`, 'good'); };
  net.onBanned = msg => { state.over = true; hud.sms('Serveur', msg || 'Ce compte est banni.', 'bad'); setTimeout(() => location.reload(), 4000); };
  net.onSaveNow = saveNow;
  net.onKicked = () => hud.sms('Serveur', 'Ton compte vient de se connecter ailleurs. Cette fenêtre est déconnectée.', 'bad');
  net.onLost = () => { world.setOthers(net); soloSave(state); hud.sms('Serveur', 'Connexion perdue. Ta partie continue en local (sauvegardée dans ce navigateur).', 'bad'); };
  setInterval(() => { if (net.online && !state.over) net.sendState(state); }, 1000);
  window.addEventListener('beforeunload', () => net.bye());
}
// les outils de debug (?debug) sont coupés en ligne : pas de console pour se donner des millions
if (DEBUG && !net.online) { Object.assign(window as any, { game: state, world, hud, step, syncUnits, net }); }

// --- caméra : glisser = déplacer, molette = zoom, clic court = sélectionner ---
const canvas = world.renderer.domElement;
let down: { x: number; y: number; moved: number } | null = null;
canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, moved: 0 }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', e => {
  if (!down) return;
  const dx = e.clientX - down.x, dy = e.clientY - down.y;
  down.moved += Math.abs(dx) + Math.abs(dy);
  if (down.moved > 6) { world.pan(dx, dy, e.clientX, e.clientY); canvas.style.cursor = 'grabbing'; }
  down.x = e.clientX; down.y = e.clientY;
});
canvas.addEventListener('pointerup', e => {
  if (down && down.moved <= 6) { const k = world.pick(e.clientX, e.clientY); if (k) hud.select(k); }
  down = null; canvas.style.cursor = '';
});
canvas.addEventListener('wheel', e => { e.preventDefault(); world.zoom(e.deltaY, e.clientX, e.clientY); }, { passive: false });
// clavier : ZQSD / WASD (touches physiques) ou flèches pour se déplacer, A/E pour tourner, R pour recentrer sur la base
const keys = new Set<string>();
window.addEventListener('keydown', e => {
  if ((e.target as HTMLElement).tagName === 'INPUT') return;
  keys.add(e.code);
  if (e.code === 'KeyQ') world.rotate(-1);
  if (e.code === 'KeyE') world.rotate(1);
  if (e.code === 'KeyR') world.resetView();
});
window.addEventListener('keyup', e => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());
function stepKeys(dt: number) {
  const r = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  const u = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
  if (r || u) world.nudge(r, u, dt);
}

world.onQuality = () => hud.sms('Réglages', 'Ton PC chauffe : j\'ai baissé un peu les effets pour garder le jeu fluide.', 'good');

// --- triche de test : touche P = +10k ---
window.addEventListener('keydown', e => {
  if (e.key === 'F9') { e.preventDefault(); hud.toggleAdmin(); return; }
  if (e.key.toLowerCase() === 'p' && !state.over && (!net.online || net.admin)) { state.cash += 10000; hud.tick(); }
  if (e.key.toLowerCase() === 'g') { const on = world.post.toggle(); hud.sms('Réglages', on ? 'Graphismes réalistes activés.' : 'Graphismes simples (plus fluide).', 'good'); }
});

// --- boucle ---
let last = performance.now(), uiT = 0;
function loop(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  for (const ev of step(state, dt)) { hud.onEvent(ev);
    if (ev.type === 'opResult' && (ev.key === 'carnage' || ev.key === 'killcop' || ev.key === 'rival') && net.online) net.cityOp(ev.key, ev.target, ev.win);
    if (ev.type === 'raidArrived') { if (net.online && net.player(ev.target)) net.raid(ev.target); else setRaidResult(state, false); } if (ev.type === 'arrested') { soloClear(); if (net.online) { net.dead(); net.news(`Le boss du cartel ${state.cartel} est tombé. Sa base est rasée.`); net.bye(); } } }
  stepKeys(dt);
  world.sync(state, now / 1000);
  world.animate(dt, now / 1000, state.time);
  world.render();
  hud.frame();
  uiT += dt; if (uiT > 0.2) { uiT = 0; hud.tick(); }
  requestAnimationFrame(loop);
}
hud.tick();
requestAnimationFrame(loop);
