'use client';

import { useEffect, useState, useCallback } from 'react';
import { ref, set, onValue, get } from 'firebase/database';
import { getRtdb } from './firebase/client';
import { stripUndef, asArray as asArrayBase } from './store-utils';
import type { Company } from './sample-companies';

/**
 * 회사정보 영구 저장소 — Firebase RTDB.
 *
 *  - 모듈 레벨 캐시 + pub/sub: 같은 탭 모든 컴포넌트가 같은 데이터 즉시 공유
 *  - onValue 구독: 다른 사용자/디바이스가 변경하면 실시간 반영
 *  - localStorage 마이그레이션: RTDB 가 비어있고 localStorage 에 있으면 1회 push 후 삭제
 */
const RTDB_PATH = 'companies';
const LOCAL_KEY_LEGACY = 'jpkerp-v4:companies';

let cache: Company[] = [];
const listeners = new Set<(v: Company[]) => void>();
let subscribed = false;

const asArray = (val: unknown) => asArrayBase<Company>(val);

async function migrateLocalToRtdb() {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(LOCAL_KEY_LEGACY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Company[];
    if (!Array.isArray(parsed) || parsed.length === 0) return;
    const snap = await get(ref(getRtdb(), RTDB_PATH));
    if (snap.exists() && asArray(snap.val()).length > 0) {
      // RTDB 가 이미 있음 — local 만 정리
      localStorage.removeItem(LOCAL_KEY_LEGACY);
      return;
    }
    await set(ref(getRtdb(), RTDB_PATH), stripUndef(parsed));
    localStorage.removeItem(LOCAL_KEY_LEGACY);
  } catch (e) {
    console.warn('[company-store] migrate failed', e);
  }
}

function ensureSubscription() {
  if (subscribed || typeof window === 'undefined') return;
  subscribed = true;
  void migrateLocalToRtdb().finally(() => {
    onValue(ref(getRtdb(), RTDB_PATH), (snap) => {
      const v = asArray(snap.val());
      cache = v;
      listeners.forEach((l) => l(v));
    });
  });
}

export function useCompanyStore() {
  const [companies, setLocal] = useState<Company[]>(() => cache);

  useEffect(() => {
    ensureSubscription();
    const fn = (v: Company[]) => setLocal(v);
    listeners.add(fn);
    setLocal(cache);
    return () => { listeners.delete(fn); };
  }, []);

  const setCompanies = useCallback((updater: Company[] | ((prev: Company[]) => Company[])) => {
    const prev = cache;
    const next = typeof updater === 'function' ? (updater as (p: Company[]) => Company[])(prev) : updater;
    cache = next;
    listeners.forEach((l) => l(next));
    set(ref(getRtdb(), RTDB_PATH), stripUndef(next)).catch((e) => {
      console.error('[company-store] write failed', e);
      if (typeof window !== 'undefined') alert(`회사정보 저장 실패: ${e?.message ?? e}\n\nFirebase Console → Realtime Database → Rules 확인 필요.`);
    });
  }, []);

  return [companies, setCompanies] as const;
}
