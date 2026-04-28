'use client';

import { PageShell } from '@/components/layout/page-shell';
import { ADMIN_SUBTABS } from '@/lib/admin-subtabs';

export default function AdminStaffPage() {
  return (
    <PageShell
      subTabs={ADMIN_SUBTABS}
      footerLeft={<span className="stat-item">직원 관리</span>}
      footerRight={<button className="btn btn-primary">+ 직원 등록</button>}
    >
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>회사코드</th>
              <th>사번</th>
              <th>성명</th>
              <th>부서</th>
              <th>직급</th>
              <th>이메일</th>
              <th>연락처</th>
              <th className="date">입사일</th>
              <th className="center">상태</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={9} className="center dim" style={{ padding: '24px 0' }}>
                직원 데이터 없음
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </PageShell>
  );
}
