import { describe, expect, it } from 'vitest';
import { isValidDice } from '../../dice';
import { COMPENDIUM, searchCompendium } from './index';

describe('contenu SRD', () => {
  it('a des identifiants uniques (ils servent de références dans les fiches)', () => {
    const ids = COMPENDIUM.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('porte une provenance et des notations de dés valides', () => {
    for (const e of COMPENDIUM) {
      expect(e.provenance.license).toBe('CC-BY-4.0');
      const rolls = e.kind === 'monster' ? [e.hpDice, ...e.attacks.map((a) => a.damage)] : [e.roll, e.kind === 'item' ? e.damage : undefined];
      for (const r of rolls.filter(Boolean)) expect(isValidDice(r!), `${e.id} : ${r}`).toBe(true);
    }
  });

  it('cherche sans tenir compte des accents', () => {
    expect(searchCompendium({ q: 'eclair' })[0]?.name).toBe('Éclair');
  });
});
