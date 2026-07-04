import { useCallback, useRef, useState } from 'react';
import { NotebookPen, Mic, MicOff, Send, CloudOff, BookCheck, Loader2 } from 'lucide-react';
import type { OSState } from '../../types';
import Panel from '../../components/ui/Panel';
import { useObsidian } from '../obsidian/ObsidianContext';
import { appendJournalEntry } from './journal';

interface Props {
  state: OSState;
  updateState: (updater: (prev: OSState) => OSState) => void;
}

const SpeechRecognitionImpl: any =
  typeof window !== 'undefined' ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : null;

/** Local dictation for the composer — independent of Jarvis's push-to-talk. */
function useDictation(onText: (t: string) => void) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const recogRef = useRef<any>(null);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  const stop = useCallback(() => recogRef.current?.stop(), []);
  const start = useCallback(() => {
    if (!SpeechRecognitionImpl || listening) return;
    const recog = new SpeechRecognitionImpl();
    recogRef.current = recog;
    recog.lang = 'en-IN';
    recog.interimResults = true;
    recog.continuous = true; // journaling wants longer takes than a command
    let finalText = '';
    recog.onresult = (e: any) => {
      let interimText = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t;
        else interimText += t;
      }
      setInterim(interimText);
    };
    recog.onend = () => {
      setListening(false);
      setInterim('');
      if (finalText.trim()) onTextRef.current(finalText.trim());
    };
    recog.onerror = () => {
      setListening(false);
      setInterim('');
    };
    setListening(true);
    recog.start();
  }, [listening]);

  return { supported: !!SpeechRecognitionImpl, listening, interim, start, stop };
}

/**
 * Journaling & Reflection: text or voice entries. Everything lands in the
 * capped local/Firestore cache; when the Obsidian vault is connected each
 * entry also appends to Journal/YYYY-MM-DD.md there.
 */
export default function JournalHub({ state, updateState }: Props) {
  const { connected, client } = useObsidian();
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [lastMode, setLastMode] = useState<'text' | 'voice'>('text');
  const entries = state.journal?.entries ?? [];

  const dictation = useDictation((t) => {
    setDraft((d) => (d ? `${d} ${t}` : t));
    setLastMode('voice');
  });

  const save = async () => {
    const text = draft.trim();
    if (!text || saving) return;
    setSaving(true);
    await appendJournalEntry(updateState, connected ? client : null, text, lastMode);
    setDraft('');
    setLastMode('text');
    setSaving(false);
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 pb-8">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-extrabold tracking-tight text-white">
          <NotebookPen size={18} className="text-brand-400" /> Journal
        </h2>
        <span className={`flex items-center gap-1.5 text-[11px] font-mono ${connected ? 'text-brand-400' : 'text-white/35'}`}>
          {connected ? <BookCheck size={13} /> : <CloudOff size={13} />}
          {connected ? 'syncing to Obsidian vault' : 'vault not connected — saving locally'}
        </span>
      </div>

      <Panel>
        <textarea
          value={dictation.interim ? `${draft}${draft ? ' ' : ''}${dictation.interim}` : draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setLastMode('text');
          }}
          rows={5}
          placeholder={dictation.listening ? 'Listening — speak your mind…' : "What's on your mind? Type, or dictate with the mic."}
          className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.04] p-3.5 text-[13.5px] leading-relaxed text-white placeholder-white/30 outline-none focus:border-brand-400/40"
        />
        <div className="mt-2.5 flex items-center gap-2">
          <button
            onClick={() => (dictation.listening ? dictation.stop() : dictation.start())}
            disabled={!dictation.supported}
            title={dictation.supported ? undefined : 'Voice input needs Chrome or Edge'}
            className={`flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-[11px] font-bold uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-30 ${
              dictation.listening ? 'border-red-400/40 bg-red-500/20 text-red-300' : 'border-white/10 bg-white/[0.04] text-white/60 hover:text-white'
            }`}
          >
            {dictation.listening ? <MicOff size={13} /> : <Mic size={13} />}
            {dictation.listening ? 'Stop' : 'Dictate'}
          </button>
          <button
            onClick={save}
            disabled={!draft.trim() || saving}
            className="ml-auto flex items-center gap-1.5 rounded-full border border-brand-400/30 bg-brand-500/20 px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-brand-300 hover:bg-brand-500/30 transition-colors cursor-pointer disabled:opacity-40"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Save entry
          </button>
        </div>
      </Panel>

      <Panel>
        <p className="mb-3 text-[10px] font-mono font-bold uppercase tracking-widest text-white/40">Recent reflections</p>
        {entries.length === 0 ? (
          <p className="text-[13px] text-white/35">Nothing yet. The first entry is the hardest — tell Jarvis “journal: …” works too.</p>
        ) : (
          <ul className="space-y-3">
            {entries.slice(0, 15).map((e) => (
              <li key={e.id} className="border-b border-white/5 pb-3 last:border-0 last:pb-0">
                <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-white/80">{e.text}</p>
                <p className="mt-1 flex items-center gap-2 text-[10.5px] font-mono text-white/30">
                  {new Date(e.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  <span>· {e.mode}</span>
                  {e.inVault && <span className="text-brand-400/70">· in vault</span>}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
