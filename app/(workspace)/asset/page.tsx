'use client';

import { useState, useMemo } from 'react';
import { Download, FileXls, Trash, PencilSimple, Copy, Plus, ShoppingCart } from '@phosphor-icons/react';
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
import { useConfirmWithEmail } from '@/lib/confirm-with-email';
import { uploadDataUrl } from '@/lib/firebase/storage';
import { nextCompanyScopedCode } from '@/lib/code-gen';
import { genId } from '@/lib/ids';
import { assetKeyFn, describeAssetDuplicate } from '@/lib/asset-dedup';
import { buildKeyIndex, matchAgainstIndex } from '@/lib/dedup';
import { downloadContractTemplate } from '@/lib/contract-template';
import Link from 'next/link';
import { Buildings } from '@phosphor-icons/react';

export default function AssetListPage() {
  const [allAssets, setAssets, assetsReady] = useAssetStore();
  const [allCompanies] = useCompanyStore();
  // active 자산만 — 소프트 삭제된 자산은 목록·집계에서 제외 (자산코드는 영구 보존)
  const assets = useMemo(() => activeAssets(allAssets), [allAssets]);
  const hasCompany = useMemo(() => allCompanies.some((c) => !c.deletedAt), [allCompanies]);
  const [selected, setSelected] = useState<Asset | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { search } = useTopbarSearch();
  const audit = useAuditStamp();
  const confirmWithEmail = useConfirmWithEmail();

  // 조회/수정/복사 다이얼로그 상태
  const [editOpen, setEditOpen] = useState(false);
  const [editMode, setEditMode] = useState<EditMode>('view');

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

  async function handleCreate(partial: Partial<Asset>) {
    if (!partial.companyCode) {
      alert('회사코드 누락 — 자산 등록 전 [일반관리 → 회사정보] 에서 회사를 먼저 등록하세요.');
      return;
    }
    // 중복 검사 — VIN > plate 우선순위 (assetKeyFn). 이미 등록된 자산과 충돌 시 거부.
    const dupIndex = buildKeyIndex<Partial<Asset>>(allAssets.filter((a) => !a.deletedAt), assetKeyFn);
    const dup = matchAgainstIndex(partial, dupIndex, assetKeyFn);
    if (dup) {
      const reason = describeAssetDuplicate(dup.matchedKey);
      const dupAsset = dup.matchedExisting as Asset;
      alert(
        reason === 'vin'
          ? `차대번호 중복 — ${partial.vin}\n이미 ${dupAsset.assetCode || dupAsset.plate} 자산에 등록됨.`
          : `차량번호 중복 — ${partial.plate}\n이미 ${dupAsset.assetCode || dupAsset.companyCode} 자산에 등록됨.`,
      );
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
    // fileDataUrl base64 → Storage 업로드 (RTDB write 한계 회피)
    let fileDataUrl = partial.fileDataUrl;
    if (fileDataUrl && fileDataUrl.startsWith('data:')) {
      try {
        fileDataUrl = await uploadDataUrl(`assets/${assetCode}/cert`, fileDataUrl);
      } catch (e) {
        console.error('[asset-create] Storage upload 실패', assetCode, e);
        fileDataUrl = undefined;
      }
    }
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
      fileDataUrl,
      assetCode,
      status: partial.status ?? '등록예정',
      ...audit.create(),
    } as Asset;
    setAssets((prev) => [next, ...prev]);
    setSelected(next);
    audit.log({ action: 'create', entityType: 'asset', entityId: next.id, label: next.plate, after: next });
  }

  /**
   * 일괄 등록 — 엑셀/OCR 다건. RTDB write 1회 + audit 1건으로 성능 N배 개선.
   * 행별 중복 검증·검사는 다이얼로그 측에서 미리 처리됨 (assetCode 발급 완료 상태).
   *
   * OCR 결과의 fileDataUrl(base64 이미지) 은 RTDB write size 한계를 피하기 위해
   * 먼저 Firebase Storage 로 업로드 후 downloadURL 로 치환.
   */
  async function handleCreateBatch(partials: Partial<Asset>[]) {
    if (partials.length === 0) return;
    // 0) fileDataUrl base64 → Storage 업로드 → URL 치환 (병렬)
    const uploadedPartials = await Promise.all(partials.map(async (p) => {
      if (p.fileDataUrl && p.fileDataUrl.startsWith('data:')) {
        try {
          const url = await uploadDataUrl(`assets/${p.assetCode}/cert`, p.fileDataUrl);
          return { ...p, fileDataUrl: url };
        } catch (e) {
          console.error('[asset-batch] Storage upload 실패 — base64 drop', p.assetCode, e);
          // Storage 업로드 실패 시 base64 drop (RTDB write 한계 방지)
          // 등록증 이미지 없이 메타데이터만 저장
          return { ...p, fileDataUrl: undefined };
        }
      }
      return p;
    }));
    const stamp = audit.create();
    const next: Asset[] = uploadedPartials.map((p) => ({
      id: p.assetCode || genId('a'),
      companyCode: p.companyCode ?? '',
      plate: p.plate ?? '',
      firstRegistDate: p.firstRegistDate ?? '',
      vehicleClass: p.vehicleClass ?? '',
      usage: p.usage ?? '자가용',
      vehicleName: p.vehicleName ?? '',
      vin: p.vin ?? '',
      ownerName: p.ownerName ?? '',
      ...p,
      assetCode: p.assetCode,
      status: p.status ?? '등록예정',
      ...stamp,
    } as Asset));

    // assetCode 누락/중복 진단 — getKey 가 keyed object 라 같은 키는 덮어씀
    const codes = next.map((a) => a.assetCode).filter((c): c is string => !!c);
    const codeSet = new Set(codes);
    const missing = next.filter((a) => !a.assetCode).length;
    const dupCount = codes.length - codeSet.size;
    if (missing > 0 || dupCount > 0) {
      console.warn('[asset-batch] 진단:', { total: next.length, missing, dupCount, codes });
      alert(
        `⚠ 일괄 등록 중 ${missing > 0 ? `${missing}건 자산코드 누락 / ` : ''}${dupCount > 0 ? `${dupCount}건 자산코드 중복 ` : ''}— ` +
        `RTDB 에 ${codeSet.size}건만 저장됩니다.`,
      );
    }

    setAssets((prev) => {
      // 기존 cache 와 새 자산 합치되, 같은 assetCode 가 있으면 새 것이 이김 (마이그레이션 재실행 안전)
      const newByKey = new Map(next.map((a) => [a.assetCode ?? a.id, a]));
      const filteredPrev = prev.filter((a) => !newByKey.has(a.assetCode ?? a.id));
      console.log(`[asset-batch] cache prev=${prev.length}, 신규=${next.length}, 덮어쓴 기존=${prev.length - filteredPrev.length}, 최종=${filteredPrev.length + next.length}`);
      return [...next, ...filteredPrev];
    });

    audit.log({
      action: 'create', entityType: 'asset', entityId: 'batch',
      label: `자산 일괄 등록 ${next.length}건`,
      after: { count: next.length, plates: next.slice(0, 10).map((a) => a.plate) },
    });
  }

  function handleUpdate(partial: Partial<Asset>) {
    if (!selected) return;
    // 중복 검사 — 자기 자신 제외 후 plate/VIN 다른 자산과 충돌 검사
    const newPlate = partial.plate?.trim();
    const newVin = partial.vin?.trim();
    const others = allAssets.filter((a) => !a.deletedAt && a.id !== selected.id);
    if (newPlate && newPlate !== selected.plate && others.some((a) => a.plate === newPlate)) {
      alert(`차량번호 ${newPlate} — 다른 자산과 중복. 변경 불가.`);
      return;
    }
    if (newVin && newVin !== selected.vin && others.some((a) => a.vin === newVin)) {
      alert(`차대번호 ${newVin} — 다른 자산과 중복. 변경 불가.`);
      return;
    }
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
    if (!confirmWithEmail(
      '자산 삭제',
      `${selected.companyCode} · ${selected.plate || selected.vehicleName}\n(자산코드는 영구 보존 — 재발급 안 됨)`,
    )) return;
    setAssets((prev) => prev.map((a) => a.id === selected.id ? { ...a, ...audit.delete() } : a));
    audit.log({ action: 'delete', entityType: 'asset', entityId: selected.id, label: selected.plate, before: selected });
    setSelected(null);
  }

  /** 선택 행 일괄 소프트삭제 — 본인 이메일 확인. */
  function handleDeleteSelected() {
    if (selectedIds.size === 0) { alert('선택된 행이 없습니다.'); return; }
    const rows = assets.filter((a) => selectedIds.has(a.id));
    const summary = rows.slice(0, 5).map((a) => `· ${a.companyCode} ${a.plate || a.vehicleName}`).join('\n')
      + (rows.length > 5 ? `\n... 외 ${rows.length - 5}건` : '');
    if (!confirmWithEmail(`자산 선택 ${selectedIds.size}건 삭제`, summary)) return;
    const stamp = audit.delete();
    setAssets((prev) => prev.map((a) => selectedIds.has(a.id) ? { ...a, ...stamp } : a));
    audit.log({
      action: 'delete', entityType: 'asset', entityId: 'batch',
      label: `자산 일괄 삭제 ${selectedIds.size}건`,
      after: { count: selectedIds.size, plates: rows.map((r) => r.plate) },
    });
    setSelectedIds(new Set());
    setSelected(null);
    alert(`${rows.length}건 삭제 완료.`);
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
            <Link className="btn" href="/purchase" title="신차 구매부터 인도까지 흐름 진행 — 차량구매 페이지로">
              <ShoppingCart size={14} weight="bold" /> 차량구매
            </Link>
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
            <button
              className="btn"
              disabled={selectedIds.size === 0}
              onClick={handleDeleteSelected}
              title="체크박스로 선택한 자산 일괄 삭제 (본인 이메일 확인 후)"
              style={{ color: selectedIds.size > 0 ? 'var(--alert-red, #dc2626)' : undefined }}
            >
              <Trash size={14} weight="bold" /> 선택 {selectedIds.size}건 삭제
            </button>
            <AssetRegisterDialog
              onCreate={handleCreate}
              onCreateBatch={handleCreateBatch}
              open={registerOpen}
              onOpenChange={setRegisterOpen}
            />
          </>
        }
      >
        {!assetsReady ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-weak)', fontSize: 12 }}>
            데이터 로딩 중...
          </div>
        ) : assets.length === 0 ? (
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
              onRowDoubleClick={(a) => { setSelected(a); setEditMode('view'); setEditOpen(true); }}
              onRowContextMenu={(_a, x, y) => setCtxMenu({ open: true, x, y })}
              globalSearch={search}
              selectedIds={selectedIds}
              onSelectionChange={setSelectedIds}
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
          onSave={editMode === 'duplicate' ? handleCreate : handleUpdate}
          onDelete={handleDelete}
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
