'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ShoppingCart, CheckCircle, Warning } from '@phosphor-icons/react';
import { PageShell } from '@/components/layout/page-shell';
import { useAssetStore } from '@/lib/use-asset-store';
import { useContractStore } from '@/lib/use-contract-store';
import { ASSET_SUBTABS, useAssetSubtabPending } from '@/lib/asset-subtabs';
import {
  PURCHASE_STAGE_LABEL,
  currentPurchaseStage,
  purchaseProgress,
  actorDisplayName,
  isPurchasePlaceholderPlate,
} from '@/lib/purchase-flow';
import type { Contract } from '@/lib/sample-contracts';
import { PurchaseStartDialog } from '@/components/purchase/purchase-start-dialog';

/**
 * 차량구매 — 핵심업무 본진. 리스트만.
 *
 * 행 클릭 = /asset/purchase/[assetId] 상세 페이지 (8단계 timeline + 단계별 입력).
 * 리스트는 한눈에 현황 파악 — 차량 / 차종 / 매칭계약 / 현재단계 / 진행률 / 출고예정일.
 */
export default function PurchaseListPage() {
  const [assets] = useAssetStore();
  const [contracts] = useContractStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const subTabPending = useAssetSubtabPending();

  const contractsById = useMemo(() => {
    const m = new Map<string, Contract>();
    for (const c of contracts) m.set(c.id, c);
    return m;
  }, [contracts]);

  const rows = useMemo(() => {
    return assets
      .filter((a) => !a.deletedAt && a.purchase)
      .map((a) => {
        const matched = a.purchase?.matchedContractId
          ? contractsById.get(a.purchase.matchedContractId) ?? null
          : null;
        const stage = currentPurchaseStage(a, matched);
        const progress = purchaseProgress(a, matched);
        return { asset: a, contract: matched, stage, progress };
      })
      .sort((x, y) => {
        const xActive = x.stage ? 1 : 0;
        const yActive = y.stage ? 1 : 0;
        if (xActive !== yActive) return yActive - xActive;
        return (y.asset.purchase?.decidedAt ?? '').localeCompare(x.asset.purchase?.decidedAt ?? '');
      });
  }, [assets, contractsById]);

  const activeCount = rows.filter((r) => r.stage).length;
  const closedCount = rows.length - activeCount;

  return (
    <>
    <PageShell
      subTabs={ASSET_SUBTABS}
      subTabPending={subTabPending}
      footerLeft={
        <>
          <span className="stat-item">전체 <strong>{rows.length}</strong></span>
          <span className="stat-item">진행중 <strong>{activeCount}</strong></span>
          <span className="stat-item">완료 <strong>{closedCount}</strong></span>
        </>
      }
      footerRight={
        <button className="btn btn-primary" onClick={() => setDialogOpen(true)}>
          <ShoppingCart size={13} weight="bold" /> + 차량구매
        </button>
      }
    >
      <div style={{ padding: 12 }}>
        {rows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48 }} className="text-weak text-xs">
            진행중인 차량구매 없음. 우측 하단 <strong>+ 차량구매</strong> 로 시작하세요.
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 130 }}>차량</th>
                <th>차종</th>
                <th style={{ width: 200 }}>매칭계약</th>
                <th style={{ width: 130 }}>현재단계</th>
                <th style={{ width: 80 }} className="num">진행률</th>
                <th style={{ width: 110 }}>출고예정일</th>
                <th style={{ width: 120 }}>구매결정</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ asset, contract, stage, progress }) => {
                const placeholder = isPurchasePlaceholderPlate(asset.plate);
                const expectedDelivery = asset.purchase?.expectedDeliveryDate;
                const dueIn = expectedDelivery ? daysFromToday(expectedDelivery) : null;
                return (
                  <tr key={asset.id} style={{ cursor: 'pointer' }}>
                    <td className="mono">
                      <Link href={`/asset/purchase/${asset.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                        {placeholder ? (
                          <span className="text-amber" title="placeholder — 상품화·등록 단계에서 실제값 입력">
                            <Warning size={11} weight="fill" /> {asset.plate}
                          </span>
                        ) : (
                          asset.plate
                        )}
                      </Link>
                    </td>
                    <td className="text-xs">
                      <Link href={`/asset/purchase/${asset.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                        {asset.purchase?.vehicleSpecMemo || asset.vehicleName || <span className="dim">-</span>}
                        {asset.purchase?.exteriorColor && <span className="dim"> · {asset.purchase.exteriorColor}</span>}
                      </Link>
                    </td>
                    <td className="text-xs">
                      <Link href={`/asset/purchase/${asset.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                        {contract
                          ? <><span className="mono">{contract.contractNo}</span> · {contract.customerName}</>
                          : <span className="dim">선도(재고)</span>}
                      </Link>
                    </td>
                    <td>
                      <Link href={`/asset/purchase/${asset.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                        {stage ? (
                          <span className="badge badge-blue">{PURCHASE_STAGE_LABEL[stage]}</span>
                        ) : (
                          <span className="badge badge-green">
                            <CheckCircle size={11} weight="fill" /> 완료
                          </span>
                        )}
                      </Link>
                    </td>
                    <td className="num text-xs">
                      <Link href={`/asset/purchase/${asset.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                        {progress.done}/{progress.total}
                      </Link>
                    </td>
                    <td className="text-xs">
                      <Link href={`/asset/purchase/${asset.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                        {expectedDelivery ? (
                          <span className={dueIn !== null && dueIn <= 2 && dueIn >= 0 ? 'text-amber' : ''}>
                            {expectedDelivery}
                            {dueIn !== null && dueIn >= 0 && dueIn <= 7 && (
                              <span className="dim"> · D{dueIn === 0 ? '-Day' : `-${dueIn}`}</span>
                            )}
                          </span>
                        ) : (
                          <span className="dim">-</span>
                        )}
                      </Link>
                    </td>
                    <td className="text-xs">
                      <Link href={`/asset/purchase/${asset.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                        {asset.purchase?.decidedAt?.slice(0, 10) ?? '-'}
                        <br />
                        <span className="dim">{actorDisplayName(asset.purchase?.decidedBy)}</span>
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </PageShell>

    <PurchaseStartDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}

function daysFromToday(dateStr: string): number | null {
  const t = Date.parse(dateStr);
  if (!Number.isFinite(t)) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.round((t - today.getTime()) / dayMs);
}
