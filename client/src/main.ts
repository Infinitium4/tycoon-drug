import './style.css';
import { createGame, step } from './sim/sim';
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

const state = createGame();              // pas de sauvegarde : tu quittes, tu perds tout
const world = new World(app);
const hud = new Hud(app, state, world);
const DEBUG = import.meta.env.DEV || location.search.includes('debug');
if (DEBUG) { Object.assign(window as any, { game: state, world, hud, step }); }

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

// --- triche de test : touche P = +10k ---
window.addEventListener('keydown', e => {
  if (e.key.toLowerCase() === 'p' && !state.over) { state.cash += 10000; hud.tick(); }
});

// --- boucle ---
let last = performance.now(), uiT = 0;
function loop(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  for (const ev of step(state, dt)) hud.onEvent(ev);
  world.sync(state, now / 1000);
  world.render();
  hud.frame();
  uiT += dt; if (uiT > 0.2) { uiT = 0; hud.tick(); }
  requestAnimationFrame(loop);
}
hud.tick();
requestAnimationFrame(loop);
