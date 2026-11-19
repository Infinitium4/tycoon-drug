// Sauvegarde de la progression : ce qui compte (argent, niveaux, terrains, folies…), pas les positions des persos.
// Le format est versionné ; au chargement on repart d'une partie neuve et on recolle seulement ce qui est valide,
// donc une vieille sauvegarde reste lisible quand le jeu ajoute des choses.
import { GameState, createGame, syncUnits } from './sim';

const VERSION = 1;
const KEYS = ['cash', 'totalEarned', 'heat', 'grip', 'time', 'comDamage', 'immunity', 'route', 'cartel', 'boss'] as const;
const RECORDS = ['levels', 'owned', 'selected', 'land', 'lux', 'routes', 'kills', 'ware', 'cont'] as const;

export interface SaveData { v: number; at: number; [k: string]: unknown }

export function exportSave(s: GameState): SaveData {
  const d: SaveData = { v: VERSION, at: Date.now() };
  for (const k of KEYS) d[k] = s[k];
  for (const k of RECORDS) d[k] = { ...(s[k] as object) };
  d.country = [...s.country];
  d.districts = s.districts.map(x => ({ unlocked: x.unlocked, active: x.active, rival: x.rival }));
  return d;
}

/** Recrée une partie à partir d'une sauvegarde. Les champs inconnus ou au mauvais type sont ignorés. */
export function importSave(d: unknown): GameState {
  const s = createGame();
  if (!d || typeof d !== 'object' || (d as SaveData).v !== VERSION) return s;
  const src = d as Record<string, unknown>;
  const same = (a: unknown, b: unknown) => typeof a === typeof b && a !== null;
  for (const k of KEYS) if (same(src[k], s[k])) (s as unknown as Record<string, unknown>)[k] = src[k];
  for (const k of RECORDS) {
    const from = src[k] as Record<string, unknown> | undefined, to = s[k] as unknown as Record<string, unknown>;
    if (from && typeof from === 'object') for (const kk of Object.keys(to)) if (same(from[kk], to[kk])) to[kk] = from[kk];
  }
  if (Array.isArray(src.country)) s.country = s.country.map((v, i) => (typeof (src.country as unknown[])[i] === 'boolean' ? (src.country as boolean[])[i] : v));
  if (Array.isArray(src.districts)) (src.districts as Record<string, unknown>[]).forEach((x, i) => {
    const t = s.districts[i]; if (!t || !x) return;
    if (typeof x.unlocked === 'boolean') t.unlocked = x.unlocked;
    if (typeof x.active === 'boolean') t.active = x.active;
    if (typeof x.rival === 'number') t.rival = x.rival;
  });
  if (!Number.isFinite(s.cash)) s.cash = 0;
  s.heat = Math.min(90, Math.max(0, s.heat));   // on ne recharge jamais une partie déjà perdue
  syncUnits(s);
  return s;
}

// ---------- solo : sauvegarde dans le navigateur ----------
const LS = 'td-solo-save';
export function soloSave(s: GameState) { try { localStorage.setItem(LS, JSON.stringify(exportSave(s))); } catch { /* stockage plein ou bloqué */ } }
export function soloLoad(): SaveData | null { try { const r = localStorage.getItem(LS); return r ? JSON.parse(r) : null; } catch { return null; } }
export function soloClear() { try { localStorage.removeItem(LS); } catch { /* */ } }
