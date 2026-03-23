'use client';
import Link from 'next/link';
import { useState } from 'react';
import { ExternalLink, Brain, Loader2, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { api } from '@/lib/api';
import { cn, timeAgo } from '@/lib/utils';
import toast from 'react-hot-toast';

// ─── NewsCard ─────────────────────────────────────────────────────────────────
export function NewsCard({ news }: { news: any }) {
  const sentimentColor =
    news.sentiment > 0.1 ? 'text-terminal-green' :
    news.sentiment < -0.1 ? 'text-terminal-red' : 'text-muted-foreground';

  return (
    <div className="terminal-panel px-4 py-3 hover:border-terminal-border/80 transition-all">
      <div className="flex items-start gap-3">
        {news.imageUrl && (
          <img
            src={news.imageUrl}
            alt=""
            className="h-12 w-16 object-cover rounded shrink-0 bg-terminal-dim"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        )}
        <div className="flex-1 min-w-0">
          <a
            href={news.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mono text-xs text-foreground hover:text-terminal-green transition-colors line-clamp-2 leading-relaxed"
          >
            {news.headline}
          </a>
          {news.summary && (
            <p className="mono text-[11px] text-muted-foreground mt-1 line-clamp-2">{news.summary}</p>
          )}
          <div className="flex items-center gap-3 mt-2">
            <span className="mono text-[10px] text-muted-foreground">{news.source}</span>
            <span className="mono text-[10px] text-muted-foreground">{timeAgo(news.publishedAt)}</span>
            {news.sentiment != null && (
              <span className={cn('mono text-[10px] font-bold', sentimentColor)}>
                {news.sentiment > 0 ? '▲' : news.sentiment < 0 ? '▼' : '■'}
                {' '}{Math.abs(news.sentiment).toFixed(2)}
              </span>
            )}
            <a href={news.url} target="_blank" rel="noopener noreferrer" className="ml-auto">
              <ExternalLink size={10} className="text-muted-foreground hover:text-terminal-green transition-colors" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── AIInsightPanel ───────────────────────────────────────────────────────────
export function AIInsightPanel({ ticker, latestReport }: { ticker: string; latestReport: any }) {
  const [insight, setInsight] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const generateInsight = async () => {
    if (!latestReport) {
      toast.error('No earnings report available');
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.getEarningsInsight(ticker, latestReport.id);
      setInsight(data.insight);
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Failed to generate insight';
      if (err.response?.status === 403) {
        toast.error('AI Insights require PRO or ELITE tier');
      } else {
        toast.error(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  if (!insight) {
    return (
      <div className="terminal-panel p-8 flex flex-col items-center gap-4">
        <div className="h-12 w-12 rounded-full bg-terminal-green/10 border border-terminal-green/30 flex items-center justify-center">
          <Brain size={20} className="text-terminal-green" />
        </div>
        <div className="text-center">
          <h3 className="mono text-sm text-foreground">AI EARNINGS INSIGHT</h3>
          <p className="mono text-xs text-muted-foreground mt-1">
            Generate a structured AI analysis of {ticker}'s latest earnings
          </p>
        </div>
        {!latestReport && (
          <p className="mono text-xs text-muted-foreground">No reported earnings available</p>
        )}
        <button
          onClick={generateInsight}
          disabled={loading || !latestReport}
          className="flex items-center gap-2 rounded border border-terminal-green/50 bg-terminal-green/10 px-4 py-2 text-terminal-green mono text-xs font-bold hover:bg-terminal-green/20 transition-all disabled:opacity-50"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <Brain size={12} />}
          {loading ? 'ANALYZING...' : 'GENERATE INSIGHT'}
        </button>
        {latestReport && (
          <p className="mono text-[10px] text-muted-foreground">
            Analysis of {latestReport.fiscalQuarter}
          </p>
        )}
      </div>
    );
  }

  const sentimentColor =
    ['VERY_BULLISH', 'BULLISH'].includes(insight.sentiment) ? 'text-terminal-green' :
    ['VERY_BEARISH', 'BEARISH'].includes(insight.sentiment) ? 'text-terminal-red' : 'text-terminal-amber';

  const beatColor = insight.beat_miss === 'BEAT' ? 'text-terminal-green' :
                    insight.beat_miss === 'MISS' ? 'text-terminal-red' : 'text-terminal-amber';

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="terminal-panel p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain size={14} className="text-terminal-green" />
          <span className="mono text-xs font-bold">AI ANALYSIS — {ticker} {latestReport?.fiscalQuarter}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className={cn('mono text-xs font-bold', beatColor)}>{insight.beat_miss}</span>
          <span className={cn('mono text-xs font-bold', sentimentColor)}>{insight.sentiment}</span>
          <span className="mono text-[10px] text-muted-foreground">
            {Math.round((insight.confidence ?? 0) * 100)}% CONFIDENCE
          </span>
        </div>
      </div>

      {/* Summary */}
      <div className="terminal-panel p-4">
        <h4 className="mono text-[10px] text-muted-foreground mb-2">EXECUTIVE SUMMARY</h4>
        <p className="mono text-xs text-foreground leading-relaxed">{insight.summary}</p>
      </div>

      {/* Key changes + analysis grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className="terminal-panel p-4">
          <h4 className="mono text-[10px] text-muted-foreground mb-2">KEY CHANGES</h4>
          <ul className="space-y-1.5">
            {(insight.key_changes ?? []).map((c: string, i: number) => (
              <li key={i} className="mono text-xs text-foreground flex gap-2">
                <span className="text-terminal-green shrink-0">›</span>
                <span className="leading-relaxed">{c}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="terminal-panel p-4">
          <h4 className="mono text-[10px] text-muted-foreground mb-2">ANOMALIES / FLAGS</h4>
          {(insight.anomalies?.length > 0) ? (
            <ul className="space-y-1.5">
              {insight.anomalies.map((a: string, i: number) => (
                <li key={i} className="mono text-xs text-terminal-amber flex gap-2">
                  <span className="shrink-0">⚠</span>
                  <span className="leading-relaxed">{a}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mono text-xs text-muted-foreground">No anomalies detected</p>
          )}
        </div>
      </div>

      {/* Bull / Bear case */}
      <div className="grid grid-cols-2 gap-3">
        <div className="terminal-panel p-4 border-terminal-green/20">
          <h4 className="mono text-[10px] text-terminal-green mb-2">▲ BULL CASE</h4>
          <p className="mono text-xs text-foreground leading-relaxed">{insight.bull_case}</p>
        </div>
        <div className="terminal-panel p-4 border-terminal-red/20">
          <h4 className="mono text-[10px] text-terminal-red mb-2">▼ BEAR CASE</h4>
          <p className="mono text-xs text-foreground leading-relaxed">{insight.bear_case}</p>
        </div>
      </div>

      <button
        onClick={() => setInsight(null)}
        className="mono text-[10px] text-muted-foreground hover:text-foreground transition-colors"
      >
        ← Regenerate
      </button>
    </div>
  );
}

// ─── TrendingTickers ──────────────────────────────────────────────────────────
export function TrendingTickers({ tickers }: { tickers: any[] }) {
  if (!tickers.length) {
    return <div className="terminal-panel p-4"><p className="mono text-xs text-muted-foreground">Loading...</p></div>;
  }
  return (
    <div className="terminal-panel overflow-hidden">
      {tickers.map((t: any, i: number) => (
        <Link
          key={t.ticker}
          href={`/dashboard/company/${t.ticker}`}
          className="flex items-center justify-between px-3 py-2 border-b border-terminal-border/50 last:border-0 hover:bg-white/3 transition-all group"
        >
          <div className="flex items-center gap-2">
            <span className="mono text-[10px] text-muted-foreground w-4">{i + 1}</span>
            <span className="mono text-xs font-bold text-foreground group-hover:text-terminal-green transition-colors">
              {t.ticker}
            </span>
            <span className="mono text-[10px] text-muted-foreground truncate max-w-24">{t.name}</span>
          </div>
          <div className="flex items-center gap-2">
            {t.signal_count > 0 && (
              <span className="mono text-[9px] text-terminal-amber">{t.signal_count}⚡</span>
            )}
            {t.avg_sentiment != null && (
              <span className={cn(
                'mono text-[10px] font-bold',
                t.avg_sentiment > 0.1 ? 'text-terminal-green' :
                t.avg_sentiment < -0.1 ? 'text-terminal-red' : 'text-muted-foreground'
              )}>
                {t.avg_sentiment > 0 ? '+' : ''}{Number(t.avg_sentiment).toFixed(2)}
              </span>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}

// ─── WatchlistPanel ───────────────────────────────────────────────────────────
export function WatchlistPanel({ items }: { items: any[] }) {
  if (!items.length) {
    return (
      <div className="terminal-panel p-6 text-center">
        <p className="mono text-xs text-muted-foreground">
          Your watchlist is empty. Search for tickers to add them.
        </p>
      </div>
    );
  }
  return (
    <div className="terminal-panel overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-terminal-border">
            {['TICKER', 'COMPANY', 'SECTOR', 'SIGNAL', 'SENTIMENT', ''].map(h => (
              <th key={h} className="mono text-[10px] text-muted-foreground text-left p-3 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item: any) => (
            <tr key={item.id} className="border-b border-terminal-border/50 hover:bg-white/2 transition-colors">
              <td className="p-3">
                <Link href={`/dashboard/company/${item.ticker}`} className="mono text-xs font-bold text-terminal-green hover:underline">
                  {item.ticker}
                </Link>
              </td>
              <td className="mono text-xs text-muted-foreground p-3">{item.company?.name}</td>
              <td className="mono text-xs text-muted-foreground p-3">{item.company?.sector ?? '—'}</td>
              <td className="p-3">
                {item.latestSignal ? (
                  <span className={cn('mono text-[10px] font-bold',
                    item.latestSignal.severity === 'CRITICAL' ? 'text-terminal-red' :
                    item.latestSignal.severity === 'HIGH' ? 'text-terminal-amber' : 'text-terminal-blue'
                  )}>
                    {item.latestSignal.type.replace(/_/g, ' ')}
                  </span>
                ) : <span className="mono text-[10px] text-muted-foreground">—</span>}
              </td>
              <td className="p-3">
                {item.latestSentiment ? (
                  <span className={cn('mono text-xs font-bold',
                    item.latestSentiment.score > 0.1 ? 'text-terminal-green' :
                    item.latestSentiment.score < -0.1 ? 'text-terminal-red' : 'text-muted-foreground'
                  )}>
                    {item.latestSentiment.score > 0 ? '+' : ''}{item.latestSentiment.score.toFixed(3)}
                  </span>
                ) : <span className="mono text-[10px] text-muted-foreground">—</span>}
              </td>
              <td className="p-3">
                <Link href={`/dashboard/company/${item.ticker}`} className="mono text-[10px] text-muted-foreground hover:text-terminal-green transition-colors">
                  VIEW →
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── EarningsCalendarWidget ───────────────────────────────────────────────────
export function EarningsCalendarWidget({ data }: { data: Record<string, any[]> }) {
  const dates = Object.keys(data).sort().slice(0, 5);
  if (!dates.length) {
    return <div className="terminal-panel p-4"><p className="mono text-[10px] text-muted-foreground">No upcoming earnings</p></div>;
  }
  return (
    <div className="terminal-panel overflow-hidden">
      {dates.map(date => {
        const reports = data[date];
        const isToday = date === new Date().toISOString().split('T')[0];
        return (
          <div key={date} className="border-b border-terminal-border/50 last:border-0">
            <div className={cn(
              'mono text-[9px] px-3 py-1.5 font-bold',
              isToday ? 'bg-terminal-amber/10 text-terminal-amber' : 'bg-terminal-dim/50 text-muted-foreground'
            )}>
              {new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase()}
              {isToday && ' — TODAY'}
            </div>
            {reports.slice(0, 3).map((r: any) => (
              <Link
                key={r.id}
                href={`/dashboard/company/${r.ticker}`}
                className="flex items-center justify-between px-3 py-1.5 hover:bg-white/3 transition-all"
              >
                <span className="mono text-xs font-bold text-foreground hover:text-terminal-green">{r.ticker}</span>
                <span className="mono text-[9px] text-muted-foreground">{r.reportTime}</span>
              </Link>
            ))}
            {reports.length > 3 && (
              <div className="mono text-[9px] text-muted-foreground px-3 py-1">+{reports.length - 3} more</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
