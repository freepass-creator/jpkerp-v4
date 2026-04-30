'use client';

import { useRouter } from 'next/navigation';
import { CaretRight } from '@phosphor-icons/react';
import { PageShell } from '@/components/layout/page-shell';
import { CONTRACT_SUBTABS } from '@/lib/contract-subtabs';
import { summarizeContract } from '@/lib/sample-contracts';
import { useContractStore } from '@/lib/use-contract-store';
import { cn } from '@/lib/cn';

/**
 * 계약스케줄 — Master view.
 * 계약별 1 row + 이행 요약 (수납·검사·정비 등).
 * 행 클릭 → /contract/schedule/[contractId] 상세 페이지로 이동.
 */
export default function ContractScheduleMasterPage() {
  const router = useRouter();
  const [contracts] = useContractStore();
  const summaries = contracts.map(summarizeContract);

  const totals = summaries.reduce(
    (acc, s) => {
      acc.contracts++;
      acc.events += s.totalEvents;
      acc.done += s.doneEvents;
      acc.pending += s.pendingEvents;
      acc.delayed += s.delayedEvents;
      acc.overdue += s.receiptOverdue;
      return acc;
    },
    { contracts: 0, events: 0, done: 0, pending: 0, delayed: 0, overdue: 0 },
  );

  return (
    <PageShell
      subTabs={CONTRACT_SUBTABS}
     
      footerLeft={
        <>
          <span className="stat-item">계약 <strong>{totals.contracts}</strong></span>
          <span className="stat-item">전체 일정 <strong>{totals.events}</strong></span>
          <span className="stat-item">완료 <strong>{totals.done}</strong></span>
          <span className="stat-item">예정 <strong>{totals.pending}</strong></span>
          {totals.delayed > 0 && <span className="stat-item alert">지연 <strong>{totals.delayed}</strong></span>}
          {totals.overdue > 0 && <span className="stat-item alert">미수 <strong>{totals.overdue}</strong></span>}
        </>
      }
      footerRight={<button className="btn">엑셀</button>}
    >
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>회사코드</th>
              <th>계약번호</th>
              <th>차량번호</th>
              <th>고객명</th>
              <th className="date">시작</th>
              <th className="date">만기</th>
              <th className="num">진행</th>
              <th className="center">수납</th>
              <th className="center">검사</th>
              <th className="center">정비</th>
              <th>다음 일정</th>
              <th className="center">상태</th>
              <th className="center" style={{ width: 30 }}></th>
            </tr>
          </thead>
          <tbody>
            {summaries.map((s) => {
              const c = s.contract;
              return (
                <tr
                  key={c.id}
                  onClick={() => router.push(`/contract/schedule/${c.contractNo}`)}
                >
                  <td className="plate">{c.companyCode}</td>
                  <td className="mono text-medium">{c.contractNo}</td>
                  <td className="plate">{c.plate}</td>
                  <td>{c.customerName}</td>
                  <td className="date">{c.startDate}</td>
                  <td className="date">{c.endDate}</td>
                  <td className="num">
                    <ProgressBar done={s.doneEvents} total={s.totalEvents} />
                  </td>
                  <td className="center">
                    <ReceiptBadge done={s.receiptDone} total={s.receiptTotal} overdue={s.receiptOverdue} />
                  </td>
                  <td className="center"><Mark ok={s.inspectionDone} /></td>
                  <td className="center"><MaintMark done={s.maintenanceDone} total={s.maintenanceTotal} /></td>
                  <td className="dim">
                    {s.nextEvent ? `${s.nextEvent.dueDate} · ${s.nextEvent.type}` : '-'}
                  </td>
                  <td className="center"><StatusBadge status={c.status} /></td>
                  <td className="center text-weak"><CaretRight size={11} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </PageShell>
  );
}

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
      <span className="mono dim" style={{ fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>
      <span style={{ width: 50, height: 4, background: 'var(--bg-stripe)' }}>
        <span style={{ display: 'block', width: `${pct}%`, height: '100%', background: 'var(--brand)' }} />
      </span>
    </span>
  );
}

function ReceiptBadge({ done, total, overdue }: { done: number; total: number; overdue: number }) {
  if (total === 0) return <span className="text-muted">·</span>;
  const cls = overdue > 0 ? 'badge-red' : done === total ? 'badge-green' : 'badge';
  const text = overdue > 0 ? `${done}/${total} ⚠${overdue}` : `${done}/${total}`;
  return <span className={cn('badge', cls)}>{text}</span>;
}

function Mark({ ok }: { ok: boolean }) {
  return (
    <span style={{ color: ok ? 'var(--alert-green-text)' : 'var(--text-muted)' }}>
      {ok ? '✓' : '·'}
    </span>
  );
}

function MaintMark({ done, total }: { done: number; total: number }) {
  if (total === 0) return <span className="text-muted">·</span>;
  if (done === total) return <span style={{ color: 'var(--alert-green-text)' }}>✓ {done}/{total}</span>;
  if (done === 0) return <span className="text-weak">✗ 0/{total}</span>;
  return <span style={{ color: 'var(--alert-orange-text)' }}>△ {done}/{total}</span>;
}

function StatusBadge({ status }: { status: string }) {
  const cls = status === '운행중' ? 'badge-green' : status === '만기' ? 'badge-orange' : 'badge';
  return <span className={cn('badge', cls)}>{status}</span>;
}
