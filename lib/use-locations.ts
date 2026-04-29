'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * 출발지·도착지 — 두 가지 저장:
 *  - locations: 최근 사용 (LRU, 자동 누적, 최대 20)
 *  - favorites: 즐겨찾기 (★ 토글, 명시적 등록, 최대 10)
 * v3 lib/hooks/useOpPrefs 의 패턴과 동일.
 */

const LOC_KEY = 'jpkerp-v4:op.locations';
const FAV_KEY_PREFIX = 'jpkerp-v4:op.favorites';

function read<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}
function write<T>(key: string, value: T) {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

/** 자주 쓰는 장소 (LRU, 자동 누적, 최대 20개) */
export function useLocations() {
  const [list, setList] = useState<string[]>([]);
  useEffect(() => setList(read(LOC_KEY, [] as string[])), []);
  const add = useCallback((place: string) => {
    const v = place.trim();
    if (!v) return;
    setList((cur) => {
      const next = [v, ...cur.filter((p) => p !== v)].slice(0, 20);
      write(LOC_KEY, next);
      return next;
    });
  }, []);
  const remove = useCallback((place: string) => {
    setList((cur) => {
      const next = cur.filter((p) => p !== place);
      write(LOC_KEY, next);
      return next;
    });
  }, []);
  return { list, add, remove };
}

/**
 * 즐겨찾기 장소 (★ 토글, 명시적, 최대 10개).
 * `namespace` 로 분리 — 'from' / 'to' 각각 별도 저장.
 */
export function useFavorites(namespace = 'default') {
  const key = `${FAV_KEY_PREFIX}.${namespace}`;
  const [list, setList] = useState<string[]>([]);
  useEffect(() => setList(read(key, [] as string[])), [key]);
  const toggle = useCallback((place: string) => {
    const v = place.trim();
    if (!v) return;
    setList((cur) => {
      const isFav = cur.includes(v);
      const next = isFav ? cur.filter((p) => p !== v) : [v, ...cur].slice(0, 10);
      write(key, next);
      return next;
    });
  }, [key]);
  const isFav = useCallback((place: string) => list.includes(place), [list]);
  return { list, toggle, isFav };
}
