// Serveur multijoueur Tycoon Drug.
// - Une seule ville, partie infinie, 12 joueurs par défaut (MAX_PLAYERS, jusqu'à 20).
// - Pas de sauvegarde : si tu quittes (ou si tu tombes), ta base disparaît.
// - Sert aussi le jeu : tes potes ouvrent http://<ton-ip>:2567 et jouent directement.
//
// Sécurité : rien de ce qu'envoie un client n'est cru sur parole. Tailles et débits limités,
// nombres bornés, textes nettoyés, issue des attaques tirée par le serveur, butin plafonné.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { createStore, hashPassword, checkPassword } = require('./store');
let store = null;   // comptes + sauvegardes (PostgreSQL ou fichier)

const PORT = Number(process.env.PORT || 2567);
const MAX = Math.min(20, Math.max(2, Number(process.env.MAX_PLAYERS || 12)));   // joueurs simultanés (2 à 20)
const N_DISTRICTS = 16;
const MAX_PER_IP = Number(process.env.MAX_PER_IP || 3);            // connexions simultanées par adresse IP
const TRUST_PROXY = process.env.TRUST_PROXY === '1';               // derrière Nginx/Traefik : lire X-Forwarded-For
const ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean); // vide = toutes
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';           // vide = panneau admin désactivé en ligne
const crypto = require('crypto');
const sameSecret = (a, b) => crypto.timingSafeEqual(crypto.createHash('sha256').update(String(a)).digest(), crypto.createHash('sha256').update(String(b)).digest());
const HIT_COOLDOWN = 120_000;                                      // un contrat sur joueur toutes les 2 min par joueur
const HIT_MIN_TRAVEL = 4_000;                                      // la voiture met au moins 4 s à arriver

// Le jeu servi aux joueurs : le build Vite (GAME_DIR, utilisé dans Docker) ou, à défaut, la version double-clic.
const GAME_DIR = process.env.GAME_DIR ? path.resolve(process.env.GAME_DIR) : null;
const GAME_HTML = path.join(__dirname, '..', 'jouer', 'TycoonDrug.html');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.glb': 'model/gltf-binary', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const HEADERS = { 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'SAMEORIGIN', 'Referrer-Policy': 'no-referrer' };

const fail = (res, code) => { res.writeHead(code, HEADERS); res.end(); };
const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return fail(res, 405);
  // une URL mal formée (« /% ») ne doit jamais faire tomber le serveur
  let url;
  try { url = decodeURIComponent((req.url || '/').split('?')[0]); } catch { return fail(res, 400); }
  if (url.includes('\0') || url.length > 300) return fail(res, 400);
  if (url === '/status' || url === '/healthz') { res.writeHead(200, { ...HEADERS, 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, joueurs: players.size, max: MAX })); return; }
  let file;
  if (GAME_DIR) {
    file = path.normalize(path.join(GAME_DIR, url === '/' ? 'index.html' : url));
    if (!file.startsWith(GAME_DIR + path.sep)) return fail(res, 403);      // pas de ../ hors du dossier du jeu
  } else if (url === '/' || url === '/index.html') file = GAME_HTML;
  else return fail(res, 404);
  const ext = path.extname(file);
  if (!MIME[ext]) return fail(res, 404);                                    // seulement les types attendus
  fs.readFile(file, (err, data) => {
    if (err) return fail(res, 404);
    res.writeHead(200, { ...HEADERS, 'Content-Type': MIME[ext], 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=86400' });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
});
server.on('error', e => { console.error(e.code === 'EADDRINUSE' ? `Le port ${PORT} est déjà utilisé (un autre serveur tourne ?).` : e.message); process.exit(1); });
server.on('clientError', (_e, socket) => { try { socket.end('HTTP/1.1 400 Bad Request\r\n\r\n'); } catch { /* */ } });

const ipOf = req => (TRUST_PROXY && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || '?';
const wss = new WebSocketServer({
  server,
  maxPayload: 32 * 1024,                                                    // un message de jeu fait < 1 Ko, une sauvegarde < 10 Ko
  verifyClient: ({ origin, req }, cb) => {
    if (ORIGINS.length && !ORIGINS.includes(origin)) return cb(false, 403, 'Origine refusée');
    const ip = ipOf(req), n = [...players.values()].filter(p => p.ip === ip).length;
    if (n >= MAX_PER_IP) return cb(false, 429, 'Trop de connexions');
    cb(true);
  },
});

// alliances, par nom de compte (survivent à une reconnexion) : user -> Set(user)
const alliances = new Map();
const allied = (a, b) => !!(a.user && b.user && alliances.get(a.user)?.has(b.user));
const setAlly = (a, b, on) => {
  for (const [x, y] of [[a, b], [b, a]]) {
    if (!alliances.has(x)) alliances.set(x, new Set());
    on ? alliances.get(x).add(y) : alliances.get(x).delete(y);
  }
};
const GIFT_COOLDOWN = 10_000;
/** id -> { ws, id, ip, slot, profile, sales, pending, bucket, lastHit, attack } */
const players = new Map();
let nextId = 1;
const freeSlot = () => { for (let i = 0; i < MAX; i++) if (![...players.values()].some(p => p.slot === i)) return i; return -1; };
const send = (p, msg) => { if (p.ws.readyState === 1) p.ws.send(JSON.stringify(msg)); };
const broadcast = (msg, except) => { for (const p of players.values()) if (p !== except && p.profile) send(p, msg); };
const news = (text, except) => broadcast({ t: 'news', text }, except);
/** Texte venant d'un client : sans balises, sans caractères de contrôle, longueur bornée. */
const clean = (v, n = 24) => String(v ?? '').replace(/[<>&"'`\u0000-\u001f\u007f-\u009f​-‏‪-‮]/g, '').trim().slice(0, n) || '???';
/** Nombre venant d'un client : fini, borné. */
const USER_RE = /^[a-zA-Z0-9_-]{3,20}$/;
const LOGIN_PER_MIN = Number(process.env.LOGIN_PER_MIN || 10);   // connexions à un compte par minute et par IP (anti force brute)
const loginTries = new Map();   // ip -> horodatages des tentatives de connexion (anti force brute)
const num = (v, lo, hi) => { const x = Number(v); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : lo; };

wss.on('connection', (ws, req) => {
  const slot = freeSlot();
  if (slot < 0) { ws.send(JSON.stringify({ t: 'full' })); ws.close(); return; }
  const p = { ws, id: nextId++, ip: ipOf(req), slot, profile: null, sales: new Array(N_DISTRICTS).fill(0), pending: new Array(N_DISTRICTS).fill(0), bucket: 20, lastHit: 0, lastNews: 0, lastState: 0, attack: null, alive: true };
  players.set(p.id, p);
  // qui ne dit pas bonjour en 10 s libère la place (sinon 6 connexions muettes bloquent la ville)
  const helloTimer = setTimeout(() => { if (!p.profile) ws.close(4000, 'hello attendu'); }, 10_000);
  ws.on('pong', () => { p.alive = true; });

  ws.on('message', raw => {
    // limite de débit : 20 messages d'avance, +10 par seconde ; au-delà, dehors
    if (--p.bucket < 0) { ws.close(4008, 'flood'); return; }
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m !== 'object') return;
    switch (m.t) {
      case 'hello':
        // connexion au compte (créé automatiquement au premier passage), puis chargement de la sauvegarde
        if (p.profile || p.authing) return;
        p.authing = true;
        login(p, m).catch(e => { console.error('[compte]', e.message); send(p, { t: 'auth', error: 'Erreur serveur, réessaie.' }); ws.close(); })
          .finally(() => { p.authing = false; clearTimeout(helloTimer); });
        break;
      case 'save': {
        // sauvegarde de la progression (toutes les 30 s et quand on quitte) ; 1 toutes les 5 s max, 30 Ko max
        const now = Date.now();
        if (!p.user || now - (p.lastSave || 0) < 5000) return;
        if (!m.data || typeof m.data !== 'object' || typeof m.data.v !== 'number') return;
        if (JSON.stringify(m.data).length > 30_000) return;
        p.lastSave = now;
        store.save(p.user, m.data).catch(e => console.error('[sauvegarde]', e.message));
        break;
      }
      case 'dead':
        // arrêté : la partie est perdue pour de bon, on l'efface et on la garde au palmarès
        if (!p.user || p.dead) return;
        p.dead = true;
        store.gameOver(p.user, p.profile.cartel, p.profile.boss, p.profile.earned, 'arrêté').catch(e => console.error('[game over]', e.message));
        break;
      case 'state': {
        // un état par seconde maximum (sinon un tricheur sature les quartiers des autres)
        if (!p.profile || Date.now() - p.lastState < 800) return;
        p.lastState = Date.now();
        const s = m.s && typeof m.s === 'object' ? m.s : {};
        Object.assign(p.profile, {
          cash: num(s.cash, 0, 1e15), earned: num(s.earned, 0, 1e15), power: num(s.power, 0, 60), villa: Math.round(num(s.villa, 0, 3)), tier: Math.round(num(s.tier, 0, 3)),
          kills: Math.round(num(s.kills, 0, 1e6)), employees: Math.round(num(s.employees, 0, 1e4)), heat: Math.round(num(s.heat, 0, 100)), lux: Math.round(num(s.lux, 0, 6)), aero: s.aero === true,
        });
        // ventes dans chaque quartier : comptées pour la domination et renvoyées aux autres (saturation partagée)
        const sat = Array.isArray(m.sat) ? m.sat : [];
        for (let i = 0; i < N_DISTRICTS; i++) {
          const v = num(sat[i], 0, 1);
          p.sales[i] = p.sales[i] * 0.97 + v;
          for (const o of players.values()) if (o !== p) o.pending[i] += v;
        }
        break;
      }
      case 'hit': {
        // contrat sur un autre joueur : délai imposé et issue tirée PAR LE SERVEUR (le client ne décide pas qu'il gagne)
        const target = players.get(Number(m.target)), now = Date.now();
        if (!p.profile || !target?.profile || target === p) return;
        if (allied(p, target)) return; // on n'attaque pas un allié
        if (now - p.lastHit < HIT_COOLDOWN) return;
        p.lastHit = now;
        const chance = Math.min(0.85, Math.max(0.15, 0.6 + (p.profile.power - target.profile.power) * 0.03));
        const win = Math.random() < chance;
        target.attack = win ? { by: p.id, cap: Math.floor(target.profile.cash * 0.2), at: now } : null;
        setTimeout(() => {
          if (!players.has(target.id) || !players.has(p.id)) return;
          send(target, { t: 'attacked', by: p.id, cartel: p.profile.cartel, boss: p.profile.boss, win });
          send(p, { t: 'hitResult', target: target.id, win });
          news(win ? `Fusillade : le cartel ${p.profile.cartel} attaque la base de ${target.profile.cartel}` : `Raid raté contre ${target.profile.cartel} : les assaillants ont pris la fuite`);
        }, Math.max(0, HIT_MIN_TRAVEL - 3000));
        break;
      }
      case 'loot': {
        // seule la victime d'une attaque réussie peut déclarer ce qu'elle a perdu, une seule fois, plafonné
        const a = p.attack;
        if (!a || Number(m.to) !== a.by || Date.now() - a.at > 30_000) return;
        p.attack = null;
        const att = players.get(a.by);
        if (att) send(att, { t: 'loot', amount: Math.floor(num(m.amount, 0, a.cap)), cartel: p.profile?.cartel });
        break;
      }
      case 'news': {
        // flash infos des joueurs : 1 toutes les 15 s, préfixé du nom du cartel pour éviter les fausses annonces
        const now = Date.now();
        if (!p.profile || now - p.lastNews < 15_000) return;
        p.lastNews = now;
        news(`[${p.profile.cartel}] ${clean(m.text, 140)}`, p);
        break;
      }
      case 'ally': {
        // proposer une alliance : la cible doit accepter (une demande à la fois par couple)
        const t = players.get(Number(m.target));
        if (!p.profile || !t?.profile || t === p || allied(p, t)) return;
        t.allyReqs = t.allyReqs || new Map();
        if (t.allyReqs.has(p.id) && Date.now() - t.allyReqs.get(p.id) < 30_000) return;
        t.allyReqs.set(p.id, Date.now());
        send(t, { t: 'allyReq', from: p.id, cartel: p.profile.cartel, boss: p.profile.boss });
        break;
      }
      case 'allyAnswer': {
        const from = players.get(Number(m.from));
        const at = p.allyReqs?.get(Number(m.from));
        if (!p.profile || !from?.profile || !at || Date.now() - at > 120_000) return;
        p.allyReqs.delete(from.id);
        if (m.yes === true) {
          setAlly(p.user, from.user, true);
          news(`Alliance : les cartels ${from.profile.cartel} et ${p.profile.cartel} font front commun`);
        } else send(from, { t: 'news', text: `${p.profile.cartel} a refusé ton alliance.` });
        break;
      }
      case 'unally': {
        const t = players.get(Number(m.target));
        if (!p.profile || !t?.profile || !allied(p, t)) return;
        setAlly(p.user, t.user, false);
        news(`Rupture : le cartel ${p.profile.cartel} rompt son alliance avec ${t.profile.cartel}`);
        break;
      }
      case 'give': {
        // don d'argent : plafonné à ce que le donneur déclare avoir, 1 don toutes les 10 s
        const t = players.get(Number(m.target)), now = Date.now();
        if (!p.profile || !t?.profile || t === p || now - (p.lastGive || 0) < GIFT_COOLDOWN) return;
        const amount = Math.floor(num(m.amount, 0, p.profile.cash));
        if (amount < 1) return;
        p.lastGive = now;
        p.profile.cash -= amount; // évite de redonner le même argent avant le prochain état
        send(p, { t: 'gave', to: t.id, amount, cartel: t.profile.cartel });
        send(t, { t: 'gift', from: p.id, amount, cartel: p.profile.cartel });
        break;
      }
      case 'admin': {
        // mot de passe vérifié ici, jamais côté navigateur ; 5 essais par minute, au-delà : déconnexion
        const now = Date.now();
        p.adminTries = (p.adminTries || []).filter(t => now - t < 60_000);
        if (p.adminTries.length >= 5) { ws.close(4029, 'trop d\'essais'); return; }
        p.adminTries.push(now);
        const ok = !!ADMIN_PASSWORD && typeof m.pass === 'string' && m.pass.length <= 200 && sameSecret(m.pass, ADMIN_PASSWORD);
        p.admin = ok;
        console.log(`[admin] ${ok ? 'connexion' : 'échec'} : ${p.profile?.cartel ?? '?'} (${p.ip})`);
        send(p, { t: 'admin', ok, enabled: !!ADMIN_PASSWORD });
        break;
      }
      case 'bye':
        ws.close();
        break;
    }
  });
  ws.on('close', () => {
    clearTimeout(helloTimer);
    players.delete(p.id);
    if (p.profile) news(`Le cartel ${p.profile.cartel} a disparu de la circulation`);
  });
  ws.on('error', () => { /* connexion coupée : géré par close */ });
});

async function login(p, m) {
  const ip = p.ip, now = Date.now();
  const tries = (loginTries.get(ip) || []).filter(t => now - t < 60_000);
  if (tries.length >= LOGIN_PER_MIN) { send(p, { t: 'auth', error: 'Trop d\'essais, attends une minute.' }); p.ws.close(); return; }
  tries.push(now); loginTries.set(ip, tries);
  const user = String(m.user ?? ''), pass = String(m.pass ?? '');
  if (!USER_RE.test(user)) { send(p, { t: 'auth', error: 'Pseudo : 3 à 20 caractères (lettres, chiffres, - et _).' }); p.ws.close(); return; }
  if (pass.length < 4 || pass.length > 100) { send(p, { t: 'auth', error: 'Mot de passe : 4 caractères minimum.' }); p.ws.close(); return; }
  let acc = await store.get(user), isNew = false;
  if (!acc) {
    await store.create(user, await hashPassword(pass), clean(m.cartel), clean(m.boss, 20));
    acc = await store.get(user); isNew = true;
  } else if (!(await checkPassword(pass, acc.pass_hash))) {
    send(p, { t: 'auth', error: 'Mot de passe incorrect pour ce pseudo.' }); p.ws.close(); return;
  }
  if (p.ws.readyState !== 1) return;
  // « Nouvelle partie » : on efface la sauvegarde et on prend les nouveaux noms
  if (m.fresh === true && !isNew) { await store.reset(user, clean(m.cartel), clean(m.boss, 20)); acc = await store.get(user); }
  // un seul onglet par compte : l'ancienne session est éjectée
  for (const o of players.values()) if (o !== p && o.user && o.user.toLowerCase() === user.toLowerCase()) { send(o, { t: 'kicked' }); o.ws.close(4001, 'connecté ailleurs'); }
  await store.login(user);
  p.user = acc.username;
  p.profile = { cartel: acc.cartel, boss: acc.boss, cash: 0, earned: 0, power: 0, villa: 0, tier: 0, kills: 0, employees: 0, heat: 0, lux: 0, aero: false };
  send(p, { t: 'welcome', id: p.id, slot: p.slot, max: MAX, user: acc.username, cartel: acc.cartel, boss: acc.boss, save: acc.save || null, isNew });
  console.log(`[compte] ${acc.username} ${isNew ? 'créé' : 'connecté'} (${acc.save ? 'reprise de la partie' : 'nouvelle partie'})`);
  news(acc.save ? `Le cartel ${acc.cartel} est de retour en ville` : `Un nouveau cartel débarque en ville : ${acc.cartel}`, p);
}

// recharge des jetons de débit
setInterval(() => { for (const p of players.values()) p.bucket = Math.min(20, p.bucket + 10); }, 1000);
// connexions mortes (onglet fermé brutalement, réseau coupé) : ping toutes les 30 s
setInterval(() => { for (const p of players.values()) { if (!p.alive) { p.ws.terminate(); continue; } p.alive = false; try { p.ws.ping(); } catch { /* */ } } }, 30_000);

// Toutes les secondes : liste des joueurs, qui domine chaque quartier, ventes des autres.
setInterval(() => {
  const live = [...players.values()].filter(p => p.profile);
  const list = live.map(p => ({ id: p.id, slot: p.slot, ...p.profile, allies: live.filter(o => o !== p && allied(p, o)).map(o => o.id) }));
  const dom = [];
  for (let i = 0; i < N_DISTRICTS; i++) {
    let best = null;
    for (const p of players.values()) if (p.profile && p.sales[i] > 0.05 && (!best || p.sales[i] > best.sales[i])) best = p;
    dom.push(best ? best.id : 0);
  }
  // poids de chaque joueur dans chaque quartier (pour les % de contrôle)
  const ctrl = {};
  for (const p of players.values()) if (p.profile) ctrl[p.id] = p.sales.map(v => +v.toFixed(3));
  for (const p of players.values()) {
    if (!p.profile) continue;
    send(p, { t: 'world', players: list, dom, ctrl, ext: p.pending.map(v => +Math.min(1, v).toFixed(4)) });
    p.pending.fill(0);
  }
}, 1000);

// arrêt propre (docker stop)
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => {
  // on demande à chacun de sauvegarder, puis on ferme
  broadcast({ t: 'news', text: 'Le serveur redémarre. Ta partie est sauvegardée, reconnecte-toi dans un instant.' });
  broadcast({ t: 'saveNow' });
  setTimeout(() => {
    for (const p of players.values()) p.ws.close();
    server.close(async () => { try { await store?.close(); } catch { /* */ } process.exit(0); });
  }, 800);
  setTimeout(() => process.exit(0), 4000).unref();
});
// filet de sécurité : une erreur imprévue est loguée, le serveur reste debout
process.on('uncaughtException', e => console.error('[erreur]', e));

createStore().then(s => { store = s; server.listen(PORT, onListen); }).catch(e => { console.error('Base de données injoignable :', e.message); process.exit(1); });
function onListen() {
  const nets = require('os').networkInterfaces();
  const ips = Object.values(nets).flat().filter(n => n && n.family === 'IPv4' && !n.internal).map(n => n.address);
  console.log('\n  TYCOON DRUG — serveur multijoueur lancé');
  console.log(`  Toi :        http://localhost:${PORT}`);
  for (const ip of ips) console.log(`  Tes potes :  http://${ip}:${PORT}   (même réseau / wifi)`);
  console.log(ADMIN_PASSWORD ? '  Panneau admin : activé (touche F9 en jeu, mot de passe ADMIN_PASSWORD)' : '  Panneau admin : désactivé en ligne (définis ADMIN_PASSWORD pour l\'activer)');
  console.log(`  Sauvegardes : ${store.kind}`);
  console.log(`  Joueurs max : ${MAX}. Ferme cette fenêtre pour arrêter le serveur.\n`);
}
