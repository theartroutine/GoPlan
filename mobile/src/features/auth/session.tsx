import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { refreshTokens, setOnRefreshFailed } from '@/shared/api/refresh';
import { clearTokens, getRefreshToken, setAccessToken, setRefreshToken } from '@/shared/api/token-store';
import { fetchMe, logoutRequest } from './api';
import type { AuthResponse, AuthUser } from './types';

export type SessionStatus = 'restoring' | 'signedOut' | 'signedIn';

export interface SessionContextValue {
  status: SessionStatus;
  user: AuthUser | null;
  signIn: (auth: AuthResponse) => Promise<void>;
  signOut: () => Promise<void>;
  updateUser: (user: AuthUser) => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<SessionStatus>('restoring');
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function restore() {
      const access = await refreshTokens();
      if (cancelled) return;
      if (!access) {
        setStatus('signedOut');
        return;
      }
      try {
        const me = await fetchMe();
        if (cancelled) return;
        setUser(me);
        setStatus('signedIn');
      } catch {
        if (cancelled) return;
        await clearTokens();
        setStatus('signedOut');
      }
    }

    restore();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setOnRefreshFailed(() => {
      setUser(null);
      setStatus('signedOut');
    });
    return () => setOnRefreshFailed(null);
  }, []);

  const signIn = useCallback(async (auth: AuthResponse) => {
    setAccessToken(auth.tokens.access);
    await setRefreshToken(auth.tokens.refresh);
    setUser(auth.user);
    setStatus('signedIn');
  }, []);

  const signOut = useCallback(async () => {
    const refresh = await getRefreshToken();
    if (refresh) {
      try {
        await logoutRequest(refresh);
      } catch {
        // Best-effort revocation; local sign-out proceeds regardless.
      }
    }
    await clearTokens();
    setUser(null);
    setStatus('signedOut');
  }, []);

  const updateUser = useCallback((next: AuthUser) => {
    setUser(next);
  }, []);

  const value = useMemo(
    () => ({ status, user, signIn, signOut, updateUser }),
    [status, user, signIn, signOut, updateUser],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used within SessionProvider');
  }
  return context;
}
