import type { ConstellationDto, CreateLinkInput, CreateNodeInput, LinkDto, LinkSuggestionDto, NodeDto, UpdateLinkInput, UpdateNodeInput } from '@ds/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http, qk } from '../../shared/api/client';

export function useConstellation(campaignId: string | null) {
  return useQuery({
    queryKey: qk.constellation(campaignId ?? 'none'),
    queryFn: () => http.get<ConstellationDto>(`/campaigns/${campaignId}/constellation`),
    enabled: !!campaignId,
  });
}

export function useSuggestions(campaignId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: qk.suggestions(campaignId ?? 'none'),
    queryFn: async () => (await http.get<{ suggestions: LinkSuggestionDto[] }>(`/campaigns/${campaignId}/constellation/suggestions`)).suggestions,
    enabled: !!campaignId && enabled,
  });
}

export function useConstellationMutations(campaignId: string) {
  const client = useQueryClient();
  const base = `/campaigns/${campaignId}/constellation`;
  const refresh = () => void client.invalidateQueries({ queryKey: qk.constellation(campaignId) });
  return {
    createNode: useMutation({ mutationFn: async (input: CreateNodeInput) => (await http.post<{ node: NodeDto }>(`${base}/nodes`, input)).node, onSuccess: refresh }),
    updateNode: useMutation({ mutationFn: async ({ id, ...patch }: UpdateNodeInput & { id: string }) => (await http.patch<{ node: NodeDto }>(`${base}/nodes/${id}`, patch)).node, onSuccess: refresh }),
    deleteNode: useMutation({ mutationFn: (id: string) => http.del(`${base}/nodes/${id}`), onSuccess: refresh }),
    createLink: useMutation({ mutationFn: async (input: CreateLinkInput) => (await http.post<{ links: LinkDto[] }>(`${base}/links`, input)).links, onSuccess: refresh }),
    updateLink: useMutation({ mutationFn: async ({ id, ...patch }: UpdateLinkInput & { id: string }) => (await http.patch<{ link: LinkDto }>(`${base}/links/${id}`, patch)).link, onSuccess: refresh }),
    deleteLink: useMutation({ mutationFn: (id: string) => http.del(`${base}/links/${id}`), onSuccess: refresh }),
  };
}
