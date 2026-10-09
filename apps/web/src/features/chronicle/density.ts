import { selectByWeight, type DensityOptions } from '@ds/shared';

/** Niveau de détail des vues de la Chronique, partagé par la 3D, la Constellation et les sessions. */
export type Density = 'essential' | 'balanced' | 'all';

export const DENSITIES: { value: Density; label: string }[] = [
  { value: 'essential', label: 'Essentiel' },
  { value: 'balanced', label: 'Équilibré' },
  { value: 'all', label: 'Tout' },
];

export type DensityPresets = Record<Exclude<Density, 'all'>, DensityOptions>;

/** Campagne entière, groupée par session. */
export const CAMPAIGN_DENSITY: DensityPresets = {
  essential: { budget: 60, perGroupMin: 4, alwaysAbove: 0.9 },
  balanced: { budget: 220, perGroupMin: 10, alwaysAbove: 0.85 },
};

/** Une session, groupée par nature d'événement (les dés ne noient pas le récit). */
export const SESSION_DENSITY: DensityPresets = {
  essential: { budget: 25, perGroupMin: 2, alwaysAbove: 0.9 },
  balanced: { budget: 90, perGroupMin: 6, alwaysAbove: 0.85 },
};

/** Constellation : les étoiles-événements autour des personnages. */
export const GRAPH_DENSITY: DensityPresets = {
  essential: { budget: 40, perGroupMin: 2, alwaysAbove: 0.9 },
  balanced: { budget: 140, perGroupMin: 5, alwaysAbove: 0.85 },
};

export function selectDensity<T extends { id: string; group: number | string; weight: number }>(items: readonly T[], density: Density, presets: DensityPresets): Set<string> {
  return density === 'all' ? new Set(items.map((i) => i.id)) : selectByWeight(items, presets[density]);
}

export type Bundled<T> = { kind: 'item'; item: T } | { kind: 'bundle'; id: string; items: T[] };

/**
 * Regroupe les suites d'au moins `min` éléments mineurs consécutifs (ex. détails déduits de l'enregistrement)
 * en un seul repli : la frise reste lisible, rien n'est caché pour autant.
 */
export function bundleMinor<T extends { id: string }>(items: readonly T[], isMinor: (item: T) => boolean, min = 3): Bundled<T>[] {
  const out: Bundled<T>[] = [];
  let run: T[] = [];
  const close = () => {
    if (run.length >= min) out.push({ kind: 'bundle', id: `bundle-${run[0]!.id}`, items: run });
    else out.push(...run.map((item) => ({ kind: 'item' as const, item })));
    run = [];
  };
  for (const item of items) {
    if (isMinor(item)) run.push(item);
    else {
      close();
      out.push({ kind: 'item', item });
    }
  }
  close();
  return out;
}
