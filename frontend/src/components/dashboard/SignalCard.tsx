'use client';
import Link from 'next/link';
import { Zap, TrendingUp, TrendingDown, Activity, AlertTriangle, BarChart2 } from 'lucide-react';
import { cn, timeAgo } from '@/lib/utils';

const SEVERITY_CONFIG = {
  CRITICAL: { color: 'text-terminal-red', bg: 'bg-terminal-red/10', border: 'border-terminal-red/40', glow: 'terminal-glow-red' },
  HIGH: { color: 'text-terminal-amber', bg: 'bg-terminal-amber/10', border: 'border-terminal-amber/40', glow: '' },
  MEDIUM: { color: 'text-terminal-blue', bg: 'bg-terminal-blue/10', border: 'border-terminal-blue/30', glow: '' },
  LOW: { color: 'text-muted-foreground', bg: 'bg-white/5', border: 'border-terminal-border', glow: '' },
};

const TYPE_ICONS: Record<string, React.ReactNode> = {
  MENTION_SPIKE: <Activity size={12} />,
  SENTIMENT_REVERSAL: <TrendingUp size={12} />,
  EARNINGS_BEAT: <TrendingUp size={12} />,
  EARNINGS_MISS: <TrendingDown size={12} />,
  UNUSUAL_VOLUME: <BarChart2 size={12} />,
  GUIDANCE_RAISE: <TrendingUp size={12} />,
  GUIDANCE_CUT: <TrendingDown size={12} />,
  ANALYST_UPGRADE: <TrendingUp size={12} />,
  ANALYST_DOWNGRADE: <TrendingDown size={12} />,
};

export function SignalCard({ signal, expanded = false }: { signal: any; expanded?: boolean }) {
  const cfg = SEVERITY_CONFIG[signal.severity as keyof typeof SEVERITY_CONFIG] ?? SEVERITY_CONFIG.LOW;

  return (
    <div className={cn(
      'terminal-panel px-4 py-3 border transition-all hover:brightness-110',
      cfg.border, cfg.glow
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          {/* Severity indicator */}
          <div className={cn('mt-0.5 rounded p-1.5 shrink-0', cfg.bg)}>
            <span className={cfg.color}>
              {TYPE_ICONS[signal.type] ?? <Zap size={12} />}
            </span>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {signal.company && (
                <Link
                  href={`/dashboard/company/${signal.ticker}`}
                  className="mono text-xs font-bold text-terminal-green hover:underline"
                >
                  ${signal.ticker}
                </Link>
              )}
              <span className="mono text-xs text-foreground truncate">{signal.title}</span>
            </div>

            {expanded && (
              <p className="mono text-[11px] text-muted-foreground mt-1 leading-relaxed">
                {signal.description}
              </p>
            )}

            <div className="flex items-center gap-3 mt-1.5">
              <span className={cn('mono text-[9px] font-bold rounded px-1.5 py-0.5', cfg.bg, cfg.color)}>
                {signal.severity}
              </span>
              <span className="mono text-[10px] text-muted-foreground">
                {signal.type.replace(/_/g, ' ')}
              </span>
              {signal.company?.sector && (
                <span className="mono text-[10px] text-muted-foreground">
                  {signal.company.sector}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1 shrink-0">
          <div className="mono text-xs font-bold text-foreground">
            {signal.score?.toFixed(0)}
            <span className="text-muted-foreground text-[10px]">/100</span>
          </div>
          <div className="mono text-[10px] text-muted-foreground">
            {timeAgo(signal.detectedAt)}
          </div>
        </div>
      </div>
    </div>
  );
}
