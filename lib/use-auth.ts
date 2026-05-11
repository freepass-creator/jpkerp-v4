'use client';

import { useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile as fbUpdateProfile,
  sendPasswordResetEmail,
  signOut as fbSignOut,
  type User,
} from 'firebase/auth';
import { ref, set } from 'firebase/database';
import { getFirebaseAuth, getRtdb } from './firebase/client';
import { pushAuditLog } from './audit-log';

/**
 * Firebase Auth 훅 — 이메일/비밀번호 로그인·가입 (jpkerp3 패턴).
 *
 *  const { user, loading } = useAuth();
 *  await login(email, password);
 *  await signup({ email, password, displayName, ... });
 *  await logout();
 */

let cache: User | null = null;
let initialized = false;
const listeners = new Set<(u: User | null) => void>();

if (typeof window !== 'undefined') {
  onAuthStateChanged(getFirebaseAuth(), (u) => {
    cache = u;
    initialized = true;
    listeners.forEach((l) => l(u));
  });
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(cache);
  const [loading, setLoading] = useState<boolean>(!initialized);

  useEffect(() => {
    const fn = (u: User | null) => {
      setUser(u);
      setLoading(false);
    };
    listeners.add(fn);
    if (initialized) setLoading(false);
    return () => { listeners.delete(fn); };
  }, []);

  return { user, loading };
}

/** 이메일/비밀번호 로그인. 실패 시 throw. 성공 시 audit_logs 에 login 이벤트 push. */
export async function login(email: string, password: string): Promise<void> {
  const cred = await signInWithEmailAndPassword(getFirebaseAuth(), email.trim(), password);
  const u = cred.user;
  pushAuditLog(
    { uid: u.uid, email: u.email ?? undefined, name: u.displayName ?? undefined },
    { action: 'login', entityType: 'auth', entityId: u.uid, label: u.email ?? u.uid },
  );
}

/** 로그아웃. 호출 직전 user 정보 캡처해서 audit push (signOut 후엔 currentUser null). */
export async function logout(): Promise<void> {
  const u = getFirebaseAuth().currentUser;
  try {
    await fbSignOut(getFirebaseAuth());
    if (u) {
      pushAuditLog(
        { uid: u.uid, email: u.email ?? undefined, name: u.displayName ?? undefined },
        { action: 'logout', entityType: 'auth', entityId: u.uid, label: u.email ?? u.uid },
      );
    }
  } catch (e) {
    console.error('[auth] logout failed', e);
  }
}

/** 비밀번호 재설정 메일 발송. 등록된 이메일이면 메일이 가고, 미등록이면 Firebase가 silently 처리 (보안). */
export async function resetPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(getFirebaseAuth(), email.trim());
}

/**
 * 신규 가입 — Firebase Auth user 생성 + displayName 설정 + RTDB users/{uid}/profile 푸시.
 *
 * 가입 후 자동 로그인 상태 (Firebase 기본 동작). AuthGate 가 children 으로 전환.
 * RTDB rules 가 `/users/{uid}` 본인 write 만 허용해야 함 (보안).
 */
export type SignupInput = {
  email: string;
  password: string;
  displayName: string;
  companyName?: string;
  companyBizNo?: string;   // 소속 회사 사업자등록번호 — 관리자 승인 시 회사 마스터 매칭에 사용
  department?: string;
  role?: string;
  phone?: string;
};

export async function signup(input: SignupInput): Promise<void> {
  const cred = await createUserWithEmailAndPassword(
    getFirebaseAuth(),
    input.email.trim(),
    input.password,
  );
  const u = cred.user;
  await fbUpdateProfile(u, { displayName: input.displayName.trim() });

  // RTDB users/{uid}/profile 초기 push
  const profile = {
    companyName:      input.companyName?.trim() ?? '',
    companyBizNo:     input.companyBizNo?.trim() ?? '',
    displayName:      input.displayName.trim(),
    role:             input.role?.trim() ?? '',
    department:       input.department?.trim() ?? '',
    email:            u.email ?? input.email.trim(),
    phone:            input.phone?.trim() ?? '',
    officePhone:      '',
    fax:              '',
    workplace:        '',
    workplaceAddress: '',
  };
  try {
    await set(ref(getRtdb(), `users/${u.uid}/profile`), profile);
  } catch (e) {
    // 프로필 저장 실패는 가입 자체를 막지 않음 — 사용자가 설정 페이지에서 수정 가능
    console.error('[auth] signup profile save failed', e);
  }

  pushAuditLog(
    { uid: u.uid, email: u.email ?? undefined, name: u.displayName ?? undefined },
    { action: 'create', entityType: 'auth', entityId: u.uid, label: `회원가입 — ${u.email}` },
  );
}
