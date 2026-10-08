import { formatModifier } from '../dice';
import { registerRuleset, type Ruleset } from '../ruleset';
import { ITEMS } from './content/items';
import { ABILITY_KEYS, ABILITY_LABELS } from './abilities';
import { CONDITIONS } from './conditions';
import { SRD_ATTRIBUTION } from './content/types';
import { createDnd5eSheet, deriveSheet, dnd5eSheetSchema, type CreateCharacterInput, type DerivedSheet, type Dnd5eSheet, type InventoryItem } from './sheet';

export * from './abilities';
export * from './classes';
export * from './conditions';
export * from './content';
export * from './effects';
export * from './generators';
export * from './progression';
export * from './sheet';
export * from './skills';
export * from './species';
export * from './spellcasting';

export const DND5E_ID = 'dnd5e-srd51';

export interface WeaponAttack {
  name: string;
  bonus: number;
  damage: string;
  damageType: string;
  /** Portée en mètres pour une arme à distance ou de lancer, sinon allonge. */
  ranged: boolean;
}

/**
 * Attaque avec un objet de l'inventaire : arme du compendium (finesse, munitions) ou arme personnalisée
 * de la Forge (jet + bonus magique). null si l'objet n'est pas une arme.
 */
export function weaponAttack(sheet: Dnd5eSheet, item: InventoryItem): WeaponAttack | null {
  const d = deriveSheet(sheet);
  const entry = ITEMS.find((e) => e.category === 'Arme' && (e.id === item.ref || e.name.toLowerCase() === item.name.toLowerCase()));
  const dice = entry?.damage ?? (item.damageType ? item.roll : undefined);
  if (!dice) return null;
  const props = entry?.properties ?? [];
  const ranged = props.some((p) => p.startsWith('Munitions'));
  const finesse = props.includes('Finesse');
  const mod = ranged || (finesse && d.modifiers.dex > d.modifiers.str) ? d.modifiers.dex : d.modifiers.str;
  const magic = item.attackBonus ?? 0;
  return {
    name: item.name,
    bonus: mod + d.proficiencyBonus + magic,
    damage: dice + formatModifier(mod + magic),
    damageType: entry?.damageType ?? item.damageType ?? '',
    ranged: ranged || props.some((p) => p.startsWith('Lancer')),
  };
}

export const dnd5e: Ruleset<Dnd5eSheet, CreateCharacterInput, DerivedSheet> = {
  id: DND5E_ID,
  name: 'D&D 5e (SRD 5.1)',
  version: '1.1.0',
  license: 'CC-BY-4.0',
  attribution: SRD_ATTRIBUTION,
  abilities: ABILITY_KEYS.map((k) => ({ key: k, ...ABILITY_LABELS[k] })),
  conditions: CONDITIONS,
  gridMeters: 1.5,
  sheetSchema: dnd5eSheetSchema as unknown as Ruleset<Dnd5eSheet>['sheetSchema'],
  createSheet: createDnd5eSheet,
  derive: deriveSheet,
  combatProfile(sheet) {
    const d = deriveSheet(sheet);
    const base = {
      hp: sheet.hp.current,
      maxHp: sheet.hp.max,
      ac: d.armorClass,
      initiativeMod: d.initiative,
      speed: d.speed,
      saves: Object.fromEntries(ABILITY_KEYS.map((k) => [k, d.saves[k].value])),
      defenses: {
        resistances: d.resistances.map((r) => ({ damage: r.damage, ...(r.when ? { when: r.when } : {}) })),
        immunities: d.immunities.map((r) => ({ damage: r.damage, ...(r.when ? { when: r.when } : {}) })),
        vulnerabilities: d.vulnerabilities.map((r) => ({ damage: r.damage, ...(r.when ? { when: r.when } : {}) })),
      },
    };
    // Attaque rapide : première arme équipée reconnue, sinon mains nues.
    const weapon = sheet.inventory.filter((i) => i.equipped).map((i) => weaponAttack(sheet, i)).find(Boolean);
    if (!weapon) {
      const unarmed = Math.max(1, 1 + d.modifiers.str);
      return { ...base, attack: { name: 'Mains nues', bonus: d.modifiers.str + d.proficiencyBonus, damage: String(unarmed), damageType: 'contondant' } };
    }
    return { ...base, attack: { name: weapon.name, bonus: weapon.bonus, damage: weapon.damage, damageType: weapon.damageType } };
  },
};

registerRuleset(dnd5e);
