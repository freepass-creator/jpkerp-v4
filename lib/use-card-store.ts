'use client';

import { createKeyedStore } from './create-keyed-store';
import type { CardUsage } from './sample-finance';

/**
 * 법인카드 사용내역 — RTDB 영구 저장.
 * 노드: card_usages/{id}/{...}
 */
const { useStore } = createKeyedStore<CardUsage>({
  path: 'card_usages',
  getKey: (c) => c.id,
  storeName: 'card-store',
  sortBy: (a, b) => (b.txDate ?? '').localeCompare(a.txDate ?? ''),
  alertLabel: '카드사용',
});

export const useCardStore = useStore;
