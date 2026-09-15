/**
 * Habit icon names resolved to components.
 *
 * Every habit has carried an `icon` since the first migration, but nothing has
 * ever drawn one. An explicit table rather than lucide's dynamic-import map:
 * the set of names we actually mint is small and closed (see migrate.ts's
 * iconFor and the Arena seed), and a static table keeps them in the main bundle
 * instead of firing a network request per row.
 */
import {
  Activity,
  Bed,
  BookOpen,
  Brain,
  Calculator,
  Check,
  Code,
  Droplets,
  Dumbbell,
  Footprints,
  Gamepad2,
  GraduationCap,
  Instagram,
  ListChecks,
  Lock,
  Moon,
  NotebookPen,
  Phone,
  Pill,
  Smartphone,
  Sparkles,
  Sun,
  Sunrise,
  Target,
  type LucideIcon,
} from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  activity: Activity,
  bed: Bed,
  'book-open': BookOpen,
  brain: Brain,
  calculator: Calculator,
  check: Check,
  code: Code,
  droplets: Droplets,
  dumbbell: Dumbbell,
  footprints: Footprints,
  'gamepad-2': Gamepad2,
  'graduation-cap': GraduationCap,
  instagram: Instagram,
  'list-checks': ListChecks,
  lock: Lock,
  moon: Moon,
  'notebook-pen': NotebookPen,
  phone: Phone,
  pill: Pill,
  smartphone: Smartphone,
  sparkles: Sparkles,
  sun: Sun,
  sunrise: Sunrise,
  target: Target,
};

export function habitIcon(name: string | undefined): LucideIcon {
  return (name && ICONS[name]) || Check;
}

/**
 * Guess an icon name from what the habit is called.
 *
 * Lived in migrate.ts serving only the one-time ritual import, which meant
 * every habit added since — by hand or by the assistant — got a hardcoded
 * 'check'. Every creation path routes through here now.
 */
export function iconNameFor(label: string): string {
  const n = label.toLowerCase();
  if (/instagram|reels|scroll/.test(n)) return 'instagram';
  if (/chess|game/.test(n)) return 'gamepad-2';
  if (/gym|workout|lift|train/.test(n)) return 'dumbbell';
  if (/mobility|stretch|yoga/.test(n)) return 'activity';
  if (/step|walk/.test(n)) return 'footprints';
  if (/class|lecture|college|attend/.test(n)) return 'graduation-cap';
  if (/recall|revis|memor/.test(n)) return 'brain';
  if (/problem|maths|math|practice|solve/.test(n)) return 'calculator';
  if (/build|code|claude|project/.test(n)) return 'code';
  if (/call|connect|family|parent/.test(n)) return 'phone';
  if (/bed(?!time)|no phone in bed/.test(n)) return 'bed';
  if (/wake|morning|sun/.test(n)) return 'sunrise';
  if (/meditat|breath/.test(n)) return 'brain';
  if (/shower|cold|water/.test(n)) return 'droplets';
  if (/read|book|librar/.test(n)) return 'book-open';
  if (/work|deep|focus|study/.test(n)) return 'target';
  if (/vitamin|med|pill/.test(n)) return 'pill';
  if (/detox|digital|phone|screen/.test(n)) return 'smartphone';
  if (/skin|care/.test(n)) return 'sparkles';
  if (/journal|grateful/.test(n)) return 'notebook-pen';
  if (/sleep|night/.test(n)) return 'moon';
  if (/plan|review/.test(n)) return 'list-checks';
  return 'check';
}
