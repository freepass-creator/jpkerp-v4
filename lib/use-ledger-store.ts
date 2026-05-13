'use client';

import { useEffect, useState, useCallback } from 'react';
import { ref, set, onValue } from 'firebase/database';
import { getRtdb } from './firebase/client';
import { stripUndef } from './store-utils';
import type { LedgerEntry } from './sample-finance';

/**
 * 계좌내역(통장 거래) 영구 저장소 — Firebase RTDB.
 * RTDB 노드는 **id 를 키로 하는 객체**: ledger/{entryId}/{...}
 * legacy 배열도 read 시 호환 처리.
 *
 *  - 모듈 레벨 캐시 + pub/sub: 같은 탭 모든 컴포넌트가 같은 데이터 즉시 공유
 *  - onValue 구독: 다른 사용자/디바이스가 변경하면 실시간 반영
 *  - echo dedup: 자체 write 가 onValue 로 다시 fire 되는 걸 직렬화 캐시로 거름
 */
const RTDB_PATH = 'ledger';

let cache: LedgerEntry[] = [];
const listeners = new Set<(v: LedgerEntry[]) => void>();
const readyListeners = new Set<() => void>();
let subscribed = false;
let initialized = false;
/** RTDB 가 자체 write 를 echo 로 다시 fire 하는 걸 거르기 위한 직렬화 캐시 */
let lastSerialized = '';

/** RTDB 에서 읽은 raw 값 → LedgerEntry[]. keyed object / legacy array 둘 다 지원. */
function fromRtdb(val: unknown): LedgerEntry[] {
  if (!val || typeof val !== 'object') return [];
  const arr = Array.isArray(val)
    ? val.filter((x): x is LedgerEntry => x != null && typeof x === 'object')
    : Object.values(val as Record<string, LedgerEntry>).filter((x): x is LedgerEntry => x != null && typeof x === 'object');
  return arr.sort((a, b) => (b.txDate ?? '').localeCompare(a.txDate ?? ''));
}

/** LedgerEntry[] → RTDB keyed object (id 키). */
function toRtdb(arr: LedgerEntry[]): Record<string, LedgerEntry> {
  const out: Record<string, LedgerEntry> = {};
  for (const e of arr) {
    if (e.id) out[e.id] = e;
  }
  return out;
}

function ensureSubscription() {
  if (subscribed || typeof window === 'undefined') return;
  subscribed = true;
  onValue(ref(getRtdb(), RTDB_PATH), (snap) => {
    const json = JSON.stringify(snap.val() ?? null);
    if (json === lastSerialized) return; // 우리가 방금 쓴 echo — 무시
    lastSerialized = json;
    const v = fromRtdb(snap.val());
    cache = v;
    initialized = true;
    listeners.forEach((l) => l(v));
    readyListeners.forEach((fn) => fn());
  });
}

export function useLedgerStore() {
  const [entries, setLocal] = useState<LedgerEntry[]>(() => cache);
  const [ready, setReady] = useState<boolean>(() => initialized);

  useEffect(() => {
    ensureSubscription();
    const fn = (v: LedgerEntry[]) => setLocal(v);
    const readyFn = () => setReady(true);
    listeners.add(fn);
    readyListeners.add(readyFn);
    setLocal(cache);
    if (initialized) setReady(true);
    return () => { listeners.delete(fn); readyListeners.delete(readyFn); };
  }, []);

  const setEntries = useCallback((updater: LedgerEntry[] | ((prev: LedgerEntry[]) => LedgerEntry[])) => {
    const prev = cache;
    const next = typeof updater === 'function' ? (updater as (p: LedgerEntry[]) => LedgerEntry[])(prev) : updater;
    cache = next;
    const stripped = stripUndef(toRtdb(next));
    // RTDB echo dedup 용 — 이 직렬화가 onValue 로 돌아오면 무시
    lastSerialized = JSON.stringify(Object.keys(stripped).length === 0 ? null : stripped);
    listeners.forEach((l) => l(next));
    set(ref(getRtdb(), RTDB_PATH), stripped).catch((e) => {
      console.error('[ledger-store] write failed', e);
      if (typeof window !== 'undefined') alert(`계좌내역 저장 실패: ${e?.message ?? e}\n\nFirebase Console → Realtime Database → Rules 확인 필요.`);
    });
  }, []);

  return [entries, setEntries, ready] as const;
}
