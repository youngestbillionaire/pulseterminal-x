'use client';
import useSWR, { mutate } from 'swr';
import { useState } from 'react';
import { api } from '@/lib/api';
import { WatchlistPanel } from '@/components/dashboard/index';
import { Plus, Search, Trash2, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/lib/store';
import { cn } from '@/lib/utils';

export default function WatchlistPage() {
  const { user } = useAuthStore();
  const [adding, setAdding] = useState(false);
  const [ticker, setTicker] = useState('');
  const [notes, setNotes] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  const { data, isLoading } = useSWR(
    'watchlist',
    () => api.getWatchlist().then(r => r.data),
    { refreshInterval: 60000 }
  );

  const items = data?.watchlist ?? [];

  const TIER_LIMITS: Record<string, number> = { FREE: 5, PRO: 50, ELITE: 500 };
  const limit = TIER_LIMITS[user?.tier ?? 'FREE'];

  const handleAdd = async () => {
    if (!ticker.trim()) return;
    setAdding(true);
    try {
      await api.addToWatchlist(ticker.trim().toUpperCase(), notes || undefined);
      toast.success(`$${ticker.toUpperCase()} added to watchlist`);
      setTicker('');
      setNotes('');
      setShowAdd(false);
      mutate('watchlist');
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Failed to add ticker';
      toast.error(msg);
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (t: string) => {
    try {
      await api.removeFromWatchlist(t);
      toast.success(`$${t} removed`);
      mutate('watchlist');
    } catch {
      toast.error('Failed to remove');
    }
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="mono text-sm font-semibold">WATCHLIST</h1>
          <p className="mono text-xs text-muted-foreground mt-0.5">
            {items.length} / {limit} TICKERS · {user?.tier} TIER
          </p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          disabled={items.length >= limit}
          className={cn(
            'flex items-center gap-2 rounded border px-3 py-2 mono text-xs font-bold transition-all',
            showAdd
              ? 'border-terminal-red/50 bg-terminal-red/10 text-terminal-red'
              : 'border-terminal-green/50 bg-terminal-green/10 text-terminal-green hover:bg-terminal-green/20',
            items.length >= limit && 'opacity-50 cursor-not-allowed'
          )}
        >
          <Plus size={12} />
          {showAdd ? 'CANCEL' : 'ADD TICKER'}
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="terminal-panel p-4 animate-slide-in">
          <h3 className="mono text-xs text-muted-foreground mb-3">ADD TO WATCHLIST</h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={ticker}
              onChange={e => setTicker(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              placeholder="TICKER"
              maxLength={10}
              className="w-28 bg-terminal-dim border border-terminal-border rounded px-3 py-2 mono text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-terminal-green/50 transition-colors uppercase"
            />
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Optional notes..."
              maxLength={200}
              className="flex-1 bg-terminal-dim border border-terminal-border rounded px-3 py-2 mono text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-terminal-green/50 transition-colors"
            />
            <button
              onClick={handleAdd}
              disabled={adding || !ticker.trim()}
              className="flex items-center gap-2 px-4 py-2 rounded border border-terminal-green/50 bg-terminal-green/10 text-terminal-green mono text-xs font-bold hover:bg-terminal-green/20 transition-all disabled:opacity-50"
            >
              {adding ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
              ADD
            </button>
          </div>
          {user?.tier === 'FREE' && (
            <p className="mono text-[10px] text-terminal-amber mt-2">
              ⚠ FREE tier: {limit - items.length} slots remaining. Upgrade for more.
            </p>
          )}
        </div>
      )}

      {/* Watchlist table */}
      {isLoading ? (
        <div className="terminal-panel h-64 animate-pulse" />
      ) : items.length === 0 ? (
        <div className="terminal-panel p-12 text-center space-y-3">
          <div className="h-10 w-10 rounded-full bg-terminal-dim border border-terminal-border flex items-center justify-center mx-auto">
            <Search size={16} className="text-muted-foreground" />
          </div>
          <p className="mono text-sm text-muted-foreground">Your watchlist is empty</p>
          <p className="mono text-xs text-muted-foreground">
            Use the search bar (⌘K) or add tickers above to track companies
          </p>
        </div>
      ) : (
        <div className="terminal-panel overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-terminal-border">
                {['TICKER', 'COMPANY', 'SECTOR', 'SIGNAL', 'SENTIMENT', 'NOTES', 'ADDED', ''].map(h => (
                  <th key={h} className="mono text-[10px] text-muted-foreground text-left p-3 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item: any) => (
                <tr key={item.id} className="border-b border-terminal-border/50 hover:bg-white/2 transition-colors group">
                  <td className="p-3">
                    <a
                      href={`/dashboard/company/${item.ticker}`}
                      className="mono text-xs font-bold text-terminal-green hover:underline"
                    >
                      {item.ticker}
                    </a>
                  </td>
                  <td className="mono text-xs text-foreground p-3 max-w-36 truncate">{item.company?.name}</td>
                  <td className="mono text-[10px] text-muted-foreground p-3">{item.company?.sector ?? '—'}</td>
                  <td className="p-3">
                    {item.latestSignal ? (
                      <span className={cn(
                        'mono text-[10px] font-bold',
                        item.latestSignal.severity === 'CRITICAL' ? 'text-terminal-red' :
                        item.latestSignal.severity === 'HIGH' ? 'text-terminal-amber' : 'text-terminal-blue'
                      )}>
                        {item.latestSignal.type.replace(/_/g, ' ')}
                      </span>
                    ) : <span className="mono text-[10px] text-muted-foreground">—</span>}
                  </td>
                  <td className="p-3">
                    {item.latestSentiment != null ? (
                      <span className={cn(
                        'mono text-xs font-bold',
                        item.latestSentiment.score > 0.1 ? 'text-terminal-green' :
                        item.latestSentiment.score < -0.1 ? 'text-terminal-red' : 'text-muted-foreground'
                      )}>
                        {item.latestSentiment.score > 0 ? '+' : ''}{item.latestSentiment.score.toFixed(3)}
                      </span>
                    ) : <span className="mono text-[10px] text-muted-foreground">—</span>}
                  </td>
                  <td className="mono text-[10px] text-muted-foreground p-3 max-w-32 truncate">
                    {item.notes || '—'}
                  </td>
                  <td className="mono text-[10px] text-muted-foreground p-3 whitespace-nowrap">
                    {new Date(item.addedAt).toLocaleDateString()}
                  </td>
                  <td className="p-3">
                    <button
                      onClick={() => handleRemove(item.ticker)}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-terminal-red transition-all"
                    >
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
