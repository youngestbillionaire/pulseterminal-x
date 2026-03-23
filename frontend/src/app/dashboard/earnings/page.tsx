'use client';
import useSWR from 'swr';
import { api } from '@/lib/api';
import { useState } from 'react';
import { cn, formatNumber } from '@/lib/utils';
import { Calendar, Clock, TrendingUp, TrendingDown } from 'lucide-react';
import Link from 'next/link';

export default function EarningsPage() {
  const [weeks, setWeeks] = useState(2);

  const { data, isLoading } = useSWR(
    ['earnings-calendar', weeks],
    () => api.getEarningsCalendar(weeks).then(r => r.data),
    { refreshInterval: 300000 }
  );

  const calendar = data?.calendar ?? {};
  const dates = Object.keys(calendar).sort();

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="mono text-sm font-semibold">EARNINGS CALENDAR</h1>
          <p className="mono text-xs text-muted-foreground mt-0.5">
            {data?.total ?? 0} UPCOMING REPORTS
          </p>
        </div>
        <div className="flex items-center gap-1">
          {[1, 2, 4, 8].map(w => (
            <button
              key={w}
              onClick={() => setWeeks(w)}
              className={cn(
                'mono text-[10px] rounded px-2.5 py-1.5 border transition-all',
                weeks === w
                  ? 'border-terminal-green/50 bg-terminal-green/10 text-terminal-green'
                  : 'border-terminal-border text-muted-foreground hover:text-foreground'
              )}
            >
              {w}W
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="terminal-panel h-32 animate-pulse" />
          ))}
        </div>
      ) : dates.length === 0 ? (
        <div className="terminal-panel p-12 text-center">
          <p className="mono text-sm text-muted-foreground">No earnings scheduled</p>
        </div>
      ) : (
        <div className="space-y-4">
          {dates.map(date => {
            const reports = calendar[date];
            const isToday = date === new Date().toISOString().split('T')[0];
            const isPast = new Date(date) < new Date();

            return (
              <div key={date}>
                <div className="flex items-center gap-2 mb-2">
                  <Calendar size={11} className={isToday ? 'text-terminal-amber' : 'text-muted-foreground'} />
                  <span className={cn(
                    'mono text-xs font-semibold',
                    isToday ? 'text-terminal-amber' : isPast ? 'text-muted-foreground' : 'text-foreground'
                  )}>
                    {new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
                      weekday: 'long', month: 'long', day: 'numeric',
                    }).toUpperCase()}
                    {isToday && <span className="ml-2 text-terminal-amber">[TODAY]</span>}
                  </span>
                  <span className="mono text-[10px] text-muted-foreground">
                    {reports.length} REPORT{reports.length !== 1 ? 'S' : ''}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-1.5">
                  {reports.map((report: any) => (
                    <EarningsRow key={report.id} report={report} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EarningsRow({ report }: { report: any }) {
  const hasResult = report.status === 'REPORTED';
  const beat = report.epsSurprisePct > 0;

  return (
    <Link href={`/dashboard/company/${report.ticker}`}>
      <div className="terminal-panel px-4 py-3 flex items-center justify-between hover:border-terminal-green/30 transition-all cursor-pointer group">
        <div className="flex items-center gap-4">
          {report.company?.logoUrl ? (
            <img src={report.company.logoUrl} alt={report.ticker} className="h-6 w-6 rounded object-contain" />
          ) : (
            <div className="h-6 w-6 rounded bg-terminal-dim border border-terminal-border flex items-center justify-center">
              <span className="mono text-[9px] font-bold text-terminal-green">{report.ticker?.slice(0, 2)}</span>
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <span className="mono text-xs font-bold text-foreground group-hover:text-terminal-green transition-colors">
                {report.ticker}
              </span>
              <span className="mono text-xs text-muted-foreground">{report.company?.name}</span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="mono text-[10px] text-muted-foreground">{report.fiscalQuarter}</span>
              <span className="mono text-[10px] text-muted-foreground">
                {report.company?.sector}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6">
          {/* Market cap */}
          {report.company?.marketCap && (
            <div className="text-right">
              <div className="mono text-[9px] text-muted-foreground">MKTCAP</div>
              <div className="mono text-xs text-foreground">{formatNumber(report.company.marketCap)}</div>
            </div>
          )}

          {/* Report time */}
          <div className="flex items-center gap-1.5">
            <Clock size={10} className="text-muted-foreground" />
            <span className="mono text-xs text-muted-foreground">
              {report.reportTime === 'BMO' ? 'Pre-Market' :
               report.reportTime === 'AMC' ? 'After Close' : 'During'}
            </span>
          </div>

          {/* EPS result if reported */}
          {hasResult ? (
            <div className="flex items-center gap-1.5">
              {beat ? (
                <TrendingUp size={12} className="text-terminal-green" />
              ) : (
                <TrendingDown size={12} className="text-terminal-red" />
              )}
              <span className={cn('mono text-xs font-bold',
                beat ? 'text-terminal-green' : 'text-terminal-red'
              )}>
                {report.epsSurprisePct > 0 ? '+' : ''}{report.epsSurprisePct?.toFixed(1)}%
              </span>
            </div>
          ) : (
            <div className="mono text-[10px] rounded border border-terminal-amber/30 bg-terminal-amber/5 text-terminal-amber px-2 py-1">
              PENDING
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
