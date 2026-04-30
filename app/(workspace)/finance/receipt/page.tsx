'use client';

import { useState, useMemo } from 'react';
import { PageShell } from '@/components/layout/page-shell';
import { FINANCE_SUBTABS, FINANCE_SUBTAB_PENDING } from '@/lib/finance-subtabs';
import { RECEIPT_SUBJECTS } from '@/lib/sample-finance';
import { useLedgerStore } from '@/lib/use-ledger-store';
import { useContractStore } from '@/lib/use-contract-store';
import { PERIODS, periodRange, isInRange, type Period } from '@/lib/period-filter';
import { exportToExcel } from '@/lib/excel-export';
import { cn } from '@/lib/cn';

/**
 * 수납내역 — 자금일보(=계좌내역)에서 입금 + 계정과목이 수납과목 (대여료/면책금/위약금/기타) 에 해당하는 row.
 */
export default function FinanceReceiptPage() {
  const [period, setPeriod] = useState<Period>('이번달');
  const [subjectFilter, setSubjectFilter] = useState<string>('전체');
  const [ledger] = useLedgerStore();
  const [contracts] = useContractStore();

  const contractMap = useMemo(() => new Map(contracts.map((c) => [c.contractNo, c])), [contracts]);

  const receipts = useMemo(() => {
    const range = periodRange(period);
    return ledger.filter((e) =>
      e.deposit && e.subject && (RECEIPT_SUBJECTS as readonly string[]).includes(e.subject) &&
      (subjectFilter === '전체' || e.subject === subjectFilter) &&
      isInRange(e.txDate, range),
    );
  }, [ledger, period, subjectFilter]);

  const totalIn = receipts.reduce((s, r) => s + (r.deposit ?? 0), 0);
  const bySubject: Record<string, number> = {};
  for (const r of receipts) {
    if (r.subject) bySubject[r.subject] = (bySubject[r.subject] ?? 0) + (r.deposit ?? 0);
  }

  return (
    <PageShell
      subTabs={FINANCE_SUBTABS}
      subTabPending={FINANCE_SUBTAB_PENDING}
      footerLeft={<>
        <div className="chip-group">
          {PERIODS.map((p) => (
            <button key={p} className={cn('chip', period === p && 'active')} onClick={() => setPeriod(p)}>{p}</button>
          ))}
        </div>
        <span className="stat-divider" />
        <div className="chip-group">
          <button className={cn('chip', subjectFilter === '전체' && 'active')} onClick={() => setSubjectFilter('전체')}>전체</button>
          {RECEIPT_SUBJECTS.map((s) => (
            <button key={s} className={cn('chip', subjectFilter === s && 'active')} onClick={() => setSubjectFilter(s)}>{s}</button>
          ))}
        </div>
        <span className="stat-divider" />
        <span className="stat-item">건수 <strong>{receipts.length}</strong></span>
        <span className="stat-item">합계 <strong>₩{totalIn.toLocaleString('ko-KR')}</strong></span>
      </>}
      footerRight={<>
        <button className="btn" onClick={() => exportToExcel({
          title: '수납내역',
          subtitle: `${period} · ${subjectFilter}`,
          columns: [
            { key: 'companyCode',     header: '회사코드', type: 'mono' },
            { key: 'plate',           header: '차량번호', type: 'mono' },
            { key: 'matchedContract', header: '계약번호', type: 'mono' },
            { key: 'customerName',    header: '고객명' },
            { key: 'subject',         header: '계정과목' },
            { key: 'txDate',          header: '수납일시', type: 'date' },
            { key: 'account',         header: '계좌', type: 'mono', width: 22 },
            { key: 'deposit',         header: '수납액', type: 'number' },
            { key: 'method',          header: '거래방법' },
            { key: 'memo',            header: '적요', width: 28 },
          ],
          rows: receipts.map((r) => {
            const c = r.matchedContract ? contractMap.get(r.matchedContract) : undefined;
            return {
              companyCode: r.companyCode,
              plate: c?.plate ?? '',
              matchedContract: r.matchedContract ?? '',
              customerName: c?.customerName ?? '',
              subject: r.subject ?? '',
              txDate: r.txDate,
              account: r.account,
              deposit: r.deposit ?? 0,
              method: r.method,
              memo: r.memo,
            };
          }),
        })}>엑셀</button>
        <button className="btn btn-primary">+ 수납 처리</button>
      </>}>
      <div className="table-wrap">
        <table className="table">
          <thead><tr>
            <th>회사코드</th><th>차량번호</th><th>계약번호</th><th>고객명</th>
            <th>계정과목</th><th className="date">수납일시</th><th>계좌</th>
            <th className="num">수납액</th><th>거래방법</th><th>적요</th>
          </tr></thead>
          <tbody>
            {receipts.length === 0 ? (
              <tr><td colSpan={10} className="center dim" style={{ padding: '24px 0' }}>해당 조건의 수납 데이터 없음</td></tr>
            ) : receipts.map((r) => {
              const c = r.matchedContract ? contractMap.get(r.matchedContract) : undefined;
              return (
                <tr key={r.id}>
                  <td className="plate">{r.companyCode}</td>
                  <td className="plate">{c?.plate ?? <span className="text-muted">-</span>}</td>
                  <td className="mono">{r.matchedContract ?? <span className="text-muted">-</span>}</td>
                  <td>{c?.customerName ?? <span className="text-muted">-</span>}</td>
                  <td><span className="badge">{r.subject}</span></td>
                  <td className="date mono">{r.txDate}</td>
                  <td className="mono dim">{r.account}</td>
                  <td className="num">{r.deposit?.toLocaleString('ko-KR')}</td>
                  <td className="dim">{r.method}</td>
                  <td>{r.memo}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </PageShell>
  );
}
