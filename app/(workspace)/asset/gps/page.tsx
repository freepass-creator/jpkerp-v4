'use client';

import { MapPin } from '@phosphor-icons/react';
import { PageShell } from '@/components/layout/page-shell';
import { EmptyState } from '@/components/ui/empty-state';
import { ASSET_SUBTABS, useAssetSubtabPending } from '@/lib/asset-subtabs';

export default function AssetGpsPage() {
  const subTabPending = useAssetSubtabPending();
  const devices: unknown[] = [];
  return (
    <PageShell
      subTabs={ASSET_SUBTABS}
      subTabPending={subTabPending}
      footerLeft={<span className="stat">전체 <strong>0</strong></span>}
      footerRight={<button className="btn btn-primary">+ 단말 등록</button>}
    >
      {devices.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="GPS 단말 등록된 차량 없음"
          description="차량별 GPS 단말 정보를 등록하세요."
          hint={<>① 자산이 먼저 등록되어 있어야 함<br />② 단말 시리얼·통신사·요금제 매핑<br />③ 위치 실시간 조회·이력 조회 가능</>}
        />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>회사코드</th>
                <th>차량번호</th>
                <th>단말 모델</th>
                <th className="date">장착일</th>
                <th className="center">시동제어</th>
                <th className="date">마지막 통신</th>
                <th>마지막 위치</th>
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
