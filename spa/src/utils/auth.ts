import type { UserRole } from '../auth/users';

export function isAdminOrAuditor(role?: string): boolean {
  return role === 'Admin' || role === 'Auditor';
}

export function canAccessAllStores(role?: string): boolean {
  return isAdminOrAuditor(role);
}
