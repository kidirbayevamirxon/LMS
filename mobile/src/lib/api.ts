export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface UserSession {
  id: string;
  fullName: string;
  phone: string;
  email?: string | null;
  language: 'uz' | 'ru';
  role: 'SUPER_ADMIN' | 'ADMIN' | 'CASHIER' | 'TEACHER' | 'STUDENT';
  roleDisplayName?: string;
  teacherId?: string | null;
  studentId?: string | null;
}

const STORAGE_ACCESS = 'edumanager_access_token';
const STORAGE_REFRESH = 'edumanager_refresh_token';
const STORAGE_USER = 'edumanager_user';

const DEFAULT_API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://13.140.203.137:8088/api').replace(/\/$/, '');

export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const isCapacitor =
      window.location.protocol.startsWith('capacitor') ||
      (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();
    if (!isCapacitor && window.location.hostname && window.location.hostname !== 'localhost') {
      return `${window.location.origin}/api`;
    }
  }
  return DEFAULT_API_URL;
}

export function getStoredTokens(): AuthTokens | null {
  if (typeof window === 'undefined') return null;
  const accessToken = localStorage.getItem(STORAGE_ACCESS);
  const refreshToken = localStorage.getItem(STORAGE_REFRESH);
  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken };
}

export function setStoredSession(user: UserSession, tokens: AuthTokens): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_ACCESS, tokens.accessToken);
  localStorage.setItem(STORAGE_REFRESH, tokens.refreshToken);
  localStorage.setItem(STORAGE_USER, JSON.stringify(user));
}

export function getStoredUser(): UserSession | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(STORAGE_USER);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserSession;
  } catch {
    return null;
  }
}

export function clearStoredSession(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_ACCESS);
  localStorage.removeItem(STORAGE_REFRESH);
  localStorage.removeItem(STORAGE_USER);
}

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const tokens = getStoredTokens();
  if (!tokens?.refreshToken) return null;

  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await fetch(`${getApiBaseUrl()}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: tokens.refreshToken }),
        });
        if (!res.ok) {
          clearStoredSession();
          return null;
        }
        const json = await res.json();
        const nextAccess = json?.data?.accessToken as string;
        const nextRefresh = json?.data?.refreshToken as string;
        if (nextAccess && nextRefresh) {
          localStorage.setItem(STORAGE_ACCESS, nextAccess);
          localStorage.setItem(STORAGE_REFRESH, nextRefresh);
          return nextAccess;
        }
        return null;
      } catch {
        return null;
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
}

export async function apiRequest<T = unknown>(
  endpoint: string,
  options: RequestInit & { skipAuth?: boolean } = {},
): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  const tokens = getStoredTokens();

  const headers = new Headers(options.headers || {});
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (!options.skipAuth && tokens?.accessToken) {
    headers.set('Authorization', `Bearer ${tokens.accessToken}`);
  }

  let response = await fetch(url, { ...options, headers });

  if (response.status === 401 && !options.skipAuth && tokens?.refreshToken) {
    const newAccess = await refreshAccessToken();
    if (newAccess) {
      headers.set('Authorization', `Bearer ${newAccess}`);
      response = await fetch(url, { ...options, headers });
    }
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/pdf') || contentType.includes('spreadsheetml')) {
    if (!response.ok) throw new Error('Faylni yuklab olishda xatolik');
    return (await response.blob()) as unknown as T;
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.message || `HTTP ${response.status} xatosi`);
  }
  return data as T;
}

export function buildAuthorizedUrl(path: string): string {
  const baseUrl = getApiBaseUrl();
  const tokens = getStoredTokens();
  const sep = path.includes('?') ? '&' : '?';
  return `${baseUrl}${path}${tokens?.accessToken ? `${sep}token=${encodeURIComponent(tokens.accessToken)}` : ''}`;
}
