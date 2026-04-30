'use client';

import { useMemo } from 'react';
import { CurrencyKrw } from '@phosphor-icons/react';
import { PageShell } from '@/components/layout/page-shell';
import { PENDING_SUBTABS, usePendingSubtabPending } from '@/lib/pending-subtabs';
import { useContractStore } from '@/lib/use-contract-store';
import { collectOverdue } from '@/lib/pending-aggregators';

/** 미납현황 — 계약 단위 미납 회차 집계. */
export default function OverduePage() {
  const [contracts] = useContractStore();
  const subTabPending = usePendingSubtabPending();
  const rows = useMemo(() => collectOverdue(contracts), [contracts]);
  const totalAmount = useMemo(() => rows.reduce((s, r) => s + r.totalAmount, 0), [rows]);
  const totalCycles = useMemo(() => rows.reduce((s, r) => s + r.unpaidCycles, 0), [rows]);

  return (
    <PageShell
      subTabs={PENDING_SUBTABS}
      subTabPending={subTabPending}
      footerLeft={
        <>
          <span className="stat-item">미납 계약 <strong>{rows.length}</strong></span>
          {totalCycles > 0 && <span className="stat-item">미납 회차 <strong>{totalCycles}</strong></span>}
          {totalAmount > 0 && <span className="stat-item alert">미납 합계 <strong>{totalAmount.toLocaleString('ko-KR')}원</strong></span>}
        </>
      }
    >
      {rows.length === 0 ? (
        <div className="page-section-center">
          <CurrencyKrw size={32} className="mx-auto text-weak" />
          <div className="mt-2 text-medium">미납 없음</div>
          <div className="mt-1 text-weak">모든 계약의 만기 도래 회차가 납부 완료 상태입니다.</div>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>회사</th>
                <th>계약번호</th>
                <th>차량</th>
                <th>임차인</th>
                <th>연락처</th>
                <th className="num">미납 회차</th>
                <th className="num">미납 금액</th>
                <th className="num">최장 연체</th>
                <th className="date">최오래된 만기일</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.contractId}>
                  <td className="plate">{r.companyCode}</td>
                  <td className="mono text-medium">{r.contractNo}</td>
                  <td className="plate">{r.plate}</td>
                  <td>{r.customerName}</td>
                  <td className="mono dim">{r.customerPhone || '-'}</td>
                  <td className="num text-red"><strong>{r.unpaidCycles}</strong></td>
                  <td className="num text-red">{r.totalAmount.toLocaleString('ko-KR')}</td>
                  <td className="num text-red">{r.longestOverdueDays}일</td>
                  <td className="date dim">{r.oldestDueDate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageShell>
  );
}
