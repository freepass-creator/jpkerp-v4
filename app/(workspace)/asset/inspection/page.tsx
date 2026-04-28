'use client';

import { PageShell } from '@/components/layout/page-shell';
import { ASSET_SUBTABS, ASSET_SUBTAB_PENDING } from '@/lib/asset-subtabs';
import { SAMPLE_ASSETS } from '@/lib/sample-assets';
import { cn } from '@/lib/cn';

/**
 * 검사내역 — 등록증 4. 검사 유효기간 (㉚ ~ ㉟) 별도 관리.
 * 만기까지 D-day 컬럼 색상 코딩 (D-30 빨강 / D-90 주황).
 */
export default function AssetInspectionPage() {
  return (
    <PageShell
      subTabs={ASSET_SUBTABS}
      subTabPending={ASSET_SUBTAB_PENDING}
      footerLeft={<span className="stat-item">전체 <strong>{SAMPLE_ASSETS.length}</strong></span>}
      footerRight={<button className="btn btn-primary">+ 검사 등록</button>}
    >
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>회사코드</th>
              <th>차량번호</th>
              <th>차명</th>
              <th className="date">연월일부터</th>
              <th className="date">연월일까지</th>
              <th className="center">D-day</th>
              <th>검사 시행장소</th>
              <th className="num">주행거리</th>
              <th>검사 책임자 확인</th>
              <th>검사 구분</th>
            </tr>
          </thead>
          <tbody>
            {SAMPLE_ASSETS.map((a) => {
              const dday = computeDday(a.inspectionTo);
              const ddayClass = ddayCellClass(dday);
              return (
                <tr key={a.id}>
                  <td className="plate">{a.companyCode}</td>
                  <td className="plate">{a.plate || <span className="text-muted">-</span>}</td>
                  <td>{a.vehicleName}</td>
                  <td className="date">{a.inspectionFrom ?? ''}</td>
                  <td className="date">{a.inspectionTo ?? ''}</td>
                  <td className={cn('center', ddayClass)}>
                    {dday === null ? <span className="text-muted">-</span> : formatDday(dday)}
                  </td>
                  <td>{a.inspectionPlace ?? ''}</td>
                  <td className="num">{a.mileage?.toLocaleString('ko-KR') ?? ''}</td>
                  <td>{a.inspectionAuthority ?? ''}</td>
                  <td className="dim">{a.inspectionType ?? ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </PageShell>
  );
}

/* 만기까지 일수 (양수=남음, 음수=경과). 데이터 없으면 null. */
function computeDday(inspectionTo?: string): number | null {
  if (!inspectionTo) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const due = new Date(inspectionTo);
  if (isNaN(due.getTime())) return null;
  return Math.floor((due.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
}

function formatDday(d: number): string {
  if (d === 0) return 'D-day';
  if (d > 0) return `D-${d}`;
  return `D+${-d}`;
}

/* 색상 정책: 경과(<0) 또는 D-30 이내 → 빨강 / D-90 이내 → 주황 / 그 외 평범 */
function ddayCellClass(d: number | null): string {
  if (d === null) return '';
  if (d < 30) return 'overdue';
  if (d < 90) return 'due-soon';
  return '';
}
