'use client';

import { useEffect, useState, useCallback } from 'react';
import type { Company } from './sample-companies';

/**
 * 회사정보 영구 저장소 (모듈 레벨 캐시 + pub/sub).
 *
 * 같은 탭의 다른 컴포넌트(/admin/company, /finance, …)가 같은 데이터를 즉시 보도록
 * - module-scoped cache 가 진실의 원천
 * - 어느 인스턴스가 set 하면 모든 구독자에게 즉시 알림 → 모두 동기화
 * - localStorage 즉시 write (작은 데이터라 디바운스 불필요)
 * - cross-tab 동기화는 'storage' 이벤트 (다른 탭 전용)
 */
const KEY = 'jpkerp-v4:companies';

let cache: Company[] | null = null;
const listeners = new Set<(v: Company[]) => void>();

function load(): Company[] {
  if (cache !== null) return cache;
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Company[];
      if (Array.isArray(parsed)) {
        cache = parsed;
        return parsed;
      }
    }
  } catch {}
  cache = [];
  return cache;
}

function persist(next: Company[]) {
  cache = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
  listeners.forEach((l) => l(next));
}

// cross-tab — 다른 탭에서 localStorage 바뀌면 동기화
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return;
    try {
      const parsed = e.newValue ? JSON.parse(e.newValue) as Company[] : [];
      if (Array.isArray(parsed)) {
        cache = parsed;
        listeners.forEach((l) => l(parsed));
      }
    } catch {}
  });
}

export function useCompanyStore() {
  const [companies, setLocal] = useState<Company[]>(() => load());

  useEffect(() => {
    const fn = (v: Company[]) => setLocal(v);
    listeners.add(fn);
    // 마운트 시 최신 캐시로 동기화 (다른 인스턴스가 그동안 set 했을 수 있음)
    setLocal(load());
    return () => { listeners.delete(fn); };
  }, []);

  const setCompanies = useCallback((updater: Company[] | ((prev: Company[]) => Company[])) => {
    const prev = cache ?? load();
    const next = typeof updater === 'function' ? (updater as (p: Company[]) => Company[])(prev) : updater;
    persist(next);
  }, []);

  return [companies, setCompanies] as const;
}
