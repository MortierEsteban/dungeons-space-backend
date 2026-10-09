import type { CorrectEventInput, CreateEventInput, EventDto, EventLinkDto, EventPageDto, EventQuery } from '@ds/shared';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http, qk, toQuery } from '../../shared/api/client';

type Filters = Omit<EventQuery, 'before'>;

/** Tous les événements narratifs (vue 3D) — jusqu'à 2000, filtrés côté serveur selon le rôle. */
export function useNarrativeEvents(campaignId: string | null) {
  return useQuery({
    queryKey: [...qk.events(campaignId ?? 'none'), 'narrative'],
    queryFn: async () => (await http.get<EventPageDto>(`/campaigns/${campaignId}/events${toQuery({ categories: 'narrative,social', limit: 2000 })}`)).events,
    enabled: !!campaignId,
  });
}

/** Timeline paginée (scroll infini, CHR-03) avec filtres serveur (CHR-04). */
export function useTimeline(campaignId: string | null, filters: Filters) {
  return useInfiniteQuery({
    queryKey: [...qk.events(campaignId ?? 'none'), 'timeline', filters],
    queryFn: ({ pageParam }) =>
      http.get<EventPageDto>(
        `/campaigns/${campaignId}/events${toQuery({ ...(filters as Record<string, string | number | undefined>), limit: filters.limit ?? 40, before: pageParam ?? undefined })}`,
      ),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => last.nextBefore,
    enabled: !!campaignId,
  });
}

export function useEventLinks(campaignId: string | null) {
  return useQuery({
    queryKey: qk.eventLinks(campaignId ?? 'none'),
    queryFn: async () => (await http.get<{ links: EventLinkDto[] }>(`/campaigns/${campaignId}/event-links`)).links,
    enabled: !!campaignId,
  });
}

export function useChronicleMutations(campaignId: string) {
  const client = useQueryClient();
  const refresh = () => {
    void client.invalidateQueries({ queryKey: qk.events(campaignId) });
    void client.invalidateQueries({ queryKey: qk.eventLinks(campaignId) });
    void client.invalidateQueries({ queryKey: qk.campaign(campaignId), exact: true });
    void client.invalidateQueries({ queryKey: [...qk.recordings(campaignId), 'trace'] });
  };
  return {
    create: useMutation({
      mutationFn: async (input: CreateEventInput) => (await http.post<{ event: EventDto }>(`/campaigns/${campaignId}/events`, input)).event,
      onSuccess: refresh,
    }),
    correct: useMutation({
      mutationFn: async ({ id, ...input }: CorrectEventInput & { id: string }) => (await http.post<{ event: EventDto }>(`/campaigns/${campaignId}/events/${id}/corrections`, input)).event,
      onSuccess: refresh,
    }),
    reveal: useMutation({
      mutationFn: async (id: string) => (await http.post<{ event: EventDto }>(`/campaigns/${campaignId}/events/${id}/reveal`)).event,
      onSuccess: refresh,
    }),
    link: useMutation({
      mutationFn: (pair: { fromId: string; toId: string }) => http.post<{ link: EventLinkDto }>(`/campaigns/${campaignId}/event-links`, pair),
      onSuccess: refresh,
    }),
    unlink: useMutation({ mutationFn: (linkId: string) => http.del(`/campaigns/${campaignId}/event-links/${linkId}`), onSuccess: refresh }),
  };
}
