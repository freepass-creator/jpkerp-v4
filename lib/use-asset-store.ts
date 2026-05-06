'use client';

import { createKeyedStore } from './create-keyed-store';
import type { Asset } from './sample-assets';

/**
 * 차량 영구 저장소 — Firebase RTDB. RTDB 노드는 **assetCode 를 키로 하는 객체**:
 *   assets/CP01VH0001/{...}, assets/CP02VH0003/{...}
 * legacy 배열(0,1,2 인덱스) 도 read 시 호환 처리.
 * assetCode 가 없는 (마이그레이션 중) 데이터는 fallback 으로 id 를 키로 사용.
 */
const { useStore } = createKeyedStore<Asset>({
  path: 'assets',
  getKey: (a) => a.assetCode ?? a.id,
  storeName: 'asset-store',
  sortBy: (a, b) => (a.assetCode ?? a.id ?? '').localeCompare(b.assetCode ?? b.id ?? ''),
  alertLabel: '차량',
});

export const useAssetStore = useStore;

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
