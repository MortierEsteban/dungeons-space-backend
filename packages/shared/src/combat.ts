import type { CombatEvent, CombatState } from '@ds/rules';
import { z } from 'zod';

export const createEncounterSchema = z.object({
  name: z.string().trim().min(1).max(120),
  cols: z.number().int().min(4).max(80).default(24),
  rows: z.number().int().min(4).max(80).default(15),
  diagonalRule: z.enum(['simple', 'alternate']).optional(),
  hideMonsterStats: z.boolean().default(true),
  /** Ajoute automatiquement les PJ de la campagne. */
  includeParty: z.boolean().default(true),
});
export type CreateEncounterInput = z.input<typeof createEncounterSchema>;

export interface EncounterSummaryDto {
  id: string;
  campaignId: string;
  name: string;
  status: 'setup' | 'active' | 'ended';
  round: number;
  combatantCount: number;
  createdAt: string;
  updatedAt: string;
}

/** Événement de combat tel qu'envoyé à un client (déjà filtré selon son rôle). */
export interface CombatEventEnvelope {
  seq: number;
  eventId: string;
  occurredAt: string;
  actorUserId: string | null;
  event: CombatEvent;
}

export interface EncounterDto extends EncounterSummaryDto {
  state: CombatState;
  /** Dernière séquence connue : le client ignore les événements déjà appliqués. */
  lastSeq: number;
}
