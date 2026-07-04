import { Ritual } from './types';

export const RITUALS: Ritual[] = [
  // Morning
  { id: 'ritual-m1', name: 'Wake Up 6AM', category: 'morning' },
  { id: 'ritual-m2', name: '10m Meditation', category: 'morning' },
  { id: 'ritual-m3', name: 'Cold Shower', category: 'morning' },
  { id: 'ritual-m4', name: 'Planning/OS Review', category: 'morning' },

  // Growth
  { id: 'ritual-g1', name: '30m Reading', category: 'growth' },
  { id: 'ritual-g2', name: '2hrs Deep Work', category: 'growth' },
  { id: 'ritual-g3', name: 'Vitamins/Meds', category: 'growth' },

  // Evening
  { id: 'ritual-e1', name: 'Digital Detox', category: 'evening' },
  { id: 'ritual-e2', name: 'Skin Care', category: 'evening' },
  { id: 'ritual-e3', name: 'Gratefulness Journal', category: 'evening' },
  { id: 'ritual-e4', name: 'Sleep 10:30PM', category: 'evening' },
];
