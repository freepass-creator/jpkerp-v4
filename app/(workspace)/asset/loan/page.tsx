'use client';

import { CreditCard } from '@phosphor-icons/react';
import { PageShell } from '@/components/layout/page-shell';
import { EmptyState } from '@/components/ui/empty-state';
import { ASSET_SUBTABS, useAssetSubtabPending } from '@/lib/asset-subtabs';

export default function AssetLoanPage() {
  const subTabPending = useAssetSubtabPending();
  const loans: unknown[] = [];
  return (
    <PageShell
      subTabs={ASSET_SUBTABS}
      subTabPending={subTabPending}
      footerLeft={<span className="stat">전체 <strong>0</strong></span>}
      footerRight={<button className="btn btn-primary">+ 할부 등록</button>}
    >
      {loans.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="할부스케줄 없음"
          description="차량 할부스케줄표를 OCR로 업로드하세요."
          hint={<>① [+ 할부등록] 클릭 → 스케줄표 PDF 업로드 → OCR 분석<br />② 회차별 납부일·금액 자동 추출<br />③ 만기·미납 자동 추적</>}
        />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>회사코드</th>
                <th>차량번호</th>
                <th>할부사</th>
                <th className="date">시작일</th>
                <th className="num">잔여회차</th>
                <th className="num">월납</th>
                <th className="num">잔여원금</th>
              </tr>
            </thead>
            <tbody>
            </tbody>
          </table>
        </div>
      )}
    </PageShell>
  );
}
