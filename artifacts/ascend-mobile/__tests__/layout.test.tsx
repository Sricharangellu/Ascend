/**
 * Smoke tests for the redirect logic in hooks/useAuthRedirect.ts
 * (which is the hook used by app/_layout.tsx's RootLayoutNav).
 *
 * useAuthRedirect reads `user` and `isLoading` from AuthContext, then calls
 * router.replace to redirect:
 *   - unauthenticated + not on /login  → router.replace('/login')
 *   - authenticated   + not in (tabs)  → router.replace('/')
 *   - still loading                    → no redirect
 *   - already on correct screen        → no redirect
 */

import React from 'react';
import { renderHook, act } from '@testing-library/react-native';

// ─── Mock AuthContext ─────────────────────────────────────────────────────────
const mockUseAuth = jest.fn();
jest.mock('../contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => mockUseAuth(),
}));

// ─── Mock expo-router ─────────────────────────────────────────────────────────
const mockRouterReplace = jest.fn();
const mockSegments: string[] = [];
jest.mock('expo-router', () => ({
  Stack: Object.assign(
    ({ children }: { children: React.ReactNode }) => children,
    { Screen: () => null },
  ),
  useRouter: () => ({ replace: mockRouterReplace }),
  useSegments: () => mockSegments,
}));

// Import the REAL hook from the application source after mocks are registered.
import { useAuthRedirect } from '../hooks/useAuthRedirect';

// ─── Helpers ──────────────────────────────────────────────────────────────────

type MockUser = { id: string; email: string; name: string; role: string; tenantId: string };

function setupAuth(user: MockUser | null, isLoading = false) {
  mockUseAuth.mockReturnValue({ user, isLoading });
}

function setSegments(segs: string[]) {
  mockSegments.length = 0;
  mockSegments.push(...segs);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  setSegments([]);
});

describe('useAuthRedirect (used by RootLayoutNav in app/_layout.tsx)', () => {
  it('redirects to /login when unauthenticated and not already on login screen', async () => {
    setupAuth(null, false);
    setSegments([]);

    await act(async () => {
      await renderHook(() => useAuthRedirect());
    });

    expect(mockRouterReplace).toHaveBeenCalledWith('/login');
  });

  it('does NOT redirect when unauthenticated and already on login screen', async () => {
    setupAuth(null, false);
    setSegments(['login']);

    await act(async () => {
      await renderHook(() => useAuthRedirect());
    });

    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  it('redirects to / when authenticated and not yet in the (tabs) group', async () => {
    const user: MockUser = { id: 'u1', email: 'a@b.com', name: 'A', role: 'owner', tenantId: 't1' };
    setupAuth(user, false);
    setSegments(['login']); // authenticated but still on login page

    await act(async () => {
      await renderHook(() => useAuthRedirect());
    });

    expect(mockRouterReplace).toHaveBeenCalledWith('/');
  });

  it('does NOT redirect when authenticated and already in the (tabs) group', async () => {
    const user: MockUser = { id: 'u1', email: 'a@b.com', name: 'A', role: 'owner', tenantId: 't1' };
    setupAuth(user, false);
    setSegments(['(tabs)']);

    await act(async () => {
      await renderHook(() => useAuthRedirect());
    });

    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  it('does NOT redirect while auth is still loading', async () => {
    setupAuth(null, true);
    setSegments([]);

    await act(async () => {
      await renderHook(() => useAuthRedirect());
    });

    expect(mockRouterReplace).not.toHaveBeenCalled();
  });
});
