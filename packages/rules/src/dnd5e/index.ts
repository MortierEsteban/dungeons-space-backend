import { formatModifier } from '../dice';
import { registerRuleset, type Ruleset } from '../ruleset';
import { ITEMS } from './content/items';
import { ABILITY_KEYS, ABILITY_LABELS } from './abilities';
import { CONDITIONS } from './conditions';
import { SRD_ATTRIBUTION } from './content/types';
import { createDnd5eSheet, deriveSheet, dnd5eSheetSchema, type CreateCharacterInput, type DerivedSheet, type Dnd5eSheet } from './sheet';

export * from './abilities';
export * from './classes';
export * from './conditions';
export * from './content';
export * from './generators';
export * from './progression';
export * from './sheet';
export * from './skills';
export * from './species';

export const DND5E_ID = 'dnd5e-srd51';

export const dnd5e: Ruleset<Dnd5eSheet, CreateCharacterInput, DerivedSheet> = {
  id: DND5E_ID,
  name: 'D&D 5e (SRD 5.1)',
  version: '1.0.0',
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
    // Attaque rapide : première arme équipée reconnue dans le compendium, sinon mains nues.
    const weapon = sheet.inventory
      .filter((i) => i.equipped)
      .map((i) => ITEMS.find((e) => e.category === 'Arme' && (e.id === i.ref || e.name.toLowerCase() === i.name.toLowerCase())))
      .find((e) => e?.damage);
    const base = { hp: sheet.hp.current, maxHp: sheet.hp.max, ac: d.armorClass, initiativeMod: d.initiative, speed: sheet.speed };
    if (!weapon?.damage) {
      const unarmed = Math.max(1, 1 + d.modifiers.str);
      return { ...base, attack: { name: 'Mains nues', bonus: d.modifiers.str + d.proficiencyBonus, damage: String(unarmed), damageType: 'contondant' } };
    }
    const props = weapon.properties ?? [];
    const ranged = props.some((p) => p.startsWith('Munitions'));
    const finesse = props.includes('Finesse');
    const mod = ranged || (finesse && d.modifiers.dex > d.modifiers.str) ? d.modifiers.dex : d.modifiers.str;
    return {
      ...base,
      attack: { name: weapon.name, bonus: mod + d.proficiencyBonus, damage: weapon.damage + formatModifier(mod), damageType: weapon.damageType ?? '' },
    };
  },
};

registerRuleset(dnd5e);
