import { launchApi } from '../../launch/launchApi';
import type { LaunchState } from '../../launch/types';
import type { JarvisTool } from '../types';

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

interface Deps {
  launchRef: { current: LaunchState | null };
  updateLaunch: (updater: (prev: LaunchState) => LaunchState) => void;
}

/** Strategic Command AI tools — reuse the existing LaunchKit endpoints. */
export function createLaunchTools({ launchRef, updateLaunch }: Deps): JarvisTool[] {
  return [
    {
      name: 'validateIdea',
      module: 'Strategic Command',
      description: 'Score a business idea on the Opportunity Matrix (demand × competition).',
      parameters: { idea: 'the business idea to score' },
      followUp: true,
      validate: (a) => (str(a.idea) ? null : 'provide an idea to score'),
      execute: async (a) => {
        const idea = str(a.idea);
        const r = await launchApi.scoreIdea(idea);
        updateLaunch((prev) => ({
          ...prev,
          matrixHistory: [{ ...r, id: crypto.randomUUID(), idea, createdAt: new Date().toISOString() }, ...prev.matrixHistory].slice(0, 25),
        }));
        return {
          ok: true,
          message: `scored: ${r.quadrant.replace('_', ' ')}`,
          data: { quadrant: r.quadrant, demand: r.demand, competition: r.competition, recommendation: r.recommendation },
        };
      },
    },
    {
      name: 'generateOffer',
      module: 'Strategic Command',
      description: "Generate a full business offer from the user's skills and set it active.",
      parameters: { skills: 'skills', knowledge: 'domain knowledge', experience: 'experience', interests: 'interests' },
      followUp: true,
      validate: (a) =>
        str(a.skills) || str(a.knowledge) || str(a.experience) || str(a.interests)
          ? null
          : 'need at least one of skills/knowledge/experience/interests',
      execute: async (a) => {
        const offer = await launchApi.generateOffer({
          skills: str(a.skills),
          knowledge: str(a.knowledge),
          experience: str(a.experience),
          interests: str(a.interests),
        });
        updateLaunch((prev) => ({ ...prev, activeOffer: offer }));
        return { ok: true, message: `offer: ${offer.title}`, data: { title: offer.title, whatYouSell: offer.whatYouSell, whoYouSellTo: offer.whoYouSellTo } };
      },
    },
    {
      name: 'generateProspects',
      module: 'Strategic Command',
      description: 'Build a targeted prospect list for the active offer and add it to the pipeline.',
      followUp: true,
      validate: () => (launchRef.current?.activeOffer ? null : 'no active offer — generate one first'),
      execute: async () => {
        const offer = launchRef.current!.activeOffer!;
        const list = await launchApi.buildProspects(offer);
        const now = new Date().toISOString();
        const saved = list.prospects.map((p) => ({ ...p, id: crypto.randomUUID(), status: 'new' as const, createdAt: now }));
        updateLaunch((prev) => ({ ...prev, prospects: [...prev.prospects, ...saved] }));
        return { ok: true, message: `${saved.length} prospects added`, data: { count: saved.length, researchNotes: list.researchNotes } };
      },
    },
  ];
}
