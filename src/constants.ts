import { Ritual, Exercise } from './types';

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

export const HEALTH_STACK: Exercise[] = [
  { id: 'ex1', name: "McKenzie Press-ups", meta: "3x10 (Back rehab)", type: 'back' },
  { id: 'ex2', name: "Pelvic Tilts", meta: "3x15 (Core bracing)", type: 'back' },
  { id: 'ex3', name: "Incline Walking", meta: "30-45m (Trek Prep)", type: 'trek' },
  { id: 'ex4', name: "Controlled Squats", meta: "4x12 (Knee health)", type: 'trek' },
  { id: 'ex5', name: "Ankle Mobility", meta: "3x15 (Foot correction)", type: 'trek' }
];

export const STOIC_QUOTES = [
  "You have power over your mind - not outside events. Realize this, and you will find strength. - Marcus Aurelius",
  "We suffer more often in imagination than in reality. - Seneca",
  "First say to yourself what you would be; and then do what you have to do. - Epictetus",
  "If it is not right do not do it; if it is not true do not say it. - Marcus Aurelius",
  "It is not the man who has too little, but the man who craves more, that is poor. - Seneca",
  "He who fears death will never do anything worthy of a man who is alive. - Seneca",
  "Waste no more time arguing what a good man should be. Be one. - Marcus Aurelius"
];
