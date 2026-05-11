'use client';

import { createKeyedStore } from './create-keyed-store';
import type { Autopay } from './sample-finance';

/**
 * 자동이체(CMS) 등록부 — RTDB 영구 저장. 결제 결과(LedgerEntry) 와 분리.
 * 노드: autopays/{id}/{...}
 */
const { useStore } = createKeyedStore<Autopay>({
  path: 'autopays',
  getKey: (a) => a.id,
  storeName: 'autopay-store',
  sortBy: (a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''),
  alertLabel: '자동이체',
});

export const useAutopayStore = useStore;
