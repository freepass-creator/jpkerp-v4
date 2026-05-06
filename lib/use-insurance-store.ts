'use client';

import { createKeyedStore } from './create-keyed-store';
import type { InsurancePolicy } from './sample-insurance';

/**
 * 보험증권 영구 저장소 — Firebase RTDB. RTDB 노드는 **id 를 키로 하는 객체**:
 *   insurances/{policyId}/{...}
 * legacy 배열도 read 시 호환 처리. installments 중첩 객체→배열 정규화 보존.
 */
const { useStore } = createKeyedStore<InsurancePolicy>({
  path: 'insurances',
  getKey: (p) => p.id,
  storeName: 'insurance-store',
  alertLabel: '보험증권',
  // installments 중첩 객체→배열 정규화 (RTDB 가 sparse 배열을 obj 로 저장하는 경우 대비).
  normalizeItem: (p) => {
    const inst = (p as InsurancePolicy & { installments?: unknown }).installments;
    if (inst && !Array.isArray(inst) && typeof inst === 'object') {
      return { ...p, installments: Object.values(inst) as InsurancePolicy['installments'] };
    }
    return p;
  },
});

export const useInsuranceStore = useStore;
