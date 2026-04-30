'use client';

import { useState } from 'react';
import { Plus, Trash, PencilSimple, Copy } from '@phosphor-icons/react';
import { PageShell } from '@/components/layout/page-shell';
import { FINANCE_SUBTABS } from '@/lib/finance-subtabs';
import { SAMPLE_CARD, type CardUsage } from '@/lib/sample-finance';
import { EntityFormDialog, type FieldDef } from '@/components/ui/entity-form-dialog';
import { ContextMenu, type ContextMenuItem } from '@/components/ui/context-menu';
import { cn } from '@/lib/cn';

const FIELDS: FieldDef[] = [
  { key: 'companyCode',     label: '회사코드',  placeholder: 'CP01', required: true },
  { key: 'matchedPlate',    label: '차량번호 (선택)' },
  { key: 'cardName',        label: '카드',      colSpan: 2, required: true },
  { key: 'approvalNo',      label: '승인번호',  required: true },
  { key: 'txDate',          label: '사용일시',  placeholder: 'YYYY-MM-DD HH:mm', required: true },
  { key: 'merchant',        label: '가맹점',    required: true, colSpan: 2 },
  { key: 'category',        label: '구분',      placeholder: '정비/주유/통행료/식비/기타' },
  { key: 'amount',          label: '사용액',    type: 'number', required: true },
  { key: 'installment',     label: '할부 (개월)', type: 'number', placeholder: '0=일시불' },
  { key: 'payDate',         label: '결제 예정일', type: 'date' },
  { key: 'matchedContract', label: '매칭 계약번호' },
  { key: 'note',            label: '비고',      colSpan: 4 },
];

export default function FinanceCardPage() {
  const [items, setItems] = useState<CardUsage[]>(SAMPLE_CARD);
  const [selected, setSelected] = useState<CardUsage | null>(null);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [ctxMenu, setCtxMenu] = useState({ open: false, x: 0, y: 0 });

  const total = items.reduce((s, c) => s + c.amount, 0);

  function fromForm(d: Record<string, string>): CardUsage {
    return {
      id: `cd-${Date.now()}`,
      companyCode: d.companyCode || 'CP01',
      cardName: d.cardName || '',
      approvalNo: d.approvalNo || '',
      txDate: d.txDate || '',
      merchant: d.merchant || '',
      category: d.category || '',
      amount: Number(d.amount) || 0,
      installment: Number(d.installment) || 0,
      payDate: d.payDate || '',
      matchedPlate: d.matchedPlate || undefined,
      matchedContract: d.matchedContract || undefined,
      note: d.note,
    };
  }
  const handleCreate = (d: Record<string, string>) => { setItems((p) => [fromForm(d), ...p]); setRegisterOpen(false); };
  const handleUpdate = (d: Record<string, string>) => {
    if (!selected) return;
    const updated = { ...selected, ...fromForm(d), id: selected.id };
    setItems((p) => p.map((x) => x.id === selected.id ? updated : x));
    setSelected(updated); setEditOpen(false);
  };
  const handleDuplicate = (d: Record<string, string>) => { setItems((p) => [fromForm(d), ...p]); setDuplicateOpen(false); };
  const handleDelete = () => {
    if (!selected) return;
    if (!confirm(`${selected.approvalNo} 결제를 삭제할까요?`)) return;
    setItems((p) => p.filter((x) => x.id !== selected.id));
    setSelected(null);
  };
  const editInitial: Record<string, string> = selected ? Object.fromEntries(
    Object.entries(selected).map(([k, v]) => [k, v == null ? '' : String(v)])
  ) : {};
  const dupInitial: Record<string, string> = { ...editInitial, approvalNo: '', txDate: '' };

  const ctxItems: ContextMenuItem[] = [
    { label: '수정', icon: <PencilSimple size={12} weight="bold" />, onClick: () => setEditOpen(true) },
    { label: '복사', icon: <Copy size={12} weight="bold" />,         onClick: () => setDuplicateOpen(true) },
    { label: '삭제', icon: <Trash size={12} weight="bold" />,        onClick: handleDelete, danger: true },
    { label: '', divider: true, onClick: () => {} },
    { label: '카드 사용 입력', icon: <Plus size={12} weight="bold" />, onClick: () => setRegisterOpen(true) },
  ];

  return (
    <>
      <PageShell subTabs={FINANCE_SUBTABS}
        footerLeft={<>
          <span className="stat-item">사용 건수 <strong>{items.length}</strong></span>
          <span className="stat-item">사용 합계 <strong>₩{total.toLocaleString('ko-KR')}</strong></span>
        </>}
        footerRight={<>
          <button className="btn">엑셀</button>
          <button className="btn" disabled={!selected} onClick={() => setEditOpen(true)}><PencilSimple size={14} weight="bold" /> 수정</button>
          <button className="btn" disabled={!selected} onClick={() => setDuplicateOpen(true)}><Copy size={14} weight="bold" /> 복사</button>
          <button className="btn" disabled={!selected} onClick={handleDelete}><Trash size={14} weight="bold" /> 삭제</button>
          <button className="btn btn-primary" onClick={() => setRegisterOpen(true)}><Plus size={14} weight="bold" /> 카드 사용 입력</button>
        </>}>
        <div className="table-wrap">
          <table className="table">
            <thead><tr>
              <th>회사코드</th><th>차량번호</th><th>승인번호</th><th>카드</th><th className="date">사용일시</th>
              <th>가맹점</th><th>구분</th><th className="num">사용액</th><th className="center">할부</th>
              <th className="date">결제 예정일</th><th>매칭 계약</th><th>비고</th>
            </tr></thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id} className={cn(selected?.id === c.id && 'selected')}
                    onClick={() => setSelected(c)}
                    onContextMenu={(e) => { e.preventDefault(); setSelected(c); setCtxMenu({ open: true, x: e.clientX, y: e.clientY }); }}>
                  <td className="plate">{c.companyCode}</td>
                  <td className="plate">{c.matchedPlate ?? <span className="text-muted">-</span>}</td>
                  <td className="mono">{c.approvalNo}</td>
                  <td className="dim">{c.cardName}</td>
                  <td className="date mono">{c.txDate}</td>
                  <td>{c.merchant}</td>
                  <td className="dim">{c.category}</td>
                  <td className="num">{c.amount.toLocaleString('ko-KR')}</td>
                  <td className="center">{c.installment === 0 ? '일시불' : `${c.installment}개월`}</td>
                  <td className="date">{c.payDate}</td>
                  <td className="mono dim">{c.matchedContract ?? ''}</td>
                  <td className="dim">{c.note ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PageShell>
      <ContextMenu open={ctxMenu.open} x={ctxMenu.x} y={ctxMenu.y}
        onClose={() => setCtxMenu({ open: false, x: 0, y: 0 })} items={selected ? ctxItems : []} />
      <EntityFormDialog open={registerOpen} onOpenChange={setRegisterOpen}
        title="카드 사용 입력" fields={FIELDS} onSubmit={handleCreate} />
      <EntityFormDialog open={editOpen} onOpenChange={setEditOpen}
        title="카드 사용 수정" fields={FIELDS} initial={editInitial}
        submitLabel="수정" onSubmit={handleUpdate} />
      <EntityFormDialog open={duplicateOpen} onOpenChange={setDuplicateOpen}
        title="카드 사용 복사" fields={FIELDS} initial={dupInitial} onSubmit={handleDuplicate} />
    </>
  );
}
