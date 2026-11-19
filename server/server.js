// Serveur multijoueur Tycoon Drug.
// - Une seule ville, partie infinie, 6 joueurs max.
// - Pas de sauvegarde : si tu quittes (ou si tu tombes), ta base disparaît.
// - Sert aussi le jeu : tes potes ouvrent http://<ton-ip>:2567 et jouent directement.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT || 2567);
const MAX = 6;
const N_DISTRICTS = 16;
// Le jeu servi aux joueurs : le build Vite (GAME_DIR, utilisé dans Docker) ou, à défaut, la version double-clic.
const GAME_DIR = process.env.GAME_DIR ? path.resolve(process.env.GAME_DIR) : null;
const GAME_HTML = path.join(__dirname, '..', 'jouer', 'TycoonDrug.html');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.glb': 'model/gltf-binary', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.md': 'text/plain; charset=utf-8' };

const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url === '/status' || url === '/healthz') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, joueurs: players.size, max: MAX })); return; }
  let file;
  if (GAME_DIR) {
    file = path.join(GAME_DIR, url === '/' ? 'index.html' : url);
    if (!file.startsWith(GAME_DIR + path.sep) && file !== path.join(GAME_DIR, 'index.html')) { res.writeHead(403); res.end(); return; }
  } else if (url === '/' || url === '/index.html') file = GAME_HTML;
  else { res.writeHead(404); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Introuvable'); return; }
    const ext = path.extname(file);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=86400' });
    res.end(data);
  });
});
const wss = new WebSocketServer({ server });

/** id -> { ws, id, slot, profile, sales: number[] (moyenne glissante), pending: number[] (ventes des autres à transmettre) } */
const players = new Map();
let nextId = 1;
const freeSlot = () => { for (let i = 0; i < MAX; i++) if (![...players.values()].some(p => p.slot === i)) return i; return -1; };
const send = (p, msg) => { if (p.ws.readyState === 1) p.ws.send(JSON.stringify(msg)); };
const broadcast = (msg, except) => { for (const p of players.values()) if (p !== except) send(p, msg); };
const news = (text, except) => broadcast({ t: 'news', text }, except);
const clean = (v, n = 24) => String(v ?? '').replace(/[<>]/g, '').slice(0, n);

wss.on('connection', ws => {
  const slot = freeSlot();
  if (slot < 0) { ws.send(JSON.stringify({ t: 'full' })); ws.close(); return; }
  const p = { ws, id: nextId++, slot, profile: null, sales: new Array(N_DISTRICTS).fill(0), pending: new Array(N_DISTRICTS).fill(0) };
  players.set(p.id, p);

  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    switch (m.t) {
      case 'hello':
        p.profile = { cartel: clean(m.cartel), boss: clean(m.boss, 20), cash: 0, earned: 0, power: 0, villa: 0, tier: 0, kills: 0, employees: 0, heat: 0, lux: 0, aero: false };
        send(p, { t: 'welcome', id: p.id, slot: p.slot, max: MAX });
        news(`Un nouveau cartel débarque en ville : ${p.profile.cartel}`, p);
        break;
      case 'state': {
        if (!p.profile) return;
        const s = m.s || {};
        Object.assign(p.profile, {
          cash: +s.cash || 0, earned: +s.earned || 0, power: +s.power || 0, villa: +s.villa || 0, tier: +s.tier || 0,
          kills: +s.kills || 0, employees: +s.employees || 0, heat: +s.heat || 0, lux: +s.lux || 0, aero: !!s.aero,
        });
        // ventes dans chaque quartier : comptées pour la domination et renvoyées aux autres (saturation partagée)
        const sat = Array.isArray(m.sat) ? m.sat : [];
        for (let i = 0; i < N_DISTRICTS; i++) {
          const v = Math.max(0, Math.min(2, +sat[i] || 0));
          p.sales[i] = p.sales[i] * 0.97 + v;
          for (const o of players.values()) if (o !== p) o.pending[i] += v;
        }
        break;
      }
      case 'hit': {
        // contrat sur un autre joueur : on prévient la cible, elle calcule ses pertes et renvoie le butin
        const target = players.get(+m.target);
        if (!target || !p.profile) return;
        send(target, { t: 'attacked', by: p.id, cartel: p.profile.cartel, boss: p.profile.boss, win: !!m.win });
        news(m.win ? `Fusillade : le cartel ${p.profile.cartel} attaque la base de ${target.profile?.cartel}` : `Raid raté contre ${target.profile?.cartel} : les assaillants ont pris la fuite`);
        break;
      }
      case 'loot': {
        const att = players.get(+m.to);
        if (att) send(att, { t: 'loot', amount: Math.max(0, +m.amount || 0), cartel: p.profile?.cartel });
        break;
      }
      case 'news':
        if (p.profile) news(clean(m.text, 140), p);
        break;
      case 'bye':
        ws.close();
        break;
    }
  });
  ws.on('close', () => {
    players.delete(p.id);
    if (p.profile) news(`Le cartel ${p.profile.cartel} a disparu de la circulation`);
  });
});

// Toutes les secondes : liste des joueurs, qui domine chaque quartier, ventes des autres.
setInterval(() => {
  const list = [...players.values()].filter(p => p.profile).map(p => ({ id: p.id, slot: p.slot, ...p.profile }));
  const dom = [];
  for (let i = 0; i < N_DISTRICTS; i++) {
    let best = null;
    for (const p of players.values()) if (p.profile && p.sales[i] > 0.05 && (!best || p.sales[i] > best.sales[i])) best = p;
    dom.push(best ? best.id : 0);
  }
  for (const p of players.values()) {
    send(p, { t: 'world', players: list, dom, ext: p.pending.map(v => +v.toFixed(4)) });
    p.pending.fill(0);
  }
}, 1000);

// arrêt propre (docker stop)
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => {
  broadcast({ t: 'news', text: 'Le serveur ferme. La ville s\'éteint.' });
  for (const p of players.values()) p.ws.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
});

server.listen(PORT, () => {
  const nets = require('os').networkInterfaces();
  const ips = Object.values(nets).flat().filter(n => n && n.family === 'IPv4' && !n.internal).map(n => n.address);
  console.log('\n  TYCOON DRUG — serveur multijoueur lancé');
  console.log(`  Toi :        http://localhost:${PORT}`);
  for (const ip of ips) console.log(`  Tes potes :  http://${ip}:${PORT}   (même réseau / wifi)`);
  console.log(`  Joueurs max : ${MAX}. Ferme cette fenêtre pour arrêter le serveur.\n`);
});
