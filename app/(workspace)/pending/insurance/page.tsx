'use client';

import { useMemo, useState, useCallback, useRef } from 'react';
import { Shield } from '@phosphor-icons/react';
import { PageShell } from '@/components/layout/page-shell';
import { PENDING_SUBTABS, usePendingSubtabPending } from '@/lib/pending-subtabs';
import { useAssetStore } from '@/lib/use-asset-store';
import { useInsuranceStore } from '@/lib/use-insurance-store';
import { useTopbarSearch } from '@/lib/use-topbar-search';
import { JpkTable, type JpkColumn, type JpkTableApi } from '@/components/shared/jpk-table';
import { cn } from '@/lib/cn';

const DAY_MS = 24 * 60 * 60 * 1000;

type InsuranceRow = {
  id: string;
  companyCode: string;
  plate: string;
  vehicleName: string;
  insurer: string;
  policyNo: string;
  endDate: string;
  daysLeft: number;
  /** '없음' = 운행중인데 매칭 보험 0건, '경과' = 만기 지남, '임박' = D-30 이내 */
  state: '없음' | '경과' | '임박';
};

/**
 * 보험 — 자산 단위 보험증권 만기 추적.
 *  · 운행중 자산인데 매칭 보험 없음 → '없음'
 *  · 매칭 보험의 endDate 가 today < → '경과'
 *  · 매칭 보험의 endDate 가 D-30 이내 → '임박'
 */
export default function PendingInsurancePage() {
  const [assets] = useAssetStore();
  const [policies] = useInsuranceStore();
  const subTabPending = usePendingSubtabPending();
  const { search } = useTopbarSearch();
  const [filtered, setFiltered] = useState<readonly InsuranceRow[]>([]);
  const tableRef = useRef<JpkTableApi<InsuranceRow> | null>(null);

  const rows = useMemo<InsuranceRow[]>(() => {
    const today = Date.now();
    const horizon = today + 30 * DAY_MS;
    // plate 별 가장 만기 늦은 보험
    const policyByPlate = new Map<string, { endDate: string; insurer: string; policyNo: string }>();
    for (const p of policies) {
      const plate = p.carNumber ?? '';
      if (!plate || !p.endDate) continue;
      const prev = policyByPlate.get(plate);
      if (!prev || p.endDate > prev.endDate) {
        policyByPlate.set(plate, { endDate: p.endDate, insurer: p.insurer ?? '', policyNo: p.policyNo ?? '' });
      }
    }

    const out: InsuranceRow[] = [];
    for (const a of assets) {
      if (a.status === '매각' || a.status === '등록예정') continue;
      const policy = policyByPlate.get(a.plate);
      if (!policy) {
        out.push({
          id: `noins-${a.id}`,
          companyCode: a.companyCode,
          plate: a.plate,
          vehicleName: a.vehicleName || a.vehicleClass || '',
          insurer: '',
          policyNo: '',
          endDate: '',
          daysLeft: 0,
          state: '없음',
        });
        continue;
      }
      const t = Date.parse(policy.endDate);
      if (!Number.isFinite(t)) continue;
      const daysLeft = Math.round((t - today) / DAY_MS);
      // horizon 안 또는 경과만 표시
      if (t > horizon) continue;
      out.push({
        id: `ins-${a.id}-${policy.endDate}`,
        companyCode: a.companyCode,
        plate: a.plate,
        vehicleName: a.vehicleName || a.vehicleClass || '',
        insurer: policy.insurer,
        policyNo: policy.policyNo,
        endDate: policy.endDate,
        daysLeft,
        state: daysLeft < 0 ? '경과' : '임박',
      });
    }

    out.sort((a, b) => {
      // 없음 우선 → 경과 → 임박 (D-day 짧은 순)
      const order = { '없음': 0, '경과': 1, '임박': 2 } as const;
      if (order[a.state] !== order[b.state]) return order[a.state] - order[b.state];
      return a.daysLeft - b.daysLeft;
    });
    return out;
  }, [assets, policies]);

  const columns = useMemo<JpkColumn<InsuranceRow>[]>(() => [
    { headerName: '회사', field: 'companyCode', width: 80, filterable: true },
    { headerName: '차량번호', field: 'plate', width: 110, filterable: true,
      cellRenderer: ({ value }) => <span className="plate text-medium">{value as string}</span> },
    { headerName: '상태', field: 'state', width: 90, filterable: true,
      cellRenderer: ({ value }) => (
        <span className={cn('badge', value === '없음' || value === '경과' ? 'badge-red' : 'badge-orange')}>
          {value as string}
        </span>
      ) },
    { headerName: '차명', field: 'vehicleName', minWidth: 140, flex: 1 },
    { headerName: '보험사', field: 'insurer', width: 130, filterable: true,
      cellRenderer: ({ value }) => <span>{(value as string) || '-'}</span> },
    { headerName: '증권번호', field: 'policyNo', width: 160,
      cellRenderer: ({ value }) => <span className="mono dim">{(value as string) || '-'}</span> },
    { headerName: '만기일', field: 'endDate', width: 120, filterType: 'date',
      cellRenderer: ({ value }) => <span>{(value as string) || '-'}</span> },
    { headerName: 'D-day', field: 'daysLeft', width: 90, align: 'right', filterType: 'range',
      cellRenderer: ({ data }) => {
        if (data.state === '없음') return <span className="text-red">없음</span>;
        const d = data.daysLeft;
        const label = d < 0 ? `${-d}일 경과` : d === 0 ? '오늘' : `D-${d}`;
        return <span className={cn(d < 0 ? 'text-red' : d <= 7 ? 'text-amber' : '')}>{label}</span>;
      } },
  ], []);

  const getRowId = useCallback((r: InsuranceRow) => r.id, []);

  return (
    <PageShell
      subTabs={PENDING_SUBTABS}
      subTabPending={subTabPending}
      footerLeft={<span className="stat-item">보험 만기·없음 <strong>{filtered.length}</strong>{filtered.length !== rows.length && <span className="text-weak"> / {rows.length}</span>}</span>}
    >
      {rows.length === 0 ? (
        <div className="page-section-center">
          <Shield size={32} className="mx-auto text-weak" />
          <div className="mt-2 text-medium">보험 임박 없음</div>
          <div className="mt-1 text-weak">모든 운영 자산이 활성 보험 보유 중 (만기 30일 이상).</div>
        </div>
      ) : (
        <JpkTable<InsuranceRow>
          ref={tableRef}
          columns={columns}
          rows={rows}
          getRowId={getRowId}
          storageKey="pending.insurance"
          onFilteredChange={setFiltered}
          globalSearch={search}
        />
      )}
    </PageShell>
  );
}
