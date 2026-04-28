'use client';

import { PageShell } from '@/components/layout/page-shell';
import { ADMIN_SUBTABS } from '@/lib/admin-subtabs';

export default function AdminAttendancePage() {
  return (
    <PageShell
      subTabs={ADMIN_SUBTABS}
      footerLeft={<span className="stat-item">근태 관리</span>}
      footerRight={<button className="btn btn-primary">+ 출근 기록</button>}
    >
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
            <tr>
              <td colSpan={9} className="center dim" style={{ padding: '24px 0' }}>
                근태 데이터 없음
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </PageShell>
  );
}
