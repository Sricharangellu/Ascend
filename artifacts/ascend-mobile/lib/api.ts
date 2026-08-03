import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Storage keys ────────────────────────────────────────────────────────────
const TOKEN_KEY = 'ascend_access_token';
const REFRESH_KEY = 'ascend_refresh_token';
const USER_KEY = 'ascend_user';

// ─── Base URL ─────────────────────────────────────────────────────────────────
export function getApiBase(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) return `https://${domain}`;
  return '';
}

// ─── Token management ─────────────────────────────────────────────────────────
export async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function saveSession(
  accessToken: string,
  refreshToken: string,
  user: UserProfile,
): Promise<void> {
  await Promise.all([
    AsyncStorage.setItem(TOKEN_KEY, accessToken),
    AsyncStorage.setItem(REFRESH_KEY, refreshToken),
    AsyncStorage.setItem(USER_KEY, JSON.stringify(user)),
  ]);
}

export async function clearSession(): Promise<void> {
  await Promise.all([
    AsyncStorage.removeItem(TOKEN_KEY),
    AsyncStorage.removeItem(REFRESH_KEY),
    AsyncStorage.removeItem(USER_KEY),
  ]);
}

export async function getStoredUser(): Promise<UserProfile | null> {
  const str = await AsyncStorage.getItem(USER_KEY);
  if (!str) return null;
  try {
    return JSON.parse(str) as UserProfile;
  } catch {
    return null;
  }
}

// ─── Error class ──────────────────────────────────────────────────────────────
export class ApiRequestError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

// ─── Fetch wrapper ────────────────────────────────────────────────────────────
export async function apiFetch<T>(
  path: string,
  options?: RequestInit & { anonymous?: boolean },
): Promise<T> {
  const { anonymous, ...fetchOptions } = options ?? {};

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((fetchOptions.headers as Record<string, string>) ?? {}),
  };

  if (!anonymous) {
    const token = await getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  const url = `${getApiBase()}${path}`;
  const res = await fetch(url, { ...fetchOptions, headers });

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    let code = 'UNKNOWN';
    try {
      const body = await res.json();
      msg = body?.error?.message ?? body?.message ?? msg;
      code = body?.error?.code ?? code;
    } catch {
      // ignore JSON parse failure
    }
    throw new ApiRequestError(code, msg, res.status);
  }

  return res.json() as Promise<T>;
}

// ─── Domain types ─────────────────────────────────────────────────────────────
export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: string;
  tenantId: string;
}

export interface TerminalProduct {
  id: string;
  sku: string;
  name: string;
  priceCents: number;
  category: string;
  taxClass: string;
  barcode?: string;
  status: 'active' | 'inactive';
  ageRestricted?: boolean;
  tobaccoType?: string;
  createdAt: number;
  updatedAt: number;
}

export interface OrderLine {
  id: string;
  orderId: string;
  productId: string;
  name: string;
  quantity: number;
  unitCents: number;
  taxCents: number;
  lineCents: number;
  taxable: boolean;
}

export interface Order {
  id: string;
  orderNumber: string;
  stateCode: string;
  status: 'open' | 'completed' | 'refunded' | 'voided';
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
  lines: OrderLine[];
  createdAt: number;
  updatedAt: number;
}

export interface SalesSummary {
  orders: {
    open: number;
    completed: number;
    refunded: number;
    voided: number;
    total: number;
  };
  revenue: {
    grossCents: number;
    taxCents: number;
    netCents: number;
  };
  payments: {
    capturedCount: number;
    capturedCents: number;
    byMethod: Record<string, number>;
  };
  kpi: {
    saleCount: number;
    grossProfitCents: number | null;
    customerCount: number;
    avgSaleValueCents: number;
    avgItemsPerSale: number;
    discountedAmountCents: number;
    discountedPct: number;
  };
  sparklines: { revenue: number[]; saleCount: number[] };
}

export interface CatalogListResponse {
  items: TerminalProduct[];
  total: number;
  limit: number;
  offset: number;
}

export interface OrdersListResponse {
  items: Order[];
  total: number;
  limit: number;
  offset: number;
}

// ─── Push notifications ───────────────────────────────────────────────────────
export async function registerPushToken(
  token: string,
  platform: 'ios' | 'android' | 'web',
): Promise<void> {
  await apiFetch('/api/v1/push-tokens', {
    method: 'POST',
    body: JSON.stringify({ token, platform }),
  });
}

export async function unregisterPushToken(token: string): Promise<void> {
  await apiFetch('/api/v1/push-tokens', {
    method: 'DELETE',
    body: JSON.stringify({ token }),
  });
}

// ─── Quiet hours ──────────────────────────────────────────────────────────────
export interface QuietHours {
  enabled: boolean;
  start: string; // "HH:MM" 24h
  end: string; // "HH:MM" 24h
  timezone: string; // IANA name
}

export async function getQuietHours(): Promise<QuietHours> {
  return apiFetch<QuietHours>('/api/v1/push-tokens/quiet-hours');
}

export async function updateQuietHours(config: QuietHours): Promise<QuietHours> {
  return apiFetch<QuietHours>('/api/v1/push-tokens/quiet-hours', {
    method: 'PUT',
    body: JSON.stringify(config),
  });
}

// ─── Order mutations ──────────────────────────────────────────────────────────
export async function completeOrder(orderId: string): Promise<Order> {
  return apiFetch<Order>(`/api/v1/orders/${orderId}/complete`, {
    method: 'POST',
  });
}

export async function voidOrder(orderId: string): Promise<Order> {
  return apiFetch<Order>(`/api/v1/orders/${orderId}/void`, {
    method: 'POST',
  });
}
