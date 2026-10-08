import type {
  CampaignDto,
  CampaignSummaryDto,
  CreateCampaignInput,
  DiscoverCampaignDto,
  InvitationDto,
  SessionDto,
  UpdateCampaignInput,
} from '@ds/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http, qk } from '../../shared/api/client';

export function useCampaigns(enabled = true) {
  return useQuery({ queryKey: qk.campaigns, queryFn: async () => (await http.get<{ campaigns: CampaignSummaryDto[] }>('/campaigns')).campaigns, enabled });
}

export function useDiscover() {
  return useQuery({ queryKey: qk.discover, queryFn: async () => (await http.get<{ campaigns: DiscoverCampaignDto[] }>('/campaigns/discover')).campaigns });
}

export function useCampaign(id: string | null) {
  return useQuery({
    queryKey: qk.campaign(id ?? 'none'),
    queryFn: async () => (await http.get<{ campaign: CampaignDto }>(`/campaigns/${id}`)).campaign,
    enabled: !!id,
  });
}

export function useInvitations(enabled = true) {
  return useQuery({ queryKey: qk.invitations, queryFn: async () => (await http.get<{ invitations: InvitationDto[] }>('/invitations')).invitations, enabled });
}

export function useSessions(id: string | null) {
  return useQuery({
    queryKey: qk.sessions(id ?? 'none'),
    queryFn: async () => (await http.get<{ sessions: SessionDto[] }>(`/campaigns/${id}/sessions`)).sessions,
    enabled: !!id,
  });
}

function useInvalidateCampaigns() {
  const client = useQueryClient();
  return (id?: string) => {
    void client.invalidateQueries({ queryKey: qk.campaigns });
    if (id) void client.invalidateQueries({ queryKey: ['campaign', id] });
  };
}

export function useCreateCampaign() {
  const invalidate = useInvalidateCampaigns();
  return useMutation({
    mutationFn: async (input: CreateCampaignInput) => (await http.post<{ campaign: CampaignDto }>('/campaigns', input)).campaign,
    onSuccess: (c) => invalidate(c.id),
  });
}

export function useUpdateCampaign(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (patch: UpdateCampaignInput) => (await http.patch<{ campaign: CampaignDto }>(`/campaigns/${id}`, patch)).campaign,
    onSuccess: (c) => {
      client.setQueryData(qk.campaign(id), c);
      void client.invalidateQueries({ queryKey: qk.campaigns });
    },
  });
}

export function useJoinCampaign() {
  const invalidate = useInvalidateCampaigns();
  return useMutation({
    mutationFn: async (code: string) => (await http.post<{ campaign: CampaignSummaryDto }>('/campaigns/join', { code })).campaign,
    onSuccess: (c) => invalidate(c.id),
  });
}

export function useApplyCampaign() {
  const client = useQueryClient();
  const invalidate = useInvalidateCampaigns();
  return useMutation({
    mutationFn: async (id: string) => (await http.post<{ campaign: CampaignSummaryDto }>(`/campaigns/${id}/apply`)).campaign,
    onSuccess: (c) => {
      invalidate(c.id);
      void client.invalidateQueries({ queryKey: qk.discover });
    },
  });
}

export function useAcceptInvitation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await http.post<{ campaign: CampaignSummaryDto }>(`/invitations/${id}/accept`)).campaign,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: qk.invitations });
      void client.invalidateQueries({ queryKey: qk.campaigns });
    },
  });
}

export function useCampaignAdmin(id: string) {
  const invalidate = useInvalidateCampaigns();
  const done = { onSuccess: () => invalidate(id) };
  return {
    regenerateCode: useMutation({ mutationFn: () => http.post<{ joinCode: string }>(`/campaigns/${id}/code`), ...done }),
    invite: useMutation({ mutationFn: (email: string) => http.post<void>(`/campaigns/${id}/invitations`, { email }), ...done }),
    revokeInvite: useMutation({ mutationFn: (invitationId: string) => http.del(`/campaigns/${id}/invitations/${invitationId}`), ...done }),
    removeMember: useMutation({ mutationFn: (userId: string) => http.del(`/campaigns/${id}/members/${userId}`), ...done }),
    startSession: useMutation({ mutationFn: (title: string) => http.post<{ session: SessionDto }>(`/campaigns/${id}/sessions`, { title }), ...done }),
    endSession: useMutation({ mutationFn: (summary: string) => http.post<{ session: SessionDto }>(`/campaigns/${id}/sessions/end`, { summary }), ...done }),
  };
}
