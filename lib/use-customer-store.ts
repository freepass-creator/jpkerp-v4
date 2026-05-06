'use client';

import { createKeyedStore } from './create-keyed-store';
import type { Customer } from './sample-customers';

/**
 * 고객 영구 저장소 — Firebase RTDB. RTDB 노드는 **code 를 키로 하는 객체**:
 *   customers/CP01CU0001/{...}, customers/CP01CU0002/{...}
 *
 * 한 고객이 여러 계약을 가질 수 있음 — 매칭은 ident/phone 으로 (sample-customers.ts:findCustomerMatch).
 */
const { useStore } = createKeyedStore<Customer>({
  path: 'customers',
  getKey: (c) => c.code,
  storeName: 'customer-store',
  sortBy: (a, b) => (a.code ?? '').localeCompare(b.code ?? ''),
  alertLabel: '고객',
});

export const useCustomerStore = useStore;
