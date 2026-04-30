'use client';

import { useMemo } from 'react';
import { Pause } from '@phosphor-icons/react';
import { PageShell } from '@/components/layout/page-shell';
import { PENDING_SUBTABS, usePendingSubtabPending } from '@/lib/pending-subtabs';
import { useAssetStore } from '@/lib/use-asset-store';
import { useContractStore } from '@/lib/use-contract-store';
import { collectIdle } from '@/lib/pending-aggregators';
import { cn } from '@/lib/cn';

/** 휴차현황 — 활성 운행중 계약이 없는 자산. */
export default function IdlePage() {
  const [assets] = useAssetStore();
  const [contracts] = useContractStore();
  const subTabPending = usePendingSubtabPending();
  const rows = useMemo(() => collectIdle(assets, contracts), [assets, contracts]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rows) c[r.reason] = (c[r.reason] ?? 0) + 1;
    return c;
  }, [rows]);

  return (
    <PageShell
      subTabs={PENDING_SUBTABS}
      subTabPending={subTabPending}
      footerLeft={
        <>
          <span className="stat-item">전체 <strong>{rows.length}</strong></span>
          {counts['등록예정']     ? <span className="stat-item">등록예정 <strong>{counts['등록예정']}</strong></span>     : null}
          {counts['대기']         ? <span className="stat-item">대기 <strong>{counts['대기']}</strong></span>             : null}
          {counts['정비']         ? <span className="stat-item">정비 <strong>{counts['정비']}</strong></span>             : null}
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
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>구분</th>
                <th>회사</th>
                <th>차량번호</th>
                <th>차명</th>
                <th>현재 상태</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.assetId}>
                  <td>
                    <span className={cn('badge', r.reason === '운행중미매칭' ? 'badge-red' : 'badge-orange')}>
                      {r.reason === '운행중미매칭' ? '⚠ 정합성' : r.reason}
                    </span>
                  </td>
                  <td className="plate">{r.companyCode}</td>
                  <td className="plate">{r.plate}</td>
                  <td>{r.vehicleName || '-'}</td>
                  <td className="dim">{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageShell>
  );
}
