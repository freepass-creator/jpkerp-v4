'use client';

import { useState, useMemo } from 'react';
import { Download, FileXls, Trash } from '@phosphor-icons/react';
import { PageShell } from '@/components/layout/page-shell';
import { AssetGrid } from '@/components/asset/asset-grid';
import { AssetRegisterDialog } from '@/components/asset/asset-register-dialog';
import { ASSET_SUBTABS } from '@/lib/asset-subtabs';
import { SAMPLE_ASSETS, type Asset, type AssetStatus } from '@/lib/sample-assets';
import { downloadContractTemplate } from '@/lib/contract-template';

/** 자산 페이지 미결 지표 — 추후 실데이터로 교체 */
const ASSET_PENDING = {
  보험미결: 3,
  할부미납: 1,
  등록증갱신: 1,
  매각정산: 0,
};

export default function AssetListPage() {
  const [assets, setAssets] = useState<Asset[]>(SAMPLE_ASSETS);
  const [selected, setSelected] = useState<Asset | null>(null);

  const counts = useMemo(() => {
    const c: Record<AssetStatus, number> = { 운행중: 0, 대기: 0, 정비: 0, 매각: 0 };
    for (const a of assets) c[a.status]++;
    return c;
  }, [assets]);

  const pendings = Object.entries(ASSET_PENDING).filter(([, n]) => n > 0);

  function handleCreate(partial: Partial<Asset>) {
    const next: Asset = {
      id: `a-${Date.now()}`,
      plate: partial.plate ?? '신규',
      carType: partial.carType ?? '',
      year: partial.year ?? new Date().getFullYear(),
      owner: partial.owner ?? '',
      registDate: partial.registDate ?? new Date().toISOString().slice(0, 10),
      vin: partial.vin ?? '',
      maker: partial.maker,
      model: partial.model,
      trim: partial.trim,
      color: partial.color,
      options: partial.options,
      status: '대기',
    };
    setAssets((prev) => [next, ...prev]);
    setSelected(next);
  }

  return (
    <PageShell
      subTabs={ASSET_SUBTABS}
      footerLeft={
        <>
          <span className="stat-item">전체 <strong>{assets.length}</strong></span>
          <span className="stat-item"><span className="status-dot 운행" />운행중 <strong>{counts.운행중}</strong></span>
          <span className="stat-item"><span className="status-dot 대기" />대기 <strong>{counts.대기}</strong></span>
          <span className="stat-item"><span className="status-dot 정비" />정비 <strong>{counts.정비}</strong></span>
          <span className="stat-item"><span className="status-dot 매각" />매각 <strong>{counts.매각}</strong></span>

          {pendings.length > 0 && <span className="stat-divider" />}
          {pendings.map(([label, n]) => (
            <span key={label} className="stat-item alert">
              {label} <strong>{n}</strong>
            </span>
          ))}

          {selected && (
            <>
              <span className="stat-divider" />
              <span className="stat-item">선택 <strong className="plate">{selected.plate}</strong></span>
            </>
          )}
        </>
      }
      footerRight={
        <>
          <button className="btn">
            <FileXls size={14} weight="bold" /> 엑셀
          </button>
          <button
            className="btn"
            disabled={!selected}
            onClick={() => selected && downloadContractTemplate(selected)}
          >
            <Download size={14} weight="bold" /> 계약 템플릿
          </button>
          <button className="btn" disabled={!selected}>
            <Trash size={14} weight="bold" /> 삭제
          </button>
          <AssetRegisterDialog onCreate={handleCreate} />
        </>
      }
    >
      <div className="table-wrap">
        <AssetGrid assets={assets} selectedId={selected?.id} onRowClick={setSelected} />
      </div>
    </PageShell>
  );
}
