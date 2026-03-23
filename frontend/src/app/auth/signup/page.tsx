'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/lib/store';
import { Eye, EyeOff, Loader2, Zap, CheckCircle2, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';

const PW_RULES = [
  { label: '8+ characters', test: (p: string) => p.length >= 8 },
  { label: 'Uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
  { label: 'Number', test: (p: string) => /[0-9]/.test(p) },
];

export default function SignupPage() {
  const router = useRouter();
  const { signup, isLoading } = useAuthStore();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');

  const passwordValid = PW_RULES.every(r => r.test(password));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordValid) return;
    setError('');
    try {
      await signup(email, password, name);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Signup failed. Please try again.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#060b14] px-4">
      <div className="absolute inset-0 grid-scanline pointer-events-none opacity-30" />

      <div className="w-full max-w-sm relative">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-12 w-12 rounded-xl bg-terminal-green/10 border border-terminal-green/30 mb-4">
            <Zap size={20} className="text-terminal-green" />
          </div>
          <h1 className="mono text-xl font-bold text-foreground">
            PULSE<span className="text-terminal-green">TERMINAL</span> X
          </h1>
          <p className="mono text-xs text-muted-foreground mt-1">Start free — upgrade anytime</p>
        </div>

        <div className="terminal-panel p-6">
          <h2 className="mono text-sm font-semibold text-foreground mb-6">CREATE ACCOUNT</h2>

          {error && (
            <div className="mb-4 rounded border border-terminal-red/30 bg-terminal-red/5 px-3 py-2">
              <p className="mono text-xs text-terminal-red">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mono text-[10px] text-muted-foreground block mb-1.5">NAME (OPTIONAL)</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Your name"
                className="w-full rounded border border-terminal-border bg-terminal-dim px-3 py-2.5 mono text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-terminal-green/50 focus:ring-1 focus:ring-terminal-green/20 transition-all"
              />
            </div>

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
                  autoComplete="new-password"
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

              {password && (
                <div className="mt-2 space-y-1">
                  {PW_RULES.map(rule => (
                    <div key={rule.label} className="flex items-center gap-2">
                      {rule.test(password) ? (
                        <CheckCircle2 size={10} className="text-terminal-green shrink-0" />
                      ) : (
                        <Circle size={10} className="text-muted-foreground shrink-0" />
                      )}
                      <span className={cn(
                        'mono text-[10px]',
                        rule.test(password) ? 'text-terminal-green' : 'text-muted-foreground'
                      )}>
                        {rule.label}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading || !passwordValid || !email}
              className="w-full flex items-center justify-center gap-2 rounded border border-terminal-green/50 bg-terminal-green/10 px-4 py-2.5 mono text-sm font-bold text-terminal-green hover:bg-terminal-green/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              {isLoading ? (
                <><Loader2 size={14} className="animate-spin" /> CREATING ACCOUNT...</>
              ) : (
                'CREATE ACCOUNT →'
              )}
            </button>
          </form>

          <div className="mt-4 pt-4 border-t border-terminal-border">
            <p className="mono text-[11px] text-muted-foreground text-center">
              Already have an account?{' '}
              <Link href="/auth/login" className="text-terminal-green hover:underline">Sign in</Link>
            </p>
          </div>
        </div>

        {/* Tier comparison teaser */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          {[
            { tier: 'FREE', price: '$0', features: ['5 watchlist', '100 API calls/day', 'Basic signals'] },
            { tier: 'PRO', price: '$29/mo', features: ['50 watchlist', '1K API calls/day', 'AI insights'], highlight: true },
            { tier: 'ELITE', price: '$99/mo', features: ['Unlimited', '10K API calls/day', 'All features'] },
          ].map(plan => (
            <div
              key={plan.tier}
              className={cn(
                'terminal-panel p-3 text-center',
                plan.highlight ? 'border-terminal-green/30' : ''
              )}
            >
              <div className={cn(
                'mono text-[10px] font-bold mb-1',
                plan.highlight ? 'text-terminal-green' : 'text-foreground'
              )}>
                {plan.tier}
              </div>
              <div className="mono text-[11px] text-foreground mb-2">{plan.price}</div>
              {plan.features.map(f => (
                <div key={f} className="mono text-[9px] text-muted-foreground">{f}</div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
