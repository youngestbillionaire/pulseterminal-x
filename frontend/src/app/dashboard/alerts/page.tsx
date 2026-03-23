'use client';
import useSWR, { mutate } from 'swr';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Bell, Plus, Trash2, BellOff, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn, timeAgo } from '@/lib/utils';

const ALERT_TYPES = [
  { value: 'SIGNAL_DETECTED', label: 'Signal Detected', desc: 'When any signal fires for this ticker' },
  { value: 'EARNINGS_RELEASE', label: 'Earnings Release', desc: 'Before earnings report date' },
  { value: 'SENTIMENT_THRESHOLD', label: 'Sentiment Threshold', desc: 'When sentiment crosses a level' },
  { value: 'VOLUME_SPIKE', label: 'Volume Spike', desc: 'Unusual trading volume detected' },
];

export default function AlertsPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    ticker: '',
    type: 'SIGNAL_DETECTED',
    threshold: '',
    channels: ['in_app'] as string[],
    cooldownMin: 60,
  });

  const { data, isLoading } = useSWR(
    'alerts',
    () => api.getAlerts().then(r => r.data),
    { refreshInterval: 30000 }
  );

  const alerts = data?.alerts ?? [];

  const handleCreate = async () => {
    if (!form.ticker.trim()) {
      toast.error('Ticker is required');
      return;
    }
    setCreating(true);
    try {
      await api.createAlert({
        ticker: form.ticker.toUpperCase(),
        type: form.type,
        condition: { type: form.type, ticker: form.ticker.toUpperCase() },
        threshold: form.threshold ? parseFloat(form.threshold) : undefined,
        channels: form.channels,
        cooldownMin: form.cooldownMin,
      });
      toast.success('Alert created');
      setShowCreate(false);
      setForm({ ticker: '', type: 'SIGNAL_DETECTED', threshold: '', channels: ['in_app'], cooldownMin: 60 });
      mutate('alerts');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to create alert');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteAlert(id);
      toast.success('Alert deleted');
      mutate('alerts');
    } catch {
      toast.error('Failed to delete alert');
    }
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="mono text-sm font-semibold">ALERT SYSTEM</h1>
          <p className="mono text-xs text-muted-foreground mt-0.5">
            {alerts.filter((a: any) => a.isActive).length} ACTIVE ALERTS
          </p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className={cn(
            'flex items-center gap-2 rounded border px-3 py-2 mono text-xs font-bold transition-all',
            showCreate
              ? 'border-terminal-red/50 bg-terminal-red/10 text-terminal-red'
              : 'border-terminal-green/50 bg-terminal-green/10 text-terminal-green hover:bg-terminal-green/20'
          )}
        >
          <Plus size={12} />
          {showCreate ? 'CANCEL' : 'NEW ALERT'}
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="terminal-panel p-4 space-y-4 animate-slide-in">
          <h3 className="mono text-xs font-semibold text-foreground">CREATE ALERT</h3>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mono text-[10px] text-muted-foreground block mb-1.5">TICKER *</label>
              <input
                type="text"
                value={form.ticker}
                onChange={e => setForm(f => ({ ...f, ticker: e.target.value.toUpperCase() }))}
                placeholder="AAPL"
                maxLength={10}
                className="w-full bg-terminal-dim border border-terminal-border rounded px-3 py-2 mono text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-terminal-green/50 transition-colors"
              />
            </div>

            <div>
              <label className="mono text-[10px] text-muted-foreground block mb-1.5">ALERT TYPE</label>
              <select
                value={form.type}
                onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                className="w-full bg-terminal-dim border border-terminal-border rounded px-3 py-2 mono text-sm text-foreground outline-none focus:border-terminal-green/50 transition-colors"
              >
                {ALERT_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            {form.type === 'SENTIMENT_THRESHOLD' && (
              <div>
                <label className="mono text-[10px] text-muted-foreground block mb-1.5">
                  THRESHOLD (-1.0 to 1.0)
                </label>
                <input
                  type="number"
                  value={form.threshold}
                  onChange={e => setForm(f => ({ ...f, threshold: e.target.value }))}
                  placeholder="0.5"
                  min="-1"
                  max="1"
                  step="0.1"
                  className="w-full bg-terminal-dim border border-terminal-border rounded px-3 py-2 mono text-sm text-foreground outline-none focus:border-terminal-green/50 transition-colors"
                />
              </div>
            )}

            <div>
              <label className="mono text-[10px] text-muted-foreground block mb-1.5">COOLDOWN</label>
              <select
                value={form.cooldownMin}
                onChange={e => setForm(f => ({ ...f, cooldownMin: parseInt(e.target.value) }))}
                className="w-full bg-terminal-dim border border-terminal-border rounded px-3 py-2 mono text-sm text-foreground outline-none focus:border-terminal-green/50 transition-colors"
              >
                {[15, 30, 60, 180, 360, 720, 1440].map(m => (
                  <option key={m} value={m}>
                    {m < 60 ? `${m}m` : `${m / 60}h`}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Channels */}
          <div>
            <label className="mono text-[10px] text-muted-foreground block mb-2">CHANNELS</label>
            <div className="flex gap-2">
              {['in_app', 'email'].map(ch => (
                <button
                  key={ch}
                  onClick={() => setForm(f => ({
                    ...f,
                    channels: f.channels.includes(ch)
                      ? f.channels.filter(c => c !== ch)
                      : [...f.channels, ch],
                  }))}
                  className={cn(
                    'mono text-[10px] rounded px-3 py-1.5 border transition-all',
                    form.channels.includes(ch)
                      ? 'border-terminal-green/50 bg-terminal-green/10 text-terminal-green'
                      : 'border-terminal-border text-muted-foreground hover:text-foreground'
                  )}
                >
                  {ch.replace('_', ' ').toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleCreate}
              disabled={creating}
              className="flex items-center gap-2 px-4 py-2 rounded border border-terminal-green/50 bg-terminal-green/10 text-terminal-green mono text-xs font-bold hover:bg-terminal-green/20 transition-all disabled:opacity-50"
            >
              {creating ? <Loader2 size={12} className="animate-spin" /> : <Bell size={12} />}
              CREATE ALERT
            </button>
          </div>
        </div>
      )}

      {/* Alerts list */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="terminal-panel h-16 animate-pulse" />
          ))}
        </div>
      ) : alerts.length === 0 ? (
        <div className="terminal-panel p-12 text-center space-y-3">
          <BellOff size={24} className="text-muted-foreground mx-auto" />
          <p className="mono text-sm text-muted-foreground">No alerts configured</p>
          <p className="mono text-xs text-muted-foreground">Create alerts to get notified about signals, earnings, and sentiment shifts</p>
        </div>
      ) : (
        <div className="space-y-2">
          {alerts.map((alert: any) => (
            <div key={alert.id} className={cn(
              'terminal-panel px-4 py-3 flex items-center justify-between group',
              !alert.isActive && 'opacity-50'
            )}>
              <div className="flex items-center gap-3">
                <div className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  alert.isActive ? 'bg-terminal-green animate-pulse' : 'bg-muted-foreground'
                )} />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="mono text-xs font-bold text-terminal-green">${alert.ticker ?? 'ALL'}</span>
                    <span className="mono text-xs text-foreground">
                      {ALERT_TYPES.find(t => t.value === alert.type)?.label ?? alert.type}
                    </span>
                    {alert.threshold != null && (
                      <span className="mono text-[10px] text-muted-foreground">
                        @ {alert.threshold}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="mono text-[10px] text-muted-foreground">
                      Cooldown: {alert.cooldownMin < 60 ? `${alert.cooldownMin}m` : `${alert.cooldownMin / 60}h`}
                    </span>
                    {alert.lastFired && (
                      <span className="mono text-[10px] text-muted-foreground">
                        Last: {timeAgo(alert.lastFired)}
                      </span>
                    )}
                    <span className="mono text-[10px] text-muted-foreground">
                      {alert.channels.join(', ')}
                    </span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => handleDelete(alert.id)}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-terminal-red transition-all"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
