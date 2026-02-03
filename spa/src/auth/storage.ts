import type { LocalUser } from './users';

const KEY = 'currentUser';

export function getCurrentUser(): LocalUser | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LocalUser;
  } catch {
    return null;
  }
}

export function setCurrentUser(user: LocalUser) {
  localStorage.setItem(KEY, JSON.stringify(user));
}

export function clearCurrentUser() {
  localStorage.removeItem(KEY);
}

