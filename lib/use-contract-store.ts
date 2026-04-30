'use client';

import { useEffect, useState, useCallback } from 'react';
import { ref, set, onValue, get } from 'firebase/database';
import { getRtdb } from './firebase/client';
import type { Contract } from './sample-contracts';

/**
 * 계약 영구 저장소 — Firebase RTDB.
 * use-asset-store / use-company-store 와 동일 패턴.
 */
const RTDB_PATH = 'contracts';
const LOCAL_KEY_LEGACY = 'jpkerp-v4:contracts';

let cache: Contract[] = [];
const listeners = new Set<(v: Contract[]) => void>();
let subscribed = false;

function asArray(val: unknown): Contract[] {
  if (!val) return [];
  if (Array.isArray(val)) return val.filter((x): x is Contract => x != null && typeof x === 'object');
  if (typeof val === 'object') return Object.values(val as Record<string, Contract>);
  return [];
}

function stripUndef<T>(v: T): T {
  if (Array.isArray(v)) return v.map(stripUndef) as unknown as T;
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (val !== undefined) out[k] = stripUndef(val);
    }
    return out as T;
  }
  return v;
}

async function migrateLocalToRtdb() {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(LOCAL_KEY_LEGACY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Contract[];
    if (!Array.isArray(parsed) || parsed.length === 0) return;
    const snap = await get(ref(getRtdb(), RTDB_PATH));
    if (snap.exists() && asArray(snap.val()).length > 0) {
      localStorage.removeItem(LOCAL_KEY_LEGACY);
      return;
    }
    await set(ref(getRtdb(), RTDB_PATH), stripUndef(parsed));
    localStorage.removeItem(LOCAL_KEY_LEGACY);
  } catch (e) {
    console.warn('[contract-store] migrate failed', e);
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

export function useContractStore() {
  const [contracts, setLocal] = useState<Contract[]>(() => cache);

  useEffect(() => {
    ensureSubscription();
    const fn = (v: Contract[]) => setLocal(v);
    listeners.add(fn);
    setLocal(cache);
    return () => { listeners.delete(fn); };
  }, []);

  const setContracts = useCallback((updater: Contract[] | ((prev: Contract[]) => Contract[])) => {
    const prev = cache;
    const next = typeof updater === 'function' ? (updater as (p: Contract[]) => Contract[])(prev) : updater;
    cache = next;
    listeners.forEach((l) => l(next));
    set(ref(getRtdb(), RTDB_PATH), stripUndef(next)).catch((e) => {
      console.error('[contract-store] write failed', e);
      if (typeof window !== 'undefined') alert(`계약 저장 실패: ${e?.message ?? e}\n\nFirebase Console → Realtime Database → Rules 확인 필요.`);
    });
  }, []);

  return [contracts, setContracts] as const;
}

/**
 * 차량번호로 활성(운행중) 계약 찾기.
 * - 정확일치 우선
 * - 운행중 우선, 다음 만기/해지/대기 순 fallback
 * - 같은 차량에 여러 계약이 있으면 가장 최근 startDate 우선
 */
export function findContractByPlate(contracts: readonly Contract[], plate: string): Contract | null {
  const q = plate.replace(/\s/g, '').trim();
  if (!q) return null;
  const norm = (p: string) => p.replace(/\s/g, '');
  const candidates = contracts.filter((c) => norm(c.plate) === q);
  if (candidates.length === 0) return null;

  const STATUS_PRIORITY: Record<string, number> = {
    '운행중': 0, '대기': 1, '만기': 2, '해지': 3,
  };
  candidates.sort((a, b) => {
    const pa = STATUS_PRIORITY[a.status] ?? 99;
    const pb = STATUS_PRIORITY[b.status] ?? 99;
    if (pa !== pb) return pa - pb;
    return (b.startDate ?? '').localeCompare(a.startDate ?? '');
  });
  return candidates[0];
}
