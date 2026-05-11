/**
 * confirm-with-email — 본인 이메일을 입력해야만 진행되는 삭제 가드.
 *
 *   const confirmWithEmail = useConfirmWithEmail();
 *   if (!confirmWithEmail('계약 삭제', '계약번호 C2025-0042')) return;
 *
 * 로그인 정보 없으면 단순 confirm() 으로 fallback (개발 환경 등).
 * 입력 비교는 trim + 소문자 무시 — 사용자 오타 관용도 약간 허용.
 */
'use client';

import { useCallback } from 'react';
import { useAuth } from './use-auth';

export function useConfirmWithEmail() {
  const { user } = useAuth();
  return useCallback((title: string, summary: string): boolean => {
    const expected = (user?.email ?? '').trim();
    if (!expected) {
      return confirm(`${title}\n\n${summary}\n\n(소프트삭제 — 감사로그 보존)`);
    }
    const input = prompt(
      `${title}\n\n${summary}\n\n삭제하려면 본인 이메일 (${expected}) 을 입력하세요:`,
      '',
    );
    if (input == null) return false;
    if (input.trim().toLowerCase() !== expected.toLowerCase()) {
      alert('이메일이 일치하지 않아 취소되었습니다.');
      return false;
    }
    return true;
  }, [user]);
}
