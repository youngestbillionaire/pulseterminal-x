'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/lib/store';
import { CommandPalette } from '@/components/terminal/CommandPalette';
import { LiveTicker } from '@/components/terminal/LiveTicker';
import { useWebSocket } from '@/components/providers/WebSocketProvider';
import {
  LayoutDashboard, TrendingUp, Calendar, Activity,
  Bell, Bookmark, Settings, Search, Zap,
  LogOut, User, ChevronRight, Wifi, WifiOff,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Terminal', exact: true },
  { href: '/dashboard/signals', icon: Zap, label: 'Signals', badge: 'LIVE' },
  { href: '/dashboard/earnings', icon: Calendar, label: 'Earnings' },
  { href: '/dashboard/sentiment', icon: Activity, label: 'Sentiment' },
  { href: '/dashboard/watchlist', icon: Bookmark, label: 'Watchlist' },
  { href: '/dashboard/alerts', icon: Bell, label: 'Alerts' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isAuthenticated, isLoading, logout } = useAuthStore();
  const { connected } = useWebSocket();
  const [cmdOpen, setCmdOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/auth/login');
    }
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCmdOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#060b14]">
        <div className="flex items-center gap-3">
          <div className="h-2 w-2 rounded-full bg-terminal-green animate-pulse" />
          <span className="mono text-sm text-muted-foreground">INITIALIZING...</span>
        </div>
      </div>
    );
  }

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#060b14]">
      {/* Live ticker tape */}
      <LiveTicker />

      {/* Top nav bar */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-terminal-border bg-terminal-panel px-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <div className="flex flex-col gap-1">
              <span className="block h-0.5 w-4 bg-current" />
              <span className="block h-0.5 w-4 bg-current" />
              <span className="block h-0.5 w-4 bg-current" />
            </div>
          </button>

          <div className="flex items-center gap-2">
            <div className="h-5 w-5 rounded bg-terminal-green/20 flex items-center justify-center">
              <span className="text-terminal-green text-xs font-bold">P</span>
            </div>
            <span className="mono text-sm font-semibold text-foreground tracking-wider">
              PULSETERMINAL<span className="text-terminal-green">X</span>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Search trigger */}
          <button
            onClick={() => setCmdOpen(true)}
            className="flex items-center gap-2 rounded border border-terminal-border bg-terminal-dim px-3 py-1.5 text-xs text-muted-foreground hover:border-terminal-green/30 hover:text-foreground transition-all"
          >
            <Search size={12} />
            <span className="mono">Search ticker...</span>
            <kbd className="mono ml-2 rounded bg-terminal-panel px-1.5 py-0.5 text-[10px] border border-terminal-border">
              ⌘K
            </kbd>
          </button>

          {/* WS status */}
          <div className={cn(
            'flex items-center gap-1.5 text-xs mono',
            connected ? 'text-terminal-green' : 'text-muted-foreground'
          )}>
            {connected ? <Wifi size={12} /> : <WifiOff size={12} />}
            {connected ? 'LIVE' : 'OFFLINE'}
          </div>

          {/* Tier badge */}
          <span className={cn(
            'mono rounded px-2 py-0.5 text-[10px] font-bold',
            user?.tier === 'ELITE' ? 'bg-amber-500/20 text-amber-400' :
            user?.tier === 'PRO' ? 'bg-blue-500/20 text-blue-400' :
            'bg-muted text-muted-foreground'
          )}>
            {user?.tier}
          </span>

          {/* User menu */}
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-full bg-terminal-dim border border-terminal-border flex items-center justify-center">
              <User size={12} className="text-muted-foreground" />
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className={cn(
          'flex flex-col border-r border-terminal-border bg-terminal-panel transition-all duration-200',
          sidebarCollapsed ? 'w-12' : 'w-48'
        )}>
          <nav className="flex flex-col gap-0.5 p-2 flex-1">
            {NAV_ITEMS.map(({ href, icon: Icon, label, badge, exact }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-2.5 rounded px-2.5 py-2 text-sm transition-all group',
                  isActive(href, exact)
                    ? 'bg-terminal-green/10 text-terminal-green border border-terminal-green/20'
                    : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                )}
              >
                <Icon size={14} className="shrink-0" />
                {!sidebarCollapsed && (
                  <>
                    <span className="mono text-xs font-medium">{label}</span>
                    {badge && (
                      <span className="ml-auto mono text-[9px] font-bold text-terminal-green animate-pulse-glow">
                        {badge}
                      </span>
                    )}
                  </>
                )}
              </Link>
            ))}
          </nav>

          {!sidebarCollapsed && (
            <div className="border-t border-terminal-border p-2">
              <Link
                href="/dashboard/settings"
                className="flex items-center gap-2.5 rounded px-2.5 py-2 text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all"
              >
                <Settings size={14} />
                <span className="mono text-xs">Settings</span>
              </Link>
              <button
                onClick={logout}
                className="flex w-full items-center gap-2.5 rounded px-2.5 py-2 text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-all"
              >
                <LogOut size={14} />
                <span className="mono text-xs">Sign out</span>
              </button>
            </div>
          )}
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>

      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
    </div>
  );
}
