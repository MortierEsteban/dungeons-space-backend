import { pick, type Rng } from '../rng';
import { ITEMS } from './content/items';
import type { Rarity } from './sheet';

export interface GeneratedNpc {
  name: string;
  species: string;
  job: string;
  trait: string;
  goal: string;
  secret: string;
}

const FIRST = ['Aldric', 'Sélène', 'Fendrel', 'Oriane', 'Garrick', 'Ysolde', 'Thibaud', 'Nyx', 'Maëlis', 'Corwin', 'Isaure', 'Bran', 'Lyssa', 'Odo'];
const LAST = ['Brumefer', 'Corbeval', 'des Saules', 'Pierrelune', 'Noirchêne', 'Ventegris', 'Cendrebois', 'Hautetour', 'Mirevent'];
const SPECIES = ['Humain', 'Elfe', 'Naine', 'Gnome', 'Tieffeline', 'Halfelin', 'Demi-orc', 'Drakéide'];
const JOBS = ['Aubergiste', 'Cartographe', 'Prêtre déchu', 'Contrebandière', 'Herboriste', 'Capitaine de la garde', 'Forgeronne', 'Ménestrel', 'Usurier', 'Fossoyeur'];
const TRAITS = ['Ne regarde jamais personne dans les yeux.', 'Collectionne les dents de dragon.', 'Rit avant chaque mauvaise nouvelle.', 'Cite des proverbes inventés.', 'Parle à ses outils comme à des enfants.', 'Compte tout à voix basse.'];
const GOALS = ['Racheter une faute ancienne.', "Devenir riche avant l'hiver.", 'Protéger sa fille à tout prix.', 'Retrouver un frère disparu.', 'Venger son ancien maître.', 'Quitter la cité sans être suivi.'];
const SECRETS = ["Est l'informateur de la guilde des voleurs.", 'Porte une malédiction lycanthrope.', "Connaît l'entrée secrète de la crypte.", 'Est en réalité un métamorphe.', 'A vendu ses compagnons pour sauver sa peau.', 'Doit une fortune à une liche.'];

export function generateNpc(rng: Rng): GeneratedNpc {
  return {
    name: `${pick(rng, FIRST)} ${pick(rng, LAST)}`,
    species: pick(rng, SPECIES),
    job: pick(rng, JOBS),
    trait: pick(rng, TRAITS),
    goal: pick(rng, GOALS),
    secret: pick(rng, SECRETS),
  };
}

export const LOOT_TIERS = ['1–4', '5–10', '11–16', '17+'] as const;
export type LootTier = (typeof LOOT_TIERS)[number];

const TIER_RARITIES: Record<LootTier, Rarity[]> = {
  '1–4': ['Commun', 'Commun', 'Peu commun'],
  '5–10': ['Commun', 'Peu commun', 'Peu commun', 'Rare'],
  '11–16': ['Peu commun', 'Rare', 'Rare', 'Très rare'],
  '17+': ['Rare', 'Très rare', 'Légendaire', 'Légendaire'],
};
const TIER_GOLD: Record<LootTier, number> = { '1–4': 10, '5–10': 80, '11–16': 600, '17+': 4000 };

export interface GeneratedLoot {
  gold: number;
  items: { id: string; name: string; rarity: Rarity }[];
}

/** Trésor aléatoire : or + 2 à 3 objets du compendium dont la rareté dépend du palier. */
export function generateLoot(tier: LootTier, rng: Rng): GeneratedLoot {
  const count = rng.next() < 0.5 ? 2 : 3;
  const items = Array.from({ length: count }, () => {
    const rarity = pick(rng, TIER_RARITIES[tier]);
    const pool = ITEMS.filter((i) => i.rarity === rarity && i.price > 0);
    const chosen = pick(rng, pool.length ? pool : ITEMS);
    return { id: chosen.id, name: chosen.name, rarity: chosen.rarity };
  });
  const mult = TIER_GOLD[tier];
  return { gold: rng.die(6) * mult + rng.die(mult), items };
}
