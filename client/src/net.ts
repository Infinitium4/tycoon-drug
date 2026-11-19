// Connexion au serveur multijoueur (une ville partagée, 12 joueurs par défaut, jusqu à 20).
import { GameState, employees, power, villaTier } from './sim/sim';
import { LUX_KEYS } from './sim/config';
import type { SaveData } from './sim/save';

export interface Login { user: string; pass: string; cartel: string; boss: string; fresh: boolean }
export interface Welcome { user: string; cartel: string; boss: string; save: SaveData | null; isNew: boolean }

export interface PlayerInfo {
  id: number; slot: number; cartel: string; boss: string;
  cash: number; earned: number; power: number; villa: number; tier: number;
  kills: number; employees: number; heat: number; lux: number; aero: boolean; allies?: number[];
}

/** Adresse du serveur par défaut : la même machine si le jeu est servi par le serveur, sinon la dernière utilisée. */
export function defaultServer() {
  const servedByServer = location.protocol.startsWith('http') && !location.hostname.endsWith('claude.ai') && !location.hostname.endsWith('claudeusercontent.com') && location.port !== '5173' && location.port !== '4173';
  if (servedByServer) return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;
  try { return localStorage.getItem('td-server') || 'ws://localhost:2567'; } catch { return 'ws://localhost:2567'; }
}
export function servedByServer() { return defaultServer() === (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host; }

export class Net {
  online = false;
  /** Admin validé par le serveur (mot de passe ADMIN_PASSWORD). */
  admin = false;
  onAdmin: (ok: boolean, enabled: boolean) => void = () => {};
  onAllyReq: (m: { from: number; cartel: string; boss: string }) => void = () => {};
  onGift: (m: { from: number; amount: number; cartel: string }) => void = () => {};
  onGave: (m: { to: number; amount: number; cartel: string }) => void = () => {};
  /** ids des joueurs alliés (d'après la liste du serveur) */
  allies = new Set<number>();
  id = 0;
  slot = 0;
  /** Nombre max de joueurs annoncé par le serveur. */
  max = 12;
  players: PlayerInfo[] = [];
  /** Pour chaque quartier : id du joueur qui y vend le plus (0 = personne). */
  dom: number[] = [];
  /** Poids de ventes de chaque joueur par quartier (contrôle). */
  ctrl: Record<number, number[]> = {};
  onWorld: (ext: number[]) => void = () => {};
  onAttacked: (m: { by: number; cartel: string; boss: string; win: boolean; kind?: string }) => void = () => {};
  onLoot: (m: { amount: number; cartel: string }) => void = () => {};
  onHitResult: (m: { target: number; win: boolean }) => void = () => {};
  onNews: (text: string) => void = () => {};
  onLost: () => void = () => {};
  onKicked: () => void = () => {};
  onBanned: (msg: string) => void = () => {};
  onRaidResult: (m: { target: number; win: boolean }) => void = () => {};
  onCityOp: (m: { by: number; cartel: string; kind: 'carnage' | 'killcop' | 'rival'; district: number; win: boolean }) => void = () => {};
  onSaveNow: () => void = () => {};
  welcome: Welcome | null = null;
  error = '';
  private ws: WebSocket | null = null;

  connect(url: string, login: Login): Promise<'ok' | 'full' | 'fail' | 'auth'> {
    return new Promise(resolve => {
      let done = false;
      const finish = (r: 'ok' | 'full' | 'fail' | 'auth') => { if (!done) { done = true; resolve(r); } };
      try { this.ws = new WebSocket(url); } catch { finish('fail'); return; }
      const ws = this.ws;
      const timer = setTimeout(() => { finish('fail'); try { ws.close(); } catch { /* */ } }, 8000);
      ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', ...login }));
      ws.onerror = () => { clearTimeout(timer); finish('fail'); };
      ws.onclose = () => { clearTimeout(timer); if (this.online) { this.online = false; this.players = []; this.onLost(); } finish('fail'); };
      ws.onmessage = e => {
        let m: any; try { m = JSON.parse(e.data); } catch { return; }
        switch (m.t) {
          case 'full': clearTimeout(timer); finish('full'); break;
          case 'auth': clearTimeout(timer); this.error = m.error; if (this.online) { this.online = false; this.players = []; this.onBanned(m.error); } finish('auth'); break;
          case 'kicked': this.onKicked(); break;
          case 'saveNow': this.onSaveNow(); break;
          case 'welcome':
            clearTimeout(timer); this.online = true; this.id = m.id; this.slot = m.slot; this.max = m.max || 12;
            this.welcome = { user: m.user, cartel: m.cartel, boss: m.boss, save: m.save, isNew: m.isNew };
            try { localStorage.setItem('td-server', url); } catch { /* */ }
            finish('ok'); break;
          case 'world': { const me = (m.players as PlayerInfo[]).find(p => p.id === this.id); this.allies = new Set(me?.allies ?? []); }
            this.players = (m.players as PlayerInfo[]).filter(p => p.id !== this.id); this.dom = m.dom; this.ctrl = m.ctrl || {}; this.onWorld(m.ext); break;
          case 'attacked': this.onAttacked(m); break;
          case 'loot': this.onLoot(m); break;
          case 'hitResult': this.onHitResult(m); break;
          case 'admin': this.admin = m.ok === true; this.onAdmin(this.admin, m.enabled === true); break;
          case 'news': this.onNews(m.text); break;
          case 'allyReq': this.onAllyReq(m); break;
          case 'gift': this.onGift(m); break;
          case 'raidResult': this.onRaidResult(m); break;
          case 'cityOp': this.onCityOp(m); break;
          case 'gave': this.onGave(m); break;
        }
      };
    });
  }
  private send(msg: unknown) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(msg)); }
  /** Envoie le profil public (ce que les autres voient sur leur PC) et les ventes par quartier. */
  sendState(s: GameState) {
    const tier = Math.min(3, Math.floor(Math.log10(Math.max(1, s.totalEarned)) / 2));
    this.send({
      t: 'state', sat: s.satOut,
      s: { cash: Math.round(s.cash), earned: Math.round(s.totalEarned), power: power(s), villa: villaTier(s), tier, kills: s.kills.cops + s.kills.rivals, employees: employees(s), heat: Math.round(s.heat), lux: LUX_KEYS.filter(k => s.lux[k]).length, aero: s.levels.aero > 0 },
    });
    s.satOut.fill(0);
  }
  /** Le serveur tire lui-même l'issue de l'attaque (le client ne peut pas tricher dessus). */
  hit(target: number) { this.send({ t: 'hit', target }); }
  ally(target: number) { this.send({ t: 'ally', target }); }
  allyAnswer(from: number, yes: boolean) { this.send({ t: 'allyAnswer', from, yes }); }
  unally(target: number) { this.send({ t: 'unally', target }); }
  raid(target: number) { this.send({ t: 'raid', target }); }
  cityOp(kind: string, district: number, win: boolean) { this.send({ t: 'cityOp', kind, district, win }); }
  give(target: number, amount: number) { this.send({ t: 'give', target, amount }); }
  loot(to: number, amount: number) { this.send({ t: 'loot', to, amount }); }
  news(text: string) { this.send({ t: 'news', text }); }
  adminLogin(pass: string) { this.send({ t: 'admin', pass }); }
  save(data: SaveData) { this.send({ t: 'save', data }); }
  dead() { this.send({ t: 'dead' }); }
  bye() { this.send({ t: 'bye' }); }
  player(id: number) { return this.players.find(p => p.id === id); }
  /** Place des autres dans TA vue : ta base est toujours à l'origine, les autres sur les emplacements autour. */
  relSlot(p: PlayerInfo) { return ((p.slot - this.slot + this.max) % this.max) - 1; }
}
