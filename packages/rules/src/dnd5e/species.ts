import type { AbilityKey } from './abilities';
import type { Effect, ResourceDef } from './effects';

export interface SpeciesDef {
  id: string;
  name: string;
  /** Vitesse de base en mètres. */
  speed: number;
  abilityBonuses: Partial<Record<AbilityKey, number>>;
  size: 'P' | 'M';
  darkvision?: number;
  /** Traits résumés ; `effects` porte leurs passifs mécaniques. */
  traits: { name: string; summary: string; effects?: Effect[] }[];
  resources?: ResourceDef[];
}

const vsCharm: Effect = { type: 'advantage', roll: 'save', against: 'contre le charme' };

/** Espèces du SRD 5.1 (bonus et traits résumés en texte original). */
export const SPECIES: SpeciesDef[] = [
  { id: 'human', name: 'Humain', speed: 9, size: 'M', abilityBonuses: { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 }, traits: [{ name: 'Polyvalence', summary: '+1 à toutes les caractéristiques.' }] },
  {
    id: 'elf', name: 'Elfe', speed: 9, size: 'M', darkvision: 18, abilityBonuses: { dex: 2 },
    traits: [
      { name: 'Sens aiguisés', summary: 'Maîtrise de la Perception.', effects: [{ type: 'skill', skill: 'perception', level: 1 }] },
      { name: 'Ascendance féerique', summary: 'Avantage contre le charme ; la magie ne peut vous endormir.', effects: [vsCharm, { type: 'condition_immunity', condition: 'Sommeil magique' }] },
      { name: 'Transe', summary: '4 heures de méditation remplacent le sommeil.' },
    ],
  },
  {
    id: 'dwarf', name: 'Nain', speed: 7.5, size: 'M', darkvision: 18, abilityBonuses: { con: 2 },
    traits: [
      { name: 'Résistance naine', summary: 'Avantage contre le poison, résistance aux dégâts de poison.', effects: [{ type: 'advantage', roll: 'save', against: 'contre le poison' }, { type: 'resistance', damage: 'poison' }] },
      { name: 'Connaissance de la pierre', summary: 'Expertise en Histoire pour tout ce qui touche à la pierre taillée.' },
      { name: 'Pas lourd', summary: 'Votre vitesse n’est pas réduite par une armure lourde.' },
    ],
  },
  {
    id: 'halfling', name: 'Halfelin', speed: 7.5, size: 'P', abilityBonuses: { dex: 2 },
    traits: [
      { name: 'Chanceux', summary: 'Relancez un 1 naturel sur un d20.' },
      { name: 'Brave', summary: 'Avantage contre la peur.', effects: [{ type: 'advantage', roll: 'save', against: 'contre la peur' }] },
      { name: 'Agilité halfeline', summary: 'Vous traversez l’espace des créatures plus grandes que vous.' },
    ],
  },
  {
    id: 'dragonborn', name: 'Drakéide', speed: 9, size: 'M', abilityBonuses: { str: 2, cha: 1 },
    resources: [{ id: 'breath-weapon', name: 'Souffle', max: '1', recharge: 'short', fromLevel: 1, pool: false }],
    traits: [
      { name: 'Souffle', summary: 'Une attaque de souffle (2d6, JS pour moitié) liée à votre ascendance draconique, une fois par repos court.' },
      { name: 'Résistance draconique', summary: 'Résistance au type de dégâts de votre ascendance (feu par défaut : modifiable sur la fiche).', effects: [{ type: 'resistance', damage: 'feu' }] },
    ],
  },
  {
    id: 'gnome', name: 'Gnome', speed: 7.5, size: 'P', darkvision: 18, abilityBonuses: { int: 2 },
    traits: [
      {
        name: 'Ruse gnome', summary: "Avantage aux jets de sauvegarde d'INT, SAG et CHA contre la magie.",
        effects: (['int', 'wis', 'cha'] as const).map((ability): Effect => ({ type: 'advantage', roll: 'save', ability, against: 'contre la magie' })),
      },
    ],
  },
  {
    id: 'half_elf', name: 'Demi-elfe', speed: 9, size: 'M', darkvision: 18, abilityBonuses: { cha: 2 },
    traits: [
      { name: 'Ascendance féerique', summary: 'Avantage contre le charme ; la magie ne peut vous endormir.', effects: [vsCharm, { type: 'condition_immunity', condition: 'Sommeil magique' }] },
      { name: 'Polyvalence', summary: '+1 à deux caractéristiques au choix, deux compétences.' },
    ],
  },
  {
    id: 'half_orc', name: 'Demi-orc', speed: 9, size: 'M', darkvision: 18, abilityBonuses: { str: 2, con: 1 },
    resources: [{ id: 'relentless-endurance', name: 'Endurance implacable', max: '1', recharge: 'long', fromLevel: 1, pool: false }],
    traits: [
      { name: 'Menaçant', summary: 'Maîtrise de l’Intimidation.', effects: [{ type: 'skill', skill: 'intimidation', level: 1 }] },
      { name: 'Endurance implacable', summary: 'Tombé à 0 PV, revenez à 1 PV une fois par repos long.' },
      { name: 'Attaques sauvages', summary: 'Un dé de dégâts supplémentaire sur un coup critique au corps à corps.' },
    ],
  },
  {
    id: 'tiefling', name: 'Tieffelin', speed: 9, size: 'M', darkvision: 18, abilityBonuses: { cha: 2, int: 1 },
    traits: [
      { name: 'Résistance infernale', summary: 'Résistance aux dégâts de feu.', effects: [{ type: 'resistance', damage: 'feu' }] },
      { name: 'Héritage infernal', summary: 'Vous connaissez le tour de magie Thaumaturgie.' },
    ],
  },
];

export function getSpecies(idOrName: string): SpeciesDef | undefined {
  const k = idOrName.toLowerCase();
  return SPECIES.find((s) => s.id === k || s.name.toLowerCase() === k);
}
