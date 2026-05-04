'use client';

import { useMemo, useState } from 'react';
import { Hourglass } from '@phosphor-icons/react';
import { PageShell } from '@/components/layout/page-shell';
import { ListFilterbar, applyListFilter } from '@/components/ui/list-filterbar';
import { PENDING_SUBTABS, usePendingSubtabPending } from '@/lib/pending-subtabs';
import { useAssetStore } from '@/lib/use-asset-store';
import { useContractStore } from '@/lib/use-contract-store';
import { collectPending } from '@/lib/pending-aggregators';
import { cn } from '@/lib/cn';

/**
 * 미결업무 — 모든 미결 작업 통합 목록.
 *
 * 출처:
 *  · 자산: 검사 만기 (asset.inspectionTo D-30), 정비 진행중 (asset.status='정비')
 *  · 계약 events: 출고/수납/검사/정비/보험/반납/기타 7타입 모두 status='예정'
 *
 * 컬럼 순서: 회사 → 차량번호 → 업무구분 → 상태 → 차명 → 임차인 → 연락처 → 회차 → 기한 → D-day → 금액
 */
export default function PendingPage() {
  const [assets] = useAssetStore();
  const [contracts] = useContractStore();
  const subTabPending = usePendingSubtabPending();
  const allItems = useMemo(() => collectPending(assets, contracts), [assets, contracts]);
  const [company, setCompany] = useState('');
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('');

  const items = useMemo(() => {
    const base = applyListFilter(
      allItems,
      { company, search },
      (r) => r.companyCode,
      (r) => `${r.plate} ${r.customerName} ${r.vehicleName} ${r.location}`,
    );
    return kind ? base.filter((r) => r.kind === kind) : base;
  }, [allItems, company, search, kind]);

  // 종류별 카운트 (필터 전 — 칩 카운트 일관성)
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const i of allItems) c[i.kind] = (c[i.kind] ?? 0) + 1;
    return c;
  }, [allItems]);

  return (
    <PageShell
      subTabs={PENDING_SUBTABS}
      subTabPending={subTabPending}
      filterbar={
        <ListFilterbar
          company={company} onCompanyChange={setCompany}
          search={search}   onSearchChange={setSearch}
          searchPlaceholder="차량번호 / 차명 / 임차인 / 위치 검색"
          extra={
            <select className="input" value={kind} onChange={(e) => setKind(e.target.value)} style={{ width: 110 }}>
              <option value="">전체 업무</option>
              <option value="검사">검사</option>
              <option value="출고">출고</option>
              <option value="정비">정비</option>
              <option value="보험">보험</option>
              <option value="반납">반납</option>
              <option value="기타">기타</option>
            </select>
          }
        />
      }
      footerLeft={
        <>
          <span className="stat-item">전체 <strong>{items.length}</strong></span>
          {counts['검사'] ? <span className="stat-item">검사 <strong>{counts['검사']}</strong></span> : null}
          {counts['출고'] ? <span className="stat-item">출고 <strong>{counts['출고']}</strong></span> : null}
          {counts['정비'] ? <span className="stat-item">정비 <strong>{counts['정비']}</strong></span> : null}
          {counts['보험'] ? <span className="stat-item">보험 <strong>{counts['보험']}</strong></span> : null}
          {counts['반납'] ? <span className="stat-item">반납 <strong>{counts['반납']}</strong></span> : null}
          {counts['기타'] ? <span className="stat-item">기타 <strong>{counts['기타']}</strong></span> : null}
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
                <th>회사</th>
                <th>차량번호</th>
                <th>업무구분</th>
                <th>상태</th>
                <th>작업상태</th>
                <th>차량상태</th>
                <th>차명</th>
                <th>위치</th>
                <th>입고지</th>
                <th>임차인</th>
                <th>연락처</th>
                <th className="num">회차</th>
                <th className="date">기한</th>
                <th className="num">D-day</th>
                <th className="num">금액</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id}>
                  <td className="plate">{p.companyCode}</td>
                  <td className="plate text-medium">{p.plate}</td>
                  <td><span className="badge">{p.kind}</span></td>
                  <td>
                    <span className={cn('badge', p.status === '미납' ? 'badge-red' : 'badge-orange')}>
                      {p.status}
                    </span>
                  </td>
                  <td>
                    <span className={cn('badge',
                      p.workStatus === '지연' ? 'badge-red'
                      : p.workStatus === '작업중' ? 'badge-blue'
                      : '',
                    )}>
                      {p.workStatus}
                    </span>
                  </td>
                  <td className="dim">{p.vehicleStatus}</td>
                  <td className="dim truncate" style={{ maxWidth: 160 }} title={p.vehicleName}>{p.vehicleName || '-'}</td>
                  <td className="dim truncate" style={{ maxWidth: 140 }} title={p.location}>{p.location || '-'}</td>
                  <td className="dim truncate" style={{ maxWidth: 140 }} title={p.inboundLocation}>{p.inboundLocation || '-'}</td>
                  <td>{p.customerName || <span className="text-weak">-</span>}</td>
                  <td className="mono dim">{p.customerPhone || '-'}</td>
                  <td className="num">{p.cycle ? `${p.cycle}회` : '-'}</td>
                  <td className="date">{p.dueDate || '-'}</td>
                  <td className={cn('num', p.daysLeft < 0 && 'text-red', p.daysLeft >= 0 && p.daysLeft <= 7 && 'text-amber')}>
                    {p.dueDate
                      ? (p.daysLeft < 0 ? `${-p.daysLeft}일 경과` : p.daysLeft === 0 ? '오늘' : `D-${p.daysLeft}`)
                      : '-'}
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

