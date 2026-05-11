'use client';

import { createKeyedStore } from './create-keyed-store';
import type { Taxbill } from './sample-finance';

/**
 * 세금계산서(매출/매입) — RTDB 영구 저장.
 * 노드: taxbills/{id}/{...}
 */
const { useStore } = createKeyedStore<Taxbill>({
  path: 'taxbills',
  getKey: (t) => t.id,
  storeName: 'taxbill-store',
  sortBy: (a, b) => (b.issueDate ?? '').localeCompare(a.issueDate ?? ''),
  alertLabel: '세금계산서',
});

export const useTaxbillStore = useStore;
