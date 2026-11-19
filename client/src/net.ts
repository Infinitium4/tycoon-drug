// Connexion au serveur multijoueur (une ville partagée, 6 joueurs max).
import { GameState, employees, power, villaTier } from './sim/sim';
import { LUX_KEYS } from './sim/config';

export interface PlayerInfo {
  id: number; slot: number; cartel: string; boss: string;
  cash: number; earned: number; power: number; villa: number; tier: number;
  kills: number; employees: number; heat: number; lux: number; aero: boolean;
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
  id = 0;
  slot = 0;
  players: PlayerInfo[] = [];
  /** Pour chaque quartier : id du joueur qui y vend le plus (0 = personne). */
  dom: number[] = [];
  onWorld: (ext: number[]) => void = () => {};
  onAttacked: (m: { by: number; cartel: string; boss: string; win: boolean }) => void = () => {};
  onLoot: (m: { amount: number; cartel: string }) => void = () => {};
  onNews: (text: string) => void = () => {};
  onLost: () => void = () => {};
  private ws: WebSocket | null = null;

  connect(url: string, cartel: string, boss: string): Promise<'ok' | 'full' | 'fail'> {
    return new Promise(resolve => {
      let done = false;
      const finish = (r: 'ok' | 'full' | 'fail') => { if (!done) { done = true; resolve(r); } };
      try { this.ws = new WebSocket(url); } catch { finish('fail'); return; }
      const ws = this.ws;
      const timer = setTimeout(() => { finish('fail'); try { ws.close(); } catch { /* */ } }, 5000);
      ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', cartel, boss }));
      ws.onerror = () => { clearTimeout(timer); finish('fail'); };
      ws.onclose = () => { clearTimeout(timer); if (this.online) { this.online = false; this.players = []; this.onLost(); } finish('fail'); };
      ws.onmessage = e => {
        let m: any; try { m = JSON.parse(e.data); } catch { return; }
        switch (m.t) {
          case 'full': clearTimeout(timer); finish('full'); break;
          case 'welcome':
            clearTimeout(timer); this.online = true; this.id = m.id; this.slot = m.slot;
            try { localStorage.setItem('td-server', url); } catch { /* */ }
            finish('ok'); break;
          case 'world': this.players = (m.players as PlayerInfo[]).filter(p => p.id !== this.id); this.dom = m.dom; this.onWorld(m.ext); break;
          case 'attacked': this.onAttacked(m); break;
          case 'loot': this.onLoot(m); break;
          case 'news': this.onNews(m.text); break;
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
  hit(target: number, win: boolean) { this.send({ t: 'hit', target, win }); }
  loot(to: number, amount: number) { this.send({ t: 'loot', to, amount }); }
  news(text: string) { this.send({ t: 'news', text }); }
  bye() { this.send({ t: 'bye' }); }
  player(id: number) { return this.players.find(p => p.id === id); }
  /** Place des autres dans TA vue : ta base est toujours à l'origine, les autres sur les emplacements autour. */
  relSlot(p: PlayerInfo) { return ((p.slot - this.slot + 6) % 6) - 1; }
}
