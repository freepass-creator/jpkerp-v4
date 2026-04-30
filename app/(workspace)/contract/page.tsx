'use client';

import { useState, useMemo } from 'react';
import { PencilSimple, Copy, Trash, Plus, Upload } from '@phosphor-icons/react';
import { PageShell } from '@/components/layout/page-shell';
import { CONTRACT_SUBTABS } from '@/lib/contract-subtabs';
import { useAssetStore } from '@/lib/use-asset-store';
import { useContractStore } from '@/lib/use-contract-store';
import { type Contract } from '@/lib/sample-contracts';
import { EntityFormDialog, type FieldDef } from '@/components/ui/entity-form-dialog';
import { ContextMenu, type ContextMenuItem } from '@/components/ui/context-menu';
import { nextSequenceCode } from '@/lib/code-gen';
import dynamic from 'next/dynamic';
import type { RentalContractExtracted } from '@/components/contract/contract-upload-dialog';
const ContractUploadDialog = dynamic(
  () => import('@/components/contract/contract-upload-dialog').then((m) => m.ContractUploadDialog),
  { ssr: false },
);
import { cn } from '@/lib/cn';

const CONTRACT_FIELDS: FieldDef[] = [
  { key: 'companyCode',    label: '회사코드',  placeholder: 'CP01', required: true },
  { key: 'contractNo',     label: '계약번호',  placeholder: '비워두면 자동 (C-2026-0001)' },
  { key: 'plate',          label: '차량번호',  required: true },
  { key: 'customerName',   label: '고객명',    required: true },
  { key: 'customerKind',   label: '신분',      type: 'select', options: ['개인', '사업자'] },
  { key: 'customerPhone',  label: '연락처' },
  { key: 'startDate',      label: '시작일',    type: 'date' },
  { key: 'endDate',        label: '만기일',    type: 'date' },
  { key: 'monthlyAmount',  label: '월 청구액', type: 'number' },
  { key: 'deposit',        label: '보증금',    type: 'number' },
];

/** 수정 시 — 식별자(회사코드·계약번호)는 변경 불가. */
const CONTRACT_EDIT_FIELDS: FieldDef[] = CONTRACT_FIELDS.map((f) =>
  f.key === 'companyCode' || f.key === 'contractNo' ? { ...f, readOnly: true } : f,
);

export default function ContractListPage() {
  const [contracts, setContracts] = useContractStore();
  const [assets] = useAssetStore();
  const [selected, setSelected] = useState<Contract | null>(null);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [ctxMenu, setCtxMenu] = useState({ open: false, x: 0, y: 0 });
  const [uploadOpen, setUploadOpen] = useState(false);
  /** OCR 추출 결과 — 등록 다이얼로그 미리채움용 (업로드 → 등록 다이얼로그 자동 오픈) */
  const [registerInitial, setRegisterInitial] = useState<Record<string, string>>({});

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

  function fromForm(d: Record<string, string>): Contract {
    // contractNo 미입력 시 자동 생성 — C-YYYY-NNNN 시퀀스. 한 번 부여되면 변경 불가.
    const contractNo = d.contractNo?.trim() || nextSequenceCode('C', contracts.map((c) => c.contractNo));
    return {
      id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      companyCode: d.companyCode || 'CP01',
      contractNo,
      plate: d.plate || '',
      customerName: d.customerName || '',
      customerKind: (d.customerKind as '개인' | '사업자') || '개인',
      customerPhone: d.customerPhone,
      startDate: d.startDate || new Date().toISOString().slice(0, 10),
      endDate: d.endDate || '',
      monthlyAmount: Number(d.monthlyAmount) || 0,
      deposit: Number(d.deposit) || 0,
      status: '운행중',
      events: [],
    };
  }

  function handleCreate(d: Record<string, string>) {
    setContracts((prev) => [fromForm(d), ...prev]);
    setRegisterOpen(false);
    setRegisterInitial({});
  }

  /**
   * OCR 추출 데이터 → CONTRACT_FIELDS 키 매핑.
   * 빈 값/null 은 빼서 폼이 placeholder 보여주게.
   */
  function mapExtractedToForm(d: RentalContractExtracted): Record<string, string> {
    const out: Record<string, string> = {};
    const set = (key: string, val: unknown) => {
      if (val === null || val === undefined || val === '') return;
      out[key] = String(val);
    };
    set('plate', d.car_number);
    set('customerName', d.contractor_name);
    set('customerKind', d.contractor_kind);
    set('customerPhone', d.contractor_phone);
    set('startDate', d.start_date);
    set('endDate', d.end_date);
    set('monthlyAmount', d.monthly_amount);
    set('deposit', d.deposit_total);
    // contractNo / companyCode 는 OCR로 자동 안 잡히므로 사용자 입력 (placeholder 유지)
    return out;
  }

  function handleExtracted(extracted: RentalContractExtracted, fileName: string) {
    const mapped = mapExtractedToForm(extracted);
    if (Object.keys(mapped).length === 0) {
      alert(`${fileName} 에서 추출된 정보가 없습니다. 직접 입력해주세요.`);
      setRegisterOpen(true);
      return;
    }
    setRegisterInitial(mapped);
    setRegisterOpen(true);
  }

  function handleUpdate(d: Record<string, string>) {
    if (!selected) return;
    const updated: Contract = { ...selected, ...fromForm(d), id: selected.id, events: selected.events };
    setContracts((prev) => prev.map((c) => (c.id === selected.id ? updated : c)));
    setSelected(updated);
    setEditOpen(false);
  }

  function handleDuplicate(d: Record<string, string>) {
    setContracts((prev) => [fromForm(d), ...prev]);
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
    customerKind: selected.customerKind ?? '개인',
    customerPhone: selected.customerPhone ?? '',
    startDate: selected.startDate,
    endDate: selected.endDate,
    monthlyAmount: String(selected.monthlyAmount),
    deposit: String(selected.deposit ?? 0),
  } : {};

  // 복사용 — unique 필드 비움
  const dupInitial: Record<string, string> = selected ? {
    ...editInitial,
    contractNo: '',
    customerName: '',
    customerPhone: '',
    plate: '',
  } : {};

  function buildCtxItems(): ContextMenuItem[] {
    return [
      { label: '수정',     icon: <PencilSimple size={12} weight="bold" />, onClick: () => setEditOpen(true) },
      { label: '복사',     icon: <Copy size={12} weight="bold" />,         onClick: () => setDuplicateOpen(true) },
      { label: '삭제',     icon: <Trash size={12} weight="bold" />,        onClick: handleDelete, danger: true },
      { label: '', divider: true, onClick: () => {} },
      { label: '계약등록', icon: <Plus size={12} weight="bold" />,         onClick: () => setRegisterOpen(true) },
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
            <button className="btn" onClick={() => setUploadOpen(true)}>
              <Upload size={14} weight="bold" /> 계약서 업로드
            </button>
            <button className="btn btn-primary" onClick={() => { setRegisterInitial({}); setRegisterOpen(true); }}>
              <Plus size={14} weight="bold" /> 계약등록
            </button>
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

      <EntityFormDialog open={registerOpen} onOpenChange={(o) => { setRegisterOpen(o); if (!o) setRegisterInitial({}); }}
        title={Object.keys(registerInitial).length > 0 ? '계약 등록 (계약서 자동 채움)' : '계약 등록'}
        fields={CONTRACT_FIELDS} initial={registerInitial} onSubmit={handleCreate} />

      <ContractUploadDialog open={uploadOpen} onOpenChange={setUploadOpen} onExtracted={handleExtracted} />
      <EntityFormDialog open={editOpen} onOpenChange={setEditOpen}
        title="계약 수정" fields={CONTRACT_EDIT_FIELDS} initial={editInitial}
        submitLabel="수정" onSubmit={handleUpdate} />
      <EntityFormDialog open={duplicateOpen} onOpenChange={setDuplicateOpen}
        title="계약 복사 (스펙 복제)" fields={CONTRACT_FIELDS} initial={dupInitial}
        onSubmit={handleDuplicate} />
    </>
  );
}
