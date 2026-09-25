import { useQuery } from '@tanstack/react-query';
import { apiJSON } from './api';

export interface Session {
  authRequired: boolean;
  authenticated: boolean;
}

// Whether Hub wants a password. When the server is unreachable (demo mode)
// there is nothing to protect, so the shell just opens.
export function useSession() {
  return useQuery({
    queryKey: ['session'],
    queryFn: () => apiJSON<Session>('/api/session'),
    retry: false,
    staleTime: 60_000,
  });
}
