import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { formatDistanceToNow } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${n.toLocaleString()}`;
}

export function formatPct(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;
}

export function timeAgo(date: string | Date): string {
  try {
    return formatDistanceToNow(new Date(date), { addSuffix: true });
  } catch {
    return 'unknown';
  }
}

export function sentimentLabel(score: number): string {
  if (score > 0.4) return 'VERY BULLISH';
  if (score > 0.15) return 'BULLISH';
  if (score > -0.15) return 'NEUTRAL';
  if (score > -0.4) return 'BEARISH';
  return 'VERY BEARISH';
}

export function severityColor(severity: string): string {
  const map: Record<string, string> = {
    CRITICAL: '#ff3b3b',
    HIGH: '#ffb800',
    MEDIUM: '#00a8ff',
    LOW: '#4a5568',
  };
  return map[severity] ?? '#4a5568';
}
