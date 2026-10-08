import { describe, expect, it } from 'vitest';
import { scoresFromArray } from './abilities';
import { classDefSchema } from './classes';
import { evalFormula, tryFormula } from './effects';
import { applyCustomClass, createDnd5eSheet, deriveSheet, dnd5eSheetSchema, levelUp, longRest, shortRest, spendResource } from './sheet';
import { scaledRoll, spellMechanics } from './spellcasting';

const sheet = (species: string, className: string, level = 1, stats = [10, 14, 14, 10, 14, 10]) =>
  createDnd5eSheet({ species, className, level, abilities: scoresFromArray(stats) });

describe('passifs des espèces et des classes', () => {
  it('donne au nain sa résistance au poison et son avantage contre le poison', () => {
    const d = deriveSheet(sheet('Nain', 'Guerrier'));
    expect(d.resistances.map((r) => r.damage)).toContain('poison');
    expect(d.advantages.map((a) => a.label)).toContain('Avantage aux jets de sauvegarde contre le poison');
  });

  it('applique la résistance au feu du tieffelin et l’avantage contre le charme de l’elfe', () => {
    expect(deriveSheet(sheet('Tieffelin', 'Occultiste')).resistances.map((r) => r.damage)).toContain('feu');
    const elf = deriveSheet(sheet('Elfe', 'Rôdeur'));
    expect(elf.advantages.some((a) => a.label.includes('charme'))).toBe(true);
    // Sens aiguisés : Perception maîtrisée sans l’avoir choisie.
    expect(elf.skills.find((s) => s.key === 'perception')?.level).toBe(1);
  });

  it('retrouve les passifs d’une fiche ancienne (traits sans effets, traits manquants)', () => {
    const s = sheet('Nain', 'Barbare', 2);
    const old = { ...s, traits: s.traits.map(({ effects: _e, ...t }) => t).filter((t) => t.name !== 'Sens du danger') };
    const d = deriveSheet(old);
    expect(d.resistances.map((r) => r.damage)).toContain('poison');
    expect(d.saves.dex.advantages).toContain('contre les effets visibles');
    expect(d.traits.find((t) => t.name === 'Sens du danger')?.fromCatalog).toBe(true);
  });

  it('garde les résistances de rage conditionnelles', () => {
    const d = deriveSheet(sheet('Humain', 'Barbare'));
    expect(d.resistances.filter((r) => r.when === 'Rage').map((r) => r.damage).sort()).toEqual(['contondant', 'perforant', 'tranchant']);
  });

  it('calcule la défense sans armure, perdue avec une armure', () => {
    const s = sheet('Humain', 'Moine', 1, [10, 16, 12, 10, 16, 10]);
    expect(deriveSheet({ ...s, armorClass: 10 }).armorClass).toBe(10 + 3 + 3);
    const armored = { ...s, armorClass: 14, inventory: [{ id: 'a', name: 'Armure de cuir', ref: 'leather', qty: 1, weight: 5, container: 'Équipé', equipped: true, rarity: 'Commun' as const, requiresAttunement: false, attuned: false }] };
    expect(deriveSheet(armored).armorClass).toBe(14);
  });

  it('applique la vitesse et le touche-à-tout', () => {
    expect(deriveSheet(sheet('Humain', 'Moine', 2)).speed).toBe(12);
    const bard = deriveSheet(sheet('Humain', 'Barde', 2));
    expect(bard.skills.find((s) => s.key === 'athletics')?.level).toBe(0.5);
  });

  it('applique les passifs d’un objet équipé et harmonisé seulement', () => {
    const s = sheet('Humain', 'Guerrier');
    const cloak = { id: 'c', name: 'Cape ignifugée', qty: 1, weight: 1, container: 'Équipé', equipped: true, rarity: 'Rare' as const, requiresAttunement: true, attuned: false, effects: [{ type: 'resistance' as const, damage: 'feu' }] };
    expect(deriveSheet({ ...s, inventory: [cloak] }).resistances).toHaveLength(0);
    expect(deriveSheet({ ...s, inventory: [{ ...cloak, attuned: true }] }).resistances.map((r) => r.source)).toEqual(['Cape ignifugée']);
  });
});

describe('ressources', () => {
  it('évalue formules et paliers', () => {
    const ctx = { level: 6, pb: 3, mods: { str: 0, dex: 2, con: 1, int: 0, wis: 0, cha: 3 } };
    expect(evalFormula('1:2, 3:3, 6:4, 12:5', ctx)).toBe(4);
    expect(evalFormula('5 * level', ctx)).toBe(30);
    expect(evalFormula('max(1, cha) + floor(level / 4)', ctx)).toBe(4);
    expect(tryFormula('niveau + inconnu', ctx)).toBeNull();
  });

  it('dépense et recharge selon le repos', () => {
    let s = sheet('Humain', 'Guerrier', 2);
    expect(deriveSheet(s).resources.map((r) => [r.id, r.max])).toEqual([['second-wind', 1], ['action-surge', 1]]);
    s = spendResource(spendResource(s, 'second-wind', 1), 'second-wind', 1);
    expect(deriveSheet(s).resources[0]!.used).toBe(1);
    s = shortRest(s, 0, 0);
    expect(deriveSheet(s).resources[0]!.used).toBe(0);
    let m = sheet('Humain', 'Moine', 3);
    m = spendResource(m, 'ki', 2);
    expect(deriveSheet(m).resources[0]).toMatchObject({ name: 'Ki', max: 3, used: 2, pool: true });
    expect(deriveSheet(longRest(m)).resources[0]!.used).toBe(0);
  });
});

describe('classes homebrew', () => {
  const lame = classDefSchema.parse({
    id: 'hb-lame', name: 'Lame runique', hitDie: 10, primary: ['str'], saves: ['str', 'int'], caster: 'third', spellAbility: 'int',
    skillChoices: { count: 2, from: ['arcana', 'athletics'] },
    features: [
      { level: 1, name: 'Peau de rune', summary: 'Résistance au froid.', effects: [{ type: 'resistance', damage: 'froid' }] },
      { level: 3, name: 'Runes vives', summary: '' },
    ],
    resources: [{ id: 'runes', name: 'Charges runiques', max: 'pb', recharge: 'short' }],
  });

  it('crée une fiche complète depuis une classe de la Forge', () => {
    const s = createDnd5eSheet({ species: 'Humain', className: lame.name, customClass: lame, classRef: 'c1', level: 3, abilities: scoresFromArray([15, 12, 14, 13, 10, 8]) });
    expect(dnd5eSheetSchema.safeParse(s).success).toBe(true);
    expect(s.saveProficiencies).toEqual(['str', 'int']);
    expect(s.spellcasting?.slots['1']).toEqual({ max: 2, used: 0 });
    const d = deriveSheet(s);
    expect(d.resistances.map((r) => r.damage)).toContain('froid');
    expect(d.resources).toEqual([expect.objectContaining({ id: 'runes', max: 2, recharge: 'short' })]);
    expect(levelUp(s)!.hitDice.die).toBe(10);
  });

  it('suit les modifications de la classe', () => {
    const s = createDnd5eSheet({ species: 'Humain', className: lame.name, customClass: lame, level: 3, abilities: scoresFromArray([15, 12, 14, 13, 10, 8]) });
    const next = applyCustomClass(s, { ...lame, name: 'Lame des glaces', features: [{ level: 1, name: 'Cœur de givre', summary: '', effects: [{ type: 'immunity', damage: 'froid' }] }] });
    expect(next.className).toBe('Lame des glaces');
    expect(next.traits.some((t) => t.name === 'Peau de rune')).toBe(false);
    expect(deriveSheet(next).immunities.map((i) => i.damage)).toEqual(['froid']);
  });
});

describe('mécaniques des sorts', () => {
  it('retrouve gabarit et sauvegarde depuis le compendium', () => {
    const m = spellMechanics({ id: 'x', ref: 'fireball', name: 'Boule de feu', level: 3, concentration: false, ritual: false, prepared: true, favorite: false });
    expect(m).toMatchObject({ area: { shape: 'sphere', size: 6 }, save: 'dex', half: true, selfOrigin: false, rangeMeters: 45, cost: 'action' });
    expect(spellMechanics({ id: 'y', ref: 'burning-hands', name: 'Mains brûlantes', level: 1, concentration: false, ritual: false, prepared: true, favorite: false }).selfOrigin).toBe(true);
  });

  it('fait monter les tours de magie et les sorts lancés plus haut', () => {
    expect(scaledRoll({ roll: '1d10', level: 0 }, 0, 5)).toBe('2d10');
    expect(scaledRoll({ roll: '1d10', level: 0 }, 0, 17)).toBe('4d10');
    expect(scaledRoll({ roll: '8d6', level: 3, upcast: '1d6' }, 5, 9)).toBe('8d6+1d6+1d6');
  });
});
