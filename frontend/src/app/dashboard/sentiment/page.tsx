'use client';
import useSWR from 'swr';
import { useState } from 'react';
import { api } from '@/lib/api';
import { SentimentChart, SentimentMeter } from '@/components/charts/index';
import { TrendingUp, TrendingDown, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';

type LeaderboardEntry = {
  ticker: string;
  name: string;
  logoUrl: string | null;
  sector: string;
  avg_score: number;
  total_mentions: number;
  velocity: number | null;
};

export default function SentimentPage() {
  const [tab, setTab] = useState<'bullish' | 'bearish'>('bullish');
  const [searchTicker, setSearchTicker] = useState('');
  const [tickerData, setTickerData] = useState<any>(null);
  const [tickerLoading, setTickerLoading] = useState(false);

  const { data: bullishData, isLoading: bullLoading } = useSWR(
    'sentiment-bullish',
    () => api.getBullishLeaderboard().then(r => r.data),
    { refreshInterval: 120000 }
  );

  const { data: bearishData, isLoading: bearLoading } = useSWR(
    'sentiment-bearish',
    () => api.getBearishLeaderboard().then(r => r.data),
    { refreshInterval: 120000 }
  );

  const leaderboard: LeaderboardEntry[] =
    tab === 'bullish' ? (bullishData?.leaderboard ?? []) :
                        (bearishData?.leaderboard ?? []);
  const isLoading = tab === 'bullish' ? bullLoading : bearLoading;

  const lookupTicker = async () => {
    if (!searchTicker.trim()) return;
    setTickerLoading(true);
    try {
      const { data } = await api.getSentiment(searchTicker.trim().toUpperCase(), 72);
      setTickerData({ ticker: searchTicker.toUpperCase(), ...data });
    } catch {
      setTickerData(null);
    } finally {
      setTickerLoading(false);
    }
  };

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="mono text-sm font-semibold">SENTIMENT DASHBOARD</h1>
          <p className="mono text-xs text-muted-foreground mt-0.5">
            NLP ANALYSIS ACROSS REDDIT · NEWS · SOCIAL
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-1.5 rounded-full bg-terminal-green animate-pulse" />
          <span className="mono text-[10px] text-terminal-green">LIVE SCORING</span>
        </div>
      </div>

      {/* Ticker lookup */}
      <div className="terminal-panel p-4">
        <h3 className="mono text-xs text-muted-foreground mb-3">TICKER SENTIMENT LOOKUP</h3>
        <div className="flex gap-2">
          <input
            type="text"
            value={searchTicker}
            onChange={e => setSearchTicker(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && lookupTicker()}
            placeholder="AAPL"
            maxLength={10}
            className="flex-1 bg-terminal-dim border border-terminal-border rounded px-3 py-2 mono text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-terminal-green/50 transition-colors"
          />
          <button
            onClick={lookupTicker}
            disabled={tickerLoading || !searchTicker.trim()}
            className="px-4 py-2 rounded border border-terminal-green/50 bg-terminal-green/10 text-terminal-green mono text-xs font-bold hover:bg-terminal-green/20 transition-all disabled:opacity-50"
          >
            {tickerLoading ? 'LOADING...' : 'ANALYZE'}
          </button>
        </div>

        {tickerData && (
          <div className="mt-4 space-y-4">
            <div className="flex items-center justify-between">
              <span className="mono text-sm font-bold text-terminal-green">${tickerData.ticker}</span>
              <Link
                href={`/dashboard/company/${tickerData.ticker}`}
                className="mono text-[10px] text-muted-foreground hover:text-terminal-green transition-colors"
              >
                FULL PROFILE →
              </Link>
            </div>

            {tickerData.aggregate && (
              <SentimentMeter score={tickerData.aggregate.avgScore ?? 0} />
            )}

            <div className="grid grid-cols-4 gap-3">
              {[
                { label: 'MENTIONS', value: tickerData.aggregate?.totalMentions ?? 0, color: 'text-foreground' },
                { label: 'BULLISH', value: tickerData.aggregate?.bullish ?? 0, color: 'text-terminal-green' },
                { label: 'BEARISH', value: tickerData.aggregate?.bearish ?? 0, color: 'text-terminal-red' },
                { label: 'NEUTRAL', value: tickerData.aggregate?.neutral ?? 0, color: 'text-muted-foreground' },
              ].map(stat => (
                <div key={stat.label} className="bg-terminal-dim rounded p-3 text-center">
                  <div className="mono text-[9px] text-muted-foreground">{stat.label}</div>
                  <div className={cn('mono text-lg font-bold mt-1', stat.color)}>
                    {stat.value.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>

            {tickerData.logs?.length > 0 && (
              <div>
                <h4 className="mono text-[10px] text-muted-foreground mb-2">72H SENTIMENT TREND</h4>
                <SentimentChart data={tickerData.logs} height={160} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Leaderboard */}
      <div className="space-y-3">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setTab('bullish')}
            className={cn(
              'flex items-center gap-1.5 rounded px-3 py-1.5 mono text-xs border transition-all',
              tab === 'bullish'
                ? 'border-terminal-green/50 bg-terminal-green/10 text-terminal-green'
                : 'border-terminal-border text-muted-foreground hover:text-foreground'
            )}
          >
            <TrendingUp size={11} /> MOST BULLISH
          </button>
          <button
            onClick={() => setTab('bearish')}
            className={cn(
              'flex items-center gap-1.5 rounded px-3 py-1.5 mono text-xs border transition-all',
              tab === 'bearish'
                ? 'border-terminal-red/50 bg-terminal-red/10 text-terminal-red'
                : 'border-terminal-border text-muted-foreground hover:text-foreground'
            )}
          >
            <TrendingDown size={11} /> MOST BEARISH
          </button>
        </div>

        <div className="terminal-panel overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-terminal-border">
                {['#', 'TICKER', 'COMPANY', 'SECTOR', 'SCORE', 'MENTIONS', 'TREND'].map(h => (
                  <th key={h} className="mono text-[10px] text-muted-foreground text-left p-3 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-terminal-border/50">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="p-3">
                        <div className="h-3 bg-terminal-dim rounded animate-pulse w-16" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : leaderboard.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center mono text-xs text-muted-foreground">
                    No data available
                  </td>
                </tr>
              ) : (
                leaderboard.map((entry, i) => {
                  const isBullish = entry.avg_score > 0;
                  const scoreColor = isBullish ? 'text-terminal-green' : 'text-terminal-red';
                  return (
                    <tr key={entry.ticker} className="border-b border-terminal-border/50 hover:bg-white/2 transition-colors">
                      <td className="mono text-[10px] text-muted-foreground p-3">{i + 1}</td>
                      <td className="p-3">
                        <Link
                          href={`/dashboard/company/${entry.ticker}`}
                          className="mono text-xs font-bold text-terminal-green hover:underline"
                        >
                          {entry.ticker}
                        </Link>
                      </td>
                      <td className="mono text-xs text-muted-foreground p-3 max-w-40 truncate">{entry.name}</td>
                      <td className="mono text-[10px] text-muted-foreground p-3">{entry.sector}</td>
                      <td className={cn('mono text-xs font-bold p-3', scoreColor)}>
                        {entry.avg_score > 0 ? '+' : ''}{Number(entry.avg_score).toFixed(3)}
                      </td>
                      <td className="mono text-xs text-foreground p-3">
                        {Number(entry.total_mentions).toLocaleString()}
                      </td>
                      <td className="p-3">
                        {entry.velocity != null && (
                          <span className={cn(
                            'mono text-[10px] font-bold flex items-center gap-1',
                            entry.velocity > 0 ? 'text-terminal-green' : 'text-terminal-red'
                          )}>
                            {entry.velocity > 0 ? '↑' : '↓'}
                            {Math.abs(Number(entry.velocity)).toFixed(2)}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
