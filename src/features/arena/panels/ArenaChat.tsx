/**
 * Room chat.
 *
 * Tile placements arrive as one rolling batched message per player per day
 * (see rooms.ts::postBatch) rather than one per habit — six people ticking
 * eight habits would otherwise be fifty messages nobody reads.
 *
 * Messages can carry an attached image (compressed the same way puzzle
 * uploads are, since there's no separate file storage backend) and @mentions
 * of other room members, highlighted when rendered.
 */
import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Send, X } from 'lucide-react';
import { useArena } from '../ArenaContext';
import { sendMessage } from '../data/rooms';
import { useAuth } from '../../../context/AuthContext';
import { prepareImage } from '../logic/image';
import { activeMentionQuery, applyMention, matchPlayers, resolveMentions, splitMentionSegments } from '../logic/mentions';

export default function ArenaChat() {
  const { room, messages, players } = useArena();
  const { user } = useAuth();
  const [text, setText] = useState('');
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const nameFor = (playerId: string | null) =>
    playerId ? (players.find((p) => p.id === playerId)?.name ?? 'Someone') : null;

  // @mention autocomplete: whatever's being typed right after the last "@" at
  // the cursor, matched against the room roster, self excluded.
  const cursor = inputRef.current?.selectionStart ?? text.length;
  const mentionQuery = activeMentionQuery(text, cursor);
  const suggestions = mentionQuery !== null ? matchPlayers(players, mentionQuery, user?.uid) : [];

  const pickMention = (name: string) => {
    const applied = applyMention(text, cursor, name);
    setText(applied.text);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(applied.cursor, applied.cursor);
    });
  };

  const onFile = async (file: File) => {
    setImageError(null);
    setImageBusy(true);
    try {
      const { dataUrl } = await prepareImage(file);
      setPendingImage(dataUrl);
    } catch (e) {
      setImageError(e instanceof Error ? e.message : 'That image could not be used.');
    } finally {
      setImageBusy(false);
    }
  };

  const send = async () => {
    const body = text.trim();
    if ((!body && !pendingImage) || !room || !user || sending) return;
    setSending(true);
    try {
      const mentions = resolveMentions(body, players);
      await sendMessage(room.id, user.uid, body, { imageUrl: pendingImage ?? undefined, mentions });
      setText('');
      setPendingImage(null);
      setImageError(null);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex h-full min-h-[320px] flex-col gap-3">
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto custom-scrollbar pr-1">
        {messages.length === 0 && (
          <p className="py-8 text-center text-[12px] text-white/25">Nothing yet. Tick a habit and the room will hear about it.</p>
        )}
        {messages.map((m) => {
          const mine = m.playerId === user?.uid;
          const mentionsMe = !!user && m.mentions?.includes(user.uid);
          // Batched placements and milestones read as system lines, not chat.
          if (m.kind !== 'text') {
            return (
              <p key={m.id} className="py-0.5 text-center font-mono text-[10.5px] uppercase tracking-wider text-white/30">
                {m.body}
              </p>
            );
          }
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] space-y-1.5 rounded-2xl px-3.5 py-2 ${
                  mine
                    ? 'bg-brand-500 text-black'
                    : mentionsMe
                      ? 'border border-brand-400/40 bg-brand-500/10 text-white/85'
                      : 'border border-white/10 bg-white/[0.06] text-white/85'
                }`}
              >
                {!mine && (
                  <span className="mb-0.5 block text-[10px] font-bold uppercase tracking-wider text-white/40">
                    {nameFor(m.playerId)}
                  </span>
                )}
                {m.imageUrl && (
                  <img src={m.imageUrl} alt="" className="max-h-56 w-full rounded-xl object-cover" />
                )}
                {m.body && (
                  <span className="block text-[13px] leading-snug">
                    {splitMentionSegments(m.body, players).map((seg, i) =>
                      seg.isMention ? (
                        <span
                          key={i}
                          className={`font-bold ${mine ? 'text-black/70' : 'text-brand-300'}`}
                        >
                          {seg.text}
                        </span>
                      ) : (
                        <span key={i}>{seg.text}</span>
                      ),
                    )}
                  </span>
                )}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {pendingImage && (
        <div className="relative w-fit shrink-0">
          <img src={pendingImage} alt="" className="h-16 w-16 rounded-xl object-cover" />
          <button
            onClick={() => setPendingImage(null)}
            aria-label="Remove image"
            className="absolute -right-1.5 -top-1.5 rounded-full bg-black/80 p-0.5 text-white/80 hover:text-white cursor-pointer"
          >
            <X size={12} />
          </button>
        </div>
      )}
      {imageError && <p className="shrink-0 text-[11px] text-red-400/90">{imageError}</p>}

      <div className="relative flex shrink-0 items-center gap-2">
        {suggestions.length > 0 && (
          <div className="absolute bottom-full left-0 mb-1.5 w-48 space-y-0.5 rounded-2xl border border-white/10 bg-black/90 p-1.5 backdrop-blur-md">
            {suggestions.map((p) => (
              <button
                key={p.id}
                onClick={() => pickMention(p.name)}
                className="flex w-full items-center rounded-xl px-2.5 py-1.5 text-left text-[12px] text-white/80 hover:bg-white/10 cursor-pointer"
              >
                {p.name}
              </button>
            ))}
          </div>
        )}
        <button
          onClick={() => fileRef.current?.click()}
          disabled={imageBusy}
          aria-label="Attach an image"
          className="shrink-0 rounded-xl border border-white/12 bg-white/[0.04] p-3 text-white/50 transition-all hover:bg-white/[0.1] hover:text-white disabled:opacity-40 cursor-pointer"
        >
          <ImagePlus size={15} />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])}
        />
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Say something to the room… @ to mention"
          className="liquid-glass-input min-w-0 flex-1 rounded-2xl px-4 py-3 text-[13px] text-white placeholder-white/25 outline-none focus:border-brand-500/50"
        />
        <button
          onClick={send}
          disabled={(!text.trim() && !pendingImage) || sending}
          aria-label="Send"
          className="shrink-0 rounded-xl bg-brand-500 p-3 text-black transition-all hover:bg-brand-400 disabled:opacity-40 cursor-pointer"
        >
          <Send size={15} />
        </button>
      </div>
    </div>
  );
}
