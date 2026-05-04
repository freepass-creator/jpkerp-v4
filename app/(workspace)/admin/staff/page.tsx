'use client';

import { Users } from '@phosphor-icons/react';
import { PageShell } from '@/components/layout/page-shell';
import { EmptyState } from '@/components/ui/empty-state';
import { ADMIN_SUBTABS } from '@/lib/admin-subtabs';

export default function AdminStaffPage() {
  const staff: unknown[] = [];
  return (
    <PageShell
      subTabs={ADMIN_SUBTABS}
      footerLeft={<span className="stat-item">직원 관리</span>}
      footerRight={<button className="btn btn-primary">+ 직원 등록</button>}
    >
      {staff.length === 0 ? (
        <EmptyState
          icon={Users}
          title="등록된 직원 없음"
          description="직원을 등록하면 근태·휴가·권한 관리가 시작됩니다."
          hint={<>① [+ 직원등록] 클릭 → 이름·연락처·역할 입력<br />② 권한 부여 (일반/관리자/대표)<br />③ 모바일 앱 초대 발송 → 계정 생성</>}
        />
      ) : (
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
            </tbody>
          </table>
        </div>
      )}
    </PageShell>
  );
}
