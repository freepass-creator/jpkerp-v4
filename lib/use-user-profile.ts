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
  /* 기본 정보 */
  displayName: string;     // 이름
  role: string;            // 직급/역할
  department: string;      // 부서
  /* 연락 — 명함 */
  email: string;           // 이메일 (auth 동기화, 변경 불가)
  phone: string;           // 휴대폰
  officePhone: string;     // 사무실 직통
  fax: string;             // 팩스
  /* 근무지 */
  workplace: string;       // 근무지명 (예: 본사 / 서울지점)
  workplaceAddress: string;// 근무지 주소
};

const EMPTY: UserProfile = {
  displayName: '', role: '', department: '',
  email: '', phone: '', officePhone: '', fax: '',
  workplace: '', workplaceAddress: '',
};

function asProfile(val: unknown, fallbackEmail: string): UserProfile {
  const s = (v: unknown): string => (typeof v === 'string' ? v : '');
  if (val && typeof val === 'object') {
    const v = val as Partial<UserProfile>;
    return {
      displayName:      s(v.displayName),
      role:             s(v.role),
      department:       s(v.department),
      email:            v.email ? s(v.email) : fallbackEmail,
      phone:            s(v.phone),
      officePhone:      s(v.officePhone),
      fax:              s(v.fax),
      workplace:        s(v.workplace),
      workplaceAddress: s(v.workplaceAddress),
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
