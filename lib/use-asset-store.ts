'use client';

import { useEffect, useState, useCallback } from 'react';
import { ref, set, onValue, get } from 'firebase/database';
import { getRtdb } from './firebase/client';
import type { Asset } from './sample-assets';

/**
 * 자산(차량) 영구 저장소 — Firebase RTDB.
 * use-company-store 와 동일 패턴: 모듈 캐시 + onValue 구독 + localStorage 마이그레이션.
 */
const RTDB_PATH = 'assets';
const LOCAL_KEY_LEGACY = 'jpkerp-v4:assets';

let cache: Asset[] = [];
const listeners = new Set<(v: Asset[]) => void>();
let subscribed = false;

function asArray(val: unknown): Asset[] {
  if (!val) return [];
  if (Array.isArray(val)) return val.filter((x): x is Asset => x != null && typeof x === 'object');
  if (typeof val === 'object') return Object.values(val as Record<string, Asset>);
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
    const parsed = JSON.parse(raw) as Asset[];
    if (!Array.isArray(parsed) || parsed.length === 0) return;
    const snap = await get(ref(getRtdb(), RTDB_PATH));
    if (snap.exists() && asArray(snap.val()).length > 0) {
      localStorage.removeItem(LOCAL_KEY_LEGACY);
      return;
    }
    await set(ref(getRtdb(), RTDB_PATH), stripUndef(parsed));
    localStorage.removeItem(LOCAL_KEY_LEGACY);
  } catch (e) {
    console.warn('[asset-store] migrate failed', e);
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

export function useAssetStore() {
  const [assets, setLocal] = useState<Asset[]>(() => cache);

  useEffect(() => {
    ensureSubscription();
    const fn = (v: Asset[]) => setLocal(v);
    listeners.add(fn);
    setLocal(cache);
    return () => { listeners.delete(fn); };
  }, []);

  const setAssets = useCallback((updater: Asset[] | ((prev: Asset[]) => Asset[])) => {
    const prev = cache;
    const next = typeof updater === 'function' ? (updater as (p: Asset[]) => Asset[])(prev) : updater;
    cache = next;
    listeners.forEach((l) => l(next));
    set(ref(getRtdb(), RTDB_PATH), stripUndef(next)).catch((e) => console.error('[asset-store] write failed', e));
  }, []);

  return [assets, setAssets] as const;
}

/** 차량번호로 자산 찾기 (앞부분 부분일치 우선, 정확일치 우선순위) */
export function findAssetByPlate(assets: readonly Asset[], plate: string): Asset | null {
  const q = plate.trim();
  if (!q) return null;
  const exact = assets.find((a) => a.plate === q);
  if (exact) return exact;
  // 부분일치 (사용자가 일부만 입력했을 때)
  const partial = assets.find((a) => a.plate.includes(q));
  return partial ?? null;
}
