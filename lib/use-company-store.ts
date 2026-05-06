'use client';

import { useEffect, useState, useCallback } from 'react';
import { ref, set, onValue } from 'firebase/database';
import { getRtdb } from './firebase/client';
import { stripUndef } from './store-utils';
import type { Company } from './sample-companies';

/**
 * 회사정보 영구 저장소 — Firebase RTDB. RTDB 노드는 **회사코드를 키로 하는 객체**:
 *   companies/CP01/{...}, companies/CP02/{...}
 * 배열 형태 (legacy 0,1,2 인덱스) 도 read 시 호환 처리.
 */
const RTDB_PATH = 'companies';

let cache: Company[] = [];
const listeners = new Set<(v: Company[]) => void>();
let subscribed = false;

/** RTDB 에서 읽은 raw 값 → Company[]. keyed object / legacy array 둘 다 지원. */
function fromRtdb(val: unknown): Company[] {
  if (!val || typeof val !== 'object') return [];
  const arr = Array.isArray(val)
    ? val.filter((x): x is Company => x != null && typeof x === 'object')
    : Object.values(val as Record<string, Company>).filter((x): x is Company => x != null && typeof x === 'object');
  return arr.sort((a, b) => (a.code ?? '').localeCompare(b.code ?? ''));
}

/** Company[] → RTDB keyed object (code 키). */
function toRtdb(arr: Company[]): Record<string, Company> {
  const out: Record<string, Company> = {};
  for (const c of arr) {
    if (c.code) out[c.code] = c;
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
    const obj = toRtdb(next);
    console.log(`[company-store] writing ${next.length} companies (keyed by code) to RTDB...`);
    set(ref(getRtdb(), RTDB_PATH), stripUndef(obj))
      .then(() => console.log(`[company-store] ✓ RTDB write OK (${next.length} companies)`))
      .catch((e) => {
        console.error('[company-store] ✗ write failed', e);
        if (typeof window !== 'undefined') alert(`회사정보 저장 실패: ${e?.message ?? e}\n\nFirebase Console → Realtime Database → Rules 확인 필요.`);
      });
  }, []);

  return [companies, setCompanies] as const;
}
