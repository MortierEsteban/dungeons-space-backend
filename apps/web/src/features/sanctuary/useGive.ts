import type { CharacterAction, CharacterDto } from '@ds/shared';
import { useQueryClient } from '@tanstack/react-query';
import { errorMessage, http, qk } from '../../shared/api/client';
import { useToast } from '../../shared/ui/toast';

/** Applique une action à la fiche d'un personnage choisi (ajout d'objet ou de sort depuis le Sanctuaire). */
export function useCharacterActionById() {
  const client = useQueryClient();
  const toast = useToast();
  return (characterId: string, action: CharacterAction, success: string) => {
    http
      .post<{ character: CharacterDto }>(`/characters/${characterId}/actions`, action)
      .then(({ character }) => {
        client.setQueryData(qk.character(character.id), character);
        toast(success, 'success');
      })
      .catch((e) => toast(errorMessage(e), 'error'));
  };
}
