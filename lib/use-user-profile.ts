'use client';

import { useEffect, useState, useCallback } from 'react';
import { ref, set, onValue } from 'firebase/database';
import { getRtdb } from './firebase/client';
import { useAuth } from './use-auth';

/**
 * 사용자 프로필 — RTDB `/users/{uid}/profile` 영구 저장.
 *
 * Rules 의 `users/$uid` 노드는 본인만 read/write (admin 예외).
 * 이메일은 Firebase Auth 에서 자동 채움 (변경 불가).
 */

export type UserProfile = {
  displayName: string;     // 이름
  department: string;      // 부서
  phone: string;           // 연락처
  email: string;           // 이메일 (auth 동기화)
  role?: string;           // 직급/역할 (선택)
};

const EMPTY: UserProfile = {
  displayName: '', department: '', phone: '', email: '', role: '',
};

function asProfile(val: unknown, fallbackEmail: string): UserProfile {
  if (val && typeof val === 'object') {
    const v = val as Partial<UserProfile>;
    return {
      displayName: typeof v.displayName === 'string' ? v.displayName : '',
      department:  typeof v.department  === 'string' ? v.department  : '',
      phone:       typeof v.phone       === 'string' ? v.phone       : '',
      email:       typeof v.email       === 'string' ? v.email       : fallbackEmail,
      role:        typeof v.role        === 'string' ? v.role        : '',
    };
  }
  return { ...EMPTY, email: fallbackEmail };
}

export function useUserProfile() {
  const { user } = useAuth();
  const uid = user?.uid;
  const authEmail = user?.email ?? '';
  const [profile, setProfile] = useState<UserProfile>({ ...EMPTY, email: authEmail });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) { setLoading(false); return; }
    const r = ref(getRtdb(), `users/${uid}/profile`);
    const unsub = onValue(r, (snap) => {
      setProfile(asProfile(snap.val(), authEmail));
      setLoading(false);
    });
    return () => unsub();
  }, [uid, authEmail]);

  const save = useCallback(async (patch: Partial<UserProfile>) => {
    if (!uid) throw new Error('로그인 상태가 아닙니다');
    const next: UserProfile = { ...profile, ...patch, email: authEmail };
    await set(ref(getRtdb(), `users/${uid}/profile`), next);
  }, [uid, authEmail, profile]);

  return { profile, save, loading, uid };
}
