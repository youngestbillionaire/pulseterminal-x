'use client';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Cell,
  AreaChart, Area,
} from 'recharts';
import { cn } from '@/lib/utils';

const CHART_THEME = {
  grid: '#1e2736',
  tick: '#4a5568',
  positive: '#00ff88',
  negative: '#ff3b3b',
  neutral: '#4a5568',
  blue: '#00a8ff',
  amber: '#ffb800',
  tooltip: { bg: '#0d1117', border: '#1e2736', text: '#e6edf3' },
};

// ─── Earnings Chart ───────────────────────────────────────────────────────────
export function EarningsChart({ data, height = 200 }: { data: any[]; height?: number }) {
  if (!data?.length) {
    return <EmptyChart height={height} message="No earnings data" />;
  }

  const chartData = [...data].reverse().map(e => ({
    quarter: e.fiscalQuarter?.replace(' ', '\n') ?? '',
    epsActual: e.epsActual,
    epsEstimate: e.epsEstimate,
    surprise: e.epsSurprisePct,
    beat: (e.epsSurprisePct ?? 0) >= 0,
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
        <CartesianGrid stroke={CHART_THEME.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="quarter"
          tick={{ fill: CHART_THEME.tick, fontSize: 9, fontFamily: 'JetBrains Mono' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: CHART_THEME.tick, fontSize: 9, fontFamily: 'JetBrains Mono' }}
          axisLine={false}
          tickLine={false}
          tickFormatter={v => `$${v}`}
        />
        <Tooltip content={<EarningsTooltip />} />
        <ReferenceLine y={0} stroke={CHART_THEME.grid} />

        {/* EPS estimate line */}
        <Line
          type="monotone"
          dataKey="epsEstimate"
          stroke={CHART_THEME.neutral}
          strokeWidth={1}
          strokeDasharray="4 4"
          dot={false}
          name="Estimate"
        />

        {/* EPS actual bars */}
        <Bar dataKey="epsActual" name="Actual" radius={[2, 2, 0, 0]}>
          {chartData.map((entry, i) => (
            <Cell
              key={i}
              fill={entry.beat ? CHART_THEME.positive : CHART_THEME.negative}
              fillOpacity={0.8}
            />
          ))}
        </Bar>
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function EarningsTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="terminal-panel p-3 min-w-36">
      <p className="mono text-[10px] text-muted-foreground mb-2">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex justify-between gap-4 mono text-[10px]">
          <span className="text-muted-foreground">{p.name}</span>
          <span className={p.name === 'Actual' && p.value > (payload.find((x: any) => x.name === 'Estimate')?.value ?? 0)
            ? 'text-terminal-green' : 'text-foreground'}>
            ${p.value?.toFixed(2)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Sentiment Chart ──────────────────────────────────────────────────────────
export function SentimentChart({ data, height = 200 }: { data: any[]; height?: number }) {
  if (!data?.length) {
    return <EmptyChart height={height} message="No sentiment data" />;
  }

  const chartData = data.slice(-48).map(log => ({
    time: new Date(log.recordedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    score: parseFloat(log.score?.toFixed(4) ?? '0'),
    mentions: log.mentionCount,
    bullish: log.bullishCount,
    bearish: log.bearishCount,
  }));

  const minScore = Math.min(...chartData.map(d => d.score), -0.5);
  const maxScore = Math.max(...chartData.map(d => d.score), 0.5);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
        <defs>
          <linearGradient id="sentimentGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={CHART_THEME.positive} stopOpacity={0.15} />
            <stop offset="95%" stopColor={CHART_THEME.positive} stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="sentimentNegGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={CHART_THEME.negative} stopOpacity={0.15} />
            <stop offset="95%" stopColor={CHART_THEME.negative} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={CHART_THEME.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="time"
          tick={{ fill: CHART_THEME.tick, fontSize: 9, fontFamily: 'JetBrains Mono' }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          domain={[minScore, maxScore]}
          tick={{ fill: CHART_THEME.tick, fontSize: 9, fontFamily: 'JetBrains Mono' }}
          axisLine={false}
          tickLine={false}
          tickFormatter={v => v.toFixed(2)}
        />
        <Tooltip content={<SentimentTooltip />} />
        <ReferenceLine y={0} stroke={CHART_THEME.grid} strokeWidth={1} />
        <Area
          type="monotone"
          dataKey="score"
          stroke={CHART_THEME.positive}
          strokeWidth={1.5}
          fill="url(#sentimentGradient)"
          dot={false}
          activeDot={{ r: 3, fill: CHART_THEME.positive }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function SentimentTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div className="terminal-panel p-3">
      <p className="mono text-[10px] text-muted-foreground mb-1">{d?.time}</p>
      <p className={cn('mono text-xs font-bold',
        d?.score > 0.1 ? 'text-terminal-green' :
        d?.score < -0.1 ? 'text-terminal-red' : 'text-foreground'
      )}>
        Score: {d?.score?.toFixed(4)}
      </p>
      {d?.mentions > 0 && (
        <p className="mono text-[10px] text-muted-foreground">Mentions: {d.mentions}</p>
      )}
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyChart({ height, message }: { height: number; message: string }) {
  return (
    <div
      className="flex items-center justify-center border border-terminal-border rounded"
      style={{ height }}
    >
      <span className="mono text-xs text-muted-foreground">{message}</span>
    </div>
  );
}

// ─── Sentiment meter (gauge) ──────────────────────────────────────────────────
export function SentimentMeter({ score }: { score: number }) {
  const pct = ((score + 1) / 2) * 100; // -1..1 → 0..100
  const color = score > 0.1 ? CHART_THEME.positive :
                score < -0.1 ? CHART_THEME.negative : CHART_THEME.amber;
  const label = score > 0.3 ? 'BULLISH' :
                score > 0.1 ? 'SLIGHTLY BULLISH' :
                score < -0.3 ? 'BEARISH' :
                score < -0.1 ? 'SLIGHTLY BEARISH' : 'NEUTRAL';

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between mono text-[10px] text-muted-foreground">
        <span>BEARISH</span>
        <span>NEUTRAL</span>
        <span>BULLISH</span>
      </div>
      <div className="relative h-2 rounded-full bg-terminal-dim overflow-hidden">
        <div
          className="absolute left-0 top-0 h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
        <div className="absolute top-1/2 left-1/2 -translate-y-1/2 w-px h-3 bg-terminal-border" />
      </div>
      <div className="text-center">
        <span className="mono text-xs font-bold" style={{ color }}>{label}</span>
        <span className="mono text-[10px] text-muted-foreground ml-2">({score.toFixed(3)})</span>
      </div>
    </div>
  );
}
