'use client';

import { useMemo, useState, useCallback, useRef } from 'react';
import { ArrowUDownLeft } from '@phosphor-icons/react';
import { PageShell } from '@/components/layout/page-shell';
import { PENDING_SUBTABS, usePendingSubtabPending } from '@/lib/pending-subtabs';
import { useAssetStore } from '@/lib/use-asset-store';
import { useContractStore } from '@/lib/use-contract-store';
import { useJournalStore } from '@/lib/use-journal-store';
import { JpkTable, type JpkColumn, type JpkTableApi } from '@/components/shared/jpk-table';
import { useTopbarSearch } from '@/lib/use-topbar-search';
import { buildLocationMap } from '@/lib/vehicle-location';
import { cn } from '@/lib/cn';

const DAY_MS = 24 * 60 * 60 * 1000;

type ReturnRow = {
  id: string;
  companyCode: string;
  plate: string;
  vehicleName: string;
  contractNo: string;
  customerName: string;
  customerPhone: string;
  dueDate: string;
  daysLeft: number;
  currentLocation: string;
};

/** 반납 — 계약 events type='반납' D-30 이내. */
export default function PendingReturnPage() {
  const [assets] = useAssetStore();
  const [contracts] = useContractStore();
  const [entries] = useJournalStore();
  const subTabPending = usePendingSubtabPending();
  const { search } = useTopbarSearch();
  const [filtered, setFiltered] = useState<readonly ReturnRow[]>([]);
  const tableRef = useRef<JpkTableApi<ReturnRow> | null>(null);

  const rows = useMemo<ReturnRow[]>(() => {
    const today = Date.now();
    const horizon = today + 30 * DAY_MS;
    const assetByPlate = new Map(assets.map((a) => [a.plate, a]));
    const locMap = buildLocationMap(entries);
    const out: ReturnRow[] = [];
    for (const c of contracts) {
      if (c.status === '만기' || c.status === '해지') continue;
      for (const e of c.events) {
        if (e.type !== '반납' || e.status !== '예정') continue;
        const t = Date.parse(e.dueDate);
        if (!Number.isFinite(t) || t > horizon) continue;
        const a = assetByPlate.get(c.plate);
        out.push({
          id: `${c.id}-${e.id}`,
          companyCode: c.companyCode,
          plate: c.plate,
          vehicleName: a?.vehicleName || a?.vehicleClass || '',
          contractNo: c.contractNo,
          customerName: c.customerName,
          customerPhone: c.customerPhone,
          dueDate: e.dueDate,
          daysLeft: Math.round((t - today) / DAY_MS),
          currentLocation: locMap.get(c.plate) || a?.ownerLocation || '',
        });
      }
    }
    out.sort((a, b) => a.daysLeft - b.daysLeft);
    return out;
  }, [assets, contracts, entries]);

  const columns = useMemo<JpkColumn<ReturnRow>[]>(() => [
    { headerName: '회사', field: 'companyCode', width: 80, filterable: true },
    { headerName: '차량번호', field: 'plate', width: 110, filterable: true,
      cellRenderer: ({ value }) => <span className="plate text-medium">{value as string}</span> },
    { headerName: '상태', width: 90,
      valueGetter: ({ data }) => data.daysLeft < 0 ? '경과' : '임박',
      cellRenderer: ({ data }) => (
        <span className={cn('badge', data.daysLeft < 0 ? 'badge-red' : 'badge-orange')}>
          {data.daysLeft < 0 ? '경과' : '임박'}
        </span>
      ) },
    { headerName: '차명', field: 'vehicleName', minWidth: 140, flex: 1 },
    { headerName: '계약번호', field: 'contractNo', width: 130, filterable: true,
      cellRenderer: ({ value }) => <span className="mono text-medium">{value as string}</span> },
    { headerName: '임차인', field: 'customerName', width: 110, filterable: true },
    { headerName: '연락처', field: 'customerPhone', width: 130,
      cellRenderer: ({ value }) => <span className="mono dim">{(value as string) || '-'}</span> },
    { headerName: '반납 예정일', field: 'dueDate', width: 120, filterType: 'date' },
    { headerName: 'D-day', field: 'daysLeft', width: 90, align: 'right', filterType: 'range', sort: 'asc',
      cellRenderer: ({ value }) => {
        const d = value as number;
        const label = d < 0 ? `${-d}일 경과` : d === 0 ? '오늘' : `D-${d}`;
        return <span className={cn(d < 0 ? 'text-red' : d <= 7 ? 'text-amber' : '')}>{label}</span>;
      } },
    { headerName: '현재 위치', field: 'currentLocation', width: 160, filterable: true,
      cellRenderer: ({ value }) => <span className="dim">{(value as string) || '-'}</span> },
  ], []);

  const getRowId = useCallback((r: ReturnRow) => r.id, []);

  return (
    <PageShell
      subTabs={PENDING_SUBTABS}
      subTabPending={subTabPending}
      footerLeft={<span className="stat-item">반납 임박 <strong>{filtered.length}</strong>{filtered.length !== rows.length && <span className="text-weak"> / {rows.length}</span>}</span>}
    >
      {rows.length === 0 ? (
        <div className="page-section-center">
          <ArrowUDownLeft size={32} className="mx-auto text-weak" />
          <div className="mt-2 text-medium">반납 예정 없음</div>
          <div className="mt-1 text-weak">30일 이내 반납 예정 계약이 없습니다.</div>
        </div>
      ) : (
        <JpkTable<ReturnRow>
          ref={tableRef}
          columns={columns}
          rows={rows}
          getRowId={getRowId}
          storageKey="pending.return"
          onFilteredChange={setFiltered}
          globalSearch={search}
        />
      )}
    </PageShell>
  );
}
