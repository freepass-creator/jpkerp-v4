'use client';

import { useEffect, useState, useCallback } from 'react';
import { ref, set, onValue, get } from 'firebase/database';
import { getRtdb } from './firebase/client';
import type { LedgerEntry } from './sample-finance';

/**
 * 계좌내역(통장 거래) 영구 저장소 — Firebase RTDB.
 *
 *  - 모듈 레벨 캐시 + pub/sub: 같은 탭 모든 컴포넌트가 같은 데이터 즉시 공유
 *  - onValue 구독: 다른 사용자/디바이스가 변경하면 실시간 반영
 *  - localStorage 마이그레이션: RTDB 가 비어있고 localStorage 에 있으면 1회 push 후 삭제
 */
const RTDB_PATH = 'ledger';
const LOCAL_KEY_LEGACY = 'jpkerp-v4:ledger';

let cache: LedgerEntry[] = [];
const listeners = new Set<(v: LedgerEntry[]) => void>();
let subscribed = false;
/** RTDB 가 자체 write 를 echo 로 다시 fire 하는 걸 거르기 위한 직렬화 캐시 */
let lastSerialized = '';

function asArray(val: unknown): LedgerEntry[] {
  if (!val) return [];
  if (Array.isArray(val)) return val.filter((x): x is LedgerEntry => x != null && typeof x === 'object');
  if (typeof val === 'object') return Object.values(val as Record<string, LedgerEntry>);
  return [];
}

/** RTDB 는 undefined 거부 — 재귀 strip. */
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
    const parsed = JSON.parse(raw) as LedgerEntry[];
    if (!Array.isArray(parsed) || parsed.length === 0) return;
    const snap = await get(ref(getRtdb(), RTDB_PATH));
    if (snap.exists() && asArray(snap.val()).length > 0) {
      localStorage.removeItem(LOCAL_KEY_LEGACY);
      return;
    }
    await set(ref(getRtdb(), RTDB_PATH), stripUndef(parsed));
    localStorage.removeItem(LOCAL_KEY_LEGACY);
  } catch (e) {
    console.warn('[ledger-store] migrate failed', e);
  }
}

function ensureSubscription() {
  if (subscribed || typeof window === 'undefined') return;
  subscribed = true;
  void migrateLocalToRtdb().finally(() => {
    onValue(ref(getRtdb(), RTDB_PATH), (snap) => {
      const json = JSON.stringify(snap.val() ?? null);
      if (json === lastSerialized) return; // 우리가 방금 쓴 echo — 무시
      lastSerialized = json;
      const v = asArray(snap.val());
      cache = v;
      listeners.forEach((l) => l(v));
    });
  });
}

export function useLedgerStore() {
  const [entries, setLocal] = useState<LedgerEntry[]>(() => cache);

  useEffect(() => {
    ensureSubscription();
    const fn = (v: LedgerEntry[]) => setLocal(v);
    listeners.add(fn);
    setLocal(cache);
    return () => { listeners.delete(fn); };
  }, []);

  const setEntries = useCallback((updater: LedgerEntry[] | ((prev: LedgerEntry[]) => LedgerEntry[])) => {
    const prev = cache;
    const next = typeof updater === 'function' ? (updater as (p: LedgerEntry[]) => LedgerEntry[])(prev) : updater;
    cache = next;
    const stripped = stripUndef(next);
    // RTDB echo dedup 용 — 이 직렬화가 onValue 로 돌아오면 무시
    lastSerialized = JSON.stringify(stripped.length === 0 ? null : stripped);
    listeners.forEach((l) => l(next));
    set(ref(getRtdb(), RTDB_PATH), stripped).catch((e) => {
      console.error('[ledger-store] write failed', e);
      if (typeof window !== 'undefined') alert(`계좌내역 저장 실패: ${e?.message ?? e}\n\nFirebase Console → Realtime Database → Rules 확인 필요.`);
    });
  }, []);

  return [entries, setEntries] as const;
}
