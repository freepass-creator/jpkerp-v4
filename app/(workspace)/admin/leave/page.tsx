'use client';

import { AirplaneTilt } from '@phosphor-icons/react';
import { PageShell } from '@/components/layout/page-shell';
import { EmptyState } from '@/components/ui/empty-state';
import { ADMIN_SUBTABS } from '@/lib/admin-subtabs';

export default function AdminLeavePage() {
  const records: unknown[] = [];
  return (
    <PageShell
      subTabs={ADMIN_SUBTABS}
      footerLeft={<span className="stat-item">휴가 관리</span>}
      footerRight={<button className="btn btn-primary">+ 휴가 신청</button>}
    >
      {records.length === 0 ? (
        <EmptyState
          icon={AirplaneTilt}
          title="휴가 신청 없음"
          description="직원 휴가 신청·승인 기록이 없습니다."
          hint={<>① 직원이 모바일 앱에서 휴가 신청<br />② 관리자가 승인/반려 처리<br />③ 잔여 일수 자동 차감</>}
        />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>회사코드</th>
                <th>사번</th>
                <th>성명</th>
                <th>휴가종류</th>
                <th className="date">시작일</th>
                <th className="date">종료일</th>
                <th className="num">일수</th>
                <th>사유</th>
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
