'use client';

import { useMemo, useState, useCallback, useRef } from 'react';
import { Wrench } from '@phosphor-icons/react';
import { PageShell } from '@/components/layout/page-shell';
import { PENDING_SUBTABS, usePendingSubtabPending } from '@/lib/pending-subtabs';
import { useAssetStore } from '@/lib/use-asset-store';
import { useContractStore } from '@/lib/use-contract-store';
import { JpkTable, type JpkColumn, type JpkTableApi } from '@/components/shared/jpk-table';
import { getCurrentLocation } from '@/lib/vehicle-location';
import { useJournalStore } from '@/lib/use-journal-store';
import type { Asset } from '@/lib/sample-assets';
import { cn } from '@/lib/cn';

const DAY_MS = 24 * 60 * 60 * 1000;

type InspectionRow = {
  id: string;
  companyCode: string;
  plate: string;
  vehicleName: string;
  inspectionFrom: string;
  inspectionTo: string;
  daysLeft: number;
  customerName: string;
  customerPhone: string;
  currentLocation: string;
  inspectionPlace: string;
};

/** 검사 — 자산 inspectionTo D-30 이내 또는 경과. */
export default function InspectionPendingPage() {
  const [assets] = useAssetStore();
  const [contracts] = useContractStore();
  const [entries] = useJournalStore();
  const subTabPending = usePendingSubtabPending();
  const [filtered, setFiltered] = useState<readonly InspectionRow[]>([]);
  const tableRef = useRef<JpkTableApi<InspectionRow> | null>(null);

  const rows = useMemo<InspectionRow[]>(() => {
    const today = Date.now();
    const horizon = today + 30 * DAY_MS;
    const out: InspectionRow[] = [];
    for (const a of assets) {
      if (!a.inspectionTo || a.status === '매각') continue;
      const t = Date.parse(a.inspectionTo);
      if (!Number.isFinite(t) || t > horizon) continue;
      const contract = contracts.find((c) => c.plate === a.plate && c.status === '운행중');
      out.push({
        id: a.id,
        companyCode: a.companyCode,
        plate: a.plate,
        vehicleName: a.vehicleName || a.vehicleClass || '',
        inspectionFrom: a.inspectionFrom ?? '',
        inspectionTo: a.inspectionTo,
        daysLeft: Math.round((t - today) / DAY_MS),
        customerName: contract?.customerName ?? '',
        customerPhone: contract?.customerPhone ?? '',
        currentLocation: getCurrentLocation(a.plate, entries) || (a as Asset).ownerLocation || '',
        inspectionPlace: a.inspectionPlace ?? '',
      });
    }
    out.sort((a, b) => a.daysLeft - b.daysLeft);
    return out;
  }, [assets, contracts, entries]);

  const columns = useMemo<JpkColumn<InspectionRow>[]>(() => [
    { headerName: '회사', field: 'companyCode', width: 80, filterable: true },
    { headerName: '차량번호', field: 'plate', width: 110, filterable: true,
      cellRenderer: ({ value }) => <span className="plate text-medium">{value as string}</span> },
    { headerName: '상태', width: 90, filterable: true,
      valueGetter: ({ data }) => data.daysLeft < 0 ? '만기경과' : '만기임박',
      cellRenderer: ({ data }) => (
        <span className={cn('badge', data.daysLeft < 0 ? 'badge-red' : 'badge-orange')}>
          {data.daysLeft < 0 ? '만기경과' : '만기임박'}
        </span>
      ) },
    { headerName: '차명', field: 'vehicleName', minWidth: 140, flex: 1 },
    { headerName: '시작일', field: 'inspectionFrom', width: 110, filterType: 'date' },
    { headerName: '만기일', field: 'inspectionTo', width: 110, filterType: 'date' },
    { headerName: 'D-day', field: 'daysLeft', width: 90, align: 'right', filterType: 'range', sort: 'asc',
      valueFormatter: ({ value }) => {
        const d = value as number;
        return d < 0 ? `${-d}일 경과` : d === 0 ? '오늘' : `D-${d}`;
      },
      cellRenderer: ({ value }) => {
        const d = value as number;
        const label = d < 0 ? `${-d}일 경과` : d === 0 ? '오늘' : `D-${d}`;
        return <span className={cn(d < 0 ? 'text-red' : d <= 7 ? 'text-amber' : '')}>{label}</span>;
      } },
    { headerName: '임차인', field: 'customerName', width: 110, filterable: true },
    { headerName: '연락처', field: 'customerPhone', width: 130,
      cellRenderer: ({ value }) => <span className="mono dim">{(value as string) || '-'}</span> },
    { headerName: '현재 위치', field: 'currentLocation', width: 160, filterable: true,
      cellRenderer: ({ value }) => <span className="dim">{(value as string) || '-'}</span> },
    { headerName: '검사 시행장소', field: 'inspectionPlace', width: 140, filterable: true,
      cellRenderer: ({ value }) => <span className="dim">{(value as string) || '-'}</span> },
  ], []);

  const getRowId = useCallback((r: InspectionRow) => r.id, []);

  return (
    <PageShell
      subTabs={PENDING_SUBTABS}
      subTabPending={subTabPending}
      footerLeft={<span className="stat-item">전체 <strong>{filtered.length}</strong>{filtered.length !== rows.length && <span className="text-weak"> / {rows.length}</span>}</span>}
    >
      {rows.length === 0 ? (
        <div className="page-section-center">
          <Wrench size={32} className="mx-auto text-weak" />
          <div className="mt-2 text-medium">만기 임박 검사 없음</div>
          <div className="mt-1 text-weak">모든 차량의 검사 만기가 30일 이상 남았습니다.</div>
        </div>
      ) : (
        <JpkTable<InspectionRow>
          ref={tableRef}
          columns={columns}
          rows={rows}
          getRowId={getRowId}
          storageKey="pending.inspection"
          onFilteredChange={setFiltered}
        />
      )}
    </PageShell>
  );
}
