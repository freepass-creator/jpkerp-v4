'use client';

import { useState } from 'react';
import { Plus, Trash, PencilSimple } from '@phosphor-icons/react';
import { PageShell } from '@/components/layout/page-shell';
import { FINANCE_SUBTABS, FINANCE_SUBTAB_PENDING } from '@/lib/finance-subtabs';
import { SAMPLE_AUTOPAY, type Autopay } from '@/lib/sample-finance';
import { EntityFormDialog, type FieldDef } from '@/components/ui/entity-form-dialog';
import { ContextMenu, type ContextMenuItem } from '@/components/ui/context-menu';
import { cn } from '@/lib/cn';

const FIELDS: FieldDef[] = [
  { key: 'companyCode',   label: '회사코드',   placeholder: 'CP01', required: true },
  { key: 'fromAccount',   label: '출금 계좌',  required: true, colSpan: 2 },
  { key: 'regNo',         label: '등록번호',   placeholder: 'CMS-NNN' },
  { key: 'partner',       label: '거래처',     required: true, colSpan: 2 },
  { key: 'category',      label: '구분',       placeholder: '보험료/할부/렌트료/기타' },
  { key: 'monthlyAmount', label: '월 이체액',  type: 'number', required: true },
  { key: 'payDay',        label: '이체일 (일)', type: 'number' },
  { key: 'startDate',     label: '시작일',     type: 'date' },
  { key: 'nextDate',      label: '다음 이체일', type: 'date' },
  { key: 'endDate',       label: '종료일 (선택)', type: 'date' },
  { key: 'status',        label: '상태',       type: 'select', options: ['활성', '중지'] },
  { key: 'note',          label: '비고',       colSpan: 4 },
];

export default function FinanceAutopayPage() {
  const [items, setItems] = useState<Autopay[]>(SAMPLE_AUTOPAY);
  const [selected, setSelected] = useState<Autopay | null>(null);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [ctxMenu, setCtxMenu] = useState({ open: false, x: 0, y: 0 });

  const active = items.filter((a) => a.status === '활성');
  const monthly = active.reduce((s, a) => s + a.monthlyAmount, 0);

  function fromForm(d: Record<string, string>): Autopay {
    return {
      id: `ap-${Date.now()}`,
      companyCode: d.companyCode || 'CP01',
      fromAccount: d.fromAccount || '',
      regNo: d.regNo || '',
      partner: d.partner || '',
      category: d.category || '',
      monthlyAmount: Number(d.monthlyAmount) || 0,
      payDay: Number(d.payDay) || 1,
      startDate: d.startDate || '',
      nextDate: d.nextDate || '',
      endDate: d.endDate || undefined,
      status: (d.status as '활성' | '중지') || '활성',
      note: d.note,
    };
  }
  function handleCreate(d: Record<string, string>) { setItems((p) => [fromForm(d), ...p]); setRegisterOpen(false); }
  function handleUpdate(d: Record<string, string>) {
    if (!selected) return;
    const updated = { ...selected, ...fromForm(d), id: selected.id };
    setItems((p) => p.map((x) => x.id === selected.id ? updated : x));
    setSelected(updated); setEditOpen(false);
  }
  function handleDelete() {
    if (!selected) return;
    if (!confirm(`${selected.regNo} 자동이체를 삭제할까요?`)) return;
    setItems((p) => p.filter((x) => x.id !== selected.id));
    setSelected(null);
  }

  const editInitial: Record<string, string> = selected ? Object.fromEntries(
    Object.entries(selected).map(([k, v]) => [k, v == null ? '' : String(v)])
  ) : {};

  const ctxItems: ContextMenuItem[] = [
    { label: '수정',         icon: <PencilSimple size={12} weight="bold" />, onClick: () => setEditOpen(true) },
    { label: '삭제',         icon: <Trash size={12} weight="bold" />,        onClick: handleDelete, danger: true },
    { label: '', divider: true, onClick: () => {} },
    { label: '자동이체 등록', icon: <Plus size={12} weight="bold" />,         onClick: () => setRegisterOpen(true) },
  ];

  return (
    <>
      <PageShell
        subTabs={FINANCE_SUBTABS} subTabPending={FINANCE_SUBTAB_PENDING}
        footerLeft={<>
          <span className="stat-item">전체 <strong>{items.length}</strong></span>
          <span className="stat-item">활성 <strong>{active.length}</strong></span>
          <span className="stat-item">월 합계 <strong>₩{monthly.toLocaleString('ko-KR')}</strong></span>
        </>}
        footerRight={<>
          <button className="btn">엑셀</button>
          <button className="btn" disabled={!selected} onClick={() => setEditOpen(true)}><PencilSimple size={14} weight="bold" /> 수정</button>
          <button className="btn" disabled={!selected} onClick={handleDelete}><Trash size={14} weight="bold" /> 삭제</button>
          <button className="btn btn-primary" onClick={() => setRegisterOpen(true)}><Plus size={14} weight="bold" /> 자동이체 등록</button>
        </>}
      >
        <div className="table-wrap">
          <table className="table">
            <thead><tr>
              <th>회사코드</th><th>출금 계좌</th><th>등록번호</th><th>거래처</th><th>구분</th>
              <th className="num">월 이체액</th><th className="num">이체일</th>
              <th className="date">시작일</th><th className="date">다음 이체일</th><th className="date">종료일</th>
              <th className="center">상태</th><th>비고</th>
            </tr></thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.id} className={cn(selected?.id === a.id && 'selected')}
                    onClick={() => setSelected(a)}
                    onContextMenu={(e) => { e.preventDefault(); setSelected(a); setCtxMenu({ open: true, x: e.clientX, y: e.clientY }); }}>
                  <td className="plate">{a.companyCode}</td>
                  <td className="mono dim">{a.fromAccount}</td>
                  <td className="mono">{a.regNo}</td>
                  <td>{a.partner}</td>
                  <td className="dim">{a.category}</td>
                  <td className="num">{a.monthlyAmount.toLocaleString('ko-KR')}</td>
                  <td className="num">매월 {a.payDay}일</td>
                  <td className="date">{a.startDate}</td>
                  <td className="date">{a.nextDate}</td>
                  <td className="date">{a.endDate ?? ''}</td>
                  <td className="center"><span className={cn('badge', a.status === '활성' ? 'badge-green' : 'badge')}>{a.status}</span></td>
                  <td className="dim">{a.note ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PageShell>
      <ContextMenu open={ctxMenu.open} x={ctxMenu.x} y={ctxMenu.y}
        onClose={() => setCtxMenu({ open: false, x: 0, y: 0 })} items={selected ? ctxItems : []} />
      <EntityFormDialog open={registerOpen} onOpenChange={setRegisterOpen}
        title="자동이체 등록" fields={FIELDS} onSubmit={handleCreate} />
      <EntityFormDialog open={editOpen} onOpenChange={setEditOpen}
        title="자동이체 수정" fields={FIELDS} initial={editInitial}
        submitLabel="수정" onSubmit={handleUpdate} />
    </>
  );
}
