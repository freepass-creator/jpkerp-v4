'use client';

import { useEffect, useState, useCallback } from 'react';
import { ref, set, onValue } from 'firebase/database';
import { getRtdb } from './firebase/client';
import { stripUndef } from './store-utils';
import type { InsurancePolicy } from './sample-insurance';

/**
 * 보험증권 영구 저장소 — Firebase RTDB. RTDB 노드는 **id 를 키로 하는 객체**:
 *   insurances/{policyId}/{...}
 * legacy 배열도 read 시 호환 처리. installments 중첩 객체→배열 정규화 보존.
 */
const RTDB_PATH = 'insurances';

let cache: InsurancePolicy[] = [];
const listeners = new Set<(v: InsurancePolicy[]) => void>();
let subscribed = false;

/** installments 중첩 객체→배열 정규화 (RTDB 가 sparse 배열을 obj 로 저장하는 경우 대비). */
function normalizeInstallments(p: InsurancePolicy): InsurancePolicy {
  const inst = (p as InsurancePolicy & { installments?: unknown }).installments;
  if (inst && !Array.isArray(inst) && typeof inst === 'object') {
    return { ...p, installments: Object.values(inst) as InsurancePolicy['installments'] };
  }
  return p;
}

/** RTDB 에서 읽은 raw 값 → InsurancePolicy[]. keyed object / legacy array 둘 다 지원. */
function fromRtdb(val: unknown): InsurancePolicy[] {
  if (!val || typeof val !== 'object') return [];
  const arr = Array.isArray(val)
    ? val.filter((x): x is InsurancePolicy => x != null && typeof x === 'object')
    : Object.values(val as Record<string, InsurancePolicy>).filter((x): x is InsurancePolicy => x != null && typeof x === 'object');
  return arr.map(normalizeInstallments);
}

/** InsurancePolicy[] → RTDB keyed object (id 키). */
function toRtdb(arr: InsurancePolicy[]): Record<string, InsurancePolicy> {
  const out: Record<string, InsurancePolicy> = {};
  for (const p of arr) {
    if (p.id) out[p.id] = p;
  }
  return out;
}

function ensureSubscription() {
  if (subscribed || typeof window === 'undefined') return;
  subscribed = true;
  onValue(ref(getRtdb(), RTDB_PATH), (snap) => {
    const v = fromRtdb(snap.val());
    cache = v;
    listeners.forEach((l) => l(v));
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
    const obj = toRtdb(next);
    set(ref(getRtdb(), RTDB_PATH), stripUndef(obj)).catch((e) => {
      console.error('[insurance-store] write failed', e);
      if (typeof window !== 'undefined') alert(`보험증권 저장 실패: ${e?.message ?? e}\n\nFirebase Rules 'insurances' 노드 권한 확인.`);
    });
  }, []);

  return [policies, setPolicies] as const;
}
