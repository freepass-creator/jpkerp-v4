'use client';

import { useState, useMemo, useCallback, useRef } from 'react';
import { PencilSimple, Copy, Trash } from '@phosphor-icons/react';
import { PageShell } from '@/components/layout/page-shell';
import { CONTRACT_SUBTABS } from '@/lib/contract-subtabs';
import { useAssetStore } from '@/lib/use-asset-store';
import { useContractStore } from '@/lib/use-contract-store';
import { type Contract, type CustomerKind, generateContractSchedule } from '@/lib/sample-contracts';
import { EntityFormDialog, type FieldDef, type FieldSection } from '@/components/ui/entity-form-dialog';
import { ContextMenu, type ContextMenuItem } from '@/components/ui/context-menu';
import { JpkTable, type JpkColumn, type JpkTableApi } from '@/components/shared/jpk-table';
import { EmptyState } from '@/components/ui/empty-state';
import { FileText } from '@phosphor-icons/react';
import { useTopbarSearch } from '@/lib/use-topbar-search';
import { nextSequenceCode } from '@/lib/code-gen';
import { ContractRegisterDialog } from '@/components/contract/contract-register-dialog';
import { useAuditStamp } from '@/lib/audit-fields';
import { cn } from '@/lib/cn';

/** 수정·복사용 폼 — 섹션 단위. 등록은 ContractRegisterDialog 사용. */
const CONTRACT_REQUIRED_FIELDS: FieldDef[] = [
  { key: 'companyCode',    label: '회사코드',  required: true, readOnly: true },
  { key: 'contractNo',     label: '계약번호',  readOnly: true },
  { key: 'plate',          label: '차량번호',  required: true },
  { key: 'customerName',   label: '고객명',    required: true },
  { key: 'customerKind',   label: '신분',      type: 'select', options: ['개인', '사업자', '법인'], required: true },
  { key: 'customerIdent',  label: '고객등록번호', required: true },
  { key: 'customerPhone',  label: '연락처',    required: true },
  { key: 'startDate',      label: '시작일',    type: 'date', required: true },
  { key: 'endDate',        label: '만기일',    type: 'date', required: true },
  { key: 'monthlyAmount',  label: '월 청구액', type: 'number' },
  { key: 'deposit',        label: '보증금',    type: 'number' },
];

const CONTRACT_OPTIONAL_SECTIONS: FieldSection[] = [
  {
    title: '임차인 추가 정보',
    fields: [
      { key: 'customerLicenseNo', label: '운전면허번호', placeholder: '00-00-000000-00' },
      { key: 'customerEmail',     label: '이메일',       placeholder: 'name@example.com' },
    ],
  },
  {
    title: '운전 조건',
    fields: [
      { key: 'driverScope',     label: '운전자 범위',  type: 'select', options: ['누구나운전', '가족한정', '임직원한정', '1인지정'] },
      { key: 'driverAgeLimit',  label: '연령 제한',    placeholder: '예: 만 26세 이상' },
      { key: 'mileageLimitKm',  label: '연간 주행거리 한도 (km)', type: 'number', placeholder: '0=무제한' },
    ],
  },
  {
    title: '인도 · 반납',
    fields: [
      { key: 'deliveryAddress', label: '인도 장소', colSpan: 2 },
      { key: 'returnAddress',   label: '반납 장소', colSpan: 2 },
    ],
  },
  {
    title: '결제',
    fields: [
      { key: 'paymentMethod', label: '결제 방법', placeholder: '자동이체 / 계좌이체 / 카드' },
      { key: 'paymentDay',    label: '결제일 (1-31)', type: 'number' },
    ],
  },
  {
    title: '특약사항',
    fields: [
      { key: 'specialTerms', label: '특약사항 (개행 보존)', type: 'textarea', colSpan: 2 },
    ],
  },
];

const CONTRACT_EDIT_SECTIONS: FieldSection[] = [
  { title: '필수 정보', fields: CONTRACT_REQUIRED_FIELDS },
  ...CONTRACT_OPTIONAL_SECTIONS,
];

const CONTRACT_DUPLICATE_SECTIONS: FieldSection[] = [
  {
    title: '필수 정보',
    fields: CONTRACT_REQUIRED_FIELDS.map((f) =>
      f.key === 'companyCode' ? { ...f, readOnly: false } :
      f.key === 'contractNo' ? { ...f, readOnly: false, placeholder: '비워두면 자동 (C-2026-0001)' } : f,
    ),
  },
  ...CONTRACT_OPTIONAL_SECTIONS,
];

export default function ContractListPage() {
  const [allContracts, setContracts] = useContractStore();
  const [allAssets, setAssets] = useAssetStore();
  // active 만 — 소프트 삭제는 목록·집계에서 제외 (코드는 영구 보존)
  const contracts = useMemo(() => allContracts.filter((c) => !c.deletedAt), [allContracts]);
  const assets = useMemo(() => allAssets.filter((a) => !a.deletedAt), [allAssets]);
  const { search } = useTopbarSearch();
  const [selected, setSelected] = useState<Contract | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [ctxMenu, setCtxMenu] = useState({ open: false, x: 0, y: 0 });
  const audit = useAuditStamp();

  const totals = useMemo(() => {
    const totalAssets = assets.filter((a) => a.status !== '매각' && a.status !== '등록예정').length;
    const active = contracts.filter((c) => c.status === '운행중').length;
    return { totalAssets, active, idle: totalAssets - active };
  }, [contracts, assets]);

  /** 계약현황은 종료(만기/해지) 제외 — 종료 계약은 /contract/ended 에서 관리. */
  const visibleContracts = useMemo(
    () => contracts.filter((c) => c.status !== '만기' && c.status !== '해지'),
    [contracts],
  );

  /** ContractDraft (필수 10필드) → Contract 완성 + 수납 스케줄 자동 생성 */
  function fromDraft(draft: Omit<Contract, 'id' | 'contractNo' | 'status' | 'events'>): Contract {
    return {
      id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      contractNo: nextSequenceCode('C', contracts.map((c) => c.contractNo)),
      ...draft,
      status: '운행중',
      events: generateContractSchedule(draft.startDate, draft.endDate, draft.monthlyAmount),
    };
  }

  /** 수정/복사 폼 record → Contract — 등록은 ContractRegisterDialog 가 처리. */
  function fromFormRecord(d: Record<string, string>): Contract {
    const contractNo = d.contractNo?.trim() || nextSequenceCode('C', contracts.map((c) => c.contractNo));
    const startDate = d.startDate || new Date().toISOString().slice(0, 10);
    const endDate = d.endDate || '';
    const monthlyAmount = Number(d.monthlyAmount) || 0;
    const mileageRaw = Number(d.mileageLimitKm);
    const paymentDayRaw = Number(d.paymentDay);
    return {
      id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      companyCode: d.companyCode || '',
      contractNo,
      plate: d.plate || '',
      customerName: d.customerName || '',
      customerKind: (d.customerKind as CustomerKind) || '개인',
      customerIdent: d.customerIdent || '',
      customerPhone: d.customerPhone || '',
      customerLicenseNo: d.customerLicenseNo?.trim() || undefined,
      customerEmail:     d.customerEmail?.trim() || undefined,
      startDate,
      endDate,
      monthlyAmount,
      deposit: Number(d.deposit) || 0,
      status: '운행중',
      driverScope:    d.driverScope?.trim() || undefined,
      driverAgeLimit: d.driverAgeLimit?.trim() || undefined,
      mileageLimitKm: Number.isFinite(mileageRaw) && mileageRaw > 0 ? mileageRaw : undefined,
      deliveryAddress: d.deliveryAddress?.trim() || undefined,
      returnAddress:   d.returnAddress?.trim() || undefined,
      paymentMethod:   d.paymentMethod?.trim() || undefined,
      paymentDay: Number.isFinite(paymentDayRaw) && paymentDayRaw >= 1 && paymentDayRaw <= 31 ? paymentDayRaw : undefined,
      specialTerms:    d.specialTerms?.trim() || undefined,
      events: generateContractSchedule(startDate, endDate, monthlyAmount),
    };
  }

  function handleCreate(draft: Omit<Contract, 'id' | 'contractNo' | 'status' | 'events'>) {
    const contract: Contract = { ...fromDraft(draft), ...audit.create() };
    setContracts((prev) => [contract, ...prev]);
    audit.log({ action: 'create', entityType: 'contract', entityId: contract.id, label: contract.contractNo, after: contract });
    // cascade: 자산 상태 전환 — '등록예정' → '대기' (출고 대기). 이미 운행중/정비/매각이면 손대지 않음.
    setAssets((prev) => prev.map((a) =>
      a.plate === contract.plate && a.companyCode === contract.companyCode && a.status === '등록예정'
        ? { ...a, status: '대기' as const, ...audit.update() }
        : a,
    ));
  }

  function handleUpdate(d: Record<string, string>) {
    if (!selected) return;
    const updated: Contract = { ...selected, ...fromFormRecord(d), id: selected.id, contractNo: selected.contractNo, events: selected.events, ...audit.update() };
    setContracts((prev) => prev.map((c) => (c.id === selected.id ? updated : c)));
    setSelected(updated);
    audit.log({ action: 'update', entityType: 'contract', entityId: updated.id, label: updated.contractNo, before: selected, after: updated });
    setEditOpen(false);
  }

  function handleDuplicate(d: Record<string, string>) {
    const dup: Contract = { ...fromFormRecord(d), ...audit.create() };
    setContracts((prev) => [dup, ...prev]);
    audit.log({ action: 'create', entityType: 'contract', entityId: dup.id, label: dup.contractNo, after: dup });
    setDuplicateOpen(false);
  }

  function handleDelete() {
    if (!selected) return;
    if (!confirm(`${selected.contractNo} 계약을 삭제할까요? (계약번호는 영구 보존 — 재발급 안 됨)`)) return;
    setContracts((prev) => prev.map((c) => c.id === selected.id ? { ...c, ...audit.delete() } : c));
    audit.log({ action: 'delete', entityType: 'contract', entityId: selected.id, label: selected.contractNo, before: selected });
    setSelected(null);
  }

  const editInitial: Record<string, string> = selected ? {
    companyCode: selected.companyCode,
    contractNo: selected.contractNo,
    plate: selected.plate,
    customerName: selected.customerName,
    customerKind: selected.customerKind,
    customerIdent: selected.customerIdent,
    customerPhone: selected.customerPhone,
    customerLicenseNo: selected.customerLicenseNo ?? '',
    customerEmail:     selected.customerEmail ?? '',
    startDate: selected.startDate,
    endDate: selected.endDate,
    monthlyAmount: String(selected.monthlyAmount),
    deposit: String(selected.deposit ?? 0),
    driverScope:    selected.driverScope ?? '',
    driverAgeLimit: selected.driverAgeLimit ?? '',
    mileageLimitKm: selected.mileageLimitKm ? String(selected.mileageLimitKm) : '',
    deliveryAddress: selected.deliveryAddress ?? '',
    returnAddress:   selected.returnAddress ?? '',
    paymentMethod:   selected.paymentMethod ?? '',
    paymentDay:      selected.paymentDay ? String(selected.paymentDay) : '',
    specialTerms:    selected.specialTerms ?? '',
  } : {};

  // 복사용 — 식별 필드 비움 (계약번호·차량·고객·연락처)
  const dupInitial: Record<string, string> = selected ? {
    ...editInitial,
    contractNo: '',
    customerName: '',
    customerIdent: '',
    customerPhone: '',
    plate: '',
  } : {};

  function buildCtxItems(): ContextMenuItem[] {
    return [
      { label: '수정',     icon: <PencilSimple size={12} weight="bold" />, onClick: () => setEditOpen(true) },
      { label: '복사',     icon: <Copy size={12} weight="bold" />,         onClick: () => setDuplicateOpen(true) },
      { label: '삭제',     icon: <Trash size={12} weight="bold" />,        onClick: handleDelete, danger: true },
    ];
  }

  return (
    <>
      <PageShell
        subTabs={CONTRACT_SUBTABS}
       
        footerLeft={
          <>
            <span className="stat-item">전체 자산 <strong>{totals.totalAssets}</strong></span>
            <span className="stat-item">계약중 <strong>{totals.active}</strong></span>
            <span className="stat-item">휴차 <strong>{totals.idle}</strong></span>
            <span className="stat-divider" />
            <span className="stat-item">전체 계약 <strong>{contracts.length}</strong></span>
            {selected && (
              <>
                <span className="stat-divider" />
                <span className="stat-item">선택 <strong className="mono">{selected.contractNo}</strong></span>
              </>
            )}
          </>
        }
        footerRight={
          <>
            <button className="btn">엑셀</button>
            <button className="btn" disabled={!selected} onClick={() => setEditOpen(true)}>
              <PencilSimple size={14} weight="bold" /> 수정
            </button>
            <button className="btn" disabled={!selected} onClick={() => setDuplicateOpen(true)}>
              <Copy size={14} weight="bold" /> 복사
            </button>
            <button className="btn" disabled={!selected} onClick={handleDelete}>
              <Trash size={14} weight="bold" /> 삭제
            </button>
            <ContractRegisterDialog onCreate={handleCreate} />
          </>
        }
      >
        {visibleContracts.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="등록된 계약 없음"
            description="OCR / 시트 / 단건 3가지 모드로 계약을 등록할 수 있습니다."
            hint={<>① 우측 하단 [+ 계약등록] → 계약서 PDF 다중 OCR / 구글시트 다건 / 개별 입력 중 선택<br />② 차량번호 → 등록 자산과 자동 매칭, 임차인 → 이전 계약자 자동 채움<br />③ 등록 시 출고·매월 수납·반납 events 자동 생성 → 계약스케줄에서 처리</>}
          />
        ) : (
          <ContractGrid
            contracts={visibleContracts}
            selectedId={selected?.id}
            onRowClick={setSelected}
            onRowContextMenu={(c, x, y) => { setSelected(c); setCtxMenu({ open: true, x, y }); }}
            globalSearch={search}
          />
        )}
      </PageShell>

      <ContextMenu open={ctxMenu.open} x={ctxMenu.x} y={ctxMenu.y}
        onClose={() => setCtxMenu({ open: false, x: 0, y: 0 })}
        items={selected ? buildCtxItems() : []} />

      <EntityFormDialog open={editOpen} onOpenChange={setEditOpen}
        title="계약 수정" sections={CONTRACT_EDIT_SECTIONS} initial={editInitial}
        submitLabel="수정" onSubmit={handleUpdate} />
      <EntityFormDialog open={duplicateOpen} onOpenChange={setDuplicateOpen}
        title="계약 복사 (스펙 복제)" sections={CONTRACT_DUPLICATE_SECTIONS} initial={dupInitial}
        onSubmit={handleDuplicate} />
    </>
  );
}

/**
 * 계약 행에 채워진 확장 정보 인디케이터 — 한글 1글자씩 6개 영역.
 * 운(운전조건) / 추(추가운전자) / 인(인도반납) / 결(결제) / 특(특약) / 파(계약서파일)
 * tooltip 으로 채워진 항목 라벨 노출.
 */
function ExtendedInfoCell({ contract }: { contract: Contract }) {
  const items = [
    { key: '운', has: !!(contract.driverScope || contract.driverAgeLimit || contract.mileageLimitKm), label: '운전조건' },
    { key: '추', has: (contract.additionalDrivers?.length ?? 0) > 0, label: '추가운전자' },
    { key: '인', has: !!(contract.deliveryAddress || contract.returnAddress), label: '인도/반납' },
    { key: '결', has: !!(contract.paymentMethod || contract.paymentDay), label: '결제' },
    { key: '특', has: !!contract.specialTerms, label: '특약' },
    { key: '파', has: !!contract.fileDataUrl, label: '계약서' },
  ];
  const filled = items.filter((i) => i.has).length;
  const tooltip = items.map((i) => `${i.label}${i.has ? ' ✓' : ' ·'}`).join(' / ');
  return (
    <span title={tooltip} style={{ display: 'inline-flex', gap: 2, fontSize: 11 }}>
      {items.map((i) => (
        <span
          key={i.key}
          style={{
            opacity: i.has ? 1 : 0.25,
            color: i.has ? 'var(--brand)' : 'var(--text-weak)',
            fontWeight: i.has ? 600 : 400,
          }}
        >
          {i.key}
        </span>
      ))}
      {filled === 0 && <span className="text-weak ml-1" style={{ fontSize: 10 }}>(기본)</span>}
    </span>
  );
}

/** 계약현황 그리드 — JpkTable 기반. 컬럼 헤더 set/range/date 필터. */
function ContractGrid({
  contracts, selectedId, onRowClick, onRowContextMenu, globalSearch,
}: {
  contracts: Contract[];
  selectedId?: string;
  onRowClick: (c: Contract) => void;
  onRowContextMenu: (c: Contract, x: number, y: number) => void;
  globalSearch?: string;
}) {
  const tableRef = useRef<JpkTableApi<Contract> | null>(null);

  const columns = useMemo<JpkColumn<Contract>[]>(() => [
    { headerName: '회사', field: 'companyCode', width: 80, filterable: true,
      cellRenderer: ({ value }) => <span className="plate">{value as string}</span> },
    { headerName: '차량번호', field: 'plate', width: 110, filterable: true,
      cellRenderer: ({ value }) => <span className="plate">{value as string}</span> },
    { headerName: '계약번호', field: 'contractNo', width: 130, filterable: true,
      cellRenderer: ({ value }) => <span className="mono text-medium">{value as string}</span> },
    { headerName: '고객명', field: 'customerName', width: 130, filterable: true },
    { headerName: '고객 신분', field: 'customerKind', width: 90, filterable: true,
      cellRenderer: ({ value }) => <span className="dim">{(value as string) ?? '-'}</span> },
    { headerName: '연락처', field: 'customerPhone', width: 130,
      cellRenderer: ({ value }) => <span className="mono dim">{(value as string) || '-'}</span> },
    { headerName: '시작일', field: 'startDate', width: 110, filterType: 'date' },
    { headerName: '만기일', field: 'endDate', width: 110, filterType: 'date' },
    { headerName: '월 청구액', field: 'monthlyAmount', width: 110, align: 'right', filterType: 'range',
      filterStep: 100000, filterUnit: 10000, filterUnitLabel: '만원',
      valueFormatter: ({ value }) => (value as number)?.toLocaleString('ko-KR') ?? '0' },
    { headerName: '보증금', field: 'deposit', width: 110, align: 'right', filterType: 'range',
      filterStep: 1000000, filterUnit: 10000, filterUnitLabel: '만원',
      valueFormatter: ({ value }) => value ? (value as number).toLocaleString('ko-KR') : '-' },
    { headerName: '상태', field: 'status', width: 90, filterable: true,
      cellRenderer: ({ value }) => (
        <span className={cn('badge', value === '운행중' ? 'badge-green' : value === '만기' ? 'badge-orange' : '')}>
          {value as string}
        </span>
      ) },
    { headerName: '추가', field: 'driverScope', width: 90, sortable: false,
      cellRenderer: ({ data }) => <ExtendedInfoCell contract={data} /> },
  ], []);

  const getRowId = useCallback((c: Contract) => c.id, []);
  const handleRowContextMenu = useCallback((c: Contract, _i: number, ev: React.MouseEvent) => {
    onRowClick(c);
    onRowContextMenu(c, ev.clientX, ev.clientY);
  }, [onRowClick, onRowContextMenu]);

  return (
    <JpkTable<Contract>
      ref={tableRef}
      columns={columns}
      rows={contracts}
      getRowId={getRowId}
      selectedKey={selectedId}
      storageKey="contract.list"
      onRowClick={onRowClick}
      onRowContextMenu={handleRowContextMenu}
      globalSearch={globalSearch}
    />
  );
}
