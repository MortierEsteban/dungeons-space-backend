import { SRD_PROVENANCE, type ItemEntry } from './types';

type I = Omit<ItemEntry, 'kind' | 'provenance'>;
const item = (i: I): ItemEntry => ({ kind: 'item', provenance: SRD_PROVENANCE, ...i });

/** Équipement et objets magiques du SRD 5.1 (poids convertis en kg). */
export const ITEMS: ItemEntry[] = [
  // Armes
  item({ id: 'dagger', name: 'Dague', category: 'Arme', rarity: 'Commun', weight: 0.5, price: 2, damage: '1d4', damageType: 'perforant', properties: ['Finesse', 'Légère', 'Lancer (6/18 m)'], summary: 'Lame courte, facile à dissimuler et à lancer.' }),
  item({ id: 'shortsword', name: 'Épée courte', category: 'Arme', rarity: 'Commun', weight: 1, price: 10, damage: '1d6', damageType: 'perforant', properties: ['Finesse', 'Légère'], summary: 'Arme de prédilection des combattants agiles.' }),
  item({ id: 'longsword', name: 'Épée longue', category: 'Arme', rarity: 'Commun', weight: 1.5, price: 15, damage: '1d8', damageType: 'tranchant', properties: ['Polyvalente (1d10)'], summary: 'La lame classique du chevalier.' }),
  item({ id: 'rapier', name: 'Rapière', category: 'Arme', rarity: 'Commun', weight: 1, price: 25, damage: '1d8', damageType: 'perforant', properties: ['Finesse'], summary: 'Lame fine et précise des duellistes.' }),
  item({ id: 'scimitar', name: 'Cimeterre', category: 'Arme', rarity: 'Commun', weight: 1.5, price: 25, damage: '1d6', damageType: 'tranchant', properties: ['Finesse', 'Légère'], summary: 'Lame courbe, rapide et tranchante.' }),
  item({ id: 'battleaxe', name: "Hache d'armes", category: 'Arme', rarity: 'Commun', weight: 2, price: 10, damage: '1d8', damageType: 'tranchant', properties: ['Polyvalente (1d10)'], summary: 'Hache de guerre équilibrée.' }),
  item({ id: 'greataxe', name: 'Hache à deux mains', category: 'Arme', rarity: 'Commun', weight: 3.5, price: 30, damage: '1d12', damageType: 'tranchant', properties: ['Lourde', 'À deux mains'], summary: 'Énorme hache qui fend armures et boucliers.' }),
  item({ id: 'warhammer', name: 'Marteau de guerre', category: 'Arme', rarity: 'Commun', weight: 1, price: 15, damage: '1d8', damageType: 'contondant', properties: ['Polyvalente (1d10)'], summary: 'Marteau conçu pour broyer les armures.' }),
  item({ id: 'mace', name: "Masse d'armes", category: 'Arme', rarity: 'Commun', weight: 2, price: 5, damage: '1d6', damageType: 'contondant', summary: 'Arme simple et robuste, appréciée des clercs.' }),
  item({ id: 'quarterstaff', name: 'Bâton', category: 'Arme', rarity: 'Commun', weight: 2, price: 0.2, damage: '1d6', damageType: 'contondant', properties: ['Polyvalente (1d8)'], summary: 'Long bâton de voyage.' }),
  item({ id: 'spear', name: 'Lance', category: 'Arme', rarity: 'Commun', weight: 1.5, price: 1, damage: '1d6', damageType: 'perforant', properties: ['Lancer (6/18 m)', 'Polyvalente (1d8)'], summary: 'Hampe terminée par une pointe de fer.' }),
  item({ id: 'shortbow', name: 'Arc court', category: 'Arme', rarity: 'Commun', weight: 1, price: 25, damage: '1d6', damageType: 'perforant', properties: ['Munitions (24/96 m)', 'À deux mains'], summary: 'Arc léger et maniable.' }),
  item({ id: 'longbow', name: 'Arc long', category: 'Arme', rarity: 'Commun', weight: 1, price: 50, damage: '1d8', damageType: 'perforant', properties: ['Munitions (45/180 m)', 'Lourde', 'À deux mains'], summary: 'Arc de grande portée.' }),
  item({ id: 'light-crossbow', name: 'Arbalète légère', category: 'Arme', rarity: 'Commun', weight: 2.5, price: 25, damage: '1d8', damageType: 'perforant', properties: ['Munitions (24/96 m)', 'Chargement', 'À deux mains'], summary: 'Arme à carreaux simple d’emploi.' }),
  // Armures
  item({ id: 'leather', name: 'Armure de cuir', category: 'Armure', rarity: 'Commun', weight: 5, price: 10, armorClass: '11 + DEX', summary: 'Armure légère de cuir bouilli.' }),
  item({ id: 'studded-leather', name: 'Armure de cuir clouté', category: 'Armure', rarity: 'Commun', weight: 6.5, price: 45, armorClass: '12 + DEX', summary: 'Cuir renforcé de rivets.' }),
  item({ id: 'chain-shirt', name: 'Chemise de mailles', category: 'Armure', rarity: 'Commun', weight: 10, price: 50, armorClass: '13 + DEX (max 2)', summary: 'Mailles portées sous les vêtements.' }),
  item({ id: 'breastplate', name: 'Cuirasse', category: 'Armure', rarity: 'Commun', weight: 10, price: 400, armorClass: '14 + DEX (max 2)', summary: 'Plastron de métal ajusté.' }),
  item({ id: 'chain-mail', name: 'Cotte de mailles', category: 'Armure', rarity: 'Commun', weight: 27.5, price: 75, armorClass: '16', properties: ['FOR 13', 'Désavantage en Discrétion'], summary: 'Armure lourde de mailles.' }),
  item({ id: 'plate', name: 'Harnois', category: 'Armure', rarity: 'Commun', weight: 32.5, price: 1500, armorClass: '18', properties: ['FOR 15', 'Désavantage en Discrétion'], summary: 'Armure complète de plaques.' }),
  item({ id: 'shield-armor', name: 'Bouclier', category: 'Armure', rarity: 'Commun', weight: 3, price: 10, armorClass: '+2', summary: 'Bouclier de bois ou de métal.' }),
  // Équipement
  item({ id: 'rope', name: 'Corde de chanvre (15 m)', category: 'Équipement', rarity: 'Commun', weight: 5, price: 1, summary: 'Robuste corde d’aventurier.' }),
  item({ id: 'rations', name: 'Rations (1 jour)', category: 'Équipement', rarity: 'Commun', weight: 1, price: 0.5, summary: 'Nourriture séchée pour une journée.' }),
  item({ id: 'torch', name: 'Torche', category: 'Équipement', rarity: 'Commun', weight: 0.5, price: 0.01, summary: 'Brûle une heure, lumière vive sur 6 m.' }),
  item({ id: 'backpack', name: 'Sac à dos', category: 'Équipement', rarity: 'Commun', weight: 2.5, price: 2, summary: 'Contient jusqu’à 15 kg d’équipement.' }),
  item({ id: 'healers-kit', name: 'Trousse de soins', category: 'Équipement', rarity: 'Commun', weight: 1.5, price: 5, summary: 'Stabilise une créature à 0 PV sans test (10 utilisations).' }),
  item({ id: 'thieves-tools', name: 'Outils de voleur', category: 'Équipement', rarity: 'Commun', weight: 0.5, price: 25, summary: 'Crochets et limes pour serrures et pièges.' }),
  item({ id: 'arrows', name: 'Flèches (20)', category: 'Équipement', rarity: 'Commun', weight: 0.5, price: 1, summary: 'Munitions pour arc.' }),
  // Potions
  item({ id: 'potion-healing', name: 'Potion de soins', category: 'Potion', rarity: 'Commun', weight: 0.25, price: 50, roll: '2d4+2', summary: 'Un liquide rouge qui scintille ; rend 2d4 + 2 PV.' }),
  item({ id: 'potion-greater-healing', name: 'Potion de soins supérieurs', category: 'Potion', rarity: 'Peu commun', weight: 0.25, price: 150, roll: '4d4+4', summary: 'Rend 4d4 + 4 PV.' }),
  item({ id: 'potion-climbing', name: "Potion d'escalade", category: 'Potion', rarity: 'Commun', weight: 0.25, price: 75, summary: 'Vitesse d’escalade égale à la vitesse pendant 1 heure.' }),
  // Objets magiques
  item({ id: 'weapon-plus-1', name: 'Épée longue +1', category: 'Arme', rarity: 'Peu commun', weight: 1.5, price: 1000, damage: '1d8+1', damageType: 'tranchant', properties: ['Polyvalente (1d10)', 'Magique'], summary: 'Une lame runique : +1 aux jets d’attaque et de dégâts.' }),
  item({ id: 'bag-of-holding', name: 'Sac sans fond', category: 'Objet merveilleux', rarity: 'Peu commun', weight: 7.5, price: 500, summary: 'Bien plus vaste à l’intérieur qu’à l’extérieur : 250 kg de capacité.' }),
  item({ id: 'cloak-of-elvenkind', name: 'Cape elfique', category: 'Objet merveilleux', rarity: 'Peu commun', weight: 0.5, price: 500, requiresAttunement: true, summary: 'Capuche relevée, avantage en Discrétion ; on vous perçoit difficilement.' }),
  item({ id: 'boots-of-elvenkind', name: 'Bottes elfiques', category: 'Objet merveilleux', rarity: 'Peu commun', weight: 0.5, price: 500, summary: 'Vos pas ne font aucun bruit.' }),
  item({ id: 'ring-of-protection', name: 'Anneau de protection', category: 'Objet merveilleux', rarity: 'Rare', weight: 0, price: 3500, requiresAttunement: true, summary: '+1 à la CA et aux jets de sauvegarde.' }),
  item({ id: 'cloak-of-protection', name: 'Cape de protection', category: 'Objet merveilleux', rarity: 'Peu commun', weight: 0.5, price: 1500, requiresAttunement: true, summary: '+1 à la CA et aux jets de sauvegarde.' }),
  item({ id: 'ring-of-jumping', name: 'Anneau de saut', category: 'Objet merveilleux', rarity: 'Peu commun', weight: 0, price: 2500, requiresAttunement: true, summary: 'Vous pouvez lancer Saut sur vous-même à volonté.' }),
  item({ id: 'wand-of-magic-missiles', name: 'Baguette de projectiles magiques', category: 'Objet merveilleux', rarity: 'Peu commun', weight: 0.5, price: 2000, roll: '3d4+3', summary: '7 charges pour lancer Projectile magique ; se recharge à l’aube.' }),
  item({ id: 'amulet-of-health', name: 'Amulette de santé', category: 'Objet merveilleux', rarity: 'Rare', weight: 0, price: 8000, requiresAttunement: true, summary: 'Votre Constitution passe à 19.' }),
  item({ id: 'staff-of-fire', name: 'Bâton de feu', category: 'Objet merveilleux', rarity: 'Très rare', weight: 2, price: 16000, requiresAttunement: true, summary: 'Résistance au feu et sorts de feu via ses charges.' }),
  item({ id: 'carpet-of-flying', name: 'Tapis volant', category: 'Objet merveilleux', rarity: 'Très rare', weight: 25, price: 20000, summary: 'Un tapis qui vole sur commande.' }),
  item({ id: 'vorpal-sword', name: 'Épée vorpale', category: 'Arme', rarity: 'Légendaire', weight: 1.5, price: 60000, damage: '1d8+3', damageType: 'tranchant', requiresAttunement: true, properties: ['Magique'], summary: '+3 ; sur un 20 naturel, peut trancher la tête de la cible.' }),
  item({ id: 'staff-of-the-magi', name: 'Bâton des mages', category: 'Objet merveilleux', rarity: 'Légendaire', weight: 2, price: 80000, requiresAttunement: true, summary: 'Le plus puissant des bâtons : absorption de sorts et 50 charges.' }),
];
