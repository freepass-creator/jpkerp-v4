'use client';

import { Shield } from '@phosphor-icons/react';
import { PageShell } from '@/components/layout/page-shell';
import { PENDING_SUBTABS, usePendingSubtabPending } from '@/lib/pending-subtabs';

/** 보험 — 보험 만기 임박. 보험 store 추가 후 실데이터 연결 예정. */
export default function PendingInsurancePage() {
  const subTabPending = usePendingSubtabPending();
  return (
    <PageShell subTabs={PENDING_SUBTABS} subTabPending={subTabPending}>
      <div className="page-section-center">
        <Shield size={32} className="mx-auto text-weak" />
        <div className="mt-2 text-medium">보험 만기 — 데이터 연결 전</div>
        <div className="mt-1 text-weak">자산관리 → 보험내역 store 정식 연결 후 자동 표시됩니다.</div>
      </div>
    </PageShell>
  );
}
