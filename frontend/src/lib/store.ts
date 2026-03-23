import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { apiClient } from '@/lib/api';

export interface User {
  id: string;
  email: string;
  name: string | null;
  tier: 'FREE' | 'PRO' | 'ELITE';
  role: 'USER' | 'ADMIN';
  avatarUrl: string | null;
  subStatus: string;
  subPeriodEnd: string | null;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;

  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshTokens: () => Promise<boolean>;
  setTokens: (access: string, refresh: string) => void;
  fetchUser: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isLoading: false,
      isAuthenticated: false,

      login: async (email, password) => {
        set({ isLoading: true });
        try {
          const { data } = await apiClient.post('/auth/login', { email, password });
          set({
            user: data.user,
            accessToken: data.accessToken,
            refreshToken: data.refreshToken,
            isAuthenticated: true,
          });
          apiClient.defaults.headers.common['Authorization'] = `Bearer ${data.accessToken}`;
        } finally {
          set({ isLoading: false });
        }
      },

      signup: async (email, password, name) => {
        set({ isLoading: true });
        try {
          const { data } = await apiClient.post('/auth/signup', { email, password, name });
          set({
            user: data.user,
            accessToken: data.accessToken,
            refreshToken: data.refreshToken,
            isAuthenticated: true,
          });
          apiClient.defaults.headers.common['Authorization'] = `Bearer ${data.accessToken}`;
        } finally {
          set({ isLoading: false });
        }
      },

      logout: async () => {
        try {
          await apiClient.post('/auth/logout');
        } catch {}
        delete apiClient.defaults.headers.common['Authorization'];
        set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false });
      },

      refreshTokens: async () => {
        const { refreshToken } = get();
        if (!refreshToken) return false;
        try {
          const { data } = await apiClient.post('/auth/refresh', { refreshToken });
          set({ accessToken: data.accessToken });
          apiClient.defaults.headers.common['Authorization'] = `Bearer ${data.accessToken}`;
          return true;
        } catch {
          set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false });
          return false;
        }
      },

      setTokens: (access, refresh) => {
        set({ accessToken: access, refreshToken: refresh });
        apiClient.defaults.headers.common['Authorization'] = `Bearer ${access}`;
      },

      fetchUser: async () => {
        try {
          const { data } = await apiClient.get('/auth/me');
          set({ user: data.user, isAuthenticated: true });
        } catch {
          set({ isAuthenticated: false, user: null });
        }
      },
    }),
    {
      name: 'pt-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
      }),
    }
  )
);
