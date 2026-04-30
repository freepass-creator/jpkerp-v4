'use client';

import { useMemo } from 'react';
import { PageShell } from '@/components/layout/page-shell';
import { CONTRACT_SUBTABS } from '@/lib/contract-subtabs';
import { summarizeContract } from '@/lib/sample-contracts';
import { useContractStore } from '@/lib/use-contract-store';
import { useLedgerStore } from '@/lib/use-ledger-store';
import { exportToExcel } from '@/lib/excel-export';
import { cn } from '@/lib/cn';

/**
 * 미납 — 계약 × 회차 단위로 청구·수납 매칭하여 미수 row 표시.
 *
 * 데이터 흐름:
 *   계약스케줄 (회차별 청구) ←→ 자금일보 (입금 + 매칭계약)
 *   미수 = 청구액 − 매칭된 입금액
 */

type OverdueRow = {
  contractNo: string;
  companyCode: string;
  plate: string;
  customerName: string;
  cycle: number;
  dueDate: string;
  charged: number;
  paid: number;
  outstanding: number;
  daysOverdue: number;
};

export default function ContractOverduePage() {
  const [contracts] = useContractStore();
  const [ledger] = useLedgerStore();

  // 매 렌더마다 new Date() 만드는 걸 피하기 위해 useMemo로 고정
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // 자금일보에서 계약별 입금 합계 계산
  const paidByContract = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of ledger) {
      if (e.deposit && e.matchedContract && e.subject === '대여료') {
        m.set(e.matchedContract, (m.get(e.matchedContract) ?? 0) + e.deposit);
      }
    }
    return m;
  }, [ledger]);

  // 계약별 회차별 미수 계산 (수납 회차에 대해 가장 최근부터 내림차순으로 차감)
  const rows: OverdueRow[] = useMemo(() => {
    const out: OverdueRow[] = [];
    for (const c of contracts) {
      const summary = summarizeContract(c);
      const totalPaid = paidByContract.get(c.contractNo) ?? 0;
      const receiptEvents = c.events.filter((e) => e.type === '수납').sort((a, b) => a.dueDate.localeCompare(b.dueDate));

      // 청구 발생한 회차 = dueDate <= 오늘
      const charged = receiptEvents.filter((e) => new Date(e.dueDate) <= today);
      const totalCharged = charged.reduce((s, e) => s + (e.amount ?? 0), 0);
      let remaining = Math.max(0, totalCharged - totalPaid);

      // 가장 최근 회차부터 미수 분배 (A안: 최근부터 밀림)
      for (let i = charged.length - 1; i >= 0 && remaining > 0; i--) {
        const e = charged[i];
        const owed = Math.min(remaining, e.amount ?? 0);
        if (owed > 0) {
          const days = Math.floor((today.getTime() - new Date(e.dueDate).getTime()) / 86400000);
          out.push({
            contractNo: c.contractNo,
            companyCode: c.companyCode,
            plate: c.plate,
            customerName: c.customerName,
            cycle: e.cycle ?? 0,
            dueDate: e.dueDate,
            charged: e.amount ?? 0,
            paid: (e.amount ?? 0) - owed,
            outstanding: owed,
            daysOverdue: days,
          });
          remaining -= owed;
        }
      }
      void summary;
    }
    return out.sort((a, b) => b.daysOverdue - a.daysOverdue);
  }, [contracts, paidByContract, today]);

  const totalOutstanding = rows.reduce((s, r) => s + r.outstanding, 0);
  const contractsWithOverdue = new Set(rows.map((r) => r.contractNo)).size;

  return (
    <PageShell
      subTabs={CONTRACT_SUBTABS}
     
      footerLeft={
        <>
          <span className="stat-item">미수 회차 <strong>{rows.length}</strong></span>
          <span className="stat-item">미수 계약 <strong>{contractsWithOverdue}</strong></span>
          <span className="stat-item alert">미수 합계 <strong>₩{totalOutstanding.toLocaleString('ko-KR')}</strong></span>
        </>
      }
      footerRight={
        <>
          <button className="btn" onClick={() => exportToExcel({
            title: '미납내역',
            subtitle: `기준일 ${new Date().toLocaleDateString('ko-KR')}`,
            columns: [
              { key: 'companyCode',  header: '회사코드', type: 'mono' },
              { key: 'plate',        header: '차량번호', type: 'mono' },
              { key: 'contractNo',   header: '계약번호', type: 'mono' },
              { key: 'customerName', header: '고객명' },
              { key: 'cycle',        header: '회차', type: 'number' },
              { key: 'dueDate',      header: '청구일', type: 'date' },
              { key: 'charged',      header: '청구액', type: 'number' },
              { key: 'paid',         header: '수납액', type: 'number' },
              { key: 'outstanding',  header: '미수액', type: 'number' },
              { key: 'daysOverdue',  header: '연체일수', type: 'number' },
            ],
            rows: rows as unknown as Record<string, unknown>[],
          })}>엑셀</button>
          <button className="btn btn-primary">+ 수납 입력</button>
        </>
      }
    >
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>회사코드</th>
              <th>차량번호</th>
              <th>계약번호</th>
              <th>고객명</th>
              <th className="num">회차</th>
              <th className="date">청구일</th>
              <th className="num">청구액</th>
              <th className="num">수납액</th>
              <th className="num">미수액</th>
              <th className="num">연체일수</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="empty-row">
                  미수 없음 — 모든 계약 회차 정상 수납
                </td>
              </tr>
            ) : (
              rows.map((r, i) => (
                <tr key={`${r.contractNo}-${r.cycle}-${i}`}>
                  <td className="plate">{r.companyCode}</td>
                  <td className="plate">{r.plate}</td>
                  <td className="mono">{r.contractNo}</td>
                  <td>{r.customerName}</td>
                  <td className="num">{r.cycle}</td>
                  <td className="date">{r.dueDate}</td>
                  <td className="num">{r.charged.toLocaleString('ko-KR')}</td>
                  <td className="num dim">{r.paid > 0 ? r.paid.toLocaleString('ko-KR') : ''}</td>
                  <td className={cn('num', r.daysOverdue >= 30 ? 'overdue' : 'due-soon')}>{r.outstanding.toLocaleString('ko-KR')}</td>
                  <td className={cn('num', r.daysOverdue >= 30 ? 'overdue' : '')}>{r.daysOverdue}일</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </PageShell>
  );
}
