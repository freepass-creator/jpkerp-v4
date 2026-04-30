'use client';

import { useState, useMemo } from 'react';
import { PencilSimple, Copy, Trash } from '@phosphor-icons/react';
import { PageShell } from '@/components/layout/page-shell';
import { CONTRACT_SUBTABS } from '@/lib/contract-subtabs';
import { useAssetStore } from '@/lib/use-asset-store';
import { useContractStore } from '@/lib/use-contract-store';
import { type Contract, type CustomerKind, generateContractSchedule } from '@/lib/sample-contracts';
import { EntityFormDialog, type FieldDef } from '@/components/ui/entity-form-dialog';
import { ContextMenu, type ContextMenuItem } from '@/components/ui/context-menu';
import { nextSequenceCode } from '@/lib/code-gen';
import { ContractRegisterDialog } from '@/components/contract/contract-register-dialog';
import { cn } from '@/lib/cn';

/** 수정·복사용 폼 필드 (등록은 ContractRegisterDialog 사용). */
const CONTRACT_EDIT_FIELDS: FieldDef[] = [
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

const CONTRACT_DUPLICATE_FIELDS: FieldDef[] = CONTRACT_EDIT_FIELDS.map((f) =>
  f.key === 'companyCode' ? { ...f, readOnly: false } :
  f.key === 'contractNo' ? { ...f, readOnly: false, placeholder: '비워두면 자동 (C-2026-0001)' } : f,
);

export default function ContractListPage() {
  const [contracts, setContracts] = useContractStore();
  const [assets, setAssets] = useAssetStore();
  const [selected, setSelected] = useState<Contract | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [ctxMenu, setCtxMenu] = useState({ open: false, x: 0, y: 0 });

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
    return {
      id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      companyCode: d.companyCode || '',
      contractNo,
      plate: d.plate || '',
      customerName: d.customerName || '',
      customerKind: (d.customerKind as CustomerKind) || '개인',
      customerIdent: d.customerIdent || '',
      customerPhone: d.customerPhone || '',
      startDate,
      endDate,
      monthlyAmount,
      deposit: Number(d.deposit) || 0,
      status: '운행중',
      events: generateContractSchedule(startDate, endDate, monthlyAmount),
    };
  }

  function handleCreate(draft: Omit<Contract, 'id' | 'contractNo' | 'status' | 'events'>) {
    const contract = fromDraft(draft);
    setContracts((prev) => [contract, ...prev]);
    // cascade: 자산 상태 전환 — '등록예정' → '대기' (출고 대기). 이미 운행중/정비/매각이면 손대지 않음.
    setAssets((prev) => prev.map((a) =>
      a.plate === contract.plate && a.companyCode === contract.companyCode && a.status === '등록예정'
        ? { ...a, status: '대기' as const }
        : a,
    ));
  }

  function handleUpdate(d: Record<string, string>) {
    if (!selected) return;
    const updated: Contract = { ...selected, ...fromFormRecord(d), id: selected.id, contractNo: selected.contractNo, events: selected.events };
    setContracts((prev) => prev.map((c) => (c.id === selected.id ? updated : c)));
    setSelected(updated);
    setEditOpen(false);
  }

  function handleDuplicate(d: Record<string, string>) {
    setContracts((prev) => [fromFormRecord(d), ...prev]);
    setDuplicateOpen(false);
  }

  function handleDelete() {
    if (!selected) return;
    if (!confirm(`${selected.contractNo} 계약을 삭제할까요?`)) return;
    setContracts((prev) => prev.filter((c) => c.id !== selected.id));
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
    startDate: selected.startDate,
    endDate: selected.endDate,
    monthlyAmount: String(selected.monthlyAmount),
    deposit: String(selected.deposit ?? 0),
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
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>회사코드</th>
                <th>차량번호</th>
                <th>계약번호</th>
                <th>고객명</th>
                <th>고객 신분</th>
                <th>고객 연락처</th>
                <th className="date">시작일</th>
                <th className="date">만기일</th>
                <th className="num">월 청구액</th>
                <th className="num">보증금</th>
                <th className="center">상태</th>
              </tr>
            </thead>
            <tbody>
              {visibleContracts.map((c) => (
                <tr
                  key={c.id}
                  className={cn(selected?.id === c.id && 'selected')}
                  onClick={() => setSelected(c)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setSelected(c);
                    setCtxMenu({ open: true, x: e.clientX, y: e.clientY });
                  }}
                >
                  <td className="plate">{c.companyCode}</td>
                  <td className="plate">{c.plate}</td>
                  <td className="mono text-medium">{c.contractNo}</td>
                  <td>{c.customerName}</td>
                  <td className="dim">{c.customerKind ?? '-'}</td>
                  <td className="mono dim">{c.customerPhone ?? '-'}</td>
                  <td className="date">{c.startDate}</td>
                  <td className="date">{c.endDate}</td>
                  <td className="num">{(c.monthlyAmount ?? 0).toLocaleString('ko-KR')}</td>
                  <td className="num">{c.deposit ? c.deposit.toLocaleString('ko-KR') : '-'}</td>
                  <td className="center">
                    <span className={cn('badge', c.status === '운행중' ? 'badge-green' : c.status === '만기' ? 'badge-orange' : 'badge')}>
                      {c.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PageShell>

      <ContextMenu open={ctxMenu.open} x={ctxMenu.x} y={ctxMenu.y}
        onClose={() => setCtxMenu({ open: false, x: 0, y: 0 })}
        items={selected ? buildCtxItems() : []} />

      <EntityFormDialog open={editOpen} onOpenChange={setEditOpen}
        title="계약 수정" fields={CONTRACT_EDIT_FIELDS} initial={editInitial}
        submitLabel="수정" onSubmit={handleUpdate} />
      <EntityFormDialog open={duplicateOpen} onOpenChange={setDuplicateOpen}
        title="계약 복사 (스펙 복제)" fields={CONTRACT_DUPLICATE_FIELDS} initial={dupInitial}
        onSubmit={handleDuplicate} />
    </>
  );
}
