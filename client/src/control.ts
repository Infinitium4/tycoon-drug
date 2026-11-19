// Contrôle des quartiers : qui vend le plus, où, et ça monte ou ça descend.
// Le poids de chacun = ses ventes récentes dans le quartier (moyenne glissante ~30 s).
// Le gang local pèse selon sa force ; les autres joueurs arrivent du serveur.
import { DISTRICTS, GANGS } from './sim/config';
import type { GameState } from './sim/sim';
import type { Net } from './net';

export interface Share { who: 'me' | 'player' | 'gang'; id?: number; name: string; share: number; color: string }
export interface DistrictControl { shares: Share[]; mine: number; trend: number; leader: Share | null }

const DECAY = 0.97;                                   // par seconde : ~33 s de mémoire
const HIST = 60;                                      // tendance calculée sur la dernière minute
const PLAYER_COLORS = ['#a855f7', '#f97316', '#06b6d4', '#ec4899', '#eab308'];
const gangWeight = (rival: number) => (rival > 0 ? 0.3 + rival * 0.12 : 0);

export class Control {
  private mine = DISTRICTS.map(() => 0);
  private hist: number[][] = DISTRICTS.map(() => []);
  data: DistrictControl[] = DISTRICTS.map(() => ({ shares: [], mine: 0, trend: 0, leader: null }));

  /** À appeler une fois par seconde. */
  update(s: GameState, net: Net | null) {
    DISTRICTS.forEach((_, i) => {
      this.mine[i] = this.mine[i] * DECAY + Math.min(1, s.satCtl[i]);
      s.satCtl[i] = 0;
      const shares: Share[] = [];
      if (this.mine[i] > 0.01) shares.push({ who: 'me', name: 'Toi', share: this.mine[i], color: '#22c55e' });
      if (net?.online) for (const p of net.players) {
        const w = net.ctrl[p.id]?.[i] ?? 0;
        if (w > 0.01) shares.push({ who: 'player', id: p.id, name: p.cartel, share: w, color: PLAYER_COLORS[p.slot % PLAYER_COLORS.length] });
      }
      const g = gangWeight(s.districts[i].rival);
      if (g > 0) shares.push({ who: 'gang', name: GANGS[i], share: g, color: '#ef4444' });
      const total = shares.reduce((a, x) => a + x.share, 0);
      for (const x of shares) x.share = total ? x.share / total : 0;
      shares.sort((a, b) => b.share - a.share);
      const mine = shares.find(x => x.who === 'me')?.share ?? 0;
      const h = this.hist[i]; h.push(mine); if (h.length > HIST) h.shift();
      this.data[i] = { shares, mine, trend: mine - h[0], leader: shares[0] ?? null };
    });
  }
}
