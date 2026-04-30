'use client';

import { PageShell } from '@/components/layout/page-shell';
import { AssetGrid } from '@/components/asset/asset-grid';
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
      <div className="table-wrap">
        <AssetGrid assets={disposed} />
      </div>
    </PageShell>
  );
}
