/**
 * Source de hasard injectable : le moteur ne lit jamais Math.random directement,
 * ce qui rend les jets reproductibles (tests, replay) — même principe que le crate Rust `dnd_core`.
 */
export interface Rng {
  /** Entier uniforme dans [1, sides]. */
  die(sides: number): number;
  /** Flottant uniforme dans [0, 1). */
  next(): number;
}

/** Générateur déterministe (mulberry32) à partir d'une graine 32 bits. */
export class SeededRng implements Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  die(sides: number): number {
    return 1 + Math.floor(this.next() * sides);
  }
}

/** Rejoue une suite de valeurs imposées (tests unitaires exacts). */
export class ScriptedRng implements Rng {
  private index = 0;

  constructor(private readonly values: readonly number[]) {}

  die(sides: number): number {
    const value = this.values[this.index++];
    if (value === undefined) throw new Error('ScriptedRng épuisé');
    if (value < 1 || value > sides) throw new Error(`Valeur scriptée ${value} hors d'un d${sides}`);
    return value;
  }

  next(): number {
    return (this.die(1000) - 1) / 1000;
  }
}

/** Hasard non déterministe, adossé à crypto quand il est disponible. */
export const systemRng: Rng = {
  next() {
    const c = (globalThis as { crypto?: { getRandomValues(a: Uint32Array): Uint32Array } }).crypto;
    if (c?.getRandomValues) {
      const buf = new Uint32Array(1);
      c.getRandomValues(buf);
      return (buf[0] ?? 0) / 4294967296;
    }
    return Math.random();
  },
  die(sides: number) {
    return 1 + Math.floor(this.next() * sides);
  },
};

export function pick<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) throw new Error('pick() sur une liste vide');
  return items[Math.floor(rng.next() * items.length)] as T;
}
