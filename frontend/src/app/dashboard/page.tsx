'use client';
import { useEffect } from 'react';
import useSWR from 'swr';
import { api } from '@/lib/api';
import { SignalCard } from '@/components/dashboard/SignalCard';
import { SentimentMeter } from '@/components/dashboard/SentimentMeter';
import { EarningsCalendarWidget } from '@/components/dashboard/EarningsCalendarWidget';
import { TrendingTickers } from '@/components/dashboard/TrendingTickers';
import { WatchlistPanel } from '@/components/dashboard/WatchlistPanel';
import { useAuthStore } from '@/lib/store';
import { useWebSocket } from '@/components/providers/WebSocketProvider';
import { Zap, TrendingUp, Activity, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';

const fetcher = (key: string) => {
  const fnMap: Record<string, () => Promise<any>> = {
    '/signals/top': () => api.getTopSignals().then(r => r.data),
    '/companies/trending': () => api.getTrending().then(r => r.data),
    '/earnings/calendar': () => api.getEarningsCalendar(1).then(r => r.data),
    '/watchlist': () => api.getWatchlist().then(r => r.data),
  };
  return fnMap[key]?.() ?? Promise.resolve(null);
};

export default function DashboardPage() {
  const { user } = useAuthStore();
  const { connected } = useWebSocket();

  const { data: signalsData } = useSWR('/signals/top', fetcher, { refreshInterval: 30000 });
  const { data: trendingData } = useSWR('/companies/trending', fetcher, { refreshInterval: 60000 });
  const { data: calendarData } = useSWR('/earnings/calendar', fetcher, { refreshInterval: 300000 });
  const { data: watchlistData } = useSWR('/watchlist', fetcher, { refreshInterval: 60000 });

  const signals = signalsData?.signals ?? [];
  const trending = trendingData?.tickers ?? [];

  return (
    <div className="h-full overflow-auto p-4 space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="mono text-sm font-semibold text-foreground">
            TERMINAL OVERVIEW
          </h1>
          <p className="mono text-xs text-muted-foreground mt-0.5">
            {new Date().toLocaleDateString('en-US', {
              weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
            }).toUpperCase()}
          </p>
        </div>

        <div className="flex items-center gap-4">
          <StatPill
            icon={<Zap size={11} />}
            label="ACTIVE SIGNALS"
            value={signals.length.toString()}
            color="amber"
          />
          <StatPill
            icon={<TrendingUp size={11} />}
            label="TRENDING"
            value={trending.length.toString()}
            color="green"
          />
          <StatPill
            icon={<Activity size={11} />}
            label="FEED"
            value={connected ? 'LIVE' : 'DELAYED'}
            color={connected ? 'green' : 'red'}
            pulse={connected}
          />
        </div>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-12 gap-3">
        {/* Signals panel - 8 cols */}
        <div className="col-span-8 space-y-3">
          <PanelHeader icon={<Zap size={12} />} title="ACTIVE SIGNALS" subtitle="REAL-TIME DETECTION" />
          <div className="space-y-2">
            {signals.length === 0 ? (
              <EmptyState message="No active signals in the last 24h" />
            ) : (
              signals.slice(0, 6).map((sig: any) => (
                <SignalCard key={sig.id} signal={sig} />
              ))
            )}
          </div>
        </div>

        {/* Right column - 4 cols */}
        <div className="col-span-4 space-y-3">
          {/* Earnings calendar */}
          <div>
            <PanelHeader icon={<Calendar size={12} />} title="EARNINGS" subtitle="THIS WEEK" />
            <EarningsCalendarWidget data={calendarData?.calendar ?? {}} />
          </div>

          {/* Trending tickers */}
          <div>
            <PanelHeader icon={<TrendingUp size={12} />} title="TRENDING" subtitle="24H ACTIVITY" />
            <TrendingTickers tickers={trending.slice(0, 8)} />
          </div>
        </div>

        {/* Watchlist - full width bottom */}
        <div className="col-span-12">
          <PanelHeader icon={<Activity size={12} />} title="WATCHLIST" subtitle={`${watchlistData?.watchlist?.length ?? 0} TICKERS`} />
          <WatchlistPanel items={watchlistData?.watchlist ?? []} />
        </div>
      </div>
    </div>
  );
}

function StatPill({ icon, label, value, color, pulse }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: 'green' | 'red' | 'amber' | 'blue';
  pulse?: boolean;
}) {
  const colorMap = {
    green: 'text-terminal-green border-terminal-green/30 bg-terminal-green/5',
    red: 'text-terminal-red border-terminal-red/30 bg-terminal-red/5',
    amber: 'text-amber-400 border-amber-400/30 bg-amber-400/5',
    blue: 'text-terminal-blue border-terminal-blue/30 bg-terminal-blue/5',
  };
  return (
    <div className={cn(
      'flex items-center gap-2 rounded border px-3 py-1.5',
      colorMap[color]
    )}>
      <span className={pulse ? 'animate-pulse' : ''}>{icon}</span>
      <div>
        <div className="mono text-[9px] text-muted-foreground">{label}</div>
        <div className="mono text-xs font-bold">{value}</div>
      </div>
    </div>
  );
}

function PanelHeader({ icon, title, subtitle }: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-center justify-between mb-2">
      <div className="flex items-center gap-2">
        <span className="text-terminal-green">{icon}</span>
        <span className="mono text-xs font-semibold text-foreground">{title}</span>
      </div>
      <span className="mono text-[10px] text-muted-foreground">{subtitle}</span>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="terminal-panel rounded p-6 flex items-center justify-center">
      <span className="mono text-xs text-muted-foreground">{message}</span>
    </div>
  );
}
