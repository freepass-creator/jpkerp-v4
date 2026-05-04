'use client';

import { Clock } from '@phosphor-icons/react';
import { PageShell } from '@/components/layout/page-shell';
import { EmptyState } from '@/components/ui/empty-state';
import { ADMIN_SUBTABS } from '@/lib/admin-subtabs';

export default function AdminAttendancePage() {
  const records: unknown[] = [];
  return (
    <PageShell
      subTabs={ADMIN_SUBTABS}
      footerLeft={<span className="stat-item">근태 관리</span>}
      footerRight={<button className="btn btn-primary">+ 출근 기록</button>}
    >
      {records.length === 0 ? (
        <EmptyState
          icon={Clock}
          title="근태 기록 없음"
          description="출퇴근 데이터가 아직 없습니다."
          hint={<>① 직원관리에서 직원 등록 → 모바일 앱 초대<br />② 출퇴근 시각 자동 기록<br />③ 월별 누적·휴가 차감 자동 계산</>}
        />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>회사코드</th>
                <th>사번</th>
                <th>성명</th>
                <th className="date">날짜</th>
                <th>출근</th>
                <th>퇴근</th>
                <th>근무시간</th>
                <th>구분</th>
                <th>비고</th>
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
