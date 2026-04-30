'use client';

import { PageShell } from '@/components/layout/page-shell';
import { CONTRACT_SUBTABS } from '@/lib/contract-subtabs';

export default function ContractExpirePage() {
  return (
    <PageShell
      subTabs={CONTRACT_SUBTABS}
     
      footerLeft={<span className="stat-item">만기도래 <strong>0</strong></span>}
      footerRight={<button className="btn btn-primary">+ 연장 처리</button>}
    >
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>회사코드</th>
              <th>계약번호</th>
              <th>차량번호</th>
              <th>고객명</th>
              <th className="date">만기일</th>
              <th className="center">D-day</th>
              <th>연장 의사</th>
              <th className="center">상태</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={8} className="center dim" style={{ padding: '24px 0' }}>
                만기 도래 계약 없음
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </PageShell>
  );
}
