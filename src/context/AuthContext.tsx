import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { User } from 'firebase/auth';
import {
  subscribeToAuth,
  signInWithGoogle,
  signInWithEmail,
  signUpWithEmail,
  resetPassword,
  logout,
} from '../lib/firebase';

interface AuthContextValue {
  /** The signed-in user, or null when signed out. */
  user: User | null;
  /** True until the first auth state resolves (avoids a login flash on reload). */
  initializing: boolean;
  signInWithGoogle: typeof signInWithGoogle;
  signInWithEmail: typeof signInWithEmail;
  signUpWithEmail: typeof signUpWithEmail;
  resetPassword: typeof resetPassword;
  logout: typeof logout;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    return subscribeToAuth((nextUser) => {
      setUser(nextUser);
      setInitializing(false);
    });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      initializing,
      signInWithGoogle,
      signInWithEmail,
      signUpWithEmail,
      resetPassword,
      logout,
    }),
    [user, initializing],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an <AuthProvider>');
  return ctx;
}
