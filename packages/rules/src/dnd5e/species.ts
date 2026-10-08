import type { AbilityKey } from './abilities';

export interface SpeciesDef {
  id: string;
  name: string;
  /** Vitesse de base en mètres. */
  speed: number;
  abilityBonuses: Partial<Record<AbilityKey, number>>;
  size: 'P' | 'M';
  darkvision?: number;
  traits: { name: string; summary: string }[];
}

/** Espèces du SRD 5.1 (bonus et traits résumés en texte original). */
export const SPECIES: SpeciesDef[] = [
  { id: 'human', name: 'Humain', speed: 9, size: 'M', abilityBonuses: { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 }, traits: [{ name: 'Polyvalence', summary: '+1 à toutes les caractéristiques.' }] },
  { id: 'elf', name: 'Elfe', speed: 9, size: 'M', darkvision: 18, abilityBonuses: { dex: 2 }, traits: [{ name: 'Ascendance féerique', summary: 'Avantage contre le charme ; la magie ne peut vous endormir.' }, { name: 'Transe', summary: '4 heures de méditation remplacent le sommeil.' }] },
  { id: 'dwarf', name: 'Nain', speed: 7.5, size: 'M', darkvision: 18, abilityBonuses: { con: 2 }, traits: [{ name: 'Résistance naine', summary: 'Avantage contre le poison, résistance aux dégâts de poison.' }] },
  { id: 'halfling', name: 'Halfelin', speed: 7.5, size: 'P', abilityBonuses: { dex: 2 }, traits: [{ name: 'Chanceux', summary: 'Relancez un 1 naturel sur un d20.' }, { name: 'Brave', summary: 'Avantage contre la peur.' }] },
  { id: 'dragonborn', name: 'Drakéide', speed: 9, size: 'M', abilityBonuses: { str: 2, cha: 1 }, traits: [{ name: 'Souffle', summary: 'Une attaque de souffle liée à votre ascendance draconique.' }] },
  { id: 'gnome', name: 'Gnome', speed: 7.5, size: 'P', darkvision: 18, abilityBonuses: { int: 2 }, traits: [{ name: 'Ruse gnome', summary: "Avantage aux jets de sauvegarde d'INT, SAG et CHA contre la magie." }] },
  { id: 'half_elf', name: 'Demi-elfe', speed: 9, size: 'M', darkvision: 18, abilityBonuses: { cha: 2 }, traits: [{ name: 'Polyvalence', summary: '+1 à deux caractéristiques au choix, deux compétences.' }] },
  { id: 'half_orc', name: 'Demi-orc', speed: 9, size: 'M', darkvision: 18, abilityBonuses: { str: 2, con: 1 }, traits: [{ name: 'Endurance implacable', summary: 'Tombé à 0 PV, revenez à 1 PV une fois par repos long.' }] },
  { id: 'tiefling', name: 'Tieffelin', speed: 9, size: 'M', darkvision: 18, abilityBonuses: { cha: 2, int: 1 }, traits: [{ name: 'Résistance infernale', summary: 'Résistance aux dégâts de feu.' }] },
];

export function getSpecies(idOrName: string): SpeciesDef | undefined {
  const k = idOrName.toLowerCase();
  return SPECIES.find((s) => s.id === k || s.name.toLowerCase() === k);
}
