import './style.css';
import { createGame, step, syncUnits, applyExt, sufferAttack } from './sim/sim';
import { Net, defaultServer, servedByServer } from './net';
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

// --- écran de départ : nom du cartel et du boss ---
const { cartel, boss, online, server } = await new Promise<{ cartel: string; boss: string; online: boolean; server: string }>(resolve => {
  const ov = document.createElement('div'); ov.className = 'start';
  ov.innerHTML = `<div class="start-card"><div class="logo">TYCOON <span>DRUG</span></div>
    <p>Une plantation, un séchoir, un charbonneur. Le reste, c'est toi qui le construis.</p>
    <label>Nom de ton cartel</label>
    <input id="cname" maxlength="24" placeholder="ex : Los Nantes" autocomplete="off">
    <label>Ton blaze (le boss, c'est toi)</label>
    <input id="bname" maxlength="20" placeholder="ex : Le Parrain" autocomplete="off">
    <label>Mode de jeu</label>
    <div class="mode"><button data-m="solo">Solo</button><button data-m="online">En ligne (6 max)</button></div>
    <div class="srv"><label>Adresse du serveur</label><input id="srv" autocomplete="off"><div class="hint">Lance <b>lancer-serveur.bat</b> sur le PC qui héberge. Tes potes ouvrent l'adresse affichée dans la fenêtre du serveur.</div></div>
    <button class="go" id="cgo">Monter le business</button>
    <small>Pas de sauvegarde : si tu quittes ou si tu tombes, ta base disparaît et tu repars de zéro.</small></div>`;
  document.body.appendChild(ov);
  const input = ov.querySelector('#cname') as HTMLInputElement; input.focus();
  const binput = ov.querySelector('#bname') as HTMLInputElement;
  const srv = ov.querySelector('#srv') as HTMLInputElement; srv.value = defaultServer();
  let mode = servedByServer() ? 'online' : 'solo';
  const setMode = (m: string) => { mode = m; ov.querySelectorAll<HTMLButtonElement>('.mode button').forEach(b => b.classList.toggle('on', b.dataset.m === m)); ov.querySelector('.srv')!.classList.toggle('show', m === 'online'); };
  ov.querySelectorAll<HTMLButtonElement>('.mode button').forEach(b => b.addEventListener('click', () => setMode(b.dataset.m!)));
  setMode(mode);
  const go = () => { ov.remove(); resolve({ cartel: input.value.trim() || 'Sans Nom', boss: binput.value.trim() || 'Le Boss', online: mode === 'online', server: srv.value.trim() }); };
  ov.querySelector('#cgo')!.addEventListener('click', go);
  for (const el of [input, binput, srv]) el.addEventListener('keydown', e => { if (e.key === 'Enter') go(); e.stopPropagation(); });
});

const state = createGame();              // pas de sauvegarde : tu quittes, tu perds tout
state.cartel = cartel; state.boss = boss;
const world = new World(app);
const hud = new Hud(app, state, world);
const DEBUG = import.meta.env.DEV || location.search.includes('debug');

// --- multijoueur ---
const net = new Net();
if (online) {
  hud.net = net;
  const r = await net.connect(server, cartel, boss);
  if (r === 'ok') hud.sms('Serveur', `Connecté. Tu es en ville avec ${net.players.length} autre${net.players.length > 1 ? 's' : ''} cartel${net.players.length > 1 ? 's' : ''}.`, 'good');
  else hud.sms('Serveur', r === 'full' ? 'La ville est pleine (6 joueurs). Tu joues en solo.' : 'Serveur injoignable. Tu joues en solo.', 'bad');
  net.onWorld = ext => { applyExt(state, ext); world.setOthers(net); };
  net.onNews = text => hud.ticker(text);
  net.onAttacked = m => { const loss = sufferAttack(state, m.win); net.loot(m.by, loss); world.baseAttacked(m.win); hud.onAttacked(m.cartel, m.boss, m.win, loss); };
  net.onLoot = m => { if (m.amount > 0) { state.cash += m.amount; state.totalEarned += m.amount; hud.sms('Le Tueur', `Butin récupéré chez ${m.cartel} : ${Math.round(m.amount).toLocaleString('fr-FR')} €.`, 'good'); } };
  net.onLost = () => { world.setOthers(net); hud.sms('Serveur', 'Connexion perdue. Tu continues en solo.', 'bad'); };
  setInterval(() => { if (net.online && !state.over) net.sendState(state); }, 1000);
  window.addEventListener('beforeunload', () => net.bye());
}
if (DEBUG) { Object.assign(window as any, { game: state, world, hud, step, syncUnits, net }); }

// --- caméra : glisser = déplacer, molette = zoom, clic court = sélectionner ---
const canvas = world.renderer.domElement;
let down: { x: number; y: number; moved: number } | null = null;
canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, moved: 0 }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', e => {
  if (!down) return;
  const dx = e.clientX - down.x, dy = e.clientY - down.y;
  down.moved += Math.abs(dx) + Math.abs(dy);
  if (down.moved > 6) { world.pan(dx, dy); canvas.style.cursor = 'grabbing'; }
  down.x = e.clientX; down.y = e.clientY;
});
canvas.addEventListener('pointerup', e => {
  if (down && down.moved <= 6) { const k = world.pick(e.clientX, e.clientY); if (k) hud.select(k); }
  down = null; canvas.style.cursor = '';
});
canvas.addEventListener('wheel', e => { e.preventDefault(); world.zoom(e.deltaY); }, { passive: false });

world.onQuality = () => hud.sms('Réglages', 'Ton PC chauffe : j\'ai baissé un peu les effets pour garder le jeu fluide.', 'good');

// --- triche de test : touche P = +10k ---
window.addEventListener('keydown', e => {
  if (e.key.toLowerCase() === 'p' && !state.over && !net.online) { state.cash += 10000; hud.tick(); }
  if (e.key.toLowerCase() === 'g') { const on = world.post.toggle(); hud.sms('Réglages', on ? 'Graphismes réalistes activés.' : 'Graphismes simples (plus fluide).', 'good'); }
});

// --- boucle ---
let last = performance.now(), uiT = 0;
function loop(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  for (const ev of step(state, dt)) { hud.onEvent(ev); if (ev.type === 'arrested' && net.online) { net.news(`Le boss du cartel ${state.cartel} est tombé. Sa base est rasée.`); net.bye(); } }
  world.sync(state, now / 1000);
  world.animate(dt, now / 1000, state.time);
  world.render();
  hud.frame();
  uiT += dt; if (uiT > 0.2) { uiT = 0; hud.tick(); }
  requestAnimationFrame(loop);
}
hud.tick();
requestAnimationFrame(loop);
