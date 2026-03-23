'use client';
import { useEffect } from 'react';
import { useAuthStore } from '@/lib/store';
import { apiClient } from '@/lib/api';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { accessToken, fetchUser, isAuthenticated } = useAuthStore();

  useEffect(() => {
    // Restore auth header from persisted token
    if (accessToken) {
      apiClient.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
      if (!isAuthenticated) fetchUser();
    }
  }, [accessToken, isAuthenticated, fetchUser]);

  return <>{children}</>;
}
