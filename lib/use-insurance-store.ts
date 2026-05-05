'use client';

import { useEffect, useState, useCallback } from 'react';
import { ref, set, onValue, get } from 'firebase/database';
import { getRtdb } from './firebase/client';
import { stripUndef, asArray as asArrayBase } from './store-utils';
import type { InsurancePolicy } from './sample-insurance';

/**
 * 보험증권 영구 저장소 — Firebase RTDB.
 * 다른 store 와 동일 패턴: 모듈 캐시 + onValue 구독 + localStorage 마이그레이션.
 */
const RTDB_PATH = 'insurances';
const LOCAL_KEY_LEGACY = 'jpkerp-v4:insurances';

let cache: InsurancePolicy[] = [];
const listeners = new Set<(v: InsurancePolicy[]) => void>();
let subscribed = false;

/** InsurancePolicy 전용 — 기본 asArray 위에 installments 중첩 객체→배열 정규화 추가. */
function asArray(val: unknown): InsurancePolicy[] {
  return asArrayBase<InsurancePolicy>(val).map((p) => {
    const inst = (p as InsurancePolicy & { installments?: unknown }).installments;
    if (inst && !Array.isArray(inst) && typeof inst === 'object') {
      return { ...p, installments: Object.values(inst) as InsurancePolicy['installments'] };
    }
    return p;
  });
}

async function migrateLocalToRtdb() {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(LOCAL_KEY_LEGACY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as InsurancePolicy[];
    if (!Array.isArray(parsed) || parsed.length === 0) return;
    const snap = await get(ref(getRtdb(), RTDB_PATH));
    if (snap.exists() && asArray(snap.val()).length > 0) {
      localStorage.removeItem(LOCAL_KEY_LEGACY);
      return;
    }
    await set(ref(getRtdb(), RTDB_PATH), stripUndef(parsed));
    localStorage.removeItem(LOCAL_KEY_LEGACY);
  } catch (e) {
    console.warn('[insurance-store] migrate failed', e);
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

export function useInsuranceStore() {
  const [policies, setLocal] = useState<InsurancePolicy[]>(() => cache);

  useEffect(() => {
    ensureSubscription();
    const fn = (v: InsurancePolicy[]) => setLocal(v);
    listeners.add(fn);
    setLocal(cache);
    return () => { listeners.delete(fn); };
  }, []);

  const setPolicies = useCallback((updater: InsurancePolicy[] | ((prev: InsurancePolicy[]) => InsurancePolicy[])) => {
    const prev = cache;
    const next = typeof updater === 'function' ? (updater as (p: InsurancePolicy[]) => InsurancePolicy[])(prev) : updater;
    cache = next;
    listeners.forEach((l) => l(next));
    set(ref(getRtdb(), RTDB_PATH), stripUndef(next)).catch((e) => {
      console.error('[insurance-store] write failed', e);
      if (typeof window !== 'undefined') alert(`보험증권 저장 실패: ${e?.message ?? e}\n\nFirebase Rules 'insurances' 노드 권한 확인.`);
    });
  }, []);

  return [policies, setPolicies] as const;
}
