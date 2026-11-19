// Stockage des comptes et des sauvegardes.
// - PostgreSQL si DATABASE_URL est défini (Docker Compose).
// - Sinon un fichier JSON dans server/data/ (lancer-serveur.bat, rien à installer).
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ---------- mots de passe : scrypt + sel, jamais stockés en clair ----------
const scrypt = (pass, salt) => new Promise((ok, ko) => crypto.scrypt(pass, salt, 64, { N: 16384, r: 8, p: 1 }, (e, k) => (e ? ko(e) : ok(k))));
async function hashPassword(pass) {
  const salt = crypto.randomBytes(16);
  return `scrypt$${salt.toString('hex')}$${(await scrypt(pass, salt)).toString('hex')}`;
}
async function checkPassword(pass, stored) {
  const [algo, salt, hash] = String(stored).split('$');
  if (algo !== 'scrypt' || !salt || !hash) return false;
  const got = await scrypt(pass, Buffer.from(salt, 'hex'));
  const want = Buffer.from(hash, 'hex');
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

// ---------- PostgreSQL ----------
async function pgStore(url) {
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: url, max: 5 });
  // la base démarre parfois après le serveur (docker compose) : on attend jusqu'à 60 s
  for (let i = 0; ; i++) {
    try { await pool.query('select 1'); break; }
    catch (e) { if (i >= 30) throw e; console.log('  … attente de PostgreSQL'); await new Promise(r => setTimeout(r, 2000)); }
  }
  await pool.query(`
    create table if not exists accounts (
      id          serial primary key,
      username    text not null,
      username_lc text not null unique,
      pass_hash   text not null,
      cartel      text not null,
      boss        text not null,
      save        jsonb,
      created_at  timestamptz not null default now(),
      saved_at    timestamptz,
      last_login  timestamptz
    );
    create table if not exists games_over (
      id        serial primary key,
      username  text not null,
      cartel    text not null,
      boss      text not null,
      earned    double precision not null default 0,
      reason    text not null,
      ended_at  timestamptz not null default now()
    );`);
  return {
    kind: 'PostgreSQL',
    async get(user) { const r = await pool.query('select * from accounts where username_lc = $1', [user.toLowerCase()]); return r.rows[0] || null; },
    async create(user, hash, cartel, boss) {
      await pool.query('insert into accounts (username, username_lc, pass_hash, cartel, boss, last_login) values ($1, $2, $3, $4, $5, now())', [user, user.toLowerCase(), hash, cartel, boss]);
    },
    async login(user) { await pool.query('update accounts set last_login = now() where username_lc = $1', [user.toLowerCase()]); },
    async save(user, data) { await pool.query('update accounts set save = $2, saved_at = now() where username_lc = $1', [user.toLowerCase(), data]); },
    async reset(user, cartel, boss) { await pool.query('update accounts set save = null, cartel = $2, boss = $3 where username_lc = $1', [user.toLowerCase(), cartel, boss]); },
    async gameOver(user, cartel, boss, earned, reason) {
      await pool.query('update accounts set save = null where username_lc = $1', [user.toLowerCase()]);
      await pool.query('insert into games_over (username, cartel, boss, earned, reason) values ($1, $2, $3, $4, $5)', [user, cartel, boss, earned, reason]);
    },
    async close() { await pool.end(); },
  };
}

// ---------- fichier JSON (sans base de données) ----------
function fileStore(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'accounts.json');
  let db = { accounts: {}, gamesOver: [] };
  try { db = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* premier lancement */ }
  let timer = null;
  const flush = () => { const tmp = file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(db)); fs.renameSync(tmp, file); };   // écriture atomique
  const persist = () => { if (!timer) timer = setTimeout(() => { timer = null; flush(); }, 1000); };
  const acc = user => db.accounts[user.toLowerCase()];
  return {
    kind: `fichier ${file}`,
    async get(user) { return acc(user) || null; },
    async create(user, hash, cartel, boss) { db.accounts[user.toLowerCase()] = { username: user, pass_hash: hash, cartel, boss, save: null, created_at: new Date().toISOString() }; persist(); },
    async login(user) { const a = acc(user); if (a) { a.last_login = new Date().toISOString(); persist(); } },
    async save(user, data) { const a = acc(user); if (a) { a.save = data; a.saved_at = new Date().toISOString(); persist(); } },
    async reset(user, cartel, boss) { const a = acc(user); if (a) { Object.assign(a, { save: null, cartel, boss }); persist(); } },
    async gameOver(user, cartel, boss, earned, reason) {
      const a = acc(user); if (a) a.save = null;
      db.gamesOver.push({ username: user, cartel, boss, earned, reason, ended_at: new Date().toISOString() });
      if (db.gamesOver.length > 500) db.gamesOver.splice(0, db.gamesOver.length - 500);
      persist();
    },
    async close() { if (timer) { clearTimeout(timer); flush(); } },
  };
}

async function createStore() {
  if (process.env.DATABASE_URL) return pgStore(process.env.DATABASE_URL);
  return fileStore(process.env.DATA_DIR || path.join(__dirname, 'data'));
}

module.exports = { createStore, hashPassword, checkPassword };
