'use client';

import { PageShell } from '@/components/layout/page-shell';
import { ADMIN_SUBTABS } from '@/lib/admin-subtabs';

export default function AdminLeavePage() {
  return (
    <PageShell
      subTabs={ADMIN_SUBTABS}
      footerLeft={<span className="stat-item">휴가 관리</span>}
      footerRight={<button className="btn btn-primary">+ 휴가 신청</button>}
    >
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
            <tr>
              <td colSpan={9} className="empty-row">
                휴가 신청 데이터 없음
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </PageShell>
  );
}
