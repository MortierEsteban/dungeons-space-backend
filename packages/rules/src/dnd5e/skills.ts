import type { AbilityKey } from './abilities';

export const SKILLS = [
  { key: 'acrobatics', name: 'Acrobaties', ability: 'dex' },
  { key: 'arcana', name: 'Arcanes', ability: 'int' },
  { key: 'athletics', name: 'Athlétisme', ability: 'str' },
  { key: 'stealth', name: 'Discrétion', ability: 'dex' },
  { key: 'animal_handling', name: 'Dressage', ability: 'wis' },
  { key: 'sleight_of_hand', name: 'Escamotage', ability: 'dex' },
  { key: 'history', name: 'Histoire', ability: 'int' },
  { key: 'intimidation', name: 'Intimidation', ability: 'cha' },
  { key: 'investigation', name: 'Investigation', ability: 'int' },
  { key: 'medicine', name: 'Médecine', ability: 'wis' },
  { key: 'nature', name: 'Nature', ability: 'int' },
  { key: 'perception', name: 'Perception', ability: 'wis' },
  { key: 'insight', name: 'Perspicacité', ability: 'wis' },
  { key: 'persuasion', name: 'Persuasion', ability: 'cha' },
  { key: 'religion', name: 'Religion', ability: 'int' },
  { key: 'performance', name: 'Représentation', ability: 'cha' },
  { key: 'survival', name: 'Survie', ability: 'wis' },
  { key: 'deception', name: 'Tromperie', ability: 'cha' },
] as const satisfies readonly { key: string; name: string; ability: AbilityKey }[];

export type SkillKey = (typeof SKILLS)[number]['key'];
export const SKILL_KEYS = SKILLS.map((s) => s.key) as SkillKey[];

/** 0 = aucune, 0.5 = touche-à-tout, 1 = maîtrise, 2 = expertise. */
export type ProficiencyLevel = 0 | 0.5 | 1 | 2;

export function proficiencyContribution(level: ProficiencyLevel, bonus: number): number {
  return Math.floor(level * bonus);
}
