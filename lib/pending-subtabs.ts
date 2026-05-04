'use client';

import { useMemo } from 'react';
import type { SubTab } from '@/components/layout/page-shell';
import { useAssetStore } from './use-asset-store';
import { useContractStore } from './use-contract-store';
import { useJournalStore } from './use-journal-store';
import { useCompanyStore } from './use-company-store';
import { useLedgerStore } from './use-ledger-store';
import { useInsuranceStore } from './use-insurance-store';
import { collectOverdue, collectIdle } from './pending-aggregators';
import { collectIntegrity } from './integrity-checks';

export const PENDING_SUBTABS: SubTab[] = [
  { href: '/pending',             label: '미결업무' },
  { href: '/pending/overdue',     label: '미납' },
  { href: '/pending/idle',        label: '휴차' },
  { href: '/pending/inspection',  label: '검사' },
  { href: '/pending/insurance',   label: '보험' },
  { href: '/pending/loan',        label: '할부' },
  { href: '/pending/tax',         label: '세금' },
  { href: '/pending/return',      label: '반납' },
  { href: '/pending/integrity',   label: '정합성' },
  { href: '/pending/journal',     label: '업무일지' },
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
  const [companies] = useCompanyStore();
  const [ledger] = useLedgerStore();
  const [policies] = useInsuranceStore();
  return useMemo(() => {
    const today = Date.now();
    const horizon = today + 30 * 24 * 60 * 60 * 1000;

    // 검사 만기 임박 (자산 inspectionTo D-30)
    const inspection = assets.filter((a) => {
      if (!a.inspectionTo || a.status === '매각') return false;
      const t = Date.parse(a.inspectionTo);
      return Number.isFinite(t) && t <= horizon;
    }).length;

    // 반납 임박 (계약 events type='반납' 만기 D-30)
    const returnSoon = contracts.reduce((sum, c) => {
      if (c.status === '만기' || c.status === '해지') return sum;
      return sum + c.events.filter((e) => {
        if (e.type !== '반납' || e.status !== '예정') return false;
        const t = Date.parse(e.dueDate);
        return Number.isFinite(t) && t <= horizon;
      }).length;
    }, 0);

    return {
      '/pending':            entries.filter((e) => e.data?.status !== '처리완료').length,
      '/pending/overdue':    collectOverdue(contracts).length,
      '/pending/idle':       collectIdle(assets, contracts).length,
      '/pending/inspection': inspection,
      '/pending/return':     returnSoon,
      '/pending/integrity':  collectIntegrity(assets, contracts, companies, ledger, policies).length,
      // 할부/세금 — 별도 store 추가 시 카운트 (현재 0)
    };
  }, [assets, contracts, entries, companies, ledger, policies]);
}
