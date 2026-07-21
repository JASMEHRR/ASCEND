import { useState } from 'react';
import { Loader2, Unplug, CheckCircle2 } from 'lucide-react';
import { useGoogle } from './GoogleContext';

/**
 * Settings block for the Google account link (Calendar + Gmail scopes).
 * Connect opens the GIS consent popup; tokens stay in the browser only.
 */
export default function GoogleSettings() {
  const google = useGoogle();
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    setError(null);
    const ok = await google.connect();
    if (!ok) setError('Google did not grant access. Check the popup wasn’t blocked and try again.');
  };

  return (
    <section className="space-y-2">
      <span className="text-[10px] font-mono font-extrabold text-white/40 uppercase tracking-[0.18em]">Google Account</span>
      <p className="text-[11px] text-white/35 leading-snug">
        Powers Calendar planning sync and the Gmail module. Access stays in this browser — nothing is stored on Ascend servers.
      </p>

      {!google.configured ? (
        <p className="rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300/90">
          Not configured: this deployment is missing <code className="font-mono">VITE_GOOGLE_CLIENT_ID</code>. See GOOGLE_SETUP.md in the repo.
        </p>
      ) : google.connected ? (
        <div className="flex items-center gap-3 px-3.5 py-2.5 rounded-2xl bg-white/[0.03] border border-white/8">
          <CheckCircle2 size={16} className="text-brand-300 shrink-0" />
          <span className="flex-1 text-[12px] font-bold text-white/85">Connected — Calendar & Gmail ready</span>
          <button
            onClick={() => google.disconnect()}
            className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[10.5px] font-bold uppercase tracking-wider text-white/50 hover:text-white transition-colors cursor-pointer"
          >
            <Unplug size={12} /> Disconnect
          </button>
        </div>
      ) : (
        <button
          onClick={handleConnect}
          disabled={google.connecting}
          className="w-full flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-2xl bg-white/[0.05] border border-white/10 hover:bg-white/[0.09] hover:border-white/20 transition-all cursor-pointer text-[12px] font-bold text-white/85 disabled:opacity-50"
        >
          {google.connecting ? <Loader2 size={14} className="animate-spin" /> : <GoogleG />}
          Connect Google (Calendar + Gmail)
        </button>
      )}
      {error && <p className="text-[11px] text-red-300/90">{error}</p>}
    </section>
  );
}

function GoogleG() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.3-2.2H12v4.1h6.5c-.1 1.1-.8 2.7-2.4 3.8l3.7 2.9c2.3-2.1 3.7-5.1 3.7-8.6z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.8-3c-1 .7-2.4 1.2-4.2 1.2-3.2 0-5.9-2.1-6.9-5l-3.9 3C3.2 21.3 7.3 24 12 24z" />
      <path fill="#FBBC05" d="M5.1 14.3c-.2-.7-.4-1.5-.4-2.3s.1-1.6.4-2.3l-4-3C.4 8.3 0 10.1 0 12s.4 3.7 1.2 5.3l3.9-3z" />
      <path fill="#EA4335" d="M12 4.7c2.3 0 3.8 1 4.7 1.8l3.4-3.3C18 1.2 15.2 0 12 0 7.3 0 3.2 2.7 1.2 6.7l4 3c1-2.9 3.6-5 6.8-5z" />
    </svg>
  );
}
