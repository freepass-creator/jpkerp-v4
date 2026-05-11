'use client';

import { Coin } from '@phosphor-icons/react';
import { PageShell } from '@/components/layout/page-shell';
import { AssetGrid } from '@/components/asset/asset-grid';
import { EmptyState } from '@/components/ui/empty-state';
import { ASSET_SUBTABS, useAssetSubtabPending } from '@/lib/asset-subtabs';
import { useAssetStore } from '@/lib/use-asset-store';

export default function AssetDisposalPage() {
  const [assets] = useAssetStore();
  const subTabPending = useAssetSubtabPending();
  const disposed = assets.filter((a) => a.status === '매각');

  return (
    <PageShell
      subTabs={ASSET_SUBTABS}
      subTabPending={subTabPending}
      footerLeft={<span className="stat">매각 <strong>{disposed.length}</strong></span>}
      footerRight={<button className="btn btn-primary">+ 처분 등록</button>}
    >
      {disposed.length === 0 ? (
        <EmptyState
          icon={Coin}
          title="처분된 자산 없음"
          description="매각·폐차·전손 처분 이력이 표시됩니다."
          hint={<>① 자산 우클릭 → 상태 변경 → 매각<br />② 또는 [+ 처분 등록] 으로 직접 등록<br />③ 처분 시 자산코드는 영구 보존, 운행 흐름만 종료</>}
        />
      ) : (
        <div className="table-wrap">
          <AssetGrid assets={disposed} />
        </div>
      )}
    </PageShell>
  );
}
