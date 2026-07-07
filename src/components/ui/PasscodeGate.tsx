/**
 * Shared privacy-lock screen for sensitive vaults (Purchases, Stocks).
 *
 * Renders the lock UI (set / unlock) when locked and the children only once
 * unlocked. Wraps usePasscodeLock, which stores only a SHA-256 hash and
 * re-locks on idle / unmount.
 */
import { useState, type ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { usePasscodeLock } from '../../lib/usePasscodeLock';

interface Props {
  hashKey: string;
  legacyPlainKey?: string;
  uid: string | null;
  /** Accent colour classes (defaults to the app's cyan brand). */
  accent?: { text: string; ring: string; button: string };
  title: string;
  children: ReactNode;
}

const DEFAULT_ACCENT = {
  text: 'text-brand-300',
  ring: 'focus:border-brand-400/50',
  button:
    'bg-brand-400/10 hover:bg-brand-400/20 border-brand-400/30 text-brand-300 shadow-[0_0_15px_rgba(6,182,212,0.1)] hover:shadow-[0_0_20px_rgba(6,182,212,0.2)]',
};

export default function PasscodeGate({ hashKey, legacyPlainKey, uid, accent = DEFAULT_ACCENT, title, children }: Props) {
  const lock = usePasscodeLock({ hashKey, legacyPlainKey, uid });
  const [code, setCode] = useState('');

  if (lock.status === 'unlocked') return <>{children}</>;
  if (lock.status === 'loading') return null;

  const isSetup = lock.status === 'setup';
  const doSubmit = async () => {
    await lock.submit(code);
    setCode('');
  };

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center relative">
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-500/5 blur-3xl" />
      <div className="relative z-10 flex w-full max-w-sm flex-col items-center rounded-3xl border border-white/10 bg-white/[0.02] p-8 text-center shadow-2xl backdrop-blur-xl">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] shadow-inner">
          <Lock size={28} className="text-white/80 drop-shadow-sm" />
        </div>
        <h2 className="mb-2 font-plus text-xl font-bold tracking-tight text-white">{title}</h2>
        <p className="mb-8 font-mono text-xs uppercase tracking-widest text-white/50">
          {isSetup ? 'Initialize security passcode' : 'Enter master passcode'}
        </p>

        <input
          type="password"
          inputMode="numeric"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') doSubmit();
          }}
          placeholder="••••"
          aria-label="Passcode"
          className={`mb-2 w-full rounded-xl border border-white/20 bg-black/40 px-4 py-4 text-center font-mono text-xl tracking-[0.5em] text-white outline-none transition-colors placeholder:text-white/20 ${accent.ring}`}
          autoFocus
        />

        {lock.error && (
          <p className="mb-3 text-[11px] text-red-400" role="alert">
            {lock.error}
          </p>
        )}

        <button
          onClick={doSubmit}
          className={`w-full rounded-xl border py-4 text-xs font-bold uppercase tracking-widest transition-all ${accent.button}`}
        >
          {isSetup ? 'Set master passcode' : 'Decrypt & access'}
        </button>
      </div>
    </div>
  );
}
