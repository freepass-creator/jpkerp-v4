'use client';

import { useMemo } from 'react';
import type { SubTab } from '@/components/layout/page-shell';
import { useAssetStore } from './use-asset-store';
import { useContractStore } from './use-contract-store';
import { useJournalStore } from './use-journal-store';
import { collectOverdue, collectIdle } from './pending-aggregators';

export const PENDING_SUBTABS: SubTab[] = [
  { href: '/pending',          label: '미결업무' },
  { href: '/pending/overdue',  label: '미납현황' },
  { href: '/pending/idle',     label: '휴차현황' },
  { href: '/pending/journal',  label: '업무일지' },
];

/**
 * sub-tab 미결 카운트 — 빨간 dot 표시용.
 *  · 미결업무 = 업무작성 entries 중 data.status !== '처리완료'
 *  · 미납·휴차 = 자산/계약 store 도출
 *  · 업무일지 = 누적 기록이지 미결이 아니므로 제외
 */
export function usePendingSubtabPending(): Record<string, number> {
  const [assets] = useAssetStore();
  const [contracts] = useContractStore();
  const [entries] = useJournalStore();
  return useMemo(() => ({
    '/pending':         entries.filter((e) => e.data?.status !== '처리완료').length,
    '/pending/overdue': collectOverdue(contracts).length,
    '/pending/idle':    collectIdle(assets, contracts).length,
  }), [assets, contracts, entries]);
}
