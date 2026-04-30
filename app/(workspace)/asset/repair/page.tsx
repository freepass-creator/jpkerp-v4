'use client';

import { PageShell } from '@/components/layout/page-shell';
import { ASSET_SUBTABS, useAssetSubtabPending } from '@/lib/asset-subtabs';

/**
 * 차량수선 — 자산별 정비/수선 이력.
 * 한 row = 1 자산 × 1 수선건.
 */
export default function AssetRepairPage() {
  const subTabPending = useAssetSubtabPending();
  return (
    <PageShell
      subTabs={ASSET_SUBTABS}
      subTabPending={subTabPending}
      footerLeft={
        <>
          <span className="stat-item">전체 <strong>0</strong></span>
          <span className="stat-item">진행중 <strong>0</strong></span>
          <span className="stat-item">완료 <strong>0</strong></span>
        </>
      }
      footerRight={
        <>
          <button className="btn">엑셀</button>
          <button className="btn btn-primary">+ 수선 등록</button>
        </>
      }
    >
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>회사코드</th>
              <th>차량번호</th>
              <th>수선번호</th>
              <th>차명</th>
              <th>수선 구분</th>
              <th className="date">접수일</th>
              <th className="date">완료일</th>
              <th>정비소</th>
              <th>증상</th>
              <th>작업 내역</th>
              <th className="num">부품비</th>
              <th className="num">공임</th>
              <th className="num">합계</th>
              <th>담당자</th>
              <th className="center">상태</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={15} className="empty-row">
                수선 이력 없음 — [+ 수선 등록] 또는 업무일지에서 차량수선 입력 시 자동 누적
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </PageShell>
  );
}
