'use client';

import { useMemo } from 'react';
import { PageShell } from '@/components/layout/page-shell';
import { CONTRACT_SUBTABS, CONTRACT_SUBTAB_PENDING } from '@/lib/contract-subtabs';
import { type ContractStatus } from '@/lib/sample-contracts';
import { useContractStore } from '@/lib/use-contract-store';
import { cn } from '@/lib/cn';

/**
 * 종료계약 — 상태가 '만기' 또는 '해지' 인 계약 관리.
 * 진행 계약은 /contract 에서, 곧 만기는 /contract/expire 에서 다룸.
 */

const ENDED_STATUSES: ContractStatus[] = ['만기', '해지'];

export default function ContractEndedPage() {
  const [contracts] = useContractStore();
  const ended = useMemo(
    () => contracts.filter((c) => ENDED_STATUSES.includes(c.status))
      .sort((a, b) => (b.endDate ?? '').localeCompare(a.endDate ?? '')),
    [contracts],
  );

  const expiredCount = ended.filter((c) => c.status === '만기').length;
  const cancelledCount = ended.filter((c) => c.status === '해지').length;

  return (
    <PageShell
      subTabs={CONTRACT_SUBTABS}
      subTabPending={CONTRACT_SUBTAB_PENDING}
      footerLeft={
        <>
          <span className="stat-item">전체 <strong>{ended.length}</strong></span>
          <span className="stat-divider" />
          <span className="stat-item">만기 <strong>{expiredCount}</strong></span>
          <span className="stat-item">해지 <strong>{cancelledCount}</strong></span>
        </>
      }
      footerRight={<button className="btn">엑셀</button>}
    >
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>회사코드</th>
              <th>차량번호</th>
              <th>계약번호</th>
              <th>고객명</th>
              <th>고객 신분</th>
              <th>고객 연락처</th>
              <th className="date">시작일</th>
              <th className="date">종료일</th>
              <th className="num">월 청구액</th>
              <th className="center">상태</th>
            </tr>
          </thead>
          <tbody>
            {ended.length === 0 ? (
              <tr>
                <td colSpan={10} className="center dim" style={{ padding: '24px 0' }}>
                  종료된 계약 없음
                </td>
              </tr>
            ) : (
              ended.map((c) => (
                <tr key={c.id}>
                  <td className="plate">{c.companyCode}</td>
                  <td className="plate">{c.plate}</td>
                  <td className="mono text-medium">{c.contractNo}</td>
                  <td>{c.customerName}</td>
                  <td className="dim">{c.customerKind ?? '-'}</td>
                  <td className="mono dim">{c.customerPhone ?? '-'}</td>
                  <td className="date">{c.startDate}</td>
                  <td className="date">{c.endDate}</td>
                  <td className="num">{(c.monthlyAmount ?? 0).toLocaleString('ko-KR')}</td>
                  <td className="center">
                    <span className={cn('badge', c.status === '만기' ? 'badge-orange' : 'badge-red')}>
                      {c.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </PageShell>
  );
}
