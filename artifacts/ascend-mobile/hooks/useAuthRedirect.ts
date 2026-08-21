/**
 * Redirect logic extracted from app/_layout.tsx so it can be unit-tested
 * independently of the heavy native stack (fonts, splash screen, etc.).
 *
 * Rules:
 *   - While auth is loading → do nothing (avoid premature redirect).
 *   - Unauthenticated + not already on /login → replace('/login').
 *   - Authenticated + not in (tabs) group → replace('/') (resolves to tabs).
 */
import { useEffect } from 'react';
import { useRouter, useSegments } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';

export function useAuthRedirect(): void {
  const { user, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const inTabsGroup = segments[0] === '(tabs)';
    const onLogin = segments[0] === 'login';

    if (!user && !onLogin) {
      router.replace('/login');
    } else if (user && !inTabsGroup) {
      router.replace('/');
    }
  }, [user, isLoading, segments]);
}
