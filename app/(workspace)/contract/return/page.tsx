'use client';

import { ArrowSquareOut } from '@phosphor-icons/react';
import { PageShell } from '@/components/layout/page-shell';
import { EmptyState } from '@/components/ui/empty-state';
import { CONTRACT_SUBTABS } from '@/lib/contract-subtabs';

export default function ContractReturnPage() {
  const returns: unknown[] = [];
  return (
    <PageShell
      subTabs={CONTRACT_SUBTABS}

      footerLeft={<span className="stat-item">반납예정 <strong>0</strong></span>}
      footerRight={<button className="btn btn-primary">+ 반납 처리</button>}
    >
      {returns.length === 0 ? (
        <EmptyState
          icon={ArrowSquareOut}
          title="반납 예정 계약 없음"
          description="예정된 반납 일정이 없습니다."
          hint={<>① 계약 만기일에 반납 이벤트 자동 생성<br />② 반납완료 처리 시 계약 만기 + 자산 대기</>}
        />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>회사코드</th>
                <th>계약번호</th>
                <th>차량번호</th>
                <th>고객명</th>
                <th className="date">반납 예정일</th>
                <th className="center">D-day</th>
                <th>반납 장소</th>
                <th className="center">상태</th>
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
