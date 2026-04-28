'use client';

import { useState, useMemo } from 'react';
import { PageShell } from '@/components/layout/page-shell';
import { FINANCE_SUBTABS, FINANCE_SUBTAB_PENDING } from '@/lib/finance-subtabs';
import { SAMPLE_LEDGER } from '@/lib/sample-finance';
import { PERIODS, periodRange, isInRange, type Period } from '@/lib/period-filter';
import { exportToExcel } from '@/lib/excel-export';
import { cn } from '@/lib/cn';

/**
 * 자금일보 — 계좌내역(자동이체·카드 포함) 일자별 집계 view.
 * 세무사 공유용 — 엑셀 다운로드 정형화.
 */
export default function FinanceDailyPage() {
  const [period, setPeriod] = useState<Period>('이번달');

  const filtered = useMemo(() => {
    const range = periodRange(period);
    return SAMPLE_LEDGER.filter((e) => isInRange(e.txDate, range));
  }, [period]);

  // 일자별 집계 (회사코드별로도 분리)
  const daily = useMemo(() => {
    const m = new Map<string, {
      key: string; companyCode: string; date: string;
      deposit: number; withdraw: number; netChange: number; endBalance: number;
      depositSubjects: Record<string, number>;
      withdrawSubjects: Record<string, number>;
      txCount: number;
    }>();
    for (const e of filtered) {
      const day = e.txDate.slice(0, 10);
      const k = `${e.companyCode}|${day}`;
      const cur = m.get(k) ?? {
        key: k, companyCode: e.companyCode, date: day,
        deposit: 0, withdraw: 0, netChange: 0, endBalance: 0,
        depositSubjects: {}, withdrawSubjects: {}, txCount: 0,
      };
      cur.deposit += e.deposit ?? 0;
      cur.withdraw += e.withdraw ?? 0;
      cur.netChange = cur.deposit - cur.withdraw;
      cur.endBalance = e.balance; // 마지막으로 본 잔액 — 단순화
      if (e.subject && e.deposit) cur.depositSubjects[e.subject] = (cur.depositSubjects[e.subject] ?? 0) + (e.deposit ?? 0);
      if (e.subject && e.withdraw) cur.withdrawSubjects[e.subject] = (cur.withdrawSubjects[e.subject] ?? 0) + (e.withdraw ?? 0);
      cur.txCount++;
      m.set(k, cur);
    }
    return Array.from(m.values()).sort((a, b) => b.date.localeCompare(a.date) || a.companyCode.localeCompare(b.companyCode));
  }, [filtered]);

  const totalIn = daily.reduce((s, d) => s + d.deposit, 0);
  const totalOut = daily.reduce((s, d) => s + d.withdraw, 0);

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
        <span className="stat-item">일자 <strong>{daily.length}</strong></span>
        <span className="stat-item">거래 <strong>{filtered.length}</strong></span>
        <span className="stat-item">입금 합계 <strong>₩{totalIn.toLocaleString('ko-KR')}</strong></span>
        <span className="stat-item">출금 합계 <strong>₩{totalOut.toLocaleString('ko-KR')}</strong></span>
      </>}
      footerRight={<>
        <button className="btn" onClick={() => exportToExcel({
          title: '자금일보',
          subtitle: `${period} · 기준일 ${new Date().toLocaleDateString('ko-KR')}`,
          columns: [
            { key: 'companyCode', header: '회사코드', type: 'mono' },
            { key: 'date',        header: '일자', type: 'date' },
            { key: 'txCount',     header: '거래건수', type: 'number' },
            { key: 'deposit',     header: '입금합계', type: 'number' },
            { key: 'withdraw',    header: '출금합계', type: 'number' },
            { key: 'netChange',   header: '순증감', type: 'number' },
            { key: 'endBalance',  header: '잔액', type: 'number' },
            { key: 'depositMemo', header: '주요 입금 (계정과목)', width: 36, getter: (r) => formatSubjects(r.depositSubjects as Record<string, number>) },
            { key: 'withdrawMemo', header: '주요 출금 (계정과목)', width: 36, getter: (r) => formatSubjects(r.withdrawSubjects as Record<string, number>) },
          ],
          rows: daily as unknown as Record<string, unknown>[],
          fileName: `자금일보-${period}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.xlsx`,
        })}>엑셀 (세무사 공유용)</button>
      </>}>
      <div className="table-wrap">
        <table className="table">
          <thead><tr>
            <th>회사코드</th>
            <th className="date">일자</th>
            <th className="num">거래건수</th>
            <th className="num">입금합계</th>
            <th className="num">출금합계</th>
            <th className="num">순증감</th>
            <th className="num">잔액</th>
            <th>주요 입금 (계정과목별)</th>
            <th>주요 출금 (계정과목별)</th>
          </tr></thead>
          <tbody>
            {daily.length === 0 ? (
              <tr><td colSpan={9} className="center dim" style={{ padding: '24px 0' }}>해당 기간 데이터 없음</td></tr>
            ) : daily.map((d) => (
              <tr key={d.key}>
                <td className="plate">{d.companyCode}</td>
                <td className="date mono">{d.date}</td>
                <td className="num">{d.txCount}</td>
                <td className="num">{d.deposit.toLocaleString('ko-KR')}</td>
                <td className="num">{d.withdraw.toLocaleString('ko-KR')}</td>
                <td className={cn('num', d.netChange < 0 && 'overdue')}>
                  {d.netChange >= 0 ? '+' : ''}{d.netChange.toLocaleString('ko-KR')}
                </td>
                <td className="num">{d.endBalance.toLocaleString('ko-KR')}</td>
                <td className="dim">{formatSubjects(d.depositSubjects) || <span className="text-muted">-</span>}</td>
                <td className="dim">{formatSubjects(d.withdrawSubjects) || <span className="text-muted">-</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageShell>
  );
}

function formatSubjects(subjects: Record<string, number>): string {
  return Object.entries(subjects).map(([s, v]) => `${s} ₩${v.toLocaleString('ko-KR')}`).join(' / ');
}
