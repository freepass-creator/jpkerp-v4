'use client';

import { Wrench } from '@phosphor-icons/react';
import { PageShell } from '@/components/layout/page-shell';
import { EmptyState } from '@/components/ui/empty-state';
import { ASSET_SUBTABS, useAssetSubtabPending } from '@/lib/asset-subtabs';

/**
 * 차량수선 — 자산별 정비/수선 이력.
 * 한 row = 1 자산 × 1 수선건.
 */
export default function AssetRepairPage() {
  const subTabPending = useAssetSubtabPending();
  const repairs: unknown[] = [];
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
      {repairs.length === 0 ? (
        <EmptyState
          icon={Wrench}
          title="수선 이력 없음"
          description="차량 수선·정비 기록이 없습니다."
          hint={<>① 좌측 [업무작성] → 차량수선 카테고리<br />② 차량·일시·내용·금액 입력<br />③ 자산별 누적 표시</>}
        />
      ) : (
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
            </tbody>
          </table>
        </div>
      )}
    </PageShell>
  );
}
