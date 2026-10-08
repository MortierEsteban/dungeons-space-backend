import { z } from 'zod';
import { ABILITY_KEYS, type AbilityKey } from './abilities';
import { effectSchema, resourceDefSchema, type Effect, type ResourceDef } from './effects';
import { SKILL_KEYS, type SkillKey } from './skills';

/** full = lanceur complet, half = demi-lanceur (dès le niveau 2), third = tiers de lanceur (dès le niveau 3), pact = magie de pacte. */
export const CASTER_TYPES = ['full', 'half', 'third', 'pact'] as const;
export type CasterType = (typeof CASTER_TYPES)[number] | null;

export interface ClassFeature {
  level: number;
  name: string;
  summary: string;
  /** Passifs appliqués à la fiche (résistances, avantages, CA…). */
  effects?: Effect[];
}

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
  /** Aptitudes, résumées (mécaniques SRD 5.1, texte original). */
  features: ClassFeature[];
  /** Ressources à usages limités (rage, ki, conduit divin…). */
  resources?: ResourceDef[];
  /** Classe créée dans la Forge (homebrew). */
  homebrew?: boolean;
}

const ability = z.enum(ABILITY_KEYS);

/** Classe personnalisée (Forge) : même forme que les classes du SRD, validée. */
export const classDefSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(60),
  hitDie: z.number().int().min(4).max(20),
  primary: z.array(ability).max(3).default([]),
  saves: z.tuple([ability, ability]),
  caster: z.enum(CASTER_TYPES).nullable().default(null),
  spellAbility: ability.optional(),
  skillChoices: z.object({ count: z.number().int().min(0).max(8), from: z.union([z.array(z.enum(SKILL_KEYS as [SkillKey, ...SkillKey[]])), z.literal('any')]) }),
  features: z
    .array(z.object({ level: z.number().int().min(1).max(20), name: z.string().trim().min(1).max(80), summary: z.string().max(2000).default(''), effects: z.array(effectSchema).max(12).optional() }))
    .max(60)
    .default([]),
  resources: z.array(resourceDefSchema).max(12).optional(),
  homebrew: z.boolean().optional(),
});
export type ClassDefInput = z.input<typeof classDefSchema>;

const PHYS: Effect[] = ['contondant', 'perforant', 'tranchant'].map((damage) => ({ type: 'resistance', damage, when: 'Rage' }));

/** Les 12 classes du SRD 5.1 (constantes mécaniques uniquement). */
export const CLASSES: ClassDef[] = [
  {
    id: 'barbarian', name: 'Barbare', hitDie: 12, primary: ['str'], saves: ['str', 'con'], caster: null,
    skillChoices: { count: 2, from: ['animal_handling', 'athletics', 'intimidation', 'nature', 'perception', 'survival'] },
    resources: [{ id: 'rage', name: 'Rage', max: '1:2, 3:3, 6:4, 12:5, 17:6', recharge: 'long', fromLevel: 1, pool: false }],
    features: [
      {
        level: 1, name: 'Rage', summary: 'Action bonus : avantage aux tests et JS de Force, bonus aux dégâts de mêlée, résistance aux dégâts contondants, perforants et tranchants.',
        effects: [...PHYS, { type: 'advantage', roll: 'check', ability: 'str', when: 'Rage' }, { type: 'advantage', roll: 'save', ability: 'str', when: 'Rage' }],
      },
      { level: 1, name: 'Défense sans armure', summary: 'Sans armure, CA = 10 + DEX + CON (bouclier permis).', effects: [{ type: 'unarmored_ac', base: 10, abilities: ['dex', 'con'], shield: true }] },
      { level: 2, name: 'Attaque téméraire', summary: 'Avantage à vos attaques de Force ce tour-ci, mais les attaques contre vous aussi.' },
      { level: 2, name: 'Sens du danger', summary: 'Avantage aux JS de Dextérité contre les effets que vous voyez (pièges, sorts).', effects: [{ type: 'advantage', roll: 'save', ability: 'dex', against: 'contre les effets visibles' }] },
      { level: 5, name: 'Attaque supplémentaire', summary: "Deux attaques lorsque vous effectuez l'action Attaquer." },
      { level: 5, name: 'Déplacement rapide', summary: 'Vitesse +3 m sans armure lourde.', effects: [{ type: 'speed', bonus: 3 }] },
      { level: 7, name: 'Instinct sauvage', summary: "Avantage aux jets d'initiative.", effects: [{ type: 'advantage', roll: 'check', ability: 'dex', against: "à l'initiative" }] },
      { level: 9, name: 'Critique brutal', summary: 'Un dé de dégâts supplémentaire sur un coup critique au corps à corps.' },
    ],
  },
  {
    id: 'bard', name: 'Barde', hitDie: 8, primary: ['cha'], saves: ['dex', 'cha'], caster: 'full', spellAbility: 'cha',
    skillChoices: { count: 3, from: 'any' },
    resources: [{ id: 'bardic-inspiration', name: 'Inspiration bardique', max: 'max(1, cha)', recharge: 'long', fromLevel: 1, pool: false }],
    features: [
      { level: 1, name: 'Inspiration bardique', summary: 'Action bonus : un allié gagne un dé à ajouter à un jet (CHA fois par repos long).' },
      { level: 2, name: 'Touche-à-tout', summary: 'Moitié du bonus de maîtrise aux tests non maîtrisés.', effects: [{ type: 'jack_of_all_trades' }] },
      { level: 2, name: 'Chant reposant', summary: 'Vos alliés récupèrent 1d6 PV de plus lors d’un repos court.' },
      { level: 3, name: 'Expertise', summary: 'Doublez la maîtrise de deux compétences.' },
      { level: 5, name: 'Source d’inspiration', summary: 'L’inspiration bardique se récupère aussi au repos court.' },
    ],
  },
  {
    id: 'cleric', name: 'Clerc', hitDie: 8, primary: ['wis'], saves: ['wis', 'cha'], caster: 'full', spellAbility: 'wis',
    skillChoices: { count: 2, from: ['history', 'insight', 'medicine', 'persuasion', 'religion'] },
    resources: [{ id: 'channel-divinity', name: 'Conduit divin', max: '2:1, 6:2, 18:3', recharge: 'short', fromLevel: 2, pool: false }],
    features: [
      { level: 1, name: 'Domaine divin', summary: 'Votre divinité vous accorde des sorts et aptitudes de domaine.' },
      { level: 2, name: 'Conduit divin', summary: 'Canalisez une énergie divine, par exemple pour repousser les morts-vivants.' },
      { level: 5, name: 'Destruction des morts-vivants', summary: 'Les morts-vivants faibles repoussés sont détruits.' },
    ],
  },
  {
    id: 'druid', name: 'Druide', hitDie: 8, primary: ['wis'], saves: ['int', 'wis'], caster: 'full', spellAbility: 'wis',
    skillChoices: { count: 2, from: ['arcana', 'animal_handling', 'insight', 'medicine', 'nature', 'perception', 'religion', 'survival'] },
    resources: [{ id: 'wild-shape', name: 'Forme sauvage', max: '2', recharge: 'short', fromLevel: 2, pool: false }],
    features: [
      { level: 1, name: 'Druidique', summary: 'Vous connaissez la langue secrète des druides.' },
      { level: 2, name: 'Forme sauvage', summary: "Prenez l'apparence d'une bête déjà vue, deux fois par repos court." },
    ],
  },
  {
    id: 'sorcerer', name: 'Ensorceleur', hitDie: 6, primary: ['cha'], saves: ['con', 'cha'], caster: 'full', spellAbility: 'cha',
    skillChoices: { count: 2, from: ['arcana', 'deception', 'insight', 'intimidation', 'persuasion', 'religion'] },
    resources: [{ id: 'sorcery-points', name: 'Points de sorcellerie', max: 'level', recharge: 'long', fromLevel: 2, pool: true }],
    features: [
      { level: 1, name: 'Origine magique', summary: 'Une source innée de magie façonne vos pouvoirs.' },
      { level: 2, name: 'Points de sorcellerie', summary: 'Convertissez points et emplacements de sorts.' },
      { level: 3, name: 'Métamagie', summary: 'Modelez vos sorts avec vos points de sorcellerie.' },
    ],
  },
  {
    id: 'fighter', name: 'Guerrier', hitDie: 10, primary: ['str', 'dex'], saves: ['str', 'con'], caster: null,
    skillChoices: { count: 2, from: ['acrobatics', 'animal_handling', 'athletics', 'history', 'insight', 'intimidation', 'perception', 'survival'] },
    resources: [
      { id: 'second-wind', name: 'Second souffle', max: '1', recharge: 'short', fromLevel: 1, pool: false },
      { id: 'action-surge', name: 'Fougue', max: '2:1, 17:2', recharge: 'short', fromLevel: 2, pool: false },
      { id: 'indomitable', name: 'Inflexible', max: '9:1, 13:2, 17:3', recharge: 'long', fromLevel: 9, pool: false },
    ],
    features: [
      { level: 1, name: 'Style de combat', summary: 'Une spécialité martiale (archerie, défense, duel…).' },
      { level: 1, name: 'Second souffle', summary: 'Action bonus : récupérez 1d10 + niveau PV, une fois par repos.' },
      { level: 2, name: 'Fougue', summary: 'Une action supplémentaire, une fois par repos.' },
      { level: 5, name: 'Attaque supplémentaire', summary: "Deux attaques lorsque vous effectuez l'action Attaquer." },
      { level: 9, name: 'Inflexible', summary: 'Relancez un jet de sauvegarde raté.' },
    ],
  },
  {
    id: 'wizard', name: 'Magicien', hitDie: 6, primary: ['int'], saves: ['int', 'wis'], caster: 'full', spellAbility: 'int',
    skillChoices: { count: 2, from: ['arcana', 'history', 'insight', 'investigation', 'medicine', 'religion'] },
    resources: [{ id: 'arcane-recovery', name: 'Restauration arcanique', max: '1', recharge: 'long', fromLevel: 1, pool: false }],
    features: [
      { level: 1, name: 'Grimoire', summary: 'Vos sorts sont consignés dans un livre que vous enrichissez.' },
      { level: 1, name: 'Restauration arcanique', summary: "Récupérez des emplacements lors d'un repos court, une fois par jour." },
    ],
  },
  {
    id: 'monk', name: 'Moine', hitDie: 8, primary: ['dex', 'wis'], saves: ['str', 'dex'], caster: null,
    skillChoices: { count: 2, from: ['acrobatics', 'athletics', 'history', 'insight', 'religion', 'stealth'] },
    resources: [{ id: 'ki', name: 'Ki', max: 'level', recharge: 'short', fromLevel: 2, pool: true }],
    features: [
      { level: 1, name: 'Défense sans armure', summary: 'Sans armure ni bouclier, CA = 10 + DEX + SAG.', effects: [{ type: 'unarmored_ac', base: 10, abilities: ['dex', 'wis'], shield: false }] },
      { level: 1, name: 'Arts martiaux', summary: 'Attaques à mains nues améliorées et action bonus de frappe.' },
      { level: 2, name: 'Ki', summary: 'Points de ki pour des déluges de coups, esquives et pas du vent.' },
      { level: 2, name: 'Déplacement sans armure', summary: 'Vitesse +3 m sans armure ni bouclier.', effects: [{ type: 'speed', bonus: 3 }] },
      { level: 6, name: 'Déplacement sans armure amélioré', summary: 'Vitesse +1,5 m supplémentaire.', effects: [{ type: 'speed', bonus: 1.5 }] },
      { level: 7, name: 'Dérobade', summary: 'Aucun dégât sur un JS de Dextérité réussi, moitié sur un échec.' },
      { level: 10, name: 'Pureté du corps', summary: 'Immunité aux maladies et au poison.', effects: [{ type: 'immunity', damage: 'poison' }, { type: 'condition_immunity', condition: 'Empoisonné' }] },
      { level: 10, name: 'Déplacement sans armure supérieur', summary: 'Vitesse +1,5 m supplémentaire.', effects: [{ type: 'speed', bonus: 1.5 }] },
    ],
  },
  {
    id: 'warlock', name: 'Occultiste', hitDie: 8, primary: ['cha'], saves: ['wis', 'cha'], caster: 'pact', spellAbility: 'cha',
    skillChoices: { count: 2, from: ['arcana', 'deception', 'history', 'intimidation', 'investigation', 'nature', 'religion'] },
    features: [
      { level: 1, name: 'Protecteur d’outre-monde', summary: 'Un pacte avec une entité puissante.' },
      { level: 1, name: 'Magie de pacte', summary: 'Peu d’emplacements, tous au plus haut niveau, récupérés au repos court.' },
      { level: 2, name: 'Manifestations occultes', summary: 'Des secrets interdits qui modifient vos pouvoirs.' },
    ],
  },
  {
    id: 'paladin', name: 'Paladin', hitDie: 10, primary: ['str', 'cha'], saves: ['wis', 'cha'], caster: 'half', spellAbility: 'cha',
    skillChoices: { count: 2, from: ['athletics', 'insight', 'intimidation', 'medicine', 'persuasion', 'religion'] },
    resources: [
      { id: 'divine-sense', name: 'Sens divin', max: '1 + max(0, cha)', recharge: 'long', fromLevel: 1, pool: false },
      { id: 'lay-on-hands', name: 'Imposition des mains', max: '5 * level', recharge: 'long', fromLevel: 1, pool: true },
      { id: 'channel-divinity', name: 'Conduit divin', max: '1', recharge: 'short', fromLevel: 3, pool: false },
    ],
    features: [
      { level: 1, name: 'Sens divin', summary: 'Détectez céleste, fiélon et mort-vivant proches.' },
      { level: 1, name: 'Imposition des mains', summary: 'Une réserve de soins égale à 5 × niveau.' },
      { level: 2, name: 'Châtiment divin', summary: 'Dépensez un emplacement pour ajouter des dégâts radiants.' },
      { level: 3, name: 'Santé divine', summary: 'Immunité aux maladies.', effects: [{ type: 'condition_immunity', condition: 'Maladie' }] },
      { level: 5, name: 'Attaque supplémentaire', summary: "Deux attaques lorsque vous effectuez l'action Attaquer." },
      { level: 6, name: 'Aura de protection', summary: 'Vous et vos alliés à 3 m ajoutez votre modificateur de CHA aux jets de sauvegarde.' },
    ],
  },
  {
    id: 'ranger', name: 'Rôdeur', hitDie: 10, primary: ['dex', 'wis'], saves: ['str', 'dex'], caster: 'half', spellAbility: 'wis',
    skillChoices: { count: 3, from: ['animal_handling', 'athletics', 'insight', 'investigation', 'nature', 'perception', 'stealth', 'survival'] },
    features: [
      { level: 1, name: 'Ennemi juré', summary: 'Avantage pour pister et se souvenir d’un type de créature choisi.', effects: [{ type: 'advantage', roll: 'skill', skill: 'survival', against: 'pour pister un ennemi juré' }] },
      { level: 1, name: 'Explorateur-né', summary: 'Un terrain de prédilection où vous ne vous perdez jamais.' },
      { level: 2, name: 'Style de combat', summary: 'Archerie, défense, duel ou combat à deux armes.' },
      { level: 5, name: 'Attaque supplémentaire', summary: "Deux attaques lorsque vous effectuez l'action Attaquer." },
      { level: 8, name: 'Foulée tout-terrain', summary: 'Le terrain difficile non magique ne vous ralentit pas.' },
    ],
  },
  {
    id: 'rogue', name: 'Roublard', hitDie: 8, primary: ['dex'], saves: ['dex', 'int'], caster: null,
    skillChoices: { count: 4, from: ['acrobatics', 'athletics', 'deception', 'insight', 'intimidation', 'investigation', 'perception', 'performance', 'persuasion', 'sleight_of_hand', 'stealth'] },
    features: [
      { level: 1, name: 'Expertise', summary: 'Doublez la maîtrise de deux compétences.' },
      { level: 1, name: 'Attaque sournoise', summary: 'Dégâts supplémentaires une fois par tour avec avantage ou un allié adjacent.' },
      { level: 2, name: 'Ruse', summary: 'Action bonus : Foncer, Se désengager ou Se cacher.' },
      { level: 5, name: 'Esquive instinctive', summary: 'Réaction : divisez par deux les dégâts d’une attaque.' },
      { level: 7, name: 'Dérobade', summary: 'Aucun dégât sur un JS de Dextérité réussi, moitié sur un échec.' },
    ],
  },
];

export function getClass(idOrName: string): ClassDef | undefined {
  const k = idOrName.toLowerCase();
  return CLASSES.find((c) => c.id === k || c.name.toLowerCase() === k);
}
