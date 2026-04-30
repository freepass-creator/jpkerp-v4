'use client';

import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, CalendarBlank } from '@phosphor-icons/react';
import { PageShell } from '@/components/layout/page-shell';
import { CONTRACT_SUBTABS, CONTRACT_SUBTAB_PENDING } from '@/lib/contract-subtabs';
import { summarizeContract, type ScheduleEvent } from '@/lib/sample-contracts';
import { useContractStore } from '@/lib/use-contract-store';
import { cn } from '@/lib/cn';

export default function ContractScheduleDetailPage() {
  const router = useRouter();
  const params = useParams();
  const contractId = params?.contractId as string | undefined;
  const [contracts] = useContractStore();

  const contract = contracts.find((c) => c.contractNo === contractId);

  if (!contract) {
    return (
      <PageShell subTabs={CONTRACT_SUBTABS} subTabPending={CONTRACT_SUBTAB_PENDING}>
        <div className="workspace-main flex items-center justify-center">
          <div className="text-center">
            <div className="text-medium">계약을 찾을 수 없습니다</div>
            <div className="text-weak mt-1">{contractId}</div>
            <button className="btn mt-3" onClick={() => router.push('/contract/schedule')}>
              <ArrowLeft size={12} weight="bold" /> 목록으로
            </button>
          </div>
        </div>
      </PageShell>
    );
  }

  const summary = summarizeContract(contract);
  const sortedEvents = [...contract.events].sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  return (
    <PageShell
      subTabs={CONTRACT_SUBTABS}
      subTabPending={CONTRACT_SUBTAB_PENDING}
      footerLeft={
        <>
          <span className="stat-item">{contract.companyCode} <strong>{contract.contractNo}</strong></span>
          <span className="stat-divider" />
          <span className="stat-item">전체 <strong>{summary.totalEvents}</strong></span>
          <span className="stat-item">완료 <strong>{summary.doneEvents}</strong></span>
          <span className="stat-item">예정 <strong>{summary.pendingEvents}</strong></span>
          {summary.delayedEvents > 0 && (
            <span className="stat-item alert">지연 <strong>{summary.delayedEvents}</strong></span>
          )}
          {summary.receiptOverdue > 0 && (
            <span className="stat-item alert">미수 <strong>{summary.receiptOverdue}</strong></span>
          )}
        </>
      }
      footerRight={
        <>
          <button className="btn" onClick={() => router.push('/contract/schedule')}>
            <ArrowLeft size={14} weight="bold" /> 목록
          </button>
          <button className="btn">
            <CalendarBlank size={14} weight="bold" /> 일정 추가
          </button>
        </>
      }
    >
      {/* 계약 요약 헤더 */}
      <div className="contract-detail-head">
        <div>
          <span className="text-weak">계약번호</span>
          <span className="mono text-medium ml-2">{contract.contractNo}</span>
        </div>
        <div>
          <span className="text-weak">차량</span>
          <span className="plate text-medium ml-2">{contract.plate}</span>
        </div>
        <div>
          <span className="text-weak">고객</span>
          <span className="ml-2">{contract.customerName} <span className="text-weak">· {contract.customerKind}</span></span>
        </div>
        <div>
          <span className="text-weak">기간</span>
          <span className="ml-2">{contract.startDate} ~ {contract.endDate}</span>
        </div>
        <div>
          <span className="text-weak">월 청구</span>
          <span className="mono ml-2">{contract.monthlyAmount.toLocaleString('ko-KR')}원</span>
        </div>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th className="center">구분</th>
              <th className="num">회차</th>
              <th className="date">예정일</th>
              <th className="center">D-day</th>
              <th className="date">실시일</th>
              <th className="num">금액</th>
              <th className="center">상태</th>
              <th>비고</th>
            </tr>
          </thead>
          <tbody>
            {sortedEvents.map((e) => (
              <ScheduleRow key={e.id} event={e} />
            ))}
          </tbody>
        </table>
      </div>
    </PageShell>
  );
}

function ScheduleRow({ event: e }: { event: ScheduleEvent }) {
  const dday = computeDday(e.dueDate);
  const ddayCls = e.status === '완료' ? '' : ddayCellClass(dday);
  const typeCls = `type-${e.type}`;
  return (
    <tr>
      <td className="center"><span className={cn('badge', typeCls)}>{e.type}</span></td>
      <td className="num">{e.cycle ?? '-'}</td>
      <td className="date">{e.dueDate}</td>
      <td className={cn('center', ddayCls)}>{e.status === '완료' ? '-' : formatDday(dday)}</td>
      <td className="date">{e.doneDate ?? ''}</td>
      <td className="num">{e.amount ? e.amount.toLocaleString('ko-KR') : ''}</td>
      <td className="center"><StatusBadge status={e.status} /></td>
      <td className="dim">{e.note ?? ''}</td>
    </tr>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === '완료' ? 'badge-green' :
    status === '지연' ? 'badge-red' :
    status === '취소' ? 'badge' :
    'badge-blue';
  return <span className={cn('badge', cls)}>{status}</span>;
}

function computeDday(dueDate: string): number | null {
  if (!dueDate) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  if (isNaN(due.getTime())) return null;
  return Math.floor((due.getTime() - now.getTime()) / 86400000);
}

function formatDday(d: number | null): string {
  if (d === null) return '-';
  if (d === 0) return 'D-day';
  if (d > 0) return `D-${d}`;
  return `D+${-d}`;
}

function ddayCellClass(d: number | null): string {
  if (d === null) return '';
  if (d < 30) return 'overdue';
  if (d < 90) return 'due-soon';
  return '';
}
