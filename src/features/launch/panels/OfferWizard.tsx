import { useState } from 'react';
import Panel from '../../../components/ui/Panel';
import Button from '../../../components/ui/Button';
import { launchApi } from '../launchApi';
import type { LaunchState, Offer } from '../types';
import { SectionHeader, FrameworkNote, Disclaimer, ErrorNote, Spinner, inputCls } from './shared';

const STEPS = [
  { key: 'skills', title: 'What are you good at?', hint: 'Hard skills you could charge for today — marketing, sales, design, coding, video, copywriting, ops…', placeholder: 'e.g. B2B marketing, paid ads, landing pages' },
  { key: 'knowledge', title: 'What do you know deeply?', hint: 'Industries or niches where you understand the players and pains better than an outsider.', placeholder: 'e.g. SaaS go-to-market, e-commerce logistics' },
  { key: 'experience', title: 'What have you actually done?', hint: 'Jobs, projects, wins — even small ones. Proof beats credentials.', placeholder: 'e.g. 4 years in a startup marketing team, grew a newsletter to 3k' },
  { key: 'interests', title: 'What could you talk about for hours?', hint: "You'll do outreach and content daily — pick terrain you enjoy.", placeholder: 'e.g. YouTube strategy, AI tools, personal finance' },
] as const;

type Answers = Record<(typeof STEPS)[number]['key'] | 'notes', string>;

function OfferResult({ offer, onUseOffer, isActive }: { offer: Offer; onUseOffer: () => void; isActive: boolean }) {
  return (
    <div className="space-y-5">
      <Panel accent>
        <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-brand-400">Your offer</p>
        <h3 className="mt-1 text-2xl font-extrabold text-white">{offer.title}</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-white/40">What you sell</p>
            <p className="mt-1 text-[13px] leading-relaxed text-white/75">{offer.whatYouSell}</p>
          </div>
          <div>
            <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-white/40">Who you sell to</p>
            <p className="mt-1 text-[13px] leading-relaxed text-white/75">{offer.whoYouSellTo}</p>
          </div>
        </div>
      </Panel>

      <div className="grid gap-4 md:grid-cols-3">
        {offer.pricingTiers.map((tier, i) => (
          <Panel key={tier.name} accent={i === 1}>
            <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-white/40">{tier.name}</p>
            <p className="mt-1 text-3xl font-extrabold text-white">
              ${tier.price.toLocaleString()}
              <span className="text-sm font-normal text-white/40">/mo</span>
            </p>
            <ul className="mt-3 space-y-1.5 text-[13px] leading-snug text-white/75">
              {tier.deliverables.map((d) => (
                <li key={d} className="flex gap-2"><span className="text-brand-400">✓</span>{d}</li>
              ))}
            </ul>
            <p className="mt-3 border-t border-white/8 pt-2 text-[11px] italic text-white/40">Best for: {tier.bestFor}</p>
          </Panel>
        ))}
      </div>
      <p className="text-[11px] italic text-white/35">Priced by result, never by the hour — the client buys an outcome, not your time.</p>

      <Panel>
        <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-white/40">One-page summary</p>
        <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-white/75">{offer.offerSummary}</p>
      </Panel>

      <Panel>
        <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-brand-400">Why this is a Blue Ocean</p>
        <p className="mt-2 text-[13px] leading-relaxed text-white/75">{offer.whyBlueOcean}</p>
      </Panel>

      <Panel>
        <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-white/40">Likely competitors — and your edge</p>
        <div className="mt-3 space-y-4">
          {offer.competitors.map((c) => (
            <div key={c.name} className="border-l-2 border-brand-500/40 pl-4">
              <p className="text-[13px] font-semibold text-white">{c.name}</p>
              <p className="mt-0.5 text-[13px] text-white/50">{c.description}</p>
              <p className="mt-1 text-[13px] text-white/75"><span className="font-semibold text-brand-400">Differentiate:</span> {c.howToDifferentiate}</p>
            </div>
          ))}
        </div>
      </Panel>

      <Panel>
        <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-white/40">7-day plan to the first client</p>
        <div className="mt-3 space-y-3">
          {offer.sevenDayPlan.map((d) => (
            <div key={d.day} className="flex gap-4">
              <span className="text-lg font-extrabold text-brand-400">D{d.day}</span>
              <div>
                <p className="text-[13px] font-semibold text-white">{d.title}</p>
                <ul className="mt-0.5 list-inside list-disc text-[13px] text-white/50">
                  {d.actions.map((a) => <li key={a}>{a}</li>)}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Disclaimer>
        This output gets you ~70–80% of the way. Before a single DM: verify the competitors yourself and sanity-check
        the price points against what your market actually pays. The judgment is your job.
      </Disclaimer>

      <Button onClick={onUseOffer} disabled={isActive}>
        {isActive ? 'Saved as active offer ✓' : 'Set as my active offer'}
      </Button>
    </div>
  );
}

export default function OfferWizard({
  state,
  update,
}: {
  state: LaunchState;
  update: (fn: (prev: LaunchState) => LaunchState) => void;
}) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>({ skills: '', knowledge: '', experience: '', interests: '', notes: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [offer, setOffer] = useState<Offer | null>(null);

  const onReview = step === STEPS.length;
  const isActive = !!offer && JSON.stringify(state.activeOffer) === JSON.stringify(offer);

  async function generate() {
    setLoading(true);
    setError('');
    try {
      setOffer(await launchApi.generateOffer(answers));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed');
    } finally {
      setLoading(false);
    }
  }

  if (offer) {
    return (
      <div className="max-w-4xl">
        <SectionHeader kicker="Step 02 — The Offer Triangle" title="Your offer is ready" />
        <OfferResult offer={offer} isActive={isActive} onUseOffer={() => update((p) => ({ ...p, activeOffer: offer }))} />
        <button className="mt-6 text-[13px] font-semibold text-white/40 hover:text-white transition-colors cursor-pointer" onClick={() => setOffer(null)}>
          ← Start over with different inputs
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <SectionHeader
        kicker="Step 02 — The Offer Triangle"
        title="AI Offer Generator"
        subtitle="Answer four questions. The model combines your unfair advantages with what's trending in AI and builds the offer: what you sell, who you sell to, and result-based pricing."
      />

      <div className="mb-6">
        <FrameworkNote title="The Offer Triangle">
          Every offer has three corners: <strong className="text-white">What</strong> you sell (a service framed as a
          result), <strong className="text-white">Who</strong> you sell to (one specific buyer with money and urgent
          pain), and <strong className="text-white">Pricing</strong> (by result — $1.5K / $3K / $6K per month — never
          hourly). Golden rule: <strong className="text-white">sell before you build.</strong>
        </FrameworkNote>
      </div>

      <div className="mb-6 flex items-center gap-2">
        {[...STEPS.map((s) => s.key), 'review'].map((k, i) => (
          <button
            key={k}
            onClick={() => i <= step && setStep(i)}
            className={`h-2 flex-1 rounded-full transition-colors ${i <= step ? 'bg-brand-500' : 'bg-white/10'}`}
            aria-label={`Step ${i + 1}`}
          />
        ))}
      </div>

      {!onReview ? (
        <Panel>
          <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-white/40">Question {step + 1} of {STEPS.length}</p>
          <h3 className="mt-1 text-xl font-extrabold text-white">{STEPS[step].title}</h3>
          <p className="mt-1 text-[13px] text-white/50">{STEPS[step].hint}</p>
          <textarea
            className={`${inputCls} mt-4 min-h-28 resize-y`}
            placeholder={STEPS[step].placeholder}
            value={answers[STEPS[step].key]}
            onChange={(e) => setAnswers({ ...answers, [STEPS[step].key]: e.target.value })}
            autoFocus
          />
          <div className="mt-4 flex justify-between">
            <Button variant="secondary" onClick={() => setStep(step - 1)} disabled={step === 0}>Back</Button>
            <Button onClick={() => setStep(step + 1)}>{step === STEPS.length - 1 ? 'Review' : 'Next'}</Button>
          </div>
        </Panel>
      ) : (
        <Panel>
          <h3 className="text-xl font-extrabold text-white">Review your inputs</h3>
          <div className="mt-4 space-y-3">
            {STEPS.map((s, i) => (
              <div key={s.key} className="flex items-start justify-between gap-4 border-b border-white/8 pb-3">
                <div>
                  <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-white/40">{s.title}</p>
                  <p className="mt-0.5 text-[13px] text-white/75">{answers[s.key] || <em className="text-white/35">— skipped —</em>}</p>
                </div>
                <button className="shrink-0 text-[11px] font-semibold text-brand-400 cursor-pointer" onClick={() => setStep(i)}>Edit</button>
              </div>
            ))}
            <label className="block">
              <span className="text-[13px] font-semibold text-white">Anything else the model should know?</span>
              <textarea
                className={`${inputCls} mt-2 min-h-20 resize-y`}
                value={answers.notes}
                onChange={(e) => setAnswers({ ...answers, notes: e.target.value })}
              />
            </label>
          </div>
          {error && <div className="mt-4"><ErrorNote message={error} /></div>}
          <div className="mt-5 flex items-center justify-between">
            <Button variant="secondary" onClick={() => setStep(step - 1)} disabled={loading}>Back</Button>
            <Button onClick={generate} loading={loading}>{loading ? 'Building' : 'Generate my offer'}</Button>
          </div>
          {loading && <div className="mt-4"><Spinner label="Combining your skills with what's trending in AI — 30–90 seconds…" /></div>}
        </Panel>
      )}
    </div>
  );
}
