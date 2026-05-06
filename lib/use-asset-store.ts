'use client';

import { useEffect, useState, useCallback } from 'react';
import { ref, set, onValue } from 'firebase/database';
import { getRtdb } from './firebase/client';
import { stripUndef } from './store-utils';
import type { Asset } from './sample-assets';

/**
 * 자산(차량) 영구 저장소 — Firebase RTDB. RTDB 노드는 **assetCode 를 키로 하는 객체**:
 *   assets/AS-CP01-0001/{...}, assets/AS-CP02-0003/{...}
 * legacy 배열(0,1,2 인덱스) 도 read 시 호환 처리.
 * assetCode 가 없는 (마이그레이션 중) 데이터는 fallback 으로 id 를 키로 사용.
 */
const RTDB_PATH = 'assets';

let cache: Asset[] = [];
const listeners = new Set<(v: Asset[]) => void>();
let subscribed = false;

/** RTDB 에서 읽은 raw 값 → Asset[]. keyed object / legacy array 둘 다 지원. */
function fromRtdb(val: unknown): Asset[] {
  if (!val || typeof val !== 'object') return [];
  const arr = Array.isArray(val)
    ? val.filter((x): x is Asset => x != null && typeof x === 'object')
    : Object.values(val as Record<string, Asset>).filter((x): x is Asset => x != null && typeof x === 'object');
  return arr.sort((a, b) => (a.assetCode ?? a.id ?? '').localeCompare(b.assetCode ?? b.id ?? ''));
}

/** Asset[] → RTDB keyed object (assetCode 키, 없으면 id fallback). */
function toRtdb(arr: Asset[]): Record<string, Asset> {
  const out: Record<string, Asset> = {};
  for (const a of arr) {
    const key = a.assetCode ?? a.id;
    if (key) out[key] = a;
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
    const obj = toRtdb(next);
    set(ref(getRtdb(), RTDB_PATH), stripUndef(obj)).catch((e) => {
      console.error('[asset-store] write failed', e);
      if (typeof window !== 'undefined') alert(`자산 저장 실패: ${e?.message ?? e}\n\nFirebase Console → Realtime Database → Rules 확인 필요.`);
    });
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
