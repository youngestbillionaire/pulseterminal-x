import axios from 'axios';

export const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// Response interceptor — handle 401s with auto token refresh
apiClient.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;

    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;

      try {
        const { useAuthStore } = await import('./store');
        const refreshed = await useAuthStore.getState().refreshTokens();
        if (refreshed) {
          const newToken = useAuthStore.getState().accessToken;
          original.headers['Authorization'] = `Bearer ${newToken}`;
          return apiClient(original);
        }
      } catch {}

      // Redirect to login
      if (typeof window !== 'undefined') {
        window.location.href = '/auth/login';
      }
    }

    return Promise.reject(error);
  }
);

// ─── API helpers ──────────────────────────────────────────────────────────────

export const api = {
  // Companies
  getCompany: (ticker: string) => apiClient.get(`/companies/${ticker}`),
  searchCompanies: (q: string) => apiClient.get(`/companies/search?q=${q}`),
  getTrending: () => apiClient.get('/companies/trending'),
  getCompanyNews: (ticker: string, page = 1) =>
    apiClient.get(`/companies/${ticker}/news?page=${page}`),
  getRedditMentions: (ticker: string, hours = 24) =>
    apiClient.get(`/companies/${ticker}/reddit?hours=${hours}`),

  // Earnings
  getEarnings: (ticker: string) => apiClient.get(`/earnings/${ticker}`),
  getEarningsCalendar: (weeks = 2) => apiClient.get(`/earnings/calendar?weeks=${weeks}`),
  getUpcomingEarnings: (ticker: string) => apiClient.get(`/earnings/${ticker}/upcoming`),
  getEarningsInsight: (ticker: string, reportId: string) =>
    apiClient.get(`/earnings/${ticker}/${reportId}/insight`),

  // Sentiment
  getSentiment: (ticker: string, hours = 24) =>
    apiClient.get(`/sentiment/${ticker}?hours=${hours}`),
  getBullishLeaderboard: () => apiClient.get('/sentiment/leaderboard/bullish'),
  getBearishLeaderboard: () => apiClient.get('/sentiment/leaderboard/bearish'),

  // Signals
  getSignals: (params?: Record<string, any>) =>
    apiClient.get('/signals', { params }),
  getTopSignals: () => apiClient.get('/signals/top'),
  getTickerSignals: (ticker: string) => apiClient.get(`/signals/${ticker}`),

  // Watchlist
  getWatchlist: () => apiClient.get('/watchlist'),
  addToWatchlist: (ticker: string, notes?: string) =>
    apiClient.post('/watchlist', { ticker, notes }),
  removeFromWatchlist: (ticker: string) => apiClient.delete(`/watchlist/${ticker}`),

  // Alerts
  getAlerts: () => apiClient.get('/alerts'),
  createAlert: (data: any) => apiClient.post('/alerts', data),
  deleteAlert: (id: string) => apiClient.delete(`/alerts/${id}`),

  // Subscription
  createCheckout: (plan: 'PRO' | 'ELITE') => apiClient.post('/subscription/checkout', { plan }),
  openBillingPortal: () => apiClient.post('/subscription/portal'),
};
