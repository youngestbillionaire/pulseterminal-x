'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Search, TrendingUp, Clock, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(0);

  // Debounced search
  useEffect(() => {
    if (!query.trim() || query.length < 1) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await api.searchCompanies(query.trim());
        setResults(data.results ?? []);
        setSelected(0);
      } catch {}
      finally { setLoading(false); }
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults([]);
      setSelected(0);
    }
  }, [open]);

  const navigate = useCallback((ticker: string) => {
    router.push(`/dashboard/company/${ticker}`);
    onClose();
  }, [router, onClose]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'ArrowDown') { setSelected(s => Math.min(s + 1, results.length - 1)); e.preventDefault(); }
      if (e.key === 'ArrowUp') { setSelected(s => Math.max(s - 1, 0)); e.preventDefault(); }
      if (e.key === 'Enter' && results[selected]) {
        navigate(results[selected].ticker);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, results, selected, navigate, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Panel */}
      <div
        className="relative w-full max-w-xl terminal-panel border-terminal-green/20 shadow-2xl animate-slide-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-terminal-border">
          <Search size={14} className="text-terminal-green shrink-0" />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search ticker or company name..."
            className="flex-1 bg-transparent mono text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
          {loading && (
            <div className="h-3 w-3 rounded-full border border-terminal-green border-t-transparent animate-spin" />
          )}
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={14} />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-auto">
          {results.length === 0 && query.length > 0 && !loading && (
            <div className="py-8 text-center">
              <p className="mono text-xs text-muted-foreground">No results for "{query}"</p>
            </div>
          )}

          {results.length === 0 && !query && (
            <div className="p-4">
              <p className="mono text-[10px] text-muted-foreground mb-3">QUICK ACTIONS</p>
              {[
                { label: 'View Signals', shortcut: 'S', href: '/dashboard/signals' },
                { label: 'Earnings Calendar', shortcut: 'E', href: '/dashboard/earnings' },
                { label: 'Sentiment Dashboard', shortcut: 'M', href: '/dashboard/sentiment' },
              ].map(action => (
                <button
                  key={action.href}
                  onClick={() => { router.push(action.href); onClose(); }}
                  className="flex w-full items-center justify-between rounded px-3 py-2 hover:bg-white/5 transition-all"
                >
                  <span className="mono text-xs text-foreground">{action.label}</span>
                  <kbd className="mono text-[10px] border border-terminal-border rounded px-1.5 py-0.5 text-muted-foreground">
                    {action.shortcut}
                  </kbd>
                </button>
              ))}
            </div>
          )}

          {results.map((r: any, i: number) => (
            <button
              key={r.id}
              onClick={() => navigate(r.ticker)}
              className={cn(
                'flex w-full items-center gap-3 px-4 py-3 transition-all text-left border-b border-terminal-border/50 last:border-0',
                i === selected ? 'bg-terminal-green/5' : 'hover:bg-white/3'
              )}
            >
              {r.logoUrl ? (
                <img src={r.logoUrl} alt={r.ticker} className="h-7 w-7 rounded object-contain bg-white/5 p-0.5" />
              ) : (
                <div className="h-7 w-7 rounded bg-terminal-dim border border-terminal-border flex items-center justify-center shrink-0">
                  <span className="mono text-[10px] font-bold text-terminal-green">{r.ticker.slice(0, 2)}</span>
                </div>
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="mono text-xs font-bold text-terminal-green">{r.ticker}</span>
                  <span className="mono text-xs text-foreground truncate">{r.name}</span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  {r.exchange && <span className="mono text-[10px] text-muted-foreground">{r.exchange}</span>}
                  {r.sector && <span className="mono text-[10px] text-muted-foreground">{r.sector}</span>}
                  {r.marketCap && (
                    <span className="mono text-[10px] text-muted-foreground">
                      {r.marketCap >= 1e12 ? `$${(r.marketCap / 1e12).toFixed(1)}T` :
                       r.marketCap >= 1e9 ? `$${(r.marketCap / 1e9).toFixed(1)}B` :
                       `$${(r.marketCap / 1e6).toFixed(0)}M`}
                    </span>
                  )}
                </div>
              </div>

              <TrendingUp size={11} className="text-muted-foreground shrink-0" />
            </button>
          ))}
        </div>

        {/* Footer hint */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-terminal-border">
          {[
            { key: '↑↓', label: 'navigate' },
            { key: '↵', label: 'select' },
            { key: 'ESC', label: 'close' },
          ].map(hint => (
            <div key={hint.key} className="flex items-center gap-1.5">
              <kbd className="mono text-[9px] border border-terminal-border rounded px-1 py-0.5 text-muted-foreground">{hint.key}</kbd>
              <span className="mono text-[9px] text-muted-foreground">{hint.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
