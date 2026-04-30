'use client';

import { useState, useMemo } from 'react';
import { Download, FileXls, Trash, PencilSimple, Copy, Plus } from '@phosphor-icons/react';
import { PageShell } from '@/components/layout/page-shell';
import { AssetGrid } from '@/components/asset/asset-grid';
import dynamic from 'next/dynamic';
import type { EditMode } from '@/components/asset/asset-edit-dialog';
const AssetRegisterDialog = dynamic(
  () => import('@/components/asset/asset-register-dialog').then((m) => m.AssetRegisterDialog),
  { ssr: false },
);
const AssetEditDialog = dynamic(
  () => import('@/components/asset/asset-edit-dialog').then((m) => m.AssetEditDialog),
  { ssr: false },
);
import { ContextMenu, type ContextMenuItem } from '@/components/ui/context-menu';
import { ASSET_SUBTABS, useAssetSubtabPending } from '@/lib/asset-subtabs';
import { type Asset, type AssetStatus } from '@/lib/sample-assets';
import { useAssetStore } from '@/lib/use-asset-store';
import { downloadContractTemplate } from '@/lib/contract-template';

export default function AssetListPage() {
  const [assets, setAssets] = useAssetStore();
  const [selected, setSelected] = useState<Asset | null>(null);

  // 수정/복사 다이얼로그 상태
  const [editOpen, setEditOpen] = useState(false);
  const [editMode, setEditMode] = useState<EditMode>('edit');

  // 우클릭 컨텍스트 메뉴
  const [ctxMenu, setCtxMenu] = useState<{ open: boolean; x: number; y: number }>({ open: false, x: 0, y: 0 });

  // 자산등록 다이얼로그 — 컨텍스트 메뉴에서도 열 수 있게 외부 컨트롤
  const [registerOpen, setRegisterOpen] = useState(false);

  const counts = useMemo(() => {
    const c: Record<AssetStatus, number> = { 등록예정: 0, 대기: 0, 운행중: 0, 정비: 0, 매각: 0 };
    for (const a of assets) c[a.status]++;
    return c;
  }, [assets]);

  const subTabPending = useAssetSubtabPending();
  const pendings = useMemo<[string, number][]>(() => {
    const items: [string, number][] = [];
    const ins = subTabPending['/asset/insurance'] ?? 0;
    const loan = subTabPending['/asset/loan'] ?? 0;
    const insp = subTabPending['/asset/inspection'] ?? 0;
    if (ins > 0) items.push(['보험미결', ins]);
    if (loan > 0) items.push(['할부미납', loan]);
    if (insp > 0) items.push(['검사만기', insp]);
    return items;
  }, [subTabPending]);

  function handleCreate(partial: Partial<Asset>) {
    const next: Asset = {
      id: `a-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      companyCode: partial.companyCode ?? 'CP01',
      plate: partial.plate ?? '',
      firstRegistDate: partial.firstRegistDate ?? '',
      vehicleClass: partial.vehicleClass ?? '',
      usage: partial.usage ?? '자가용',
      vehicleName: partial.vehicleName ?? '',
      vin: partial.vin ?? '',
      ownerName: partial.ownerName ?? '',
      ...partial,
      status: partial.status ?? '등록예정',
    } as Asset;
    setAssets((prev) => [next, ...prev]);
    setSelected(next);
  }

  function handleUpdate(partial: Partial<Asset>) {
    if (!selected) return;
    const updated: Asset = { ...selected, ...partial } as Asset;
    setAssets((prev) => prev.map((a) => (a.id === selected.id ? updated : a)));
    setSelected(updated);
  }

  function openEdit(mode: EditMode) {
    if (!selected) return;
    setEditMode(mode);
    setEditOpen(true);
  }

  function handleDelete() {
    if (!selected) return;
    if (!confirm(`${selected.companyCode} ${selected.plate || selected.vehicleName} 자산을 삭제할까요?`)) return;
    setAssets((prev) => prev.filter((a) => a.id !== selected.id));
    setSelected(null);
  }

  return (
    <>
      <PageShell
        subTabs={ASSET_SUBTABS}
        subTabPending={subTabPending}
        footerLeft={
          <>
            <span className="stat-item">전체 <strong>{assets.length}</strong></span>
            <span className="stat-item"><span className="status-dot 예정" />등록예정 <strong>{counts.등록예정}</strong></span>
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
                <span className="stat-item">선택 <strong className="plate">{selected.plate || selected.vehicleName}</strong></span>
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
              disabled={!selected || !selected.plate}
              onClick={() => selected && downloadContractTemplate(selected)}
              title={selected && !selected.plate ? '등록증 등록 후 가능' : ''}
            >
              <Download size={14} weight="bold" /> 계약 템플릿
            </button>
            <button className="btn" disabled={!selected} onClick={() => openEdit('edit')}>
              <PencilSimple size={14} weight="bold" /> 수정
            </button>
            <button className="btn" disabled={!selected} onClick={() => openEdit('duplicate')}>
              <Copy size={14} weight="bold" /> 복사
            </button>
            <button className="btn" disabled={!selected} onClick={handleDelete}>
              <Trash size={14} weight="bold" /> 삭제
            </button>
            <AssetRegisterDialog
              onCreate={handleCreate}
              open={registerOpen}
              onOpenChange={setRegisterOpen}
            />
          </>
        }
      >
        <div className="table-wrap">
          <AssetGrid
            assets={assets}
            selectedId={selected?.id}
            onRowClick={setSelected}
            onRowContextMenu={(_a, x, y) => setCtxMenu({ open: true, x, y })}
          />
        </div>
      </PageShell>

      <ContextMenu
        open={ctxMenu.open}
        x={ctxMenu.x}
        y={ctxMenu.y}
        onClose={() => setCtxMenu({ open: false, x: 0, y: 0 })}
        items={selected ? buildContextMenu({
          onEdit: () => openEdit('edit'),
          onDuplicate: () => openEdit('duplicate'),
          onDelete: handleDelete,
          onRegister: () => setRegisterOpen(true),
        }) : []}
      />

      {selected && (
        <AssetEditDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          mode={editMode}
          initial={selected}
          onSave={editMode === 'edit' ? handleUpdate : handleCreate}
        />
      )}
    </>
  );
}

function buildContextMenu({
  onEdit,
  onDuplicate,
  onDelete,
  onRegister,
}: {
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onRegister: () => void;
}): ContextMenuItem[] {
  return [
    { label: '수정',     icon: <PencilSimple size={12} weight="bold" />, onClick: onEdit },
    { label: '복사',     icon: <Copy size={12} weight="bold" />,         onClick: onDuplicate },
    { label: '삭제',     icon: <Trash size={12} weight="bold" />,        onClick: onDelete, danger: true },
    { label: '', divider: true, onClick: () => {} },
    { label: '자산등록', icon: <Plus size={12} weight="bold" />,         onClick: onRegister },
  ];
}
