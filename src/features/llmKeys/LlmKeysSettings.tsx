/**
 * The "env dashboard" — add, swap, or remove the API keys Jarvis's backend
 * draws from (llm.ts), with no redeploy. Add more than one key for the same
 * provider (several free-tier accounts, say) and the server automatically
 * moves to the next one when a key hits its rate limit — see llm-keys.ts and
 * generateChat's cooldown logic.
 *
 * Direct Firestore read/write, same as data/habits.ts — this collection has
 * no dedicated context provider since nothing else in the app needs live
 * updates from it, just this one panel.
 */
import { useEffect, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { Check, Clock, KeyRound, Plus, Trash2 } from 'lucide-react';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';

type Provider = 'groq' | 'nvidia' | 'gemini' | 'custom';

interface LlmKeyDoc {
  provider: Provider;
  label: string;
  key: string;
  baseUrl?: string;
  model?: string;
  disabledUntil?: string | null;
  lastError?: string | null;
  addedAt: string;
}

interface LlmKeyRow extends LlmKeyDoc {
  id: string;
}

const PROVIDER_LABEL: Record<Provider, string> = {
  groq: 'Groq',
  nvidia: 'NVIDIA NIM',
  gemini: 'Gemini',
  custom: 'Custom (any OpenAI-compatible endpoint)',
};

const keysRef = (uid: string) => collection(db, 'users', uid, 'llmKeys');

function statusFor(k: LlmKeyRow): { text: string; tone: 'ok' | 'cooling' } {
  if (k.disabledUntil && Date.parse(k.disabledUntil) > Date.now()) {
    const mins = Math.max(1, Math.round((Date.parse(k.disabledUntil) - Date.now()) / 60000));
    return { text: `cooling down, ~${mins}m left`, tone: 'cooling' };
  }
  return { text: 'active', tone: 'ok' };
}

export default function LlmKeysSettings() {
  const { user } = useAuth();
  const uid = user?.uid;
  const [keys, setKeys] = useState<LlmKeyRow[]>([]);
  const [provider, setProvider] = useState<Provider>('groq');
  const [label, setLabel] = useState('');
  const [key, setKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!uid) return;
    return onSnapshot(keysRef(uid), (snap) => {
      setKeys(snap.docs.map((d) => ({ id: d.id, ...(d.data() as LlmKeyDoc) })));
    });
  }, [uid]);

  const add = async () => {
    if (!uid || !key.trim()) return;
    if (provider === 'custom' && (!baseUrl.trim() || !model.trim())) return;
    setSaving(true);
    try {
      await addDoc(keysRef(uid), {
        provider,
        label: label.trim() || PROVIDER_LABEL[provider],
        key: key.trim(),
        ...(provider === 'custom' ? { baseUrl: baseUrl.trim(), model: model.trim() } : {}),
        disabledUntil: null,
        lastError: null,
        addedAt: new Date().toISOString(),
      } satisfies LlmKeyDoc);
      setLabel('');
      setKey('');
      setBaseUrl('');
      setModel('');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!uid) return;
    await deleteDoc(doc(db, 'users', uid, 'llmKeys', id));
  };

  /** Manually clear a cooldown — useful if the user knows the limit already reset. */
  const reactivate = async (id: string) => {
    if (!uid) return;
    await updateDoc(doc(db, 'users', uid, 'llmKeys', id), { disabledUntil: null });
  };

  const grouped = (['groq', 'nvidia', 'gemini', 'custom'] as Provider[]).map((p) => ({
    provider: p,
    rows: keys.filter((k) => k.provider === p),
  }));

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono font-extrabold text-white/40 uppercase tracking-[0.18em]">AI provider keys</span>
      </div>
      <p className="text-[11px] leading-relaxed text-white/40">
        What Jarvis's replies actually run on. Add more than one key per provider — free-tier accounts from
        anywhere — and it automatically moves to the next one when the current key hits its limit, no redeploy.
        Keys are stored under your own account, same as everything else in Ascend.
      </p>

      {grouped.map(
        ({ provider: p, rows }) =>
          rows.length > 0 && (
            <div key={p} className="space-y-1.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-white/30">{PROVIDER_LABEL[p]}</p>
              {rows.map((k) => {
                const status = statusFor(k);
                return (
                  <div
                    key={k.id}
                    className="flex items-center gap-2.5 rounded-xl border border-white/8 bg-white/[0.03] px-3.5 py-2.5"
                  >
                    <KeyRound size={13} className="shrink-0 text-white/30" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] font-semibold text-white/85">{k.label}</span>
                      <span className="block font-mono text-[10px] text-white/30">
                        …{k.key.slice(-4)}
                        {k.baseUrl ? ` · ${k.baseUrl}` : ''}
                      </span>
                    </span>
                    <span
                      className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-mono ${
                        status.tone === 'ok'
                          ? 'bg-brand-500/15 text-brand-300 ring-1 ring-brand-500/25'
                          : 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/25'
                      }`}
                    >
                      {status.tone === 'ok' ? <Check size={10} /> : <Clock size={10} />}
                      {status.text}
                    </span>
                    {status.tone === 'cooling' && (
                      <button
                        onClick={() => reactivate(k.id)}
                        className="shrink-0 text-[10px] font-bold text-white/40 hover:text-brand-300 cursor-pointer"
                      >
                        Reactivate
                      </button>
                    )}
                    <button
                      onClick={() => remove(k.id)}
                      aria-label={`Remove ${k.label}`}
                      className="shrink-0 rounded-lg p-1.5 text-white/30 transition-colors hover:bg-white/10 hover:text-red-400 cursor-pointer"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          ),
      )}
      {keys.length === 0 && (
        <p className="py-2 text-center text-[11.5px] text-white/25">
          No keys added yet — Jarvis is running on whatever's set in the deployment's environment variables.
        </p>
      )}

      <div className="space-y-2 rounded-2xl border border-white/8 bg-white/[0.02] p-3">
        <div className="flex gap-2">
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as Provider)}
            className="liquid-glass-input rounded-xl px-3 py-2 text-[12px] text-white outline-none focus:border-brand-500/50"
          >
            {(['groq', 'nvidia', 'gemini', 'custom'] as Provider[]).map((p) => (
              <option key={p} value={p} className="bg-[#05070c]">
                {PROVIDER_LABEL[p]}
              </option>
            ))}
          </select>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="label, e.g. my second account"
            className="liquid-glass-input min-w-0 flex-1 rounded-xl px-3 py-2 text-[12px] text-white placeholder-white/25 outline-none focus:border-brand-500/50"
          />
        </div>
        {provider === 'custom' && (
          <div className="flex gap-2">
            <input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://.../v1/chat/completions"
              className="liquid-glass-input min-w-0 flex-1 rounded-xl px-3 py-2 text-[12px] text-white placeholder-white/25 outline-none focus:border-brand-500/50"
            />
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="model id"
              className="liquid-glass-input w-32 shrink-0 rounded-xl px-3 py-2 text-[12px] text-white placeholder-white/25 outline-none focus:border-brand-500/50"
            />
          </div>
        )}
        <div className="flex gap-2">
          <input
            value={key}
            onChange={(e) => setKey(e.target.value)}
            type="password"
            placeholder="paste the API key"
            className="liquid-glass-input min-w-0 flex-1 rounded-xl px-3 py-2 text-[12px] text-white placeholder-white/25 outline-none focus:border-brand-500/50"
          />
          <button
            onClick={add}
            disabled={saving || !key.trim() || (provider === 'custom' && (!baseUrl.trim() || !model.trim()))}
            className="shrink-0 rounded-xl bg-brand-500 p-2.5 text-black transition-all hover:bg-brand-400 disabled:opacity-40 cursor-pointer"
            aria-label="Add key"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>
    </section>
  );
}
