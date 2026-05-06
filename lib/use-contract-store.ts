'use client';

import { useEffect, useState, useCallback } from 'react';
import { ref, set, onValue } from 'firebase/database';
import { getRtdb } from './firebase/client';
import { stripUndef } from './store-utils';
import type { Contract } from './sample-contracts';

/**
 * 계약 영구 저장소 — Firebase RTDB. RTDB 노드는 **contractNo 를 키로 하는 객체**:
 *   contracts/C-2026-0001/{...}, contracts/C-2026-0002/{...}
 * legacy 배열도 read 시 호환 처리. events 중첩 객체→배열 정규화 보존.
 */
const RTDB_PATH = 'contracts';

let cache: Contract[] = [];
const listeners = new Set<(v: Contract[]) => void>();
let subscribed = false;

/** events 중첩 객체→배열 정규화 (RTDB 가 sparse 배열을 obj 로 저장하는 경우 대비). */
function normalizeEvents(c: Contract): Contract {
  const ev = (c as Contract & { events?: unknown }).events;
  if (ev && !Array.isArray(ev) && typeof ev === 'object') {
    return { ...c, events: Object.values(ev) as Contract['events'] };
  }
  return c;
}

/** RTDB 에서 읽은 raw 값 → Contract[]. keyed object / legacy array 둘 다 지원. */
function fromRtdb(val: unknown): Contract[] {
  if (!val || typeof val !== 'object') return [];
  const arr = Array.isArray(val)
    ? val.filter((x): x is Contract => x != null && typeof x === 'object')
    : Object.values(val as Record<string, Contract>).filter((x): x is Contract => x != null && typeof x === 'object');
  return arr
    .map(normalizeEvents)
    .sort((a, b) => (a.contractNo ?? '').localeCompare(b.contractNo ?? ''));
}

/** Contract[] → RTDB keyed object (contractNo 키). */
function toRtdb(arr: Contract[]): Record<string, Contract> {
  const out: Record<string, Contract> = {};
  for (const c of arr) {
    if (c.contractNo) out[c.contractNo] = c;
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
    const obj = toRtdb(next);
    set(ref(getRtdb(), RTDB_PATH), stripUndef(obj)).catch((e) => {
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
