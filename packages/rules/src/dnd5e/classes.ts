import type { AbilityKey } from './abilities';
import type { SkillKey } from './skills';

export type CasterType = 'full' | 'half' | 'pact' | null;

export interface ClassDef {
  id: string;
  name: string;
  hitDie: number;
  primary: AbilityKey[];
  saves: [AbilityKey, AbilityKey];
  caster: CasterType;
  spellAbility?: AbilityKey;
  /** Nombre de compétences au choix au niveau 1, et liste autorisée. */
  skillChoices: { count: number; from: SkillKey[] | 'any' };
  /** Aptitudes de bas niveau, résumées (mécaniques SRD 5.1, texte original). */
  features: { level: number; name: string; summary: string }[];
}

/** Les 12 classes du SRD 5.1 (constantes mécaniques uniquement). */
export const CLASSES: ClassDef[] = [
  {
    id: 'barbarian', name: 'Barbare', hitDie: 12, primary: ['str'], saves: ['str', 'con'], caster: null,
    skillChoices: { count: 2, from: ['animal_handling', 'athletics', 'intimidation', 'nature', 'perception', 'survival'] },
    features: [
      { level: 1, name: 'Rage', summary: 'Action bonus : avantage aux tests de Force, bonus aux dégâts de mêlée, résistance aux dégâts contondants, perforants et tranchants.' },
      { level: 1, name: 'Défense sans armure', summary: 'Sans armure, CA = 10 + DEX + CON.' },
      { level: 2, name: 'Attaque téméraire', summary: 'Avantage à vos attaques de Force ce tour-ci, mais les attaques contre vous aussi.' },
      { level: 5, name: 'Attaque supplémentaire', summary: "Deux attaques lorsque vous effectuez l'action Attaquer." },
    ],
  },
  {
    id: 'bard', name: 'Barde', hitDie: 8, primary: ['cha'], saves: ['dex', 'cha'], caster: 'full', spellAbility: 'cha',
    skillChoices: { count: 3, from: 'any' },
    features: [
      { level: 1, name: 'Inspiration bardique', summary: 'Action bonus : un allié gagne un dé à ajouter à un jet.' },
      { level: 2, name: 'Touche-à-tout', summary: 'Moitié du bonus de maîtrise aux tests non maîtrisés.' },
    ],
  },
  {
    id: 'cleric', name: 'Clerc', hitDie: 8, primary: ['wis'], saves: ['wis', 'cha'], caster: 'full', spellAbility: 'wis',
    skillChoices: { count: 2, from: ['history', 'insight', 'medicine', 'persuasion', 'religion'] },
    features: [
      { level: 1, name: 'Domaine divin', summary: 'Votre divinité vous accorde des sorts et aptitudes de domaine.' },
      { level: 2, name: 'Conduit divin', summary: 'Canalisez une énergie divine, par exemple pour repousser les morts-vivants.' },
    ],
  },
  {
    id: 'druid', name: 'Druide', hitDie: 8, primary: ['wis'], saves: ['int', 'wis'], caster: 'full', spellAbility: 'wis',
    skillChoices: { count: 2, from: ['arcana', 'animal_handling', 'insight', 'medicine', 'nature', 'perception', 'religion', 'survival'] },
    features: [
      { level: 1, name: 'Druidique', summary: 'Vous connaissez la langue secrète des druides.' },
      { level: 2, name: 'Forme sauvage', summary: "Prenez l'apparence d'une bête déjà vue." },
    ],
  },
  {
    id: 'sorcerer', name: 'Ensorceleur', hitDie: 6, primary: ['cha'], saves: ['con', 'cha'], caster: 'full', spellAbility: 'cha',
    skillChoices: { count: 2, from: ['arcana', 'deception', 'insight', 'intimidation', 'persuasion', 'religion'] },
    features: [
      { level: 1, name: 'Origine magique', summary: 'Une source innée de magie façonne vos pouvoirs.' },
      { level: 2, name: 'Points de sorcellerie', summary: 'Convertissez points et emplacements de sorts.' },
    ],
  },
  {
    id: 'fighter', name: 'Guerrier', hitDie: 10, primary: ['str', 'dex'], saves: ['str', 'con'], caster: null,
    skillChoices: { count: 2, from: ['acrobatics', 'animal_handling', 'athletics', 'history', 'insight', 'intimidation', 'perception', 'survival'] },
    features: [
      { level: 1, name: 'Style de combat', summary: 'Une spécialité martiale (archerie, défense, duel…).' },
      { level: 1, name: 'Second souffle', summary: 'Action bonus : récupérez 1d10 + niveau PV, une fois par repos.' },
      { level: 2, name: 'Fougue', summary: 'Une action supplémentaire, une fois par repos.' },
      { level: 5, name: 'Attaque supplémentaire', summary: "Deux attaques lorsque vous effectuez l'action Attaquer." },
    ],
  },
  {
    id: 'wizard', name: 'Magicien', hitDie: 6, primary: ['int'], saves: ['int', 'wis'], caster: 'full', spellAbility: 'int',
    skillChoices: { count: 2, from: ['arcana', 'history', 'insight', 'investigation', 'medicine', 'religion'] },
    features: [
      { level: 1, name: 'Grimoire', summary: 'Vos sorts sont consignés dans un livre que vous enrichissez.' },
      { level: 1, name: 'Restauration arcanique', summary: "Récupérez des emplacements lors d'un repos court." },
    ],
  },
  {
    id: 'monk', name: 'Moine', hitDie: 8, primary: ['dex', 'wis'], saves: ['str', 'dex'], caster: null,
    skillChoices: { count: 2, from: ['acrobatics', 'athletics', 'history', 'insight', 'religion', 'stealth'] },
    features: [
      { level: 1, name: 'Défense sans armure', summary: 'Sans armure ni bouclier, CA = 10 + DEX + SAG.' },
      { level: 1, name: 'Arts martiaux', summary: 'Attaques à mains nues améliorées et action bonus de frappe.' },
      { level: 2, name: 'Ki', summary: 'Points de ki pour des déluges de coups, esquives et pas du vent.' },
    ],
  },
  {
    id: 'warlock', name: 'Occultiste', hitDie: 8, primary: ['cha'], saves: ['wis', 'cha'], caster: 'pact', spellAbility: 'cha',
    skillChoices: { count: 2, from: ['arcana', 'deception', 'history', 'intimidation', 'investigation', 'nature', 'religion'] },
    features: [
      { level: 1, name: 'Protecteur d’outre-monde', summary: 'Un pacte avec une entité puissante.' },
      { level: 1, name: 'Magie de pacte', summary: 'Peu d’emplacements, tous au plus haut niveau, récupérés au repos court.' },
    ],
  },
  {
    id: 'paladin', name: 'Paladin', hitDie: 10, primary: ['str', 'cha'], saves: ['wis', 'cha'], caster: 'half', spellAbility: 'cha',
    skillChoices: { count: 2, from: ['athletics', 'insight', 'intimidation', 'medicine', 'persuasion', 'religion'] },
    features: [
      { level: 1, name: 'Sens divin', summary: 'Détectez céleste, fiélon et mort-vivant proches.' },
      { level: 1, name: 'Imposition des mains', summary: 'Une réserve de soins égale à 5 × niveau.' },
      { level: 2, name: 'Châtiment divin', summary: 'Dépensez un emplacement pour ajouter des dégâts radiants.' },
    ],
  },
  {
    id: 'ranger', name: 'Rôdeur', hitDie: 10, primary: ['dex', 'wis'], saves: ['str', 'dex'], caster: 'half', spellAbility: 'wis',
    skillChoices: { count: 3, from: ['animal_handling', 'athletics', 'insight', 'investigation', 'nature', 'perception', 'stealth', 'survival'] },
    features: [
      { level: 1, name: 'Ennemi juré', summary: 'Avantage pour pister et se souvenir d’un type de créature choisi.' },
      { level: 1, name: 'Explorateur-né', summary: 'Un terrain de prédilection où vous ne vous perdez jamais.' },
      { level: 2, name: 'Style de combat', summary: 'Archerie, défense, duel ou combat à deux armes.' },
      { level: 5, name: 'Attaque supplémentaire', summary: "Deux attaques lorsque vous effectuez l'action Attaquer." },
    ],
  },
  {
    id: 'rogue', name: 'Roublard', hitDie: 8, primary: ['dex'], saves: ['dex', 'int'], caster: null,
    skillChoices: { count: 4, from: ['acrobatics', 'athletics', 'deception', 'insight', 'intimidation', 'investigation', 'perception', 'performance', 'persuasion', 'sleight_of_hand', 'stealth'] },
    features: [
      { level: 1, name: 'Expertise', summary: 'Doublez la maîtrise de deux compétences.' },
      { level: 1, name: 'Attaque sournoise', summary: 'Dégâts supplémentaires une fois par tour avec avantage ou un allié adjacent.' },
      { level: 2, name: 'Ruse', summary: 'Action bonus : Foncer, Se désengager ou Se cacher.' },
    ],
  },
];

export function getClass(idOrName: string): ClassDef | undefined {
  const k = idOrName.toLowerCase();
  return CLASSES.find((c) => c.id === k || c.name.toLowerCase() === k);
}
