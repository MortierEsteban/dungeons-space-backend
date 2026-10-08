import type { Dnd5eSheet } from '@ds/rules';
import type { CharacterAction, CharacterDto } from '@ds/shared';
import { errorMessage } from '../../shared/api/client';
import { useToast } from '../../shared/ui/toast';
import { useCharacterMutations } from './api';

/**
 * Deux façons de modifier une fiche :
 * - `edit` : retouche libre (quantités, conteneurs, préparation…) — la fiche est revalidée par le ruleset ;
 * - `act`  : action de jeu (dégâts, repos, sort…) — règles appliquées et événement inscrit dans la Chronique.
 */
export function useSheet(character: CharacterDto) {
  const m = useCharacterMutations(character.id);
  const toast = useToast();
  const onError = (e: unknown) => toast(errorMessage(e), 'error');
  return {
    sheet: character.sheet,
    derived: character.derived,
    canEdit: character.canEdit,
    busy: m.update.isPending || m.act.isPending,
    edit(fn: (draft: Dnd5eSheet) => void) {
      if (!character.sheet || !character.canEdit) return;
      const draft = structuredClone(character.sheet);
      fn(draft);
      m.update.mutate({ sheet: draft as unknown as Record<string, unknown> }, { onError });
    },
    act(action: CharacterAction, success?: string) {
      m.act.mutate(action, { onError, onSuccess: () => success && toast(success, 'success') });
    },
    rename(name: string) {
      if (name.trim() && name !== character.name) m.update.mutate({ name: name.trim() }, { onError });
    },
    setPortrait(url: string | null) {
      m.update.mutate({ portraitUrl: url }, { onError });
    },
    updateNpc: (patch: Partial<NonNullable<CharacterDto['npc']>>) => m.update.mutate({ npc: patch }, { onError }),
    remove: m.remove,
  };
}

export type SheetApi = ReturnType<typeof useSheet>;
