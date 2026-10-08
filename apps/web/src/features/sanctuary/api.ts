import type { CharacterDto, CompendiumEntry, CreationDto, CreationInput, RulesetDto } from '@ds/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http, qk, toQuery } from '../../shared/api/client';

export function useCompendium(q: string, kind?: CompendiumEntry['kind']) {
  return useQuery({
    queryKey: [...qk.compendium, q, kind ?? 'all'],
    queryFn: async () => (await http.get<{ entries: CompendiumEntry[] }>(`/compendium${toQuery({ q, kind })}`)).entries,
    placeholderData: keepPreviousData,
    staleTime: 10 * 60_000,
  });
}

export function useCreations() {
  return useQuery({ queryKey: qk.creations, queryFn: async () => (await http.get<{ creations: CreationDto[] }>('/creations')).creations });
}

export function useRulesets() {
  return useQuery({ queryKey: qk.rulesets, queryFn: async () => (await http.get<{ rulesets: RulesetDto[] }>('/rulesets')).rulesets, staleTime: Infinity });
}

export function useCreationMutations() {
  const client = useQueryClient();
  const refresh = () => void client.invalidateQueries({ queryKey: qk.creations });
  return {
    create: useMutation({ mutationFn: async (input: CreationInput) => (await http.post<{ creation: CreationDto }>('/creations', input)).creation, onSuccess: refresh }),
    update: useMutation({ mutationFn: async ({ id, ...input }: CreationInput & { id: string }) => (await http.put<{ creation: CreationDto }>(`/creations/${id}`, input)).creation, onSuccess: refresh }),
    remove: useMutation({ mutationFn: (id: string) => http.del(`/creations/${id}`), onSuccess: refresh }),
    give: useMutation({
      mutationFn: async ({ id, characterId, qty = 1 }: { id: string; characterId: string; qty?: number }) => (await http.post<{ character: CharacterDto }>(`/creations/${id}/give`, { characterId, qty })).character,
      onSuccess: (c) => {
        client.setQueryData(qk.character(c.id), c);
        void client.invalidateQueries({ queryKey: qk.events(c.campaignId) });
      },
    }),
  };
}
