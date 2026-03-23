'use client';
import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { api } from '@/lib/api';
import { useWebSocket } from '@/components/providers/WebSocketProvider';
import { EarningsChart } from '@/components/charts/EarningsChart';
import { SentimentChart } from '@/components/charts/SentimentChart';
import { SignalCard } from '@/components/dashboard/SignalCard';
import { NewsCard } from '@/components/dashboard/NewsCard';
import { AIInsightPanel } from '@/components/dashboard/AIInsightPanel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TrendingUp, TrendingDown, Activity, Zap, Newspaper, Brain } from 'lucide-react';
import { cn, formatNumber, formatPct } from '@/lib/utils';

export default function CompanyPage() {
  const { ticker } = useParams<{ ticker: string }>();
  const { subscribeTicker, unsubscribeTicker } = useWebSocket();
  const tickerUpper = ticker?.toUpperCase() ?? '';

  useEffect(() => {
    if (tickerUpper) {
      subscribeTicker(tickerUpper);
      return () => unsubscribeTicker(tickerUpper);
    }
  }, [tickerUpper]);

  const { data: companyData, error } = useSWR(
    tickerUpper ? `/companies/${tickerUpper}` : null,
    () => api.getCompany(tickerUpper).then(r => r.data),
    { refreshInterval: 60000 }
  );

  const { data: sentimentData } = useSWR(
    tickerUpper ? `/sentiment/${tickerUpper}` : null,
    () => api.getSentiment(tickerUpper, 72).then(r => r.data),
    { refreshInterval: 120000 }
  );

  const { data: newsData } = useSWR(
    tickerUpper ? `/companies/${tickerUpper}/news` : null,
    () => api.getCompanyNews(tickerUpper).then(r => r.data),
    { refreshInterval: 300000 }
  );

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="terminal-panel p-8 text-center">
          <p className="mono text-sm text-terminal-red">TICKER NOT FOUND: {tickerUpper}</p>
        </div>
      </div>
    );
  }

  if (!companyData) {
    return <LoadingSkeleton />;
  }

  const { company } = companyData;
  const latestEarnings = company.earnings?.[0];
  const latestSentiment = sentimentData?.logs?.[0];

  return (
    <div className="h-full overflow-auto p-4 space-y-4">
      {/* Company header */}
      <div className="terminal-panel p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            {company.logoUrl ? (
              <img src={company.logoUrl} alt={company.name} className="h-10 w-10 rounded object-contain bg-white/5 p-1" />
            ) : (
              <div className="h-10 w-10 rounded bg-terminal-dim border border-terminal-border flex items-center justify-center">
                <span className="mono text-sm font-bold text-terminal-green">
                  {tickerUpper.slice(0, 2)}
                </span>
              </div>
            )}
            <div>
              <div className="flex items-center gap-3">
                <h1 className="mono text-lg font-bold text-foreground">{tickerUpper}</h1>
                <span className="mono text-sm text-muted-foreground">{company.name}</span>
                {company.exchange && (
                  <span className="mono text-[10px] border border-terminal-border rounded px-1.5 py-0.5 text-muted-foreground">
                    {company.exchange}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1">
                <span className="mono text-xs text-muted-foreground">{company.sector}</span>
                {company.marketCap && (
                  <span className="mono text-xs text-muted-foreground">
                    MCap: <span className="text-foreground">{formatNumber(company.marketCap)}</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Quick stats */}
          <div className="flex gap-4">
            {latestEarnings?.epsSurprisePct !== undefined && (
              <QuickStat
                label="EPS SURPRISE"
                value={formatPct(latestEarnings.epsSurprisePct)}
                positive={latestEarnings.epsSurprisePct > 0}
              />
            )}
            {latestSentiment && (
              <QuickStat
                label="SENTIMENT"
                value={latestSentiment.score > 0 ? 'BULLISH' : latestSentiment.score < 0 ? 'BEARISH' : 'NEUTRAL'}
                positive={latestSentiment.score > 0}
              />
            )}
            <QuickStat
              label="SIGNALS"
              value={`${company.signals?.length ?? 0} ACTIVE`}
              positive={true}
              neutral={!company.signals?.length}
            />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-3">
        <TabsList className="bg-terminal-panel border border-terminal-border h-8">
          {[
            { value: 'overview', icon: <Activity size={11} />, label: 'OVERVIEW' },
            { value: 'earnings', icon: <TrendingUp size={11} />, label: 'EARNINGS' },
            { value: 'sentiment', icon: <Activity size={11} />, label: 'SENTIMENT' },
            { value: 'signals', icon: <Zap size={11} />, label: 'SIGNALS' },
            { value: 'news', icon: <Newspaper size={11} />, label: 'NEWS' },
            { value: 'ai', icon: <Brain size={11} />, label: 'AI INSIGHT' },
          ].map(tab => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="mono text-[10px] flex items-center gap-1.5 data-[state=active]:bg-terminal-green/10 data-[state=active]:text-terminal-green"
            >
              {tab.icon}{tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="terminal-panel p-4">
              <h3 className="mono text-xs text-muted-foreground mb-3">EARNINGS HISTORY</h3>
              <EarningsChart data={company.earnings ?? []} />
            </div>
            <div className="terminal-panel p-4">
              <h3 className="mono text-xs text-muted-foreground mb-3">SENTIMENT TREND (72H)</h3>
              <SentimentChart data={sentimentData?.logs ?? []} />
            </div>
          </div>

          {/* Active signals */}
          {company.signals?.length > 0 && (
            <div className="space-y-2">
              <h3 className="mono text-xs text-muted-foreground">ACTIVE SIGNALS</h3>
              {company.signals.slice(0, 3).map((sig: any) => (
                <SignalCard key={sig.id} signal={sig} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="earnings">
          <EarningsTable earnings={company.earnings ?? []} ticker={tickerUpper} />
        </TabsContent>

        <TabsContent value="sentiment">
          <div className="grid grid-cols-1 gap-3">
            <div className="terminal-panel p-4">
              <SentimentChart data={sentimentData?.logs ?? []} height={300} />
            </div>
            <SentimentStats aggregate={sentimentData?.aggregate} />
          </div>
        </TabsContent>

        <TabsContent value="signals">
          <div className="space-y-2">
            {company.signals?.length === 0 ? (
              <div className="terminal-panel p-8 text-center">
                <p className="mono text-xs text-muted-foreground">No active signals</p>
              </div>
            ) : (
              company.signals?.map((sig: any) => (
                <SignalCard key={sig.id} signal={sig} expanded />
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="news">
          <div className="space-y-2">
            {newsData?.news?.map((item: any) => (
              <NewsCard key={item.id} news={item} />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="ai">
          <AIInsightPanel
            ticker={tickerUpper}
            latestReport={latestEarnings}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function QuickStat({ label, value, positive, neutral }: {
  label: string; value: string; positive?: boolean; neutral?: boolean;
}) {
  return (
    <div className="text-right">
      <div className="mono text-[9px] text-muted-foreground">{label}</div>
      <div className={cn('mono text-xs font-bold',
        neutral ? 'text-muted-foreground' :
        positive ? 'text-terminal-green' : 'text-terminal-red'
      )}>
        {value}
      </div>
    </div>
  );
}

function EarningsTable({ earnings, ticker }: { earnings: any[]; ticker: string }) {
  return (
    <div className="terminal-panel overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-terminal-border">
            {['QUARTER', 'DATE', 'EPS EST', 'EPS ACT', 'SURPRISE', 'REV EST', 'REV ACT', 'REV SURP'].map(h => (
              <th key={h} className="mono text-[10px] text-muted-foreground text-left p-3 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {earnings.map((e: any) => (
            <tr key={e.id} className="border-b border-terminal-border/50 hover:bg-white/2 transition-colors">
              <td className="mono text-xs text-foreground p-3 font-medium">{e.fiscalQuarter}</td>
              <td className="mono text-xs text-muted-foreground p-3">
                {new Date(e.reportDate).toLocaleDateString()}
              </td>
              <td className="mono text-xs text-muted-foreground p-3">
                {e.epsEstimate != null ? `$${e.epsEstimate.toFixed(2)}` : '—'}
              </td>
              <td className="mono text-xs text-foreground p-3">
                {e.epsActual != null ? `$${e.epsActual.toFixed(2)}` : '—'}
              </td>
              <td className={cn('mono text-xs p-3 font-bold',
                e.epsSurprisePct > 0 ? 'text-terminal-green' :
                e.epsSurprisePct < 0 ? 'text-terminal-red' : 'text-muted-foreground'
              )}>
                {e.epsSurprisePct != null ? `${e.epsSurprisePct > 0 ? '+' : ''}${e.epsSurprisePct.toFixed(1)}%` : '—'}
              </td>
              <td className="mono text-xs text-muted-foreground p-3">
                {e.revenueEstimate != null ? formatNumber(e.revenueEstimate) : '—'}
              </td>
              <td className="mono text-xs text-foreground p-3">
                {e.revenueActual != null ? formatNumber(e.revenueActual) : '—'}
              </td>
              <td className={cn('mono text-xs p-3 font-bold',
                e.revenueSurprisePct > 0 ? 'text-terminal-green' :
                e.revenueSurprisePct < 0 ? 'text-terminal-red' : 'text-muted-foreground'
              )}>
                {e.revenueSurprisePct != null ? `${e.revenueSurprisePct > 0 ? '+' : ''}${e.revenueSurprisePct.toFixed(1)}%` : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SentimentStats({ aggregate }: { aggregate: any }) {
  if (!aggregate) return null;
  const total = aggregate.totalMentions || 1;
  return (
    <div className="terminal-panel p-4 grid grid-cols-4 gap-4">
      {[
        { label: 'TOTAL MENTIONS', value: aggregate.totalMentions?.toLocaleString() ?? '0' },
        { label: 'BULLISH', value: aggregate.bullish?.toString() ?? '0', positive: true },
        { label: 'BEARISH', value: aggregate.bearish?.toString() ?? '0', positive: false },
        { label: 'AVG SCORE', value: aggregate.avgScore?.toFixed(3) ?? '0.000' },
      ].map(stat => (
        <div key={stat.label} className="text-center">
          <div className="mono text-[10px] text-muted-foreground">{stat.label}</div>
          <div className={cn('mono text-lg font-bold mt-1',
            stat.positive === true ? 'text-terminal-green' :
            stat.positive === false ? 'text-terminal-red' : 'text-foreground'
          )}>
            {stat.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="p-4 space-y-4">
      <div className="terminal-panel p-4 animate-pulse">
        <div className="h-10 bg-terminal-dim rounded w-1/3" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="terminal-panel p-4 h-48 animate-pulse bg-terminal-dim/50" />
        <div className="terminal-panel p-4 h-48 animate-pulse bg-terminal-dim/50" />
      </div>
    </div>
  );
}
