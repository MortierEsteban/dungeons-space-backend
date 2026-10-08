import type { LoginInput, RegisterInput, UpdateProfileInput, UserDto } from '@ds/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, http, qk } from '../../shared/api/client';
import { disconnectSocket } from '../../shared/realtime/socket';

/** Utilisateur courant ; null si non connecté (401). */
export function useMe() {
  return useQuery({
    queryKey: qk.me,
    queryFn: async () => {
      try {
        return (await http.get<{ user: UserDto }>('/auth/me')).user;
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: 5 * 60_000,
  });
}

export function useLogin() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginInput) => http.post<{ user: UserDto }>('/auth/login', input),
    onSuccess: ({ user }) => {
      client.clear();
      client.setQueryData(qk.me, user);
    },
  });
}

export function useRegister() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: RegisterInput) => http.post<{ user: UserDto }>('/auth/register', input),
    onSuccess: ({ user }) => {
      client.clear();
      client.setQueryData(qk.me, user);
    },
  });
}

export function useLogout() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => http.post<void>('/auth/logout'),
    onSettled: () => {
      disconnectSocket();
      client.clear();
      client.setQueryData(qk.me, null);
    },
  });
}

export function useUpdateProfile() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (patch: UpdateProfileInput) => http.patch<{ user: UserDto }>('/auth/me', patch),
    onSuccess: ({ user }) => client.setQueryData(qk.me, user),
  });
}
