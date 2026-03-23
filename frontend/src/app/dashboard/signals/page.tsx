'use client';
// ─── Signals Page ─────────────────────────────────────────────────────────────
import useSWR from 'swr';
import { api } from '@/lib/api';
import { SignalCard } from '@/components/dashboard/SignalCard';
import { useState } from 'react';
import { cn } from '@/lib/utils';

const SEVERITIES = ['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;
const TYPES = ['ALL', 'MENTION_SPIKE', 'SENTIMENT_REVERSAL', 'EARNINGS_BEAT', 'EARNINGS_MISS', 'UNUSUAL_VOLUME'] as const;

export default function SignalsPage() {
  const [severity, setSeverity] = useState<string>('ALL');
  const [type, setType] = useState<string>('ALL');
  const [hours, setHours] = useState(24);

  const params = {
    ...(severity !== 'ALL' && { severity }),
    ...(type !== 'ALL' && { type }),
    hours,
    limit: 50,
  };

  const { data, isLoading } = useSWR(
    ['signals', severity, type, hours],
    () => api.getSignals(params).then(r => r.data),
    { refreshInterval: 30000 }
  );

  const signals = data?.signals ?? [];

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="mono text-sm font-semibold">SIGNAL DETECTION ENGINE</h1>
          <p className="mono text-xs text-muted-foreground mt-0.5">
            {data?.total ?? 0} SIGNALS DETECTED
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-1.5 rounded-full bg-terminal-green animate-pulse" />
          <span className="mono text-xs text-terminal-green">LIVE MONITORING</span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="flex items-center gap-1">
          <span className="mono text-[10px] text-muted-foreground mr-1">SEVERITY:</span>
          {SEVERITIES.map(s => (
            <button
              key={s}
              onClick={() => setSeverity(s)}
              className={cn(
                'mono text-[10px] rounded px-2 py-1 border transition-all',
                severity === s
                  ? 'border-terminal-green/50 bg-terminal-green/10 text-terminal-green'
                  : 'border-terminal-border text-muted-foreground hover:text-foreground'
              )}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 ml-4">
          <span className="mono text-[10px] text-muted-foreground mr-1">WINDOW:</span>
          {[4, 12, 24, 48, 168].map(h => (
            <button
              key={h}
              onClick={() => setHours(h)}
              className={cn(
                'mono text-[10px] rounded px-2 py-1 border transition-all',
                hours === h
                  ? 'border-terminal-blue/50 bg-terminal-blue/10 text-terminal-blue'
                  : 'border-terminal-border text-muted-foreground hover:text-foreground'
              )}
            >
              {h >= 24 ? `${h / 24}D` : `${h}H`}
            </button>
          ))}
        </div>
      </div>

      {/* Signal list */}
      <div className="space-y-2">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="terminal-panel h-20 animate-pulse" />
          ))
        ) : signals.length === 0 ? (
          <div className="terminal-panel p-12 text-center">
            <p className="mono text-sm text-muted-foreground">No signals match current filters</p>
          </div>
        ) : (
          signals.map((sig: any) => (
            <SignalCard key={sig.id} signal={sig} expanded />
          ))
        )}
      </div>
    </div>
  );
}
