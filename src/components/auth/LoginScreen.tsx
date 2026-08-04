import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mail, Lock, LogIn, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import JarvisOrb from '../../features/jarvis/ui/JarvisOrb';

type Mode = 'signin' | 'signup';

/** Rotating one-liners introducing what's inside, shown next to the orb. */
const PITCH_LINES = [
  "I'm Jarvis — I run this place with you.",
  'Habits, rituals, and streaks, tracked daily.',
  'A vision board, journal, and idea log in one spot.',
  'Race friends on shared habit puzzles in Arena.',
  'Ask me anything — I can see your whole day.',
  'Stocks, tasks, and goals, all synced across devices.',
];

function LoginPitch() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % PITCH_LINES.length), 3400);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="mb-8 flex flex-col items-center text-center">
      <JarvisOrb state="idle" size={72} />
      <p className="mt-4 text-[10px] font-mono font-black uppercase tracking-[0.3em] text-brand-400">
        Ascend Protocol
      </p>
      <div className="mt-2.5 h-9 max-w-xs px-2">
        <AnimatePresence mode="wait">
          <motion.p
            key={i}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.35 }}
            className="text-[13px] leading-snug text-white/60"
          >
            {PITCH_LINES[i]}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}

/** Maps Firebase auth error codes to friendly, non-technical messages. */
function friendlyError(code: string): string {
  switch (code) {
    case 'auth/invalid-email':
      return 'That email address looks invalid.';
    case 'auth/missing-password':
      return 'Please enter your password.';
    case 'auth/weak-password':
      return 'Password should be at least 6 characters.';
    case 'auth/email-already-in-use':
      return 'An account already exists for this email.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Incorrect email or password.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Try again later.';
    case 'auth/popup-closed-by-user':
      return 'Sign-in was cancelled.';
    default:
      return 'Something went wrong. Please try again.';
  }
}

export default function LoginScreen() {
  const { signInWithGoogle, signInWithEmail, signUpWithEmail, resetPassword } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (err) {
      setError(friendlyError((err as { code?: string }).code ?? ''));
    } finally {
      setBusy(false);
    }
  };

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    run(() => (mode === 'signin' ? signInWithEmail(email, password) : signUpWithEmail(email, password)));
  };

  const handleReset = () => {
    if (!email) {
      setError('Enter your email above first, then tap “Forgot password”.');
      return;
    }
    run(async () => {
      await resetPassword(email);
      setNotice('Password reset email sent. Check your inbox.');
    });
  };

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center bg-app text-white p-4 overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(16,185,129,0.10),_transparent_55%)]" />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 26 }}
        className="relative w-full max-w-sm"
      >
        <LoginPitch />

        <div className="rounded-[2rem] border border-white/12 bg-white/[0.03] backdrop-blur-2xl p-8 shadow-[0_30px_60px_rgba(0,0,0,0.6)]">
        <div className="mb-7 text-center">
          <h1 className="text-2xl font-extrabold tracking-tight">
            {mode === 'signin' ? 'Welcome back' : 'Create your account'}
          </h1>
          <p className="mt-1.5 text-[12px] text-white/45">
            {mode === 'signin' ? 'Sign in to sync across your devices.' : 'Start tracking your daily protocol.'}
          </p>
        </div>

        <button
          type="button"
          onClick={() => run(signInWithGoogle)}
          disabled={busy}
          className="flex w-full items-center justify-center gap-3 rounded-xl border border-white/15 bg-white/[0.06] px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-white/[0.12] disabled:opacity-50 cursor-pointer"
        >
          <GoogleGlyph />
          Continue with Google
        </button>

        <div className="my-5 flex items-center gap-3 text-[10px] font-mono uppercase tracking-widest text-white/25">
          <span className="h-px flex-1 bg-white/10" />
          or
          <span className="h-px flex-1 bg-white/10" />
        </div>

        <form onSubmit={handleEmailSubmit} className="space-y-3">
          <label className="block">
            <span className="sr-only">Email</span>
            <div className="flex items-center gap-3 rounded-xl border border-white/12 bg-[#05070c] px-3.5 focus-within:border-brand-500/60">
              <Mail size={15} className="text-white/35" />
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-transparent py-3 text-sm text-white placeholder:text-white/25 outline-none"
              />
            </div>
          </label>

          <label className="block">
            <span className="sr-only">Password</span>
            <div className="flex items-center gap-3 rounded-xl border border-white/12 bg-[#05070c] px-3.5 focus-within:border-brand-500/60">
              <Lock size={15} className="text-white/35" />
              <input
                type="password"
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="w-full bg-transparent py-3 text-sm text-white placeholder:text-white/25 outline-none"
              />
            </div>
          </label>

          {error && <p className="text-[12px] text-red-400" role="alert">{error}</p>}
          {notice && <p className="text-[12px] text-brand-400" role="status">{notice}</p>}

          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-brand-500/30 bg-brand-500/15 px-4 py-3 text-sm font-bold uppercase tracking-wider text-brand-300 transition-colors hover:bg-brand-500/25 disabled:opacity-50 cursor-pointer"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
            {mode === 'signin' ? 'Sign in' : 'Sign up'}
          </button>
        </form>

        <div className="mt-5 flex items-center justify-between text-[12px]">
          <button
            type="button"
            onClick={() => {
              setMode((m) => (m === 'signin' ? 'signup' : 'signin'));
              setError(null);
              setNotice(null);
            }}
            className="text-white/50 hover:text-white transition-colors cursor-pointer"
          >
            {mode === 'signin' ? 'Create an account' : 'Have an account? Sign in'}
          </button>
          {mode === 'signin' && (
            <button
              type="button"
              onClick={handleReset}
              className="text-white/40 hover:text-white transition-colors cursor-pointer"
            >
              Forgot password?
            </button>
          )}
        </div>
        </div>
      </motion.div>
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 4.1 29.3 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22 22-9.8 22-22c0-1.3-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 4.1 29.3 2 24 2 15.5 2 8.1 6.8 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 46c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 37 26.7 38 24 38c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C8 41.1 15.4 46 24 46z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2c-.4.4 6.6-4.8 6.6-14.8 0-1.3-.1-2.3-.4-3.5z" />
    </svg>
  );
}
