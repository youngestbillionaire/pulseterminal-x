'use client';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import Link from 'next/link';

export function LiveTicker() {
  const { data } = useSWR(
    'trending-tape',
    () => api.getTrending().then(r => r.data),
    { refreshInterval: 60000 }
  );

  const tickers = data?.tickers ?? [];
  if (!tickers.length) return <div className="h-6 border-b border-terminal-border bg-terminal-panel" />;

  // Duplicate for seamless loop
  const items = [...tickers, ...tickers];

  return (
    <div className="h-6 border-b border-terminal-border bg-terminal-panel overflow-hidden flex items-center relative">
      <div className="absolute left-0 z-10 h-full w-8 bg-gradient-to-r from-terminal-panel to-transparent pointer-events-none" />
      <div className="absolute right-0 z-10 h-full w-8 bg-gradient-to-l from-terminal-panel to-transparent pointer-events-none" />

      <div className="flex animate-ticker whitespace-nowrap">
        {items.map((t: any, i: number) => (
          <Link
            key={`${t.ticker}-${i}`}
            href={`/dashboard/company/${t.ticker}`}
            className="flex items-center gap-2 px-4 hover:text-terminal-green transition-colors"
          >
            <span className="mono text-[10px] font-bold text-foreground">{t.ticker}</span>
            {t.avg_sentiment != null && (
              <span className={cn(
                'mono text-[9px]',
                Number(t.avg_sentiment) > 0.05 ? 'text-terminal-green' :
                Number(t.avg_sentiment) < -0.05 ? 'text-terminal-red' : 'text-muted-foreground'
              )}>
                {Number(t.avg_sentiment) > 0 ? '▲' : Number(t.avg_sentiment) < 0 ? '▼' : '■'}
              </span>
            )}
            <span className="text-terminal-border mx-2">|</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
