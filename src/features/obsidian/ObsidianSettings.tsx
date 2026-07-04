import { useState } from 'react';
import { Check, Loader2, Link2, Unlink } from 'lucide-react';
import { useObsidian } from './ObsidianContext';

/** Connect / disconnect the Obsidian vault. Lives inside the Settings modal. */
export default function ObsidianSettings() {
  const { status, connected, config, error, connect, disconnect } = useObsidian();
  const [baseUrl, setBaseUrl] = useState(config?.baseUrl ?? 'https://127.0.0.1:27124');
  const [apiKey, setApiKey] = useState(config?.apiKey ?? '');

  const inputCls = 'w-full rounded-xl border border-white/12 bg-[#05070c] px-3.5 py-2.5 text-[13px] text-white placeholder:text-white/25 outline-none focus:border-brand-500/60';

  return (
    <section className="space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono font-extrabold text-white/40 uppercase tracking-[0.18em]">Obsidian vault</span>
        {connected && (
          <span className="flex items-center gap-1 text-[10px] font-bold text-brand-400">
            <Check size={11} /> Connected
          </span>
        )}
      </div>

      {connected ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5">
          <p className="truncate text-[12px] text-white/60">{config?.baseUrl}</p>
          <button onClick={disconnect} className="flex shrink-0 items-center gap-1.5 text-[11px] font-bold text-white/50 hover:text-red-300 transition-colors cursor-pointer">
            <Unlink size={13} /> Disconnect
          </button>
        </div>
      ) : (
        <>
          <p className="text-[11px] leading-relaxed text-white/40">
            Install the <span className="text-white/60">Local REST API</span> plugin in Obsidian, then paste its URL + API key. Jarvis can then search, read, and write your notes. Everything stays on your machine.
          </p>
          <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://127.0.0.1:27124" className={inputCls} aria-label="Obsidian API URL" />
          <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} type="password" placeholder="API key" className={inputCls} aria-label="Obsidian API key" />
          {error && <p className="text-[11px] text-red-400">{error}</p>}
          <button
            onClick={() => connect({ baseUrl: baseUrl.trim(), apiKey: apiKey.trim() })}
            disabled={status === 'connecting' || !baseUrl.trim() || !apiKey.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-brand-500/30 bg-brand-500/15 py-2.5 text-[11px] font-extrabold uppercase tracking-wider text-brand-300 transition-colors hover:bg-brand-500/25 disabled:opacity-40 cursor-pointer"
          >
            {status === 'connecting' ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />}
            Connect vault
          </button>
        </>
      )}
    </section>
  );
}
