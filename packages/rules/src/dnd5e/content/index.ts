import { ITEMS } from './items';
import { MONSTERS } from './monsters';
import { SPELLS } from './spells';
import type { CompendiumEntry } from './types';

export * from './types';
export { ITEMS } from './items';
export { MONSTERS, XP_BY_CR, crToNumber } from './monsters';
export { SPELLS } from './spells';

export const COMPENDIUM: CompendiumEntry[] = [...SPELLS, ...MONSTERS, ...ITEMS];

const normalize = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export interface CompendiumQuery {
  q?: string;
  kind?: CompendiumEntry['kind'];
}

/** Recherche insensible aux accents et à la casse sur le nom et le résumé. */
export function searchCompendium(query: CompendiumQuery, entries: CompendiumEntry[] = COMPENDIUM): CompendiumEntry[] {
  const q = query.q ? normalize(query.q.trim()) : '';
  return entries.filter(
    (e) => (!query.kind || e.kind === query.kind) && (!q || normalize(e.name).includes(q) || normalize(e.summary).includes(q)),
  );
}

export function findCompendiumEntry(id: string): CompendiumEntry | undefined {
  return COMPENDIUM.find((e) => e.id === id);
}
