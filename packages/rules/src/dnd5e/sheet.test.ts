import { describe, expect, it } from 'vitest';
import { abilityModifier, pointBuyCost, scoresFromArray } from './abilities';
import { proficiencyBonus, spellSlotsFor, levelForXp } from './progression';
import { applyDamage, applyHealing, createDnd5eSheet, deriveSheet, dnd5eSheetSchema, levelUp, longRest } from './sheet';
import { dnd5e } from './index';

const elowen = () =>
  createDnd5eSheet({
    species: 'Elfe',
    className: 'Rôdeur',
    level: 5,
    abilities: scoresFromArray([10, 16, 14, 12, 16, 8]),
    skills: ['stealth', 'perception', 'survival'],
  });

describe('caractéristiques et progression', () => {
  it('calcule modificateurs et bonus de maîtrise', () => {
    expect(abilityModifier(8)).toBe(-1);
    expect(abilityModifier(10)).toBe(0);
    expect(abilityModifier(18)).toBe(4);
    expect(proficiencyBonus(1)).toBe(2);
    expect(proficiencyBonus(5)).toBe(3);
    expect(proficiencyBonus(17)).toBe(6);
  });

  it('valide le point buy à 27 points', () => {
    expect(pointBuyCost(scoresFromArray([15, 15, 15, 8, 8, 8]))).toBe(27);
    expect(pointBuyCost(scoresFromArray([16, 8, 8, 8, 8, 8]))).toBeNull();
  });

  it('donne les emplacements de sorts par type de lanceur', () => {
    expect(spellSlotsFor('full', 5)).toEqual({ 1: 4, 2: 3, 3: 2 });
    expect(spellSlotsFor('half', 5)).toEqual({ 1: 4, 2: 2 });
    expect(spellSlotsFor('half', 1)).toEqual({});
    expect(spellSlotsFor('pact', 5)).toEqual({ 3: 2 });
    expect(levelForXp(7200)).toBe(5);
  });
});

describe('fiche D&D 5e', () => {
  it('applique les bonus d’espèce et produit une fiche valide', () => {
    const sheet = elowen();
    expect(sheet.abilities.dex).toBe(18);
    expect(sheet.speed).toBe(9);
    expect(dnd5eSheetSchema.safeParse(sheet).success).toBe(true);
    expect(sheet.spellcasting?.slots['1']).toEqual({ max: 4, used: 0 });
  });

  it('dérive sauvegardes, compétences et perception passive', () => {
    const d = deriveSheet(elowen());
    expect(d.proficiencyBonus).toBe(3);
    expect(d.saves.dex).toMatchObject({ value: 7, proficient: true });
    expect(d.skills.find((s) => s.key === 'stealth')?.value).toBe(7);
    expect(d.passivePerception).toBe(16);
    expect(d.spellSaveDc).toBe(14);
  });

  it('respecte les valeurs forcées (override)', () => {
    const d = deriveSheet({ ...elowen(), overrides: { armorClass: 19 } });
    expect(d.armorClass).toBe(19);
    expect(d.overridden).toContain('armorClass');
  });

  it('absorbe les dégâts avec les PV temporaires puis soigne', () => {
    let s = elowen();
    s = { ...s, hp: { ...s.hp, temp: 5 } };
    s = applyDamage(s, 8);
    expect(s.hp.temp).toBe(0);
    expect(s.hp.current).toBe(s.hp.max - 3);
    s = applyHealing(s, 100);
    expect(s.hp.current).toBe(s.hp.max);
  });

  it('monte de niveau et récupère au repos long', () => {
    const s = elowen();
    const up = levelUp({ ...s, spellcasting: { ...s.spellcasting!, slots: { 1: { max: 4, used: 3 }, 2: { max: 2, used: 1 } } } })!;
    expect(up.level).toBe(6);
    expect(up.hp.max).toBe(s.hp.max + 8);
    const rested = longRest(up);
    expect(Object.values(rested.spellcasting!.slots).every((slot) => slot.used === 0)).toBe(true);
  });

  it('projette un profil de combat depuis la fiche', () => {
    const s = elowen();
    s.inventory.push({ id: 'a', name: 'Arc long', ref: 'longbow', qty: 1, weight: 1, container: 'Équipé', equipped: true, rarity: 'Commun', requiresAttunement: false, attuned: false });
    const p = dnd5e.combatProfile(s);
    expect(p.attack).toEqual({ name: 'Arc long', bonus: 7, damage: '1d8+4', damageType: 'perforant' });
    expect(p.initiativeMod).toBe(4);
  });
});
