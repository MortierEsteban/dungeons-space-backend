import type { AbilityKey } from './abilities';
import { SPELLS } from './content/spells';
import type { AreaShape, SpellEntry } from './content/types';
import type { KnownSpell } from './sheet';

/** Ce qu'il faut savoir d'un sort pour le résoudre sur le plateau. */
export interface SpellMechanics {
  name: string;
  level: number;
  /** Gabarit en mètres, ou absent (sort à cible(s)). */
  area?: { shape: AreaShape; size: number };
  /** Le gabarit part du lanceur (« Personnelle (cône 4,5 m) ») au lieu d'un point visé. */
  selfOrigin: boolean;
  /** Portée en mètres (0 = personnelle, null = inconnue ou illimitée). */
  rangeMeters: number | null;
  attack: boolean;
  save?: AbilityKey;
  half: boolean;
  heal: boolean;
  roll?: string;
  damageType?: string;
  condition?: string;
  targets: number;
  upcast?: string;
  concentration: boolean;
  /** Économie d'action consommée. */
  cost: 'action' | 'bonus' | 'reaction' | 'none';
}

/** « 36 m » → 36, « Contact » → 1,5, « Personnelle… » → 0. */
export function rangeMeters(range: string | undefined): number | null {
  if (!range) return null;
  const r = range.toLowerCase();
  if (r.startsWith('personnel')) return 0;
  if (r.startsWith('contact')) return 1.5;
  const m = /(\d+(?:[.,]\d+)?)\s*m\b/.exec(r);
  return m ? Number(m[1]!.replace(',', '.')) : null;
}

function costOf(castingTime: string | undefined): SpellMechanics['cost'] {
  const t = (castingTime ?? '').toLowerCase();
  if (t.includes('bonus')) return 'bonus';
  if (t.includes('réaction') || t.includes('reaction')) return 'reaction';
  if (t.includes('action')) return 'action';
  return 'none';
}

/** Entrée SRD d'un sort connu (par référence, sinon par nom). */
export function spellEntryOf(spell: Pick<KnownSpell, 'ref' | 'name'>): SpellEntry | undefined {
  return SPELLS.find((s) => s.id === spell.ref) ?? SPELLS.find((s) => s.name.toLowerCase() === spell.name.toLowerCase());
}

/**
 * Mécaniques d'un sort du grimoire : les champs saisis sur la fiche (Forge, homebrew) priment,
 * le compendium complète les sorts ajoutés avant que la fiche ne les stocke.
 */
export function spellMechanics(spell: KnownSpell): SpellMechanics {
  const e = spellEntryOf(spell);
  const range = spell.range ?? e?.range;
  const area = spell.area ?? e?.area;
  const save = spell.save ?? e?.save;
  const roll = spell.roll ?? e?.roll;
  return {
    name: spell.name,
    level: spell.level,
    ...(area ? { area } : {}),
    selfOrigin: !!area && (range ?? '').toLowerCase().startsWith('personnel'),
    rangeMeters: rangeMeters(range),
    attack: spell.attack ?? e?.attack ?? false,
    ...(save ? { save } : {}),
    // Par défaut, un sort de zone à sauvegarde fait moitié des dégâts sur une réussite.
    half: spell.half ?? e?.half ?? (!!save && !!area),
    heal: spell.heal ?? e?.heal ?? false,
    ...(roll ? { roll } : {}),
    ...((spell.damageType ?? e?.damageType) ? { damageType: spell.damageType ?? e?.damageType } : {}),
    ...((spell.condition ?? e?.condition) ? { condition: spell.condition ?? e?.condition } : {}),
    targets: spell.targets ?? e?.targets ?? 1,
    ...((spell.upcast ?? e?.upcast) ? { upcast: spell.upcast ?? e?.upcast } : {}),
    concentration: spell.concentration || !!e?.concentration,
    cost: costOf(spell.castingTime ?? e?.castingTime),
  };
}

/**
 * Jet effectif : les tours de magie gagnent des dés aux niveaux 5, 11 et 17 ;
 * un emplacement supérieur ajoute les dés de `upcast` par niveau.
 */
export function scaledRoll(m: Pick<SpellMechanics, 'roll' | 'level' | 'upcast'>, slotLevel: number, characterLevel: number): string | undefined {
  if (!m.roll) return undefined;
  if (m.level === 0) {
    const tier = characterLevel >= 17 ? 4 : characterLevel >= 11 ? 3 : characterLevel >= 5 ? 2 : 1;
    return tier === 1 ? m.roll : m.roll.replace(/^(\d*)d(\d+)/i, (_, n: string, f: string) => `${(Number(n) || 1) * tier}d${f}`);
  }
  const extra = Math.max(0, slotLevel - m.level);
  return m.upcast && extra > 0 ? `${m.roll}${`+${m.upcast}`.repeat(extra)}` : m.roll;
}

/** Copie d'une entrée du compendium dans le grimoire (mécaniques comprises). */
export function knownSpellFromEntry(e: SpellEntry): Omit<KnownSpell, 'id'> {
  return {
    ref: e.id, name: e.name, level: e.level, school: e.school, castingTime: e.castingTime, range: e.range, duration: e.duration,
    concentration: e.concentration, ritual: e.ritual, prepared: e.level === 0, favorite: false, description: e.summary,
    ...(e.roll ? { roll: e.roll } : {}),
    ...(e.area ? { area: e.area } : {}),
    ...(e.save ? { save: e.save } : {}),
    ...(e.half !== undefined ? { half: e.half } : {}),
    ...(e.attack ? { attack: true } : {}),
    ...(e.heal ? { heal: true } : {}),
    ...(e.damageType ? { damageType: e.damageType } : {}),
    ...(e.condition ? { condition: e.condition } : {}),
    ...(e.targets ? { targets: e.targets } : {}),
    ...(e.upcast ? { upcast: e.upcast } : {}),
  };
}
