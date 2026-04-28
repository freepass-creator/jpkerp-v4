'use client';

import { PageShell } from '@/components/layout/page-shell';
import { AssetGrid } from '@/components/asset/asset-grid';
import { ASSET_SUBTABS, ASSET_SUBTAB_PENDING } from '@/lib/asset-subtabs';
import { SAMPLE_ASSETS } from '@/lib/sample-assets';

export default function AssetDisposalPage() {
  const disposed = SAMPLE_ASSETS.filter((a) => a.status === '매각');

  return (
    <PageShell
      subTabs={ASSET_SUBTABS}
      subTabPending={ASSET_SUBTAB_PENDING}
      footerLeft={<span className="stat">매각 <strong>{disposed.length}</strong></span>}
      footerRight={<button className="btn btn-primary">+ 처분 등록</button>}
    >
      <div className="table-wrap">
        <AssetGrid assets={disposed} />
      </div>
    </PageShell>
  );
}
