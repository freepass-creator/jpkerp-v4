'use client';

import { useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut as fbSignOut,
  GoogleAuthProvider,
  type User,
} from 'firebase/auth';
import { getFirebaseAuth } from './firebase/client';

/**
 * Firebase Auth 상태 훅 — Google 로그인 / 로그아웃.
 *
 *  const { user, loading, login, logout } = useAuth();
 *  - user: 로그인된 User 또는 null
 *  - loading: 초기 인증 상태 확인 중 true
 *  - login(): Google 팝업으로 로그인
 *  - logout(): 로그아웃
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

  return {
    user,
    loading,
    login,
    logout,
  };
}

/** Google 팝업 로그인 */
export async function login() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    await signInWithPopup(getFirebaseAuth(), provider);
  } catch (e) {
    console.error('[auth] login failed', e);
    alert(`로그인 실패: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** 로그아웃 */
export async function logout() {
  try {
    await fbSignOut(getFirebaseAuth());
  } catch (e) {
    console.error('[auth] logout failed', e);
  }
}
