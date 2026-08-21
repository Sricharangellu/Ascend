/**
 * Unit tests for contexts/AuthContext.tsx
 *
 * Covers:
 * - Session restore from AsyncStorage on mount (getStoredUser)
 * - login success: calls apiFetch, saves session, sets user
 * - login failure (wrong password / API error): sets loginError, re-throws
 * - login failure (network error): sets loginError, re-throws
 * - logout: clears session, sets user to null
 *
 * Note: @testing-library/react-native v14 ships an async renderHook that must
 * be awaited. Each test follows: await renderHook → await act(async()=>{}) to
 * flush async effects → assertions.
 */

import React from 'react';
import { act, renderHook } from '@testing-library/react-native';
import { AuthProvider, useAuth } from '../contexts/AuthContext';

// ─── Mock lib/api ─────────────────────────────────────────────────────────────
const mockApiFetch = jest.fn();
const mockSaveSession = jest.fn();
const mockClearSession = jest.fn();
const mockGetStoredUser = jest.fn();
let capturedUnauthorizedHandler: (() => void) | null = null;
const mockSetUnauthorizedHandler = jest.fn((handler: () => void) => {
  capturedUnauthorizedHandler = handler;
  return () => {
    if (capturedUnauthorizedHandler === handler) capturedUnauthorizedHandler = null;
  };
});

jest.mock('../lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  saveSession: (...args: unknown[]) => mockSaveSession(...args),
  clearSession: () => mockClearSession(),
  getStoredUser: () => mockGetStoredUser(),
  setUnauthorizedHandler: (handler: () => void) => mockSetUnauthorizedHandler(handler),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

const mockUser = {
  id: 'u1',
  email: 'owner@store.com',
  name: 'Owner',
  role: 'owner',
  tenantId: 't1',
};

const loginResponse = {
  accessToken: 'access-tok',
  refreshToken: 'refresh-tok',
  expiresIn: 3600,
  user: mockUser,
};

function wrapper({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

/** Render the hook and flush initial async effects (getStoredUser promise). */
async function renderAuthHook() {
  const rendered = await renderHook(() => useAuth(), { wrapper });
  // Flush the getStoredUser promise resolution through React
  await act(async () => {});
  return rendered;
}

beforeEach(() => {
  jest.clearAllMocks();
  capturedUnauthorizedHandler = null;
  // Default: no stored session resolves immediately
  mockGetStoredUser.mockResolvedValue(null);
});

// ─── Session restore ──────────────────────────────────────────────────────────

describe('session restore on mount', () => {
  it('starts loading with no user before getStoredUser resolves', async () => {
    // Return a promise that never settles so loading stays true
    let resolveStoredUser!: (v: null) => void;
    mockGetStoredUser.mockReturnValue(
      new Promise<null>((r) => { resolveStoredUser = r; }),
    );

    // renderHook only – don't flush effects yet
    const { result } = await renderHook(() => useAuth(), { wrapper });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.user).toBeNull();

    // Cleanup: resolve the promise so no open handle lingers
    await act(async () => { resolveStoredUser(null); });
  });

  it('sets user from AsyncStorage when a stored session exists', async () => {
    mockGetStoredUser.mockResolvedValue(mockUser);

    const { result } = await renderAuthHook();

    expect(result.current.isLoading).toBe(false);
    expect(result.current.user).toEqual(mockUser);
  });

  it('sets user to null and clears loading when no session is stored', async () => {
    mockGetStoredUser.mockResolvedValue(null);

    const { result } = await renderAuthHook();

    expect(result.current.isLoading).toBe(false);
    expect(result.current.user).toBeNull();
  });
});

// ─── login success ────────────────────────────────────────────────────────────

describe('login – success', () => {
  it('calls apiFetch with credentials, saves session, and sets user', async () => {
    mockApiFetch.mockResolvedValue(loginResponse);
    mockSaveSession.mockResolvedValue(undefined);

    const { result } = await renderAuthHook();

    await act(async () => {
      await result.current.login('owner@store.com', 'correct-password');
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/identity/login',
      expect.objectContaining({
        method: 'POST',
        anonymous: true,
        body: JSON.stringify({ email: 'owner@store.com', password: 'correct-password' }),
      }),
    );
    expect(mockSaveSession).toHaveBeenCalledWith(
      loginResponse.accessToken,
      loginResponse.refreshToken,
      loginResponse.user,
    );
    expect(result.current.user).toEqual(mockUser);
    expect(result.current.loginError).toBeNull();
  });
});

// ─── login failure ────────────────────────────────────────────────────────────

describe('login – wrong password (API error)', () => {
  it('sets loginError and re-throws so callers can react', async () => {
    const apiError = new Error('Invalid credentials');
    mockApiFetch.mockRejectedValue(apiError);

    const { result } = await renderAuthHook();

    let caughtError: unknown;
    await act(async () => {
      try {
        await result.current.login('owner@store.com', 'wrong-password');
      } catch (e) {
        caughtError = e;
      }
    });

    expect(result.current.loginError).toBe('Invalid credentials');
    expect(result.current.user).toBeNull();
    expect(caughtError).toBe(apiError);
  });
});

describe('login – network error', () => {
  it('sets loginError to "Network request failed" and re-throws', async () => {
    const networkError = new TypeError('Network request failed');
    mockApiFetch.mockRejectedValue(networkError);

    const { result } = await renderAuthHook();

    let caughtError: unknown;
    await act(async () => {
      try {
        await result.current.login('owner@store.com', 'any');
      } catch (e) {
        caughtError = e;
      }
    });

    expect(result.current.loginError).toBe('Network request failed');
    expect(caughtError).toBe(networkError);
  });

  it('falls back to "Sign in failed" message when error is not an Error instance', async () => {
    mockApiFetch.mockRejectedValue('string-rejection');

    const { result } = await renderAuthHook();

    await act(async () => {
      try {
        await result.current.login('a@b.com', 'pw');
      } catch {
        // expected
      }
    });

    expect(result.current.loginError).toBe('Sign in failed');
  });
});

// ─── logout ───────────────────────────────────────────────────────────────────

describe('logout', () => {
  it('calls clearSession and sets user to null', async () => {
    mockGetStoredUser.mockResolvedValue(mockUser);
    mockClearSession.mockResolvedValue(undefined);

    const { result } = await renderAuthHook();
    expect(result.current.user).toEqual(mockUser);

    await act(async () => {
      await result.current.logout();
    });

    expect(mockClearSession).toHaveBeenCalledTimes(1);
    expect(result.current.user).toBeNull();
  });
});

// ─── 401 → logout via unauthorized handler ────────────────────────────────────

describe('unauthorized handler (expired token)', () => {
  it('registers a handler on mount that logs the user out when invoked', async () => {
    mockGetStoredUser.mockResolvedValue(mockUser);

    const { result } = await renderAuthHook();
    expect(result.current.user).toEqual(mockUser);
    expect(mockSetUnauthorizedHandler).toHaveBeenCalledTimes(1);
    expect(capturedUnauthorizedHandler).not.toBeNull();

    // Simulate apiFetch hitting a 401 → interceptor fires the handler
    await act(async () => {
      capturedUnauthorizedHandler!();
    });

    expect(result.current.user).toBeNull();
  });

  it('unregisters the handler on unmount', async () => {
    const { unmount } = await renderAuthHook();
    expect(capturedUnauthorizedHandler).not.toBeNull();
    await act(async () => {
      unmount();
    });
    expect(capturedUnauthorizedHandler).toBeNull();
  });
});

// ─── useAuth guard ────────────────────────────────────────────────────────────

describe('useAuth outside AuthProvider', () => {
  it('throws when called outside <AuthProvider>', async () => {
    // renderHook is async in RNTL v14; the error propagates as a rejected promise
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(
      renderHook(() => useAuth()),
    ).rejects.toThrow('useAuth must be used inside <AuthProvider>');
    consoleSpy.mockRestore();
  });
});
