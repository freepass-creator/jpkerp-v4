'use client';

import { useMemo, useState, useCallback, useRef } from 'react';
import { CurrencyKrw } from '@phosphor-icons/react';
import { PageShell } from '@/components/layout/page-shell';
import { PENDING_SUBTABS, usePendingSubtabPending } from '@/lib/pending-subtabs';
import { useContractStore } from '@/lib/use-contract-store';
import { collectOverdue, type OverdueRow } from '@/lib/pending-aggregators';
import { JpkTable, type JpkColumn, type JpkTableApi } from '@/components/shared/jpk-table';

/** 미납현황 — 계약 단위 미납 회차 집계. 컬럼 헤더 필터. */
export default function OverduePage() {
  const [contracts] = useContractStore();
  const subTabPending = usePendingSubtabPending();
  const rows = useMemo(() => collectOverdue(contracts), [contracts]);
  const [filtered, setFiltered] = useState<readonly OverdueRow[]>([]);
  const tableRef = useRef<JpkTableApi<OverdueRow> | null>(null);

  const totalAmount = useMemo(() => filtered.reduce((s, r) => s + r.totalAmount, 0), [filtered]);
  const totalCycles = useMemo(() => filtered.reduce((s, r) => s + r.unpaidCycles, 0), [filtered]);

  const columns = useMemo<JpkColumn<OverdueRow>[]>(() => [
    { headerName: '회사', field: 'companyCode', width: 80, filterable: true },
    { headerName: '차량번호', field: 'plate', width: 110, filterable: true,
      cellRenderer: ({ value }) => <span className="plate text-medium">{value as string}</span> },
    { headerName: '상태', width: 80, filterable: true,
      valueGetter: () => '미납',
      cellRenderer: () => <span className="badge badge-red">미납</span> },
    { headerName: '계약번호', field: 'contractNo', width: 130, filterable: true,
      cellRenderer: ({ value }) => <span className="mono text-medium">{value as string}</span> },
    { headerName: '임차인', field: 'customerName', width: 120, filterable: true },
    { headerName: '연락처', field: 'customerPhone', width: 130,
      cellRenderer: ({ value }) => <span className="mono dim">{(value as string) || '-'}</span> },
    { headerName: '미납 회차', field: 'unpaidCycles', width: 90, align: 'right', filterType: 'range', sort: 'desc',
      cellRenderer: ({ value }) => <span className="text-red"><strong>{value as number}</strong></span> },
    { headerName: '미납 금액', field: 'totalAmount', width: 130, align: 'right', filterType: 'range',
      filterStep: 100000, filterUnit: 10000, filterUnitLabel: '만원',
      valueFormatter: ({ value }) => (value as number).toLocaleString('ko-KR'),
      cellRenderer: ({ value }) => <span className="text-red">{(value as number).toLocaleString('ko-KR')}</span> },
    { headerName: '최장 연체', field: 'longestOverdueDays', width: 90, align: 'right', filterType: 'range',
      cellRenderer: ({ value }) => <span className="text-red">{value as number}일</span> },
    { headerName: '최오래된 만기', field: 'oldestDueDate', width: 120, filterType: 'date',
      cellRenderer: ({ value }) => <span className="date dim">{value as string}</span> },
  ], []);

  const getRowId = useCallback((r: OverdueRow) => r.contractId, []);

  return (
    <PageShell
      subTabs={PENDING_SUBTABS}
      subTabPending={subTabPending}
      footerLeft={
        <>
          <span className="stat-item">미납 계약 <strong>{filtered.length}</strong>{filtered.length !== rows.length && <span className="text-weak"> / {rows.length}</span>}</span>
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
        <JpkTable<OverdueRow>
          ref={tableRef}
          columns={columns}
          rows={rows}
          getRowId={getRowId}
          storageKey="pending.overdue"
          onFilteredChange={setFiltered}
        />
      )}
    </PageShell>
  );
}
