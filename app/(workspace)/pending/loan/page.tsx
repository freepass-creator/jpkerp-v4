'use client';

import { CreditCard } from '@phosphor-icons/react';
import { PageShell } from '@/components/layout/page-shell';
import { PENDING_SUBTABS, usePendingSubtabPending } from '@/lib/pending-subtabs';

/** 할부 — 할부 만기·미납. 할부 store 추가 후 실데이터 연결 예정. */
export default function PendingLoanPage() {
  const subTabPending = usePendingSubtabPending();
  return (
    <PageShell subTabs={PENDING_SUBTABS} subTabPending={subTabPending}>
      <div className="page-section-center">
        <CreditCard size={32} className="mx-auto text-weak" />
        <div className="mt-2 text-medium">할부 — 데이터 연결 전</div>
        <div className="mt-1 text-weak">자산관리 → 할부스케줄 store 정식 연결 후 자동 표시됩니다.</div>
      </div>
    </PageShell>
  );
}
