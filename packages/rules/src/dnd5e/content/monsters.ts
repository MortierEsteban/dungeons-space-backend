import { SRD_PROVENANCE, type MonsterAttack, type MonsterEntry } from './types';

export const XP_BY_CR: Record<string, number> = {
  '0': 10, '1/8': 25, '1/4': 50, '1/2': 100, '1': 200, '2': 450, '3': 700, '4': 1100, '5': 1800, '6': 2300,
  '7': 2900, '8': 3900, '9': 5000, '10': 5900, '11': 7200, '12': 8400, '13': 10000, '14': 11500, '15': 13000,
  '16': 15000, '17': 18000, '18': 20000, '19': 22000, '20': 25000, '21': 33000,
};

export function crToNumber(cr: string): number {
  if (cr.includes('/')) {
    const [a, b] = cr.split('/').map(Number);
    return (a ?? 0) / (b ?? 1);
  }
  return Number(cr);
}

const atk = (name: string, bonus: number, damage: string, damageType: string, reach = 'allonge 1,5 m'): MonsterAttack => ({ name, bonus, damage, damageType, reach });

type M = Omit<MonsterEntry, 'kind' | 'provenance' | 'xp' | 'abilities' | 'traits'> & { stats: [number, number, number, number, number, number]; traits?: string[] };

const monster = ({ stats, traits, ...m }: M): MonsterEntry => ({
  kind: 'monster',
  ...m,
  xp: XP_BY_CR[m.cr] ?? 0,
  abilities: { str: stats[0], dex: stats[1], con: stats[2], int: stats[3], wis: stats[4], cha: stats[5] },
  traits: traits ?? [],
  provenance: SRD_PROVENANCE,
});

/** Bestiaire du SRD 5.1 (statistiques du SRD, descriptions originales). */
export const MONSTERS: MonsterEntry[] = [
  monster({ id: 'giant-rat', name: 'Rat géant', type: 'Bête', size: 'P', cr: '1/8', ac: 12, hp: 7, hpDice: '2d6', speed: 9, stats: [7, 15, 11, 2, 10, 4], attacks: [atk('Morsure', 4, '1d4+2', 'perforant')], traits: ['Tactique de groupe'], summary: 'Vermine énorme et affamée qui grouille dans les égouts.' }),
  monster({ id: 'kobold', name: 'Kobold', type: 'Humanoïde', size: 'P', cr: '1/8', ac: 12, hp: 5, hpDice: '2d6-2', speed: 9, stats: [7, 15, 9, 8, 7, 8], attacks: [atk('Dague', 4, '1d4+2', 'perforant')], traits: ['Sensibilité au soleil', 'Tactique de groupe'], summary: 'Petit reptilien couard, redoutable en nombre et dans ses tunnels piégés.' }),
  monster({ id: 'bandit', name: 'Bandit', type: 'Humanoïde', size: 'M', cr: '1/8', ac: 12, hp: 11, hpDice: '2d8+2', speed: 9, stats: [11, 12, 12, 10, 10, 10], attacks: [atk('Cimeterre', 3, '1d6+1', 'tranchant')], summary: 'Détrousseur de grand chemin, plus courageux en bande que seul.' }),
  monster({ id: 'goblin', name: 'Gobelin', type: 'Humanoïde', size: 'P', cr: '1/4', ac: 15, hp: 7, hpDice: '2d6', speed: 9, stats: [8, 14, 10, 10, 8, 8], attacks: [atk('Cimeterre', 4, '1d6+2', 'tranchant'), atk('Arc court', 4, '1d6+2', 'perforant', 'portée 24/96 m')], traits: ['Fuite agile'], summary: "Petit humanoïde rusé qui attaque en meute et se replie dans l'ombre dès que le combat tourne mal." }),
  monster({ id: 'skeleton', name: 'Squelette', type: 'Mort-vivant', size: 'M', cr: '1/4', ac: 13, hp: 13, hpDice: '2d8+4', speed: 9, stats: [10, 14, 15, 6, 8, 5], attacks: [atk('Épée courte', 4, '1d6+2', 'perforant')], traits: ['Vulnérable aux dégâts contondants'], summary: 'Ossements animés par une magie nécromantique, obéissant sans relâche.' }),
  monster({ id: 'zombie', name: 'Zombi', type: 'Mort-vivant', size: 'M', cr: '1/4', ac: 8, hp: 22, hpDice: '3d8+9', speed: 6, stats: [13, 6, 16, 3, 6, 5], attacks: [atk('Coup', 3, '1d6+1', 'contondant')], traits: ['Robustesse de mort-vivant'], summary: 'Cadavre lent et obstiné qui se relève parfois quand on le croit vaincu.' }),
  monster({ id: 'wolf', name: 'Loup', type: 'Bête', size: 'M', cr: '1/4', ac: 13, hp: 11, hpDice: '2d8+2', speed: 12, stats: [12, 15, 12, 3, 12, 6], attacks: [atk('Morsure', 4, '2d4+2', 'perforant')], traits: ['Tactique de groupe', 'Odorat aiguisé'], summary: 'Chasseur en meute qui renverse ses proies.' }),
  monster({ id: 'orc', name: 'Orc', type: 'Humanoïde', size: 'M', cr: '1/2', ac: 13, hp: 15, hpDice: '2d8+6', speed: 9, stats: [16, 12, 16, 7, 11, 10], attacks: [atk('Hache à deux mains', 5, '1d12+3', 'tranchant')], traits: ['Agressif'], summary: 'Pillard brutal qui fond sur ses ennemis sans attendre.' }),
  monster({ id: 'hobgoblin', name: 'Hobgobelin', type: 'Humanoïde', size: 'M', cr: '1/2', ac: 18, hp: 11, hpDice: '2d8+2', speed: 9, stats: [13, 12, 12, 10, 10, 9], attacks: [atk('Épée longue', 3, '1d8+1', 'tranchant')], traits: ['Avantage martial'], summary: 'Soldat discipliné, membre de légions bien organisées.' }),
  monster({ id: 'gnoll', name: 'Gnoll', type: 'Humanoïde', size: 'M', cr: '1/2', ac: 15, hp: 22, hpDice: '5d8', speed: 9, stats: [14, 12, 11, 6, 10, 7], attacks: [atk('Lance', 4, '1d6+2', 'perforant')], traits: ['Déchaînement'], summary: 'Charognard à tête de hyène, insatiable et cruel.' }),
  monster({ id: 'ghoul', name: 'Goule', type: 'Mort-vivant', size: 'M', cr: '1', ac: 12, hp: 22, hpDice: '5d8', speed: 9, stats: [13, 15, 10, 7, 10, 6], attacks: [atk('Griffes', 4, '2d4+2', 'tranchant')], traits: ['Griffes paralysantes'], summary: 'Dévoreur de cadavres dont les griffes paralysent les vivants.' }),
  monster({ id: 'giant-spider', name: 'Araignée géante', type: 'Bête', size: 'G', cr: '1', ac: 14, hp: 26, hpDice: '4d10+4', speed: 9, stats: [14, 16, 12, 2, 11, 4], attacks: [atk('Morsure', 5, '1d8+3', 'perforant')], traits: ['Pattes d’araignée', 'Toile'], summary: 'Tisse ses pièges entre les arbres et injecte un venin puissant.' }),
  monster({ id: 'dire-wolf', name: 'Loup sanguinaire', type: 'Bête', size: 'G', cr: '1', ac: 14, hp: 37, hpDice: '5d10+10', speed: 15, stats: [17, 15, 15, 3, 12, 7], attacks: [atk('Morsure', 5, '2d6+3', 'perforant')], traits: ['Tactique de groupe'], summary: 'Loup massif, monture favorite de certains gobelins.' }),
  monster({ id: 'ogre', name: 'Ogre', type: 'Géant', size: 'G', cr: '2', ac: 11, hp: 59, hpDice: '7d10+21', speed: 12, stats: [19, 8, 16, 5, 7, 7], attacks: [atk('Massue', 6, '2d8+4', 'contondant')], summary: 'Brute affamée et paresseuse, aussi forte que stupide.' }),
  monster({ id: 'gargoyle', name: 'Gargouille', type: 'Élémentaire', size: 'M', cr: '2', ac: 15, hp: 52, hpDice: '7d8+21', speed: 9, stats: [15, 11, 16, 6, 11, 7], attacks: [atk('Griffes', 4, '1d6+2', 'tranchant')], traits: ['Apparence trompeuse'], summary: 'Statue de pierre vivante qui guette immobile sur les corniches.' }),
  monster({ id: 'mimic', name: 'Mimique', type: 'Monstruosité', size: 'M', cr: '2', ac: 12, hp: 58, hpDice: '9d8+18', speed: 4.5, stats: [17, 12, 15, 5, 13, 8], attacks: [atk('Pseudopode', 5, '1d8+3', 'contondant')], traits: ['Métamorphe', 'Adhésif'], summary: 'Prend l’apparence d’un coffre ou d’une porte pour piéger les imprudents.' }),
  monster({ id: 'owlbear', name: 'Hibours', type: 'Monstruosité', size: 'G', cr: '3', ac: 13, hp: 59, hpDice: '7d10+21', speed: 12, stats: [20, 12, 17, 3, 12, 7], attacks: [atk('Bec', 7, '1d10+5', 'perforant'), atk('Griffes', 7, '2d8+5', 'tranchant')], traits: ['Vue et odorat aiguisés'], summary: 'Prédateur mi-ours mi-hibou, au cri perçant, qui règne sur les sous-bois profonds.' }),
  monster({ id: 'basilisk', name: 'Basilic', type: 'Monstruosité', size: 'M', cr: '3', ac: 15, hp: 52, hpDice: '8d8+16', speed: 6, stats: [16, 8, 15, 2, 8, 7], attacks: [atk('Morsure', 5, '2d6+3', 'perforant')], traits: ['Regard pétrifiant'], summary: 'Reptile à huit pattes dont le regard change la chair en pierre.' }),
  monster({ id: 'wight', name: 'Nécrophage', type: 'Mort-vivant', size: 'M', cr: '3', ac: 14, hp: 45, hpDice: '6d8+18', speed: 9, stats: [15, 14, 16, 10, 13, 15], attacks: [atk('Épée longue', 4, '1d8+2', 'tranchant'), atk('Drain de vie', 4, '1d6+2', 'nécrotique')], traits: ['Sensibilité au soleil'], summary: 'Mort-vivant intelligent, avide de la force vitale des vivants.' }),
  monster({ id: 'troll', name: 'Troll', type: 'Géant', size: 'G', cr: '5', ac: 15, hp: 84, hpDice: '8d10+40', speed: 9, stats: [18, 13, 20, 7, 9, 7], attacks: [atk('Morsure', 7, '1d6+4', 'perforant'), atk('Griffes', 7, '2d6+4', 'tranchant')], traits: ['Régénération (sauf feu ou acide)'], summary: 'Géant décharné qui se régénère tant que le feu ne l’a pas touché.' }),
  monster({ id: 'flesh-golem', name: 'Golem de chair', type: 'Créature artificielle', size: 'M', cr: '5', ac: 9, hp: 93, hpDice: '11d8+44', speed: 9, stats: [19, 9, 18, 6, 10, 5], attacks: [atk('Coup', 7, '2d8+4', 'contondant')], traits: ['Absorption de la foudre', 'Aversion du feu'], summary: 'Assemblage de cadavres animé par la foudre.' }),
  monster({ id: 'young-red-dragon', name: 'Jeune dragon rouge', type: 'Dragon', size: 'G', cr: '10', ac: 18, hp: 178, hpDice: '17d10+85', speed: 12, stats: [23, 10, 21, 14, 11, 19], attacks: [atk('Morsure', 10, '2d10+6', 'perforant', 'allonge 3 m'), atk('Griffes', 10, '2d6+6', 'tranchant')], traits: ['Souffle de feu (cône 9 m, 16d6)', 'Immunité au feu'], summary: 'Orgueilleux et cupide, il fait de son antre volcanique un sanctuaire à sa propre gloire.' }),
  monster({ id: 'lich', name: 'Liche', type: 'Mort-vivant', size: 'M', cr: '21', ac: 17, hp: 135, hpDice: '18d8+54', speed: 9, stats: [11, 16, 16, 20, 14, 16], attacks: [atk('Contact paralysant', 12, '3d6', 'froid')], traits: ['Résistance légendaire (3/jour)', 'Rajeunissement', 'Incantation de niveau 18'], summary: 'Un mage ayant scellé son âme dans un phylactère pour échapper à la mort.' }),
];
