import type { AbilityKey, AbilityScores } from '../abilities';
import type { Rarity } from '../sheet';

/** Provenance de chaque entrée (exigence CNT-01). */
export interface Provenance {
  source: string;
  license: string;
}

export const SRD_PROVENANCE: Provenance = { source: 'SRD 5.1', license: 'CC-BY-4.0' };

export const SRD_ATTRIBUTION =
  'This work includes material taken from the System Reference Document 5.1 ("SRD 5.1") by Wizards of the Coast LLC ' +
  'and available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed under the ' +
  'Creative Commons Attribution 4.0 International License available at https://creativecommons.org/licenses/by/4.0/legalcode.';

export type AreaShape = 'cone' | 'sphere' | 'line' | 'cube' | 'cylinder';

export interface SpellEntry {
  kind: 'spell';
  id: string;
  name: string;
  level: number;
  school: string;
  castingTime: string;
  range: string;
  duration: string;
  concentration: boolean;
  ritual: boolean;
  components: string[];
  classes: string[];
  summary: string;
  roll?: string;
  damageType?: string;
  save?: AbilityKey;
  /** Gabarit : `size` en mètres (rayon d'une sphère, longueur d'un cône ou d'une ligne, côté d'un cube). */
  area?: { shape: AreaShape; size: number };
  /** Jet d'attaque de sort contre la CA. */
  attack?: boolean;
  /** Le jet soigne (+ modificateur de lancement) au lieu de blesser. */
  heal?: boolean;
  /** Moitié des dégâts sur un jet de sauvegarde réussi. */
  half?: boolean;
  /** État infligé (sauvegarde ratée) ou accordé (sort bénéfique sans sauvegarde). */
  condition?: string;
  /** Nombre de cibles (rayons, projectiles…). */
  targets?: number;
  /** Dés ajoutés par niveau d'emplacement au-dessus du niveau du sort. */
  upcast?: string;
  provenance: Provenance;
}

export interface MonsterAttack {
  name: string;
  bonus: number;
  damage: string;
  damageType: string;
  reach: string;
}

export interface MonsterEntry {
  kind: 'monster';
  id: string;
  name: string;
  type: string;
  size: 'TP' | 'P' | 'M' | 'G' | 'TG' | 'Gig';
  cr: string;
  xp: number;
  ac: number;
  hp: number;
  hpDice: string;
  /** Vitesse en mètres. */
  speed: number;
  abilities: AbilityScores;
  attacks: MonsterAttack[];
  traits: string[];
  /** Défenses aux dégâts (types en français). */
  defenses?: { resistances?: string[]; immunities?: string[]; vulnerabilities?: string[] };
  summary: string;
  provenance: Provenance;
}

export type ItemCategory = 'Arme' | 'Armure' | 'Équipement' | 'Potion' | 'Objet merveilleux';

export interface ItemEntry {
  kind: 'item';
  id: string;
  name: string;
  category: ItemCategory;
  rarity: Rarity;
  /** Poids en kg. */
  weight: number;
  /** Prix en pièces d'or. */
  price: number;
  damage?: string;
  damageType?: string;
  properties?: string[];
  armorClass?: string;
  requiresAttunement?: boolean;
  /** Effet en notation de dés (potions). */
  roll?: string;
  summary: string;
  provenance: Provenance;
}

export type CompendiumEntry = SpellEntry | MonsterEntry | ItemEntry;

export const SIZE_CELLS: Record<MonsterEntry['size'], number> = { TP: 1, P: 1, M: 1, G: 2, TG: 3, Gig: 4 };
