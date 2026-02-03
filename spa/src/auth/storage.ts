import type { LocalUser } from './users';

const KEY = 'currentUser';

// In-memory fallback when Tracking Prevention (or private mode) blocks localStorage
let memoryUser: LocalUser | null = null;

function getStorageItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function setStorageItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Tracking Prevention or quota; keep in memory only
  }
}

function removeStorageItem(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function getCurrentUser(): LocalUser | null {
  try {
    const raw = getStorageItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as LocalUser;
      memoryUser = parsed;
      return parsed;
    }
    return memoryUser;
  } catch {
    return memoryUser;
  }
}

export function setCurrentUser(user: LocalUser) {
  memoryUser = user;
  setStorageItem(KEY, JSON.stringify(user));
}

export function clearCurrentUser() {
  memoryUser = null;
  removeStorageItem(KEY);
}

