import { useState } from 'react';
import { Check, Link2, Unlink, AlertTriangle } from 'lucide-react';
import { useKite } from './KiteContext';

/** Connect / reconnect / disconnect Zerodha Kite. Lives inside Settings. */
export default function KiteSettings() {
  const { status, connected, loginError, connect, disconnect, setTokenManually } = useKite();
  const [devToken, setDevToken] = useState('');

  const connectBtnCls =
    'flex w-full items-center justify-center gap-2 rounded-xl border border-brand-500/30 bg-brand-500/15 py-2.5 text-[11px] font-extrabold uppercase tracking-wider text-brand-300 transition-colors hover:bg-brand-500/25 cursor-pointer';

  return (
    <section className="space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono font-extrabold text-white/40 uppercase tracking-[0.18em]">Zerodha Kite</span>
        {connected && (
          <span className="flex items-center gap-1 text-[10px] font-bold text-brand-400">
            <Check size={11} /> Connected
          </span>
        )}
      </div>

      {connected ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5">
          <p className="text-[12px] text-white/60">Portfolio linked — read-only. Session renews each morning.</p>
          <button
            onClick={disconnect}
            className="flex shrink-0 items-center gap-1.5 text-[11px] font-bold text-white/50 hover:text-red-300 transition-colors cursor-pointer"
          >
            <Unlink size={13} /> Disconnect
          </button>
        </div>
      ) : (
        <>
          {status === 'expired' ? (
            <div className="flex items-center gap-2 rounded-xl border border-amber-400/25 bg-amber-500/10 px-3.5 py-2.5 text-[11.5px] text-amber-300/90">
              <AlertTriangle size={13} className="shrink-0" />
              Kite session expired — Zerodha tokens reset daily around 7:30am IST.
            </div>
          ) : (
            <p className="text-[11px] leading-relaxed text-white/40">
              Link your Zerodha account so Jarvis can read your real holdings, positions, and margins.
              Read-only — no orders can ever be placed from here.
            </p>
          )}
          {loginError && <p className="text-[11px] text-red-400">{loginError}</p>}
          <button onClick={connect} className={connectBtnCls}>
            <Link2 size={13} />
            {status === 'expired' ? 'Reconnect Kite' : 'Connect Kite'}
          </button>
          {import.meta.env.DEV && (
            <div className="flex gap-2">
              <input
                value={devToken}
                onChange={(e) => setDevToken(e.target.value)}
                type="password"
                placeholder="Dev: paste access_token from prod"
                aria-label="Kite access token (dev only)"
                className="w-full rounded-xl border border-white/12 bg-[#05070c] px-3.5 py-2 text-[12px] text-white placeholder:text-white/25 outline-none focus:border-brand-500/60"
              />
              <button
                onClick={() => {
                  setTokenManually(devToken);
                  setDevToken('');
                }}
                disabled={!devToken.trim()}
                className="shrink-0 rounded-xl border border-white/12 bg-white/5 px-3 text-[11px] font-bold text-white/60 hover:text-white disabled:opacity-40 cursor-pointer"
              >
                Use
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
