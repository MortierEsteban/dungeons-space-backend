import { describe, expect, it } from 'vitest';
import { campaignColor, initials, num, signed } from './format';

describe('formatage', () => {
  it('signe les modificateurs', () => {
    expect(signed(3)).toBe('+3');
    expect(signed(0)).toBe('+0');
    expect(signed(-1)).toBe('-1');
  });

  it('formate les nombres à la française', () => {
    expect(num(10.5)).toBe('10,5');
  });

  it('calcule les initiales', () => {
    expect(initials('Elowen Sylvecœur')).toBe('ES');
    expect(initials('Brakk')).toBe('B');
  });

  it('attribue une couleur stable à une campagne', () => {
    expect(campaignColor('abc')).toBe(campaignColor('abc'));
  });
});
