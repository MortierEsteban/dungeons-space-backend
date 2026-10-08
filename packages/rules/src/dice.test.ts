import { describe, expect, it } from 'vitest';
import { averageDice, combineAdvantage, critDice, DiceNotationError, parseDice, rollD20, rollDice } from './dice';
import { ScriptedRng, SeededRng } from './rng';

describe('notation de dés', () => {
  it('analyse dés, constantes et conservation', () => {
    expect(parseDice('2d6+3')).toEqual([
      { kind: 'dice', sign: 1, count: 2, sides: 6 },
      { kind: 'const', sign: 1, value: 3 },
    ]);
    expect(parseDice('4d6kh3')[0]).toMatchObject({ keep: { mode: 'high', count: 3 } });
    expect(parseDice('d20-1')).toHaveLength(2);
  });

  it('refuse les notations invalides', () => {
    expect(() => parseDice('2x6')).toThrow(DiceNotationError);
    expect(() => parseDice('0d6')).toThrow(DiceNotationError);
    expect(() => parseDice('2d6kh3')).toThrow(DiceNotationError);
  });

  it('additionne les dés conservés', () => {
    const roll = rollDice('4d6kh3+1', new ScriptedRng([1, 6, 4, 5]));
    expect(roll.terms[0]!.kept).toEqual([6, 5, 4]);
    expect(roll.total).toBe(16);
  });

  it('expose le d20 naturel, avec avantage', () => {
    const adv = rollD20(5, new ScriptedRng([3, 18]), 'advantage');
    expect(adv.natural).toBe(18);
    expect(adv.total).toBe(23);
    const dis = rollD20(5, new ScriptedRng([3, 18]), 'disadvantage');
    expect(dis.natural).toBe(3);
  });

  it('avantage et désavantage s’annulent', () => {
    expect(combineAdvantage(['advantage', 'disadvantage', 'advantage'])).toBe('normal');
    expect(combineAdvantage(['advantage'])).toBe('advantage');
  });

  it('double les dés en cas de critique', () => {
    expect(critDice('1d8+3')).toBe('2d8+3');
    expect(averageDice('2d6')).toBe(7);
    expect(averageDice('7d10+21')).toBe(59);
  });

  it('est déterministe avec une graine', () => {
    const a = Array.from({ length: 20 }, (_, i) => rollDice('3d6', new SeededRng(i)).total);
    const b = Array.from({ length: 20 }, (_, i) => rollDice('3d6', new SeededRng(i)).total);
    expect(a).toEqual(b);
    expect(a.every((v) => v >= 3 && v <= 18)).toBe(true);
  });
});
