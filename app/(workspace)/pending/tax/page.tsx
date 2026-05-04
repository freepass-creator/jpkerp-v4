'use client';

import { useMemo, useState, useCallback, useRef } from 'react';
import { Receipt } from '@phosphor-icons/react';
import { PageShell } from '@/components/layout/page-shell';
import { PENDING_SUBTABS, usePendingSubtabPending } from '@/lib/pending-subtabs';
import { useAssetStore } from '@/lib/use-asset-store';
import { useTopbarSearch } from '@/lib/use-topbar-search';
import { JpkTable, type JpkColumn, type JpkTableApi } from '@/components/shared/jpk-table';
import { cn } from '@/lib/cn';

const DAY_MS = 24 * 60 * 60 * 1000;

type TaxRow = {
  id: string;
  companyCode: string;
  plate: string;
  vehicleName: string;
  half: '1기' | '2기';
  dueDate: string;
  daysLeft: number;
};

/**
 * 자동차세 — 자산 단위 정기 납부 (매년 6/30 1기, 12/31 2기).
 *  · 등록된 모든 운영 자산에 대해 도래/임박 자동차세 알림
 *  · 데이터는 dynamic 도출 — 별도 store 없이 asset 등록만 되면 자동
 */
export default function PendingTaxPage() {
  const [assets] = useAssetStore();
  const subTabPending = usePendingSubtabPending();
  const { search } = useTopbarSearch();
  const [filtered, setFiltered] = useState<readonly TaxRow[]>([]);
  const tableRef = useRef<JpkTableApi<TaxRow> | null>(null);

  const rows = useMemo<TaxRow[]>(() => {
    const today = Date.now();
    const horizon = today + 30 * DAY_MS;
    const out: TaxRow[] = [];
    for (const a of assets) {
      if (a.status === '매각') continue;
      // 올해 + 내년 1·2기 4개 중 horizon 안 또는 경과 만 표시
      const year = new Date().getFullYear();
      for (const yr of [year, year + 1]) {
        for (const [month, day, half] of [[6, 30, '1기'], [12, 31, '2기']] as const) {
          const dueDate = `${yr}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const t = Date.parse(dueDate);
          if (!Number.isFinite(t) || t > horizon) continue;
          out.push({
            id: `tax-${a.id}-${dueDate}`,
            companyCode: a.companyCode,
            plate: a.plate,
            vehicleName: a.vehicleName || a.vehicleClass || '',
            half: half as '1기' | '2기',
            dueDate,
            daysLeft: Math.round((t - today) / DAY_MS),
          });
        }
      }
    }
    out.sort((a, b) => a.daysLeft - b.daysLeft);
    return out;
  }, [assets]);

  const columns = useMemo<JpkColumn<TaxRow>[]>(() => [
    { headerName: '회사', field: 'companyCode', width: 80, filterable: true },
    { headerName: '차량번호', field: 'plate', width: 110, filterable: true,
      cellRenderer: ({ value }) => <span className="plate text-medium">{value as string}</span> },
    { headerName: '상태', width: 90, filterable: true,
      valueGetter: ({ data }) => data.daysLeft < 0 ? '경과' : '임박',
      cellRenderer: ({ data }) => (
        <span className={cn('badge', data.daysLeft < 0 ? 'badge-red' : 'badge-orange')}>
          {data.daysLeft < 0 ? '경과' : '임박'}
        </span>
      ) },
    { headerName: '구분', field: 'half', width: 80, filterable: true,
      cellRenderer: ({ value }) => <span className="badge">자동차세 {value as string}</span> },
    { headerName: '차명', field: 'vehicleName', minWidth: 160, flex: 1 },
    { headerName: '납부 기한', field: 'dueDate', width: 120, filterType: 'date' },
    { headerName: 'D-day', field: 'daysLeft', width: 90, align: 'right', filterType: 'range', sort: 'asc',
      cellRenderer: ({ value }) => {
        const d = value as number;
        const label = d < 0 ? `${-d}일 경과` : d === 0 ? '오늘' : `D-${d}`;
        return <span className={cn(d < 0 ? 'text-red' : d <= 7 ? 'text-amber' : '')}>{label}</span>;
      } },
  ], []);

  const getRowId = useCallback((r: TaxRow) => r.id, []);

  return (
    <PageShell
      subTabs={PENDING_SUBTABS}
      subTabPending={subTabPending}
      footerLeft={<span className="stat-item">자동차세 임박 <strong>{filtered.length}</strong>{filtered.length !== rows.length && <span className="text-weak"> / {rows.length}</span>}</span>}
    >
      {rows.length === 0 ? (
        <div className="page-section-center">
          <Receipt size={32} className="mx-auto text-weak" />
          <div className="mt-2 text-medium">자동차세 임박 없음</div>
          <div className="mt-1 text-weak">등록된 자산이 없거나 모든 차량 자동차세 만기가 30일 이상 남았습니다.</div>
        </div>
      ) : (
        <JpkTable<TaxRow>
          ref={tableRef}
          columns={columns}
          rows={rows}
          getRowId={getRowId}
          storageKey="pending.tax"
          onFilteredChange={setFiltered}
          globalSearch={search}
        />
      )}
    </PageShell>
  );
}
