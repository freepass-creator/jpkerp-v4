/**
 * 자산 도메인 중복 키 정의.
 *
 * 키 우선순위:
 *   1) 차대번호 (VIN) — 차량 고유 식별자, 가장 확실.
 *   2) 차량번호 (plate) — VIN 누락 시 폴백. 같은 차량이면 plate 도 동일.
 *
 * lib/dedup.ts 위에 도메인 키만 얹은 얇은 wrapper.
 */
import type { KeyFn } from './dedup';
import type { Asset } from './sample-assets';

export const assetKeyFn: KeyFn<Partial<Asset>> = (item) => [
  item.vin ? `VIN:${item.vin}` : null,
  item.plate ? `PL:${item.plate}` : null,
];

/** 사용자에게 보여줄 중복 사유 한 줄 — 'vin' / 'plate' / null. */
export function describeAssetDuplicate(matchedKey: string): 'vin' | 'plate' | null {
  if (matchedKey.startsWith('VIN:')) return 'vin';
  if (matchedKey.startsWith('PL:')) return 'plate';
  return null;
}
