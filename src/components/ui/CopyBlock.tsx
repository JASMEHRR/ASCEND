import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

/** A labelled block of generated text with a copy-to-clipboard button. */
export default function CopyBlock({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-brand-400">{label}</p>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(text).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
          aria-label={`Copy ${label}`}
          className="flex items-center gap-1.5 text-[11px] font-semibold text-white/50 hover:text-white transition-colors cursor-pointer"
        >
          {copied ? <Check size={13} className="text-brand-400" /> : <Copy size={13} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-white/80">{text}</p>
    </div>
  );
}
