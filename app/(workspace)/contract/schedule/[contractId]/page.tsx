'use client';

import { useState, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, CalendarBlank, CheckCircle, ArrowCounterClockwise, Notebook } from '@phosphor-icons/react';
import { PageShell } from '@/components/layout/page-shell';
import { EmptyState } from '@/components/ui/empty-state';
import { CONTRACT_SUBTABS } from '@/lib/contract-subtabs';
import { summarizeContract, type ScheduleEvent, type ScheduleType, type Contract } from '@/lib/sample-contracts';
import { useContractStore } from '@/lib/use-contract-store';
import { useAssetStore } from '@/lib/use-asset-store';
import { useAuditStamp } from '@/lib/audit-fields';
import { cn } from '@/lib/cn';

/**
 * 계약스케줄 상세 — 회차별 출고/수납/반납/검사 등 events 관리.
 *
 * 행동:
 *  · 행 우측 버튼 → 완료 ↔ 예정 토글 (doneDate = today)
 *  · 일괄 처리 — '오늘까지 도래' or '선택 일괄 완료'
 *  · 다중 선택 — 좌측 체크박스 (예정/지연만 선택 가능, 완료는 disabled)
 *  · 필터 chip — 상태 (전체/예정/완료/지연) × 유형 (계약 내 type 들)
 *  · 모든 mutation 은 audit_logs 에 한 줄씩 push (개별 추적)
 *  · 수납 회차 완료 = 미수에서 빠짐, 수납내역에 보임
 */

type StateFilter = '전체' | '예정' | '완료' | '지연';
type TypeFilter = '전체' | ScheduleType;

export default function ContractScheduleDetailPage() {
  const router = useRouter();
  const params = useParams();
  const contractId = params?.contractId as string | undefined;
  const [contracts, setContracts] = useContractStore();
  const [, setAssets] = useAssetStore();
  const audit = useAuditStamp();

  const [stateFilter, setStateFilter] = useState<StateFilter>('전체');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('전체');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const contract = contracts.find((c) => c.contractNo === contractId);

  // 모든 hook 은 early return 위에서 호출 — 계약 내 type 종류 도출 (chip 노출용)
  const typesInContract = useMemo<ScheduleType[]>(() => {
    if (!contract) return [];
    const seen = new Set<ScheduleType>();
    for (const e of contract.events) seen.add(e.type);
    // 표준 순서로 정렬
    const order: ScheduleType[] = ['출고', '수납', '엔진오일', '검사', '정비', '반납'];
    return order.filter((t) => seen.has(t));
  }, [contract]);

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
  const today = new Date().toISOString().slice(0, 10);

  /** 지연 판정 — 별도 status 안 만들고 derived (예정 + dueDate 과거). */
  const isDelayed = (e: ScheduleEvent) => e.status === '예정' && e.dueDate < today;

  /** chip 필터 적용 후 정렬된 event 목록 (테이블 출력용). */
  const visibleEvents = useMemo(() => {
    return [...contract.events]
      .filter((e) => {
        if (stateFilter === '예정') {
          if (!(e.status === '예정' && !isDelayed(e))) return false;
        } else if (stateFilter === '완료') {
          if (e.status !== '완료') return false;
        } else if (stateFilter === '지연') {
          if (!isDelayed(e)) return false;
        }
        if (typeFilter !== '전체' && e.type !== typeFilter) return false;
        return true;
      })
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contract.events, stateFilter, typeFilter, today]);

  /** 체크박스 가능한 row (완료 제외) */
  const selectableVisibleIds = visibleEvents.filter((e) => e.status !== '완료').map((e) => e.id);
  const allVisibleSelected = selectableVisibleIds.length > 0 && selectableVisibleIds.every((id) => selectedIds.has(id));
  const partialSelected = !allVisibleSelected && selectableVisibleIds.some((id) => selectedIds.has(id));

  // contract 가 정해진 시점 — 아래 toggleEvent 클로저에서 안전하게 참조
  const targetPlate = contract.plate;
  const targetEvents = contract.events;
  const contractDbId = contract.id;
  const contractNo = contract.contractNo;

  function describe(e: ScheduleEvent): string {
    return `${contractNo} ${e.type}${e.cycle ? ` ${e.cycle}회차` : ''}`;
  }

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

    setContracts((prev) => prev.map((c) => {
      if (c.contractNo !== contractId) return c;
      let nextStatus = c.status;
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

    audit.log({
      action: 'update',
      entityType: 'contract',
      entityId: contractDbId,
      label: `${describe(target)} ${willComplete ? '완료' : '취소'}`,
      before: { eventStatus: target.status, doneDate: target.doneDate },
      after: { eventStatus: willComplete ? '완료' : '예정', doneDate: willComplete ? today : null },
    });
  }

  /** doneDate 보충 입력 — 마이그레이션 시 입금일 미상이었던 회차 채우기.
   *  status 토글 없이 doneDate 만 수정. 빈 문자열 입력 시 다시 미상 처리. */
  function setDoneDate(eventId: string, value: string) {
    const target = targetEvents.find((e) => e.id === eventId);
    if (!target) return;
    const before = target.doneDate;
    const after = value || undefined;
    setContracts((prev) => prev.map((c) => {
      if (c.contractNo !== contractId) return c;
      return {
        ...c,
        events: c.events.map((e) =>
          e.id === eventId ? { ...e, doneDate: after } : e
        ),
      };
    }));
    audit.log({
      action: 'update',
      entityType: 'contract',
      entityId: contractDbId,
      label: `${describe(target)} 실시일 보충`,
      before: { doneDate: before ?? null },
      after: { doneDate: after ?? null },
    });
  }

  /** 오늘까지 만기 도래한 예정 events 일괄 완료 */
  function bulkCompleteUntilToday() {
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
    targets.forEach((t) => audit.log({
      action: 'update',
      entityType: 'contract',
      entityId: contractDbId,
      label: `${describe(t)} 완료 (도래 일괄)`,
      before: { eventStatus: t.status, doneDate: t.doneDate },
      after: { eventStatus: '완료', doneDate: t.dueDate },
    }));
  }

  /** 선택된 회차 일괄 완료 — dueDate 가 과거면 dueDate, 아니면 today 를 doneDate 로. */
  function bulkCompleteSelected() {
    const targets = targetEvents.filter((e) => selectedIds.has(e.id) && e.status !== '완료');
    if (targets.length === 0) {
      alert('선택된 회차가 없습니다.');
      return;
    }
    if (!confirm(`선택된 ${targets.length}건을 일괄 완료 처리합니다. 계속할까요?`)) return;

    // 반납 cascade 처리 — 선택에 반납 포함되면 계약 만기 / 자산 대기
    const hasReturn = targets.some((t) => t.type === '반납');
    const hasShipout = targets.some((t) => t.type === '출고');

    setContracts((prev) => prev.map((c) => {
      if (c.contractNo !== contractId) return c;
      const idSet = new Set(targets.map((t) => t.id));
      return {
        ...c,
        status: hasReturn ? '만기' : c.status,
        events: c.events.map((e) =>
          idSet.has(e.id)
            ? { ...e, status: '완료' as const, doneDate: e.dueDate < today ? e.dueDate : today }
            : e,
        ),
      };
    }));

    if (hasShipout) {
      setAssets((prev) => prev.map((a) =>
        a.plate === targetPlate ? { ...a, status: '운행중' as const } : a,
      ));
    }
    if (hasReturn) {
      setAssets((prev) => prev.map((a) =>
        a.plate === targetPlate && a.status !== '매각'
          ? { ...a, status: '대기' as const }
          : a,
      ));
    }

    targets.forEach((t) => {
      const doneDate = t.dueDate < today ? t.dueDate : today;
      audit.log({
        action: 'update',
        entityType: 'contract',
        entityId: contractDbId,
        label: `${describe(t)} 완료 (선택 일괄)`,
        before: { eventStatus: t.status, doneDate: t.doneDate },
        after: { eventStatus: '완료', doneDate },
      });
    });

    setSelectedIds(new Set());
  }

  function toggleSelectAll() {
    if (allVisibleSelected) {
      // 현재 보이는 것만 해제
      const next = new Set(selectedIds);
      for (const id of selectableVisibleIds) next.delete(id);
      setSelectedIds(next);
    } else {
      const next = new Set(selectedIds);
      for (const id of selectableVisibleIds) next.add(id);
      setSelectedIds(next);
    }
  }

  function toggleSelectOne(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  }

  const selectedCount = selectedIds.size;

  return (
    <PageShell
      subTabs={CONTRACT_SUBTABS}
      filterbar={
        <>
          <div className="chip-group" role="tablist" aria-label="상태">
            {(['전체', '예정', '완료', '지연'] as StateFilter[]).map((s) => (
              <button
                key={s}
                type="button"
                className={cn('chip', stateFilter === s && 'active')}
                onClick={() => setStateFilter(s)}
              >{s}</button>
            ))}
          </div>
          <div className="chip-group" role="tablist" aria-label="유형">
            <button
              type="button"
              className={cn('chip', typeFilter === '전체' && 'active')}
              onClick={() => setTypeFilter('전체')}
            >전체</button>
            {typesInContract.map((t) => (
              <button
                key={t}
                type="button"
                className={cn('chip', typeFilter === t && 'active')}
                onClick={() => setTypeFilter(t)}
              >{t}</button>
            ))}
          </div>
        </>
      }
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
          {selectedCount > 0 && (
            <>
              <span className="stat-divider" />
              <span className="stat-item">선택 <strong>{selectedCount}</strong>건</span>
            </>
          )}
        </>
      }
      footerRight={
        <>
          <button className="btn" onClick={() => router.push('/contract/schedule')}>
            <ArrowLeft size={14} weight="bold" /> 목록
          </button>
          <button
            className="btn"
            onClick={bulkCompleteSelected}
            disabled={selectedCount === 0}
            title={selectedCount === 0 ? '선택된 회차 없음' : `선택 ${selectedCount}건 일괄 완료`}
          >
            <CheckCircle size={14} weight="bold" /> 선택 일괄 완료
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

      {visibleEvents.length === 0 ? (
        <EmptyState
          icon={Notebook}
          title="이벤트 없음"
          description={contract.events.length === 0
            ? '이 계약에 등록된 출고/수납/반납 이벤트가 없습니다.'
            : '필터 조건에 해당하는 회차가 없습니다.'}
          hint={contract.events.length === 0
            ? <>계약 등록 시 자동 생성됩니다. 비어있으면 계약 데이터 (시작일·종료일·월대여료) 확인이 필요합니다.</>
            : undefined}
        />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th className="center" style={{ width: 32 }}>
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    ref={(el) => { if (el) el.indeterminate = partialSelected; }}
                    onChange={toggleSelectAll}
                    disabled={selectableVisibleIds.length === 0}
                    title="전체 선택/해제 (예정/지연만)"
                  />
                </th>
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
              {visibleEvents.map((e) => (
                <ScheduleRow
                  key={e.id}
                  event={e}
                  delayed={isDelayed(e)}
                  selected={selectedIds.has(e.id)}
                  onToggleSelect={() => toggleSelectOne(e.id)}
                  onToggle={() => toggleEvent(e.id)}
                  onDoneDate={(v) => setDoneDate(e.id, v)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
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

function ScheduleRow({
  event: e, delayed, selected, onToggleSelect, onToggle, onDoneDate,
}: {
  event: ScheduleEvent;
  delayed: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onToggle: () => void;
  onDoneDate: (value: string) => void;
}) {
  const dday = computeDday(e.dueDate);
  const ddayCls = e.status === '완료' ? '' : ddayCellClass(dday);
  const typeCls = `type-${e.type}`;
  const isDone = e.status === '완료';
  const onTime = isDone && e.doneDate === e.dueDate;
  // 지연 시각 강조 — overdue 가 이미 ddayCls 로 들어가지만, 행 단위로도 표시 가능 (현재는 cell 만)
  return (
    <tr className={cn(selected && 'selected')}>
      <td className="center">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          disabled={isDone}
          title={isDone ? '이미 완료된 회차' : '선택'}
        />
      </td>
      <td className="center"><span className={cn('badge', typeCls)}>{e.type}</span></td>
      <td className="num">{e.cycle ?? '-'}</td>
      <td className="date">{e.dueDate}</td>
      <td className={cn('center', ddayCls)}>{isDone ? '-' : formatDday(dday)}</td>
      <td className="date">
        {isDone ? (
          <input
            type="date"
            className="input"
            style={{ padding: '2px 4px', fontSize: 12, width: 130 }}
            value={e.doneDate ?? ''}
            onChange={(ev) => onDoneDate(ev.target.value)}
            title={onTime ? '제날짜 수납 (마이그레이션 가정) — 실제 입금일 알면 수정' : '실제 입금일'}
          />
        ) : ''}
      </td>
      <td className="num">{e.amount ? e.amount.toLocaleString('ko-KR') : ''}</td>
      <td className="center"><StatusBadge status={e.status} delayed={delayed} /></td>
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

function StatusBadge({ status, delayed }: { status: string; delayed: boolean }) {
  // 지연 (예정 + 과거) 은 visual class 만 추가 — status 값 자체는 '예정' 유지
  if (delayed && status === '예정') {
    return <span className={cn('badge', 'badge-red')} title="예정일 경과 (지연)">지연</span>;
  }
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
