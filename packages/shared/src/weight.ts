import type { EventDto } from './chronicle';
import { eventOrigin } from './recording';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export type WeightedEvent = Pick<EventDto, 'importance' | 'source' | 'payload' | 'actors' | 'targets' | 'category'>;

/** Confiance de l'analyse automatique (0–1), 0,6 par défaut si elle n'a pas été notée. */
export function eventConfidence(e: Pick<EventDto, 'payload'>): number {
  const c = Number(e.payload?.confidence);
  return Number.isFinite(c) ? clamp(c, 0, 1) : 0.6;
}

/**
 * Poids d'affichage d'un événement, entre 0 et 1 : l'importance d'abord, puis ce qui le relie au reste
 * (liens, personnages impliqués). Un événement noté à la main pèse un peu plus qu'un événement déduit
 * de l'enregistrement, lequel est pondéré par la confiance de l'analyse. Les moments clés restent en haut.
 * Sert à ordonner, dimensionner et filtrer les vues quand une session produit des centaines de points.
 */
export function eventWeight(e: WeightedEvent, degree = 0): number {
  const importance = clamp(Math.round(e.importance), 1, 5);
  let w = 0.1 + (importance - 1) * 0.2;
  w += Math.min(0.12, degree * 0.04);
  w += Math.min(0.08, (e.actors.length + e.targets.length) * 0.02);
  const origin = eventOrigin(e);
  if (origin === 'manual') w += 0.08;
  if (origin === 'recording') w *= 0.7 + 0.3 * eventConfidence(e);
  if (e.category === 'session') w = Math.max(w, 0.85);
  if (importance >= 5) w = Math.max(w, 0.95);
  return Math.round(clamp(w, 0, 1) * 1000) / 1000;
}

export interface DensityOptions {
  /** Nombre total de points visés. */
  budget: number;
  /** Chaque groupe (session) garde au moins ses N événements les plus lourds. */
  perGroupMin: number;
  /** Au-delà de ce poids, un événement est toujours gardé. */
  alwaysAbove?: number;
}

/**
 * Niveau de détail : choisit les événements à afficher sous un budget de points, sans qu'une session
 * bavarde n'écrase les autres (minimum par session), puis complète avec les plus lourds de toute la campagne.
 */
export function selectByWeight<T extends { id: string; group: number | string; weight: number }>(items: readonly T[], opts: DensityOptions): Set<string> {
  if (items.length <= opts.budget) return new Set(items.map((i) => i.id));
  const keep = new Set<string>();
  const byWeight = [...items].sort((a, b) => b.weight - a.weight);
  const perGroup = new Map<number | string, number>();
  for (const item of byWeight) {
    const n = perGroup.get(item.group) ?? 0;
    if (n < opts.perGroupMin || item.weight >= (opts.alwaysAbove ?? Infinity)) {
      keep.add(item.id);
      perGroup.set(item.group, n + 1);
    }
  }
  for (const item of byWeight) {
    if (keep.size >= opts.budget) break;
    keep.add(item.id);
  }
  return keep;
}

/** Natures d'événements traumatiques ou décisives : toujours nommées dans les vues d'ensemble. */
export const LANDMARK_TYPES: ReadonlySet<string> = new Set(['narrative.death', 'character.died', 'social.betrayed']);

/**
 * Repère majeur de la campagne : une mort, une trahison, ou un moment noté d'importance maximale.
 * Les vues d'ensemble n'affichent que ces titres (et les personnages) ; le reste se dévoile au zoom ou au focus.
 */
export function isLandmarkEvent(e: Pick<EventDto, 'type' | 'importance'>): boolean {
  return LANDMARK_TYPES.has(e.type) || e.importance >= 5;
}
