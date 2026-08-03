/**
 * First-run habit setup.
 *
 * Typing habits into a form one at a time is the dullest possible first
 * five minutes, and it's exactly when someone decides whether to bother. So
 * the default path is conversational: describe your day in a sentence and
 * Jarvis creates the habits. The manual form stays one click away for anyone
 * who'd rather just type.
 */
import { useState } from 'react';
import { ListPlus, Loader2, Sparkles } from 'lucide-react';
import { useArena } from '../ArenaContext';
import { useJarvis } from '../../jarvis/engine/JarvisProvider';

const EXAMPLES = [
  'I want to read, work out, and sleep by 11',
  'Track 8 glasses of water, meditation, and no doomscrolling',
  'Morning walk, journal, and 2 hours of deep work',
];

export default function ArenaOnboard({ onManual }: { onManual: () => void }) {
  const { room } = useArena();
  const { sendMessage, setOpen } = useJarvis();
  const [text, setText] = useState('');
  const [sent, setSent] = useState(false);

  /**
   * Hand the description to Jarvis, which already has addArenaHabit
   * registered. Phrasing it as an explicit instruction keeps it from replying
   * with advice instead of calling the tool.
   */
  const ask = async (description: string) => {
    const body = description.trim();
    if (!body) return;
    setSent(true);
    setOpen(true);
    await sendMessage(
      `Set up my Arena habits. Add each of these as a separate habit using addArenaHabit, ` +
        `then tell me what you added: ${body}`,
    );
  };

  return (
    <div className="mx-auto max-w-md space-y-4 py-4">
      <div className="text-center">
        <Sparkles size={26} className="mx-auto text-brand-400/70" />
        <h3 className="mt-3 text-[15px] font-bold text-white">
          {room ? `What are you tracking in ${room.name}?` : 'What do you want to track?'}
        </h3>
        <p className="mt-1 text-[12px] leading-snug text-white/40">
          Describe your day and Jarvis will set the habits up. Each one becomes a piece of your weekly
          picture.
        </p>
      </div>

      <div className="liquid-glass-panel space-y-2.5 rounded-3xl p-5">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void ask(text);
            }
          }}
          rows={3}
          placeholder="e.g. I want to read every day, drink 8 glasses of water, and stop scrolling before bed"
          className="liquid-glass-input w-full resize-none rounded-xl px-3.5 py-3 text-[13px] leading-snug text-white placeholder-white/25 outline-none focus:border-brand-500/50"
        />
        <button
          onClick={() => void ask(text)}
          disabled={!text.trim() || sent}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-2.5 text-[12px] font-bold text-black transition-all hover:bg-brand-400 disabled:opacity-40 cursor-pointer"
        >
          {sent ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {sent ? 'Jarvis is setting them up…' : 'Set up my habits'}
        </button>

        <div className="space-y-1.5 pt-1">
          <p className="font-mono text-[9px] uppercase tracking-widest text-white/25">Or try one of these</p>
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => setText(ex)}
              className="block w-full rounded-lg px-2 py-1.5 text-left text-[11.5px] text-white/45 transition-colors hover:bg-white/[0.05] hover:text-white/80 cursor-pointer"
            >
              “{ex}”
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={onManual}
        className="mx-auto flex items-center gap-1.5 text-[11.5px] font-semibold text-white/35 transition-colors hover:text-white/75 cursor-pointer"
      >
        <ListPlus size={12} /> I'll add them myself
      </button>
    </div>
  );
}
