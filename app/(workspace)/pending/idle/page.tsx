'use client';

import { useMemo, useState, useCallback, useRef } from 'react';
import { Pause } from '@phosphor-icons/react';
import { PageShell } from '@/components/layout/page-shell';
import { PENDING_SUBTABS, usePendingSubtabPending } from '@/lib/pending-subtabs';
import { useAssetStore } from '@/lib/use-asset-store';
import { useContractStore } from '@/lib/use-contract-store';
import { collectIdle, type IdleRow } from '@/lib/pending-aggregators';
import { JpkTable, type JpkColumn, type JpkTableApi } from '@/components/shared/jpk-table';
import { useTopbarSearch } from '@/lib/use-topbar-search';
import { cn } from '@/lib/cn';

/** 휴차현황 — 활성 계약 없는 자산. 컬럼 헤더 필터. */
export default function IdlePage() {
  const [assets] = useAssetStore();
  const [contracts] = useContractStore();
  const subTabPending = usePendingSubtabPending();
  const { search } = useTopbarSearch();
  const rows = useMemo(() => collectIdle(assets, contracts), [assets, contracts]);
  const [filtered, setFiltered] = useState<readonly IdleRow[]>([]);
  const tableRef = useRef<JpkTableApi<IdleRow> | null>(null);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of filtered) c[r.reason] = (c[r.reason] ?? 0) + 1;
    return c;
  }, [filtered]);

  const columns = useMemo<JpkColumn<IdleRow>[]>(() => [
    { headerName: '회사', field: 'companyCode', width: 80, filterable: true },
    { headerName: '차량번호', field: 'plate', width: 110, filterable: true,
      cellRenderer: ({ value }) => <span className="plate text-medium">{value as string}</span> },
    { headerName: '상태', field: 'reason', width: 110, filterable: true,
      cellRenderer: ({ data }) => (
        <span className={cn('badge', data.reason === '운행중미매칭' ? 'badge-red' : 'badge-orange')}>
          {data.reason === '운행중미매칭' ? '⚠ 정합성' : '대기중'}
        </span>
      ) },
    { headerName: '차명', field: 'vehicleName', minWidth: 160, flex: 1, filterable: true,
      valueFormatter: ({ value }) => (value as string) || '-' },
    { headerName: '비고', field: 'reason', width: 130, filterable: true,
      cellRenderer: ({ value }) => <span className="dim">{value as string}</span> },
  ], []);

  const getRowId = useCallback((r: IdleRow) => r.assetId, []);

  return (
    <PageShell
      subTabs={PENDING_SUBTABS}
      subTabPending={subTabPending}
      footerLeft={
        <>
          <span className="stat-item">전체 <strong>{filtered.length}</strong>{filtered.length !== rows.length && <span className="text-weak"> / {rows.length}</span>}</span>
          {counts['등록예정']     ? <span className="stat-item">등록예정 <strong>{counts['등록예정']}</strong></span>     : null}
          {counts['대기']         ? <span className="stat-item">대기 <strong>{counts['대기']}</strong></span>             : null}
          {counts['운행중미매칭'] ? <span className="stat-item alert">정합성 경보 <strong>{counts['운행중미매칭']}</strong></span> : null}
        </>
      }
    >
      {rows.length === 0 ? (
        <div className="page-section-center">
          <Pause size={32} className="mx-auto text-weak" />
          <div className="mt-2 text-medium">휴차 없음</div>
          <div className="mt-1 text-weak">모든 자산이 매각 또는 운행중 계약과 매칭됩니다.</div>
        </div>
      ) : (
        <JpkTable<IdleRow>
          ref={tableRef}
          columns={columns}
          rows={rows}
          getRowId={getRowId}
          storageKey="pending.idle"
          onFilteredChange={setFiltered}
          globalSearch={search}
        />
      )}
    </PageShell>
  );
}
