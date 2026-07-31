/**
 * Unit tests for lib/api.ts
 *
 * Covers:
 * - apiFetch attaches Bearer token for authenticated requests
 * - apiFetch skips token when anonymous: true
 * - apiFetch throws ApiRequestError on non-ok responses (401 etc.)
 * - apiFetch throws on network failure
 * - clearSession removes all three AsyncStorage keys
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ApiRequestError,
  apiFetch,
  clearSession,
  getStoredUser,
  saveSession,
} from '../lib/api';

// AsyncStorage is auto-mocked via jest-expo setup; the mock module provides
// in-memory store semantics so we get realistic behaviour without I/O.

const TOKEN_KEY = 'ascend_access_token';
const REFRESH_KEY = 'ascend_refresh_token';
const USER_KEY = 'ascend_user';

const mockUser = {
  id: 'u1',
  email: 'owner@store.com',
  name: 'Owner',
  role: 'owner',
  tenantId: 't1',
};

// Capture global.fetch calls
let fetchSpy: jest.SpyInstance;

beforeEach(() => {
  // Reset the AsyncStorage mock store between tests
  (AsyncStorage as jest.Mocked<typeof AsyncStorage>).clear();
  fetchSpy = jest.spyOn(global, 'fetch');
});

afterEach(() => {
  fetchSpy.mockRestore();
});

// ─── apiFetch – token attachment ──────────────────────────────────────────────

describe('apiFetch – Bearer token', () => {
  it('attaches Authorization header when a token is stored', async () => {
    await AsyncStorage.setItem(TOKEN_KEY, 'my-access-token');

    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    await apiFetch('/api/test');

    const calledHeaders = fetchSpy.mock.calls[0][1]?.headers as Record<
      string,
      string
    >;
    expect(calledHeaders['Authorization']).toBe('Bearer my-access-token');
  });

  it('does NOT attach Authorization header when anonymous: true', async () => {
    await AsyncStorage.setItem(TOKEN_KEY, 'my-access-token');

    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    await apiFetch('/api/test', { anonymous: true });

    const calledHeaders = fetchSpy.mock.calls[0][1]?.headers as Record<
      string,
      string
    >;
    expect(calledHeaders['Authorization']).toBeUndefined();
  });

  it('does NOT attach Authorization header when no token is stored', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    await apiFetch('/api/test');

    const calledHeaders = fetchSpy.mock.calls[0][1]?.headers as Record<
      string,
      string
    >;
    expect(calledHeaders['Authorization']).toBeUndefined();
  });
});

// ─── apiFetch – error handling ────────────────────────────────────────────────

describe('apiFetch – error handling', () => {
  it('throws ApiRequestError with status 401 on Unauthorized response', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Token expired' } }),
        { status: 401 },
      ),
    );

    await expect(apiFetch('/api/protected')).rejects.toMatchObject({
      name: 'ApiRequestError',
      status: 401,
      code: 'UNAUTHORIZED',
      message: 'Token expired',
    });
  });

  it('throws ApiRequestError with a fallback message when body is not JSON', async () => {
    fetchSpy.mockResolvedValue(
      new Response('Bad Gateway', { status: 502 }),
    );

    const error = await apiFetch('/api/test').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect((error as ApiRequestError).status).toBe(502);
  });

  it('re-throws on network failure (fetch rejects)', async () => {
    fetchSpy.mockRejectedValueOnce(new TypeError('Network request failed'));

    await expect(apiFetch('/api/test')).rejects.toThrow('Network request failed');
  });
});

// ─── clearSession ─────────────────────────────────────────────────────────────

describe('clearSession', () => {
  it('removes all three session keys from AsyncStorage', async () => {
    await AsyncStorage.setItem(TOKEN_KEY, 'tok');
    await AsyncStorage.setItem(REFRESH_KEY, 'ref');
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(mockUser));

    await clearSession();

    expect(await AsyncStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(await AsyncStorage.getItem(REFRESH_KEY)).toBeNull();
    expect(await AsyncStorage.getItem(USER_KEY)).toBeNull();
  });
});

// ─── saveSession / getStoredUser ──────────────────────────────────────────────

describe('saveSession + getStoredUser', () => {
  it('persists and retrieves the user profile', async () => {
    await saveSession('tok', 'ref', mockUser);
    const stored = await getStoredUser();
    expect(stored).toEqual(mockUser);
  });

  it('returns null when nothing is stored', async () => {
    expect(await getStoredUser()).toBeNull();
  });

  it('returns null when stored value is malformed JSON', async () => {
    await AsyncStorage.setItem(USER_KEY, '{invalid}');
    expect(await getStoredUser()).toBeNull();
  });
});
