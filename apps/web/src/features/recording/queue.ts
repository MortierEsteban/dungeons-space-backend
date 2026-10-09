import type { TranscriptSegmentInput } from '@ds/shared';
import type { SpokenSegment } from './capture';

interface Queued extends SpokenSegment {
  clientSeq: number;
}

interface Stored {
  next: number;
  items: Queued[];
}

/**
 * File d'envoi de la transcription : chaque phrase reçoit un numéro (idempotence côté serveur)
 * et reste en file, sauvegardée localement, jusqu'à l'accusé de réception. Un rechargement de page
 * ou une coupure réseau ne perd rien.
 */
export class SegmentQueue {
  private state: Stored;

  constructor(
    private readonly key: string,
    private readonly storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null = safeStorage(),
  ) {
    this.state = this.load();
  }

  get size(): number {
    return this.state.items.length;
  }

  get nextSeq(): number {
    return this.state.next;
  }

  /** Aligne la numérotation sur celle connue du serveur (reprise sur un autre onglet, autre session de navigateur). */
  ensureSeq(min: number): void {
    if (min > this.state.next) {
      this.state.next = min;
      this.save();
    }
  }

  push(segment: SpokenSegment): number {
    const clientSeq = this.state.next++;
    this.state.items.push({ ...segment, clientSeq });
    this.save();
    return clientSeq;
  }

  /** Prochain lot à envoyer, avec l'ancienneté de chaque phrase au moment de l'envoi. */
  batch(max = 100, now = Date.now()): TranscriptSegmentInput[] {
    return this.state.items.slice(0, max).map((s) => ({
      clientSeq: s.clientSeq,
      text: s.text,
      speaker: null,
      ageMs: Math.max(0, now - s.startedAt),
      durationMs: Math.max(0, s.endedAt - s.startedAt),
    }));
  }

  ack(clientSeqs: number[]): void {
    const done = new Set(clientSeqs);
    this.state.items = this.state.items.filter((s) => !done.has(s.clientSeq));
    this.save();
  }

  clear(): void {
    this.state = { next: this.state.next, items: [] };
    this.storage?.removeItem(this.key);
  }

  private load(): Stored {
    try {
      const raw = this.storage?.getItem(this.key);
      const parsed = raw ? (JSON.parse(raw) as Stored) : null;
      if (parsed && Number.isInteger(parsed.next) && Array.isArray(parsed.items)) return parsed;
    } catch {
      /* sauvegarde illisible : on repart d'une file vide */
    }
    return { next: 0, items: [] };
  }

  private save(): void {
    try {
      this.storage?.setItem(this.key, JSON.stringify(this.state));
    } catch {
      /* stockage plein ou indisponible : la file reste en mémoire */
    }
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
