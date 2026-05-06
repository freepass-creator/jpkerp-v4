'use client';

import { useAuth } from './use-auth';

/**
 * Admin guard — UID/email 화이트리스트 기반.
 *
 * Firebase Rules 강제 이전 임시 가드. 운영 안정 후 RTDB users/{uid}/role 로 전환.
 *
 * 추가 admin 이메일은 ADMIN_EMAILS 에 lowercase 로 push.
 */

export const ADMIN_EMAILS: readonly string[] = [
  'dudguq@gmail.com',
];

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase().trim());
}

export function useIsAdmin(): { isAdmin: boolean; loading: boolean } {
  const { user, loading } = useAuth();
  return { isAdmin: isAdminEmail(user?.email), loading };
}
