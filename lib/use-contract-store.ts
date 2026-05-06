'use client';

import { createKeyedStore } from './create-keyed-store';
import type { Contract } from './sample-contracts';

/**
 * 계약 영구 저장소 — Firebase RTDB. RTDB 노드는 **contractNo 를 키로 하는 객체**:
 *   contracts/CT2605060001/{...}, contracts/CT2605060002/{...}
 * legacy 배열도 read 시 호환 처리. events 중첩 객체→배열 정규화 보존.
 */
const { useStore } = createKeyedStore<Contract>({
  path: 'contracts',
  getKey: (c) => c.contractNo,
  storeName: 'contract-store',
  sortBy: (a, b) => (a.contractNo ?? '').localeCompare(b.contractNo ?? ''),
  alertLabel: '계약',
  // events 중첩 객체→배열 정규화 (RTDB 가 sparse 배열을 obj 로 저장하는 경우 대비).
  normalizeItem: (c) => {
    const ev = (c as Contract & { events?: unknown }).events;
    if (ev && !Array.isArray(ev) && typeof ev === 'object') {
      return { ...c, events: Object.values(ev) as Contract['events'] };
    }
    return c;
  },
});

export const useContractStore = useStore;

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
