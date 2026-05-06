'use client';

import { useState, useMemo } from 'react';
import { Download, FileXls, Trash, PencilSimple, Copy, Plus } from '@phosphor-icons/react';
import { PageShell } from '@/components/layout/page-shell';
import { AssetGrid } from '@/components/asset/asset-grid';
import { EmptyState } from '@/components/ui/empty-state';
import { Car } from '@phosphor-icons/react';
import { useTopbarSearch } from '@/lib/use-topbar-search';
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
import { activeAssets, type Asset, type AssetStatus } from '@/lib/sample-assets';
import { useAssetStore } from '@/lib/use-asset-store';
import { useCompanyStore } from '@/lib/use-company-store';
import { useAuditStamp } from '@/lib/audit-fields';
import { nextCompanyScopedCode } from '@/lib/code-gen';
import { genId } from '@/lib/ids';
import { downloadContractTemplate } from '@/lib/contract-template';
import Link from 'next/link';
import { Buildings } from '@phosphor-icons/react';

export default function AssetListPage() {
  const [allAssets, setAssets] = useAssetStore();
  const [allCompanies] = useCompanyStore();
  // active 자산만 — 소프트 삭제된 자산은 목록·집계에서 제외 (자산코드는 영구 보존)
  const assets = useMemo(() => activeAssets(allAssets), [allAssets]);
  const hasCompany = useMemo(() => allCompanies.some((c) => !c.deletedAt), [allCompanies]);
  const [selected, setSelected] = useState<Asset | null>(null);
  const { search } = useTopbarSearch();
  const audit = useAuditStamp();

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
    if (!partial.companyCode) {
      alert('회사코드 누락 — 자산 등록 전 [일반관리 → 회사정보] 에서 회사를 먼저 등록하세요.');
      return;
    }
    const companyCode = partial.companyCode;
    // 배치 등록(register-dialog) 은 partial.assetCode 를 미리 발급해서 넘김 — 그대로 사용.
    // 단건/복사 등 코드가 없는 케이스만 새로 발급.
    const assetCode = partial.assetCode || nextCompanyScopedCode(
      'VH',
      companyCode,
      allAssets.map((a) => a.assetCode).filter((c): c is string => !!c),
      { pad: 4 },
    );
    const next: Asset = {
      id: genId('a'),
      companyCode,
      plate: partial.plate ?? '',
      firstRegistDate: partial.firstRegistDate ?? '',
      vehicleClass: partial.vehicleClass ?? '',
      usage: partial.usage ?? '자가용',
      vehicleName: partial.vehicleName ?? '',
      vin: partial.vin ?? '',
      ownerName: partial.ownerName ?? '',
      ...partial,
      assetCode,
      status: partial.status ?? '등록예정',
      ...audit.create(),
    } as Asset;
    setAssets((prev) => [next, ...prev]);
    setSelected(next);
    audit.log({ action: 'create', entityType: 'asset', entityId: next.id, label: next.plate, after: next });
  }

  function handleUpdate(partial: Partial<Asset>) {
    if (!selected) return;
    // assetCode 는 변경 불가 — 원본 보존
    const { assetCode: _ignore, ...rest } = partial;
    void _ignore;
    const updated: Asset = { ...selected, ...rest, assetCode: selected.assetCode, ...audit.update() } as Asset;
    setAssets((prev) => prev.map((a) => (a.id === selected.id ? updated : a)));
    setSelected(updated);
    audit.log({ action: 'update', entityType: 'asset', entityId: updated.id, label: updated.plate, before: selected, after: updated });
  }

  function openEdit(mode: EditMode) {
    if (!selected) return;
    setEditMode(mode);
    setEditOpen(true);
  }

  function handleDelete() {
    if (!selected) return;
    if (!confirm(`${selected.companyCode} ${selected.plate || selected.vehicleName} 자산을 삭제할까요? (자산코드는 영구 보존 — 재발급 안 됨)`)) return;
    setAssets((prev) => prev.map((a) => a.id === selected.id ? { ...a, ...audit.delete() } : a));
    audit.log({ action: 'delete', entityType: 'asset', entityId: selected.id, label: selected.plate, before: selected });
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
        {assets.length === 0 ? (
          !hasCompany ? (
            <EmptyState
              icon={Buildings}
              title="회사정보를 먼저 등록해주세요"
              description="자산·계약·재무 모든 데이터는 회사(사업자) 단위로 묶여 동작합니다."
              hint={<>① [회사 등록하러 가기] → 사업자등록증 OCR 또는 수기 입력<br />② 회사 등록 후 자동차등록증 OCR 시 자동 매칭<br />③ 그 다음 자산·계약 등록</>}
              cta={
                <Link href="/admin/company" className="btn btn-primary">
                  회사 등록하러 가기 →
                </Link>
              }
            />
          ) : (
            <EmptyState
              icon={Car}
              title="등록된 자산 없음"
              description="자동차등록증 OCR 또는 수기 입력으로 차량 자산을 등록하세요."
              hint={<>① 우측 하단 [+ 자산등록] 클릭 → 등록증 PDF/이미지 다중 업로드 → 즉시 OCR 분석<br />② 회사·차량번호는 OCR이 자동 매칭. 누락 시 행에서 직접 입력 가능 (인라인)</>}
            />
          )
        ) : (
          <div className="table-wrap">
            <AssetGrid
              assets={assets}
              selectedId={selected?.id}
              onRowClick={setSelected}
              onRowContextMenu={(_a, x, y) => setCtxMenu({ open: true, x, y })}
              globalSearch={search}
            />
          </div>
        )}
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
