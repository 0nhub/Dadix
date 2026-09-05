// import { AxiosProgressEvent } from 'axios';
import { apiBase } from '@/constants';
import axios from 'axios';

const ACCESS_TOKEN_STORAGE_KEY = 'dadix_access_token';

function isLocalStorageAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return typeof window.localStorage?.getItem === 'function';
  } catch {
    return false;
  }
}

function getStoredTokenFromStorage(): string | null {
  if (!isLocalStorageAvailable()) return null;
  try {
    return window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

let storedAccessToken: string | null = null;

export function setStoredAccessToken(token: string | null) {
  storedAccessToken = token;
  try {
    if (isLocalStorageAvailable()) {
      if (token) window.localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, token);
      else window.localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
    }
  } catch {
    /* ignore */
  }
}

function getAccessTokenFromCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/\baccessToken=([^;]*)/);
  return match ? decodeURIComponent(match[1].trim()) : null;
}

function getAccessToken(): string | null {
  return storedAccessToken ?? getStoredTokenFromStorage() ?? getAccessTokenFromCookie();
}

const callApi = axios.create({
  withCredentials: true,
  baseURL: apiBase || '',
  timeout: 5000,
  headers: {
    Accept: '*/*',
    'Content-Type': 'application/json; charset=utf-8',
  },
});

callApi.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export { callApi };
