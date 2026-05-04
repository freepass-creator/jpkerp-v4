'use client';

import { Receipt } from '@phosphor-icons/react';
import { PageShell } from '@/components/layout/page-shell';
import { PENDING_SUBTABS, usePendingSubtabPending } from '@/lib/pending-subtabs';

/** 세금 — 자동차세·취득세 등 만기. 별도 store 추가 후 연결 예정. */
export default function PendingTaxPage() {
  const subTabPending = usePendingSubtabPending();
  return (
    <PageShell subTabs={PENDING_SUBTABS} subTabPending={subTabPending}>
      <div className="page-section-center">
        <Receipt size={32} className="mx-auto text-weak" />
        <div className="mt-2 text-medium">세금 — 데이터 연결 전</div>
        <div className="mt-1 text-weak">자동차세·취득세·면허세 등 store 추가 후 자동 표시됩니다.</div>
      </div>
    </PageShell>
  );
}
