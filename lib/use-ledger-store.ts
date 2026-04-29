'use client';

import { useEffect, useState, useCallback } from 'react';
import type { LedgerEntry } from './sample-finance';

/**
 * 계좌내역(통장 거래) 영구 저장소.
 * 모듈 레벨 캐시 + pub/sub — 같은 탭 내 모든 컴포넌트(/finance, /finance/daily, …)가
 * 같은 데이터를 즉시 공유. cross-tab 은 'storage' 이벤트.
 */
const KEY = 'jpkerp-v4:ledger';

let cache: LedgerEntry[] | null = null;
const listeners = new Set<(v: LedgerEntry[]) => void>();

function load(): LedgerEntry[] {
  if (cache !== null) return cache;
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as LedgerEntry[];
      if (Array.isArray(parsed)) {
        cache = parsed;
        return parsed;
      }
    }
  } catch {}
  cache = [];
  return cache;
}

function persist(next: LedgerEntry[]) {
  cache = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
  listeners.forEach((l) => l(next));
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return;
    try {
      const parsed = e.newValue ? JSON.parse(e.newValue) as LedgerEntry[] : [];
      if (Array.isArray(parsed)) {
        cache = parsed;
        listeners.forEach((l) => l(parsed));
      }
    } catch {}
  });
}

export function useLedgerStore() {
  const [entries, setLocal] = useState<LedgerEntry[]>(() => load());

  useEffect(() => {
    const fn = (v: LedgerEntry[]) => setLocal(v);
    listeners.add(fn);
    setLocal(load());
    return () => { listeners.delete(fn); };
  }, []);

  const setEntries = useCallback((updater: LedgerEntry[] | ((prev: LedgerEntry[]) => LedgerEntry[])) => {
    const prev = cache ?? load();
    const next = typeof updater === 'function' ? (updater as (p: LedgerEntry[]) => LedgerEntry[])(prev) : updater;
    persist(next);
  }, []);

  return [entries, setEntries] as const;
}
