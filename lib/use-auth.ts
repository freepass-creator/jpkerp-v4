'use client';

import { useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  type User,
} from 'firebase/auth';
import { getFirebaseAuth } from './firebase/client';

/**
 * Firebase Auth 훅 — 이메일/비밀번호 로그인 (jpkerp3 패턴 동일).
 *
 *  const { user, loading } = useAuth();
 *  await login(email, password);
 *  await logout();
 *
 * 계정은 Firebase Console → Authentication → Users 에서 관리자가 추가.
 * 신규 가입 폼은 별도 (운영 안정 후 구현).
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

/** 이메일/비밀번호 로그인. 실패 시 throw. */
export async function login(email: string, password: string): Promise<void> {
  await signInWithEmailAndPassword(getFirebaseAuth(), email.trim(), password);
}

/** 로그아웃 */
export async function logout(): Promise<void> {
  try {
    await fbSignOut(getFirebaseAuth());
  } catch (e) {
    console.error('[auth] logout failed', e);
  }
}
