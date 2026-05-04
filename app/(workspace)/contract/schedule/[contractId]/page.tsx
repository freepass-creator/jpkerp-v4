'use client';

import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, CalendarBlank, CheckCircle, ArrowCounterClockwise } from '@phosphor-icons/react';
import { PageShell } from '@/components/layout/page-shell';
import { CONTRACT_SUBTABS } from '@/lib/contract-subtabs';
import { summarizeContract, type ScheduleEvent, type Contract } from '@/lib/sample-contracts';
import { useContractStore } from '@/lib/use-contract-store';
import { useAssetStore } from '@/lib/use-asset-store';
import { cn } from '@/lib/cn';

/**
 * 계약스케줄 상세 — 회차별 출고/수납/반납/검사 등 events 관리.
 *
 * 행동:
 *  · 행 클릭 → 완료 ↔ 예정 토글 (doneDate = today)
 *  · 일괄 처리 — '오늘까지 도래' 만 일괄 완료
 *  · 수납 회차 완료 = 미수에서 빠짐, 수납내역에 보임
 */
export default function ContractScheduleDetailPage() {
  const router = useRouter();
  const params = useParams();
  const contractId = params?.contractId as string | undefined;
  const [contracts, setContracts] = useContractStore();
  const [, setAssets] = useAssetStore();

  const contract = contracts.find((c) => c.contractNo === contractId);

  if (!contract) {
    return (
      <PageShell subTabs={CONTRACT_SUBTABS}>
        <div className="page-section-center">
          <div className="text-medium">계약을 찾을 수 없습니다</div>
          <div className="text-weak mt-1">{contractId}</div>
          <button className="btn mt-3" onClick={() => router.push('/contract/schedule')}>
            <ArrowLeft size={12} weight="bold" /> 목록으로
          </button>
        </div>
      </PageShell>
    );
  }

  const summary = summarizeContract(contract);
  const sortedEvents = [...contract.events].sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  // contract 가 정해진 시점 — 아래 toggleEvent 클로저에서 안전하게 참조
  const targetPlate = contract.plate;
  const targetEvents = contract.events;

  /**
   * 단일 event 토글 — 예정 ↔ 완료.
   * Cascade:
   *  · 출고 완료 → 매칭 자산 status: '대기'/'등록예정' → '운행중'
   *  · 반납 완료 → 계약 status → '만기' + 자산 status → '대기'
   *  · 위 둘 다 토글 취소(완료→예정) 시 역방향 복원
   */
  function toggleEvent(eventId: string) {
    const target = targetEvents.find((e) => e.id === eventId);
    if (!target) return;
    const willComplete = target.status !== '완료';
    const today = new Date().toISOString().slice(0, 10);

    setContracts((prev) => prev.map((c) => {
      if (c.contractNo !== contractId) return c;
      let nextStatus = c.status;
      // 반납 cascade: 반납 완료 시 계약 만기 / 취소 시 운행중 복원
      if (target.type === '반납') nextStatus = willComplete ? '만기' : '운행중';
      return {
        ...c,
        status: nextStatus,
        events: c.events.map((e) => {
          if (e.id !== eventId) return e;
          if (willComplete) return { ...e, status: '완료' as const, doneDate: today };
          return { ...e, status: '예정' as const, doneDate: undefined };
        }),
      };
    }));

    // 자산 status cascade — 출고/반납 완료 시 매칭 자산 상태 변경
    if (target.type === '출고') {
      setAssets((prev) => prev.map((a) =>
        a.plate === targetPlate
          ? { ...a, status: willComplete ? ('운행중' as const) : ('대기' as const) }
          : a,
      ));
    } else if (target.type === '반납') {
      setAssets((prev) => prev.map((a) =>
        a.plate === targetPlate && a.status !== '매각'
          ? { ...a, status: willComplete ? ('대기' as const) : ('운행중' as const) }
          : a,
      ));
    }
  }

  /** 오늘까지 만기 도래한 예정 events 일괄 완료 */
  function bulkCompleteUntilToday() {
    const today = new Date().toISOString().slice(0, 10);
    const targets = targetEvents.filter((e) => e.status === '예정' && e.dueDate <= today);
    if (targets.length === 0) {
      alert('오늘까지 만기 도래한 예정 항목이 없습니다.');
      return;
    }
    if (!confirm(`만기 도래 ${targets.length}건을 일괄 완료 처리합니다. 계속할까요?`)) return;
    setContracts((prev) => prev.map((c) => {
      if (c.contractNo !== contractId) return c;
      return {
        ...c,
        events: c.events.map((e) =>
          e.status === '예정' && e.dueDate <= today
            ? { ...e, status: '완료' as const, doneDate: e.dueDate }
            : e,
        ),
      };
    }));
  }

  return (
    <PageShell
      subTabs={CONTRACT_SUBTABS}
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
          <button className="btn" onClick={bulkCompleteUntilToday}>
            <CheckCircle size={14} weight="bold" /> 도래 일괄 완료
          </button>
          <button className="btn">
            <CalendarBlank size={14} weight="bold" /> 일정 추가
          </button>
        </>
      }
    >
      {/* 계약 요약 헤더 */}
      <ContractHeader contract={contract} />

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
              <th className="center" style={{ width: 90 }}></th>
            </tr>
          </thead>
          <tbody>
            {sortedEvents.map((e) => (
              <ScheduleRow key={e.id} event={e} onToggle={() => toggleEvent(e.id)} />
            ))}
          </tbody>
        </table>
      </div>
    </PageShell>
  );
}

function ContractHeader({ contract }: { contract: Contract }) {
  return (
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
  );
}

function ScheduleRow({ event: e, onToggle }: { event: ScheduleEvent; onToggle: () => void }) {
  const dday = computeDday(e.dueDate);
  const ddayCls = e.status === '완료' ? '' : ddayCellClass(dday);
  const typeCls = `type-${e.type}`;
  const isDone = e.status === '완료';
  return (
    <tr>
      <td className="center"><span className={cn('badge', typeCls)}>{e.type}</span></td>
      <td className="num">{e.cycle ?? '-'}</td>
      <td className="date">{e.dueDate}</td>
      <td className={cn('center', ddayCls)}>{isDone ? '-' : formatDday(dday)}</td>
      <td className="date">{e.doneDate ?? ''}</td>
      <td className="num">{e.amount ? e.amount.toLocaleString('ko-KR') : ''}</td>
      <td className="center"><StatusBadge status={e.status} /></td>
      <td className="dim">{e.note ?? ''}</td>
      <td className="center">
        <button
          className={cn('btn btn-sm', isDone ? '' : 'btn-primary')}
          onClick={onToggle}
          title={isDone ? '완료 취소 → 예정으로' : '완료 처리'}
        >
          {isDone ? <><ArrowCounterClockwise size={11} /> 취소</> : <><CheckCircle size={11} weight="bold" /> 완료</>}
        </button>
      </td>
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
