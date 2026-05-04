'use client';

import { CreditCard } from '@phosphor-icons/react';
import { PageShell } from '@/components/layout/page-shell';
import { PENDING_SUBTABS, usePendingSubtabPending } from '@/lib/pending-subtabs';
import { EmptyState } from '@/components/ui/empty-state';

/** 할부 — 할부 만기·미납. 할부 store 추가 후 실데이터 연결 예정. */
export default function PendingLoanPage() {
  const subTabPending = usePendingSubtabPending();
  return (
    <PageShell subTabs={PENDING_SUBTABS} subTabPending={subTabPending}>
      <EmptyState
        icon={CreditCard}
        title="할부 — 데이터 연결 전"
        description="자산관리 → 할부스케줄 store 정식 연결 후 자동 표시됩니다."
        hint={<>자산 매입을 할부로 한 경우, 매월 할부금 납부 일정 자동 추적. 현재는 데이터 모델만 정의되어 있고 입력 흐름 미구현.</>}
      />
    </PageShell>
  );
}
