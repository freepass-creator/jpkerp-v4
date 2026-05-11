'use client';

import { createKeyedStore } from './create-keyed-store';
import type { Expense } from './sample-finance';

/**
 * 지출(비용) — RTDB 영구 저장. expenseNo (EX-NNNN) 가 회사 scope 코드지만
 * RTDB key 는 id 사용 (코드 변경 가능성·중복 검증은 앱 레벨).
 * 노드: expenses/{id}/{...}
 */
const { useStore } = createKeyedStore<Expense>({
  path: 'expenses',
  getKey: (e) => e.id,
  storeName: 'expense-store',
  sortBy: (a, b) => (b.occurDate ?? '').localeCompare(a.occurDate ?? ''),
  alertLabel: '지출',
});

export const useExpenseStore = useStore;
