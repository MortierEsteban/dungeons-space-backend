import type { CharacterAction, CharacterDto, CharacterSummaryDto, CreateCharacterInput, NoteDto, NoteInput, UpdateCharacterInput } from '@ds/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http, qk } from '../../shared/api/client';

export function useCampaignCharacters(campaignId: string | null) {
  return useQuery({
    queryKey: qk.characters(campaignId ?? 'none'),
    queryFn: async () => (await http.get<{ characters: CharacterSummaryDto[] }>(`/campaigns/${campaignId}/characters`)).characters,
    enabled: !!campaignId,
  });
}

export function useMyCharacters() {
  return useQuery({ queryKey: qk.myCharacters, queryFn: async () => (await http.get<{ characters: CharacterSummaryDto[] }>('/characters/mine')).characters });
}

export function useCharacter(id: string | null) {
  return useQuery({
    queryKey: qk.character(id ?? 'none'),
    queryFn: async () => (await http.get<{ character: CharacterDto }>(`/characters/${id}`)).character,
    enabled: !!id,
  });
}

export function useNotes(characterId: string | null) {
  return useQuery({
    queryKey: qk.notes(characterId ?? 'none'),
    queryFn: async () => (await http.get<{ notes: NoteDto[] }>(`/characters/${characterId}/notes`)).notes,
    enabled: !!characterId,
  });
}

export function useCreateCharacter(campaignId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateCharacterInput) => (await http.post<{ character: CharacterDto }>(`/campaigns/${campaignId}/characters`, input)).character,
    onSuccess: (c) => {
      client.setQueryData(qk.character(c.id), c);
      void client.invalidateQueries({ queryKey: qk.characters(campaignId) });
      void client.invalidateQueries({ queryKey: qk.myCharacters });
      void client.invalidateQueries({ queryKey: qk.constellation(campaignId) });
    },
  });
}

/** Mutations d'une fiche : la réponse du serveur (règles appliquées) remplace le cache. */
export function useCharacterMutations(id: string) {
  const client = useQueryClient();
  const apply = (c: CharacterDto) => {
    client.setQueryData(qk.character(id), c);
    void client.invalidateQueries({ queryKey: qk.characters(c.campaignId) });
    void client.invalidateQueries({ queryKey: qk.myCharacters });
    void client.invalidateQueries({ queryKey: qk.events(c.campaignId) });
  };
  return {
    update: useMutation({ mutationFn: async (patch: UpdateCharacterInput) => (await http.patch<{ character: CharacterDto }>(`/characters/${id}`, patch)).character, onSuccess: apply }),
    act: useMutation({ mutationFn: async (action: CharacterAction) => (await http.post<{ character: CharacterDto }>(`/characters/${id}/actions`, action)).character, onSuccess: apply }),
    remove: useMutation({
      mutationFn: () => http.del(`/characters/${id}`),
      onSuccess: () => {
        void client.invalidateQueries({ queryKey: qk.myCharacters });
        void client.invalidateQueries({ queryKey: ['campaign'] });
      },
    }),
  };
}

export function useNoteMutations(characterId: string) {
  const client = useQueryClient();
  const refresh = () => void client.invalidateQueries({ queryKey: qk.notes(characterId) });
  return {
    create: useMutation({ mutationFn: (input: NoteInput) => http.post<{ note: NoteDto }>(`/characters/${characterId}/notes`, input), onSuccess: refresh }),
    update: useMutation({ mutationFn: ({ id, ...patch }: Partial<NoteInput> & { id: string }) => http.patch<{ note: NoteDto }>(`/notes/${id}`, patch), onSuccess: refresh }),
    remove: useMutation({ mutationFn: (id: string) => http.del(`/notes/${id}`), onSuccess: refresh }),
  };
}
