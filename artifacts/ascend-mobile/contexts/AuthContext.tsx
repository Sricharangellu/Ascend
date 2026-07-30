import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { apiFetch, clearSession, getStoredUser, saveSession } from '@/lib/api';
import type { UserProfile } from '@/lib/api';

interface AuthContextValue {
  user: UserProfile | null;
  isLoading: boolean;
  loginError: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

interface LoginResponse {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  user: UserProfile;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Restore session from AsyncStorage on first mount
  useEffect(() => {
    let active = true;
    getStoredUser().then((stored) => {
      if (active) {
        setUser(stored);
        setIsLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setLoginError(null);
    try {
      const data = await apiFetch<LoginResponse>('/api/identity/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
        anonymous: true,
      });
      await saveSession(data.accessToken, data.refreshToken, data.user);
      setUser(data.user);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign in failed';
      setLoginError(message);
      throw err;
    }
  }, []);

  const logout = useCallback(async () => {
    await clearSession();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, loginError, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
