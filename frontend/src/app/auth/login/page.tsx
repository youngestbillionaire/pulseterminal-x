'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/lib/store';
import { Eye, EyeOff, Loader2, Zap } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const { login, isLoading } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await login(email, password);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Invalid credentials');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#060b14] px-4">
      {/* Grid background */}
      <div className="absolute inset-0 grid-scanline pointer-events-none opacity-30" />

      <div className="w-full max-w-sm relative">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-12 w-12 rounded-xl bg-terminal-green/10 border border-terminal-green/30 mb-4">
            <Zap size={20} className="text-terminal-green" />
          </div>
          <h1 className="mono text-xl font-bold text-foreground">
            PULSE<span className="text-terminal-green">TERMINAL</span> X
          </h1>
          <p className="mono text-xs text-muted-foreground mt-1">Financial Intelligence Platform</p>
        </div>

        {/* Card */}
        <div className="terminal-panel p-6">
          <h2 className="mono text-sm font-semibold text-foreground mb-6">SIGN IN</h2>

          {error && (
            <div className="mb-4 rounded border border-terminal-red/30 bg-terminal-red/5 px-3 py-2">
              <p className="mono text-xs text-terminal-red">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mono text-[10px] text-muted-foreground block mb-1.5">EMAIL</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@example.com"
                className="w-full rounded border border-terminal-border bg-terminal-dim px-3 py-2.5 mono text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-terminal-green/50 focus:ring-1 focus:ring-terminal-green/20 transition-all"
              />
            </div>

            <div>
              <label className="mono text-[10px] text-muted-foreground block mb-1.5">PASSWORD</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="w-full rounded border border-terminal-border bg-terminal-dim px-3 py-2.5 mono text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-terminal-green/50 focus:ring-1 focus:ring-terminal-green/20 transition-all pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 rounded border border-terminal-green/50 bg-terminal-green/10 px-4 py-2.5 mono text-sm font-bold text-terminal-green hover:bg-terminal-green/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <><Loader2 size={14} className="animate-spin" /> AUTHENTICATING...</>
              ) : (
                'SIGN IN →'
              )}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-terminal-border">
            <p className="mono text-[11px] text-muted-foreground text-center">
              No account?{' '}
              <Link href="/auth/signup" className="text-terminal-green hover:underline">
                Create one
              </Link>
            </p>
          </div>

          {/* Demo accounts */}
          <div className="mt-4">
            <p className="mono text-[10px] text-muted-foreground text-center mb-2">DEMO ACCOUNTS</p>
            <div className="grid grid-cols-3 gap-1">
              {[
                { tier: 'FREE', email: 'free@demo.com' },
                { tier: 'PRO', email: 'pro@demo.com' },
                { tier: 'ELITE', email: 'elite@demo.com' },
              ].map(d => (
                <button
                  key={d.tier}
                  type="button"
                  onClick={() => { setEmail(d.email); setPassword('Demo123!'); }}
                  className="mono text-[9px] rounded border border-terminal-border px-2 py-1.5 text-muted-foreground hover:text-foreground hover:border-terminal-green/30 transition-all text-center"
                >
                  {d.tier}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
