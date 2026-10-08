import { fogOf, fogView, FogMemory, visibleCells, type CombatEvent, type CombatState } from '@ds/rules';
import { useMemo, useRef } from 'react';
import { FOG_EXPLORED, FOG_UNKNOWN, FOG_VISIBLE, type FogCells } from './scene/support';

export interface FogResult {
  /** L'état tel que le voit cet utilisateur (créatures et décor hors de vue retirés). */
  view: CombatState;
  cells: FogCells;
}

/**
 * Brouillard de guerre d'un utilisateur : ce qu'il voit maintenant, plus sa mémoire de la carte
 * déduite du flux d'événements (rejoué de façon incrémentale). `viewerId` null = pas de brouillard
 * (le MJ voit tout, sauf s'il choisit « Voir comme » un joueur).
 */
export function useFog(state: CombatState | null, history: readonly CombatEvent[], viewerId: string | null): FogResult | null {
  const memory = useRef<{ fog: FogMemory; first: CombatEvent | undefined } | null>(null);
  return useMemo(() => {
    if (!state || !viewerId || !fogOf(state).enabled) return null;
    let m = memory.current;
    // Nouvel utilisateur, ou historique rechargé / rembobiné (replay) : on repart de zéro.
    if (!m || m.fog.userId !== viewerId || m.first !== history[0] || history.length < m.fog.processed) {
      m = memory.current = { fog: new FogMemory(viewerId), first: history[0] };
    }
    m.fog.advance(history);
    const visible = visibleCells(state, viewerId);
    const known = new Set([...m.fog.explored, ...visible]);
    const { cols, rows } = state.map;
    const cells = new Uint8Array(cols * rows).fill(FOG_UNKNOWN);
    for (const k of known) {
      const [x, y] = k.split(',').map(Number) as [number, number];
      if (x < cols && y < rows) cells[y * cols + x] = visible.has(k) ? FOG_VISIBLE : FOG_EXPLORED;
    }
    return { view: fogView(state, viewerId, visible, known), cells: { cols, rows, cells } };
  }, [state, history, viewerId]);
}
