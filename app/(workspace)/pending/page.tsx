'use client';

import { useMemo } from 'react';
import { Hourglass } from '@phosphor-icons/react';
import { PageShell } from '@/components/layout/page-shell';
import { PENDING_SUBTABS, usePendingSubtabPending } from '@/lib/pending-subtabs';
import { useAssetStore } from '@/lib/use-asset-store';
import { useContractStore } from '@/lib/use-contract-store';
import { collectPending, type PendingItem } from '@/lib/pending-aggregators';
import { cn } from '@/lib/cn';

/**
 * 미결업무 — 검사만기 · 미수납 · 출고미완 (자산 + 계약 events 집계).
 */
export default function PendingPage() {
  const [assets] = useAssetStore();
  const [contracts] = useContractStore();
  const subTabPending = usePendingSubtabPending();
  const items = useMemo(() => collectPending(assets, contracts), [assets, contracts]);

  // 종류별 카운트
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const i of items) c[i.kind] = (c[i.kind] ?? 0) + 1;
    return c;
  }, [items]);

  return (
    <PageShell
      subTabs={PENDING_SUBTABS}
      subTabPending={subTabPending}
      footerLeft={
        <>
          <span className="stat-item">전체 <strong>{items.length}</strong></span>
          {counts['검사만기']  ? <span className="stat-item">검사만기 <strong>{counts['검사만기']}</strong></span>  : null}
          {counts['미수납']    ? <span className="stat-item alert">미수납 <strong>{counts['미수납']}</strong></span>  : null}
          {counts['출고미완']  ? <span className="stat-item alert">출고미완 <strong>{counts['출고미완']}</strong></span>: null}
        </>
      }
    >
      {items.length === 0 ? (
        <div className="page-section-center">
          <Hourglass size={32} className="mx-auto text-weak" />
          <div className="mt-2 text-medium">미결업무 없음</div>
          <div className="mt-1 text-weak">검사 만기 · 미수납 · 출고 미완료가 모두 해결된 상태입니다.</div>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>구분</th>
                <th>회사</th>
                <th>차량</th>
                <th>대상</th>
                <th className="date">기한</th>
                <th className="num">D-day</th>
                <th className="num">금액</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id}>
                  <td><KindBadge kind={p.kind} /></td>
                  <td className="plate">{p.companyCode}</td>
                  <td className="plate">{p.plate}</td>
                  <td className="dim truncate" style={{ maxWidth: 280 }} title={p.target}>{p.target}</td>
                  <td className="date">{p.dueDate}</td>
                  <td className={cn('num', p.daysLeft < 0 && 'text-red', p.daysLeft >= 0 && p.daysLeft <= 7 && 'text-amber')}>
                    {p.daysLeft < 0 ? `${-p.daysLeft}일 경과` : p.daysLeft === 0 ? '오늘' : `D-${p.daysLeft}`}
                  </td>
                  <td className="num">{p.amount ? p.amount.toLocaleString('ko-KR') : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageShell>
  );
}

function KindBadge({ kind }: { kind: PendingItem['kind'] }) {
  const tone =
    kind === '미수납' ? 'badge-red' :
    kind === '출고미완' ? 'badge-orange' :
    kind === '검사만기' ? 'badge-orange' :
    kind === '보험만기' ? 'badge-orange' : '';
  return <span className={`badge ${tone}`}>{kind}</span>;
}
