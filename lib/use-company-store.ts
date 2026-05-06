'use client';

import { createKeyedStore } from './create-keyed-store';
import type { Company } from './sample-companies';

/**
 * 회사정보 영구 저장소 — Firebase RTDB. RTDB 노드는 **회사코드를 키로 하는 객체**:
 *   companies/CP01/{...}, companies/CP02/{...}
 * 배열 형태 (legacy 0,1,2 인덱스) 도 read 시 호환 처리.
 */
const { useStore } = createKeyedStore<Company>({
  path: 'companies',
  getKey: (c) => c.code,
  storeName: 'company-store',
  sortBy: (a, b) => (a.code ?? '').localeCompare(b.code ?? ''),
  alertLabel: '회사정보',
});

export const useCompanyStore = useStore;
