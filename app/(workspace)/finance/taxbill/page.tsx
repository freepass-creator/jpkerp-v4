'use client';

import { useState, useMemo } from 'react';
import { Plus, Trash, PencilSimple } from '@phosphor-icons/react';
import { PageShell } from '@/components/layout/page-shell';
import { FINANCE_SUBTABS } from '@/lib/finance-subtabs';
import { SAMPLE_TAXBILL, type Taxbill } from '@/lib/sample-finance';
import { EntityFormDialog, type FieldDef } from '@/components/ui/entity-form-dialog';
import { ContextMenu, type ContextMenuItem } from '@/components/ui/context-menu';
import { cn } from '@/lib/cn';

type TaxbillView = '매출' | '매입';

const FIELDS = (view: TaxbillView): FieldDef[] => [
  { key: 'companyCode',  label: '회사코드',  placeholder: 'CP01', required: true },
  { key: 'view',         label: '구분',      type: 'select', options: ['매출', '매입'] },
  { key: 'partner',      label: view === '매출' ? '공급받는자' : '공급자', required: true, colSpan: 2 },
  { key: 'approvalNo',   label: '승인번호',  required: true },
  { key: 'writeDate',    label: '작성일',    type: 'date', required: true },
  { key: 'issueDate',    label: '발급일',    type: 'date' },
  { key: 'item',         label: '품목',      colSpan: 4 },
  { key: 'supplyAmount', label: '공급가액',  type: 'number', required: true },
  { key: 'vat',          label: '부가세',    type: 'number' },
  { key: 'total',        label: '합계',      type: 'number' },
  { key: 'matchedTx',    label: '결제 매칭' },
  { key: 'status',       label: '상태',      type: 'select', options: ['발급', '전송', '예정'] },
  { key: 'note',         label: '비고',      colSpan: 4 },
];

export default function FinanceTaxbillPage() {
  const [items, setItems] = useState<Taxbill[]>(SAMPLE_TAXBILL);
  const [view, setView] = useState<TaxbillView>('매출');
  const [selected, setSelected] = useState<Taxbill | null>(null);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [ctxMenu, setCtxMenu] = useState({ open: false, x: 0, y: 0 });

  const filtered = useMemo(() => items.filter((t) => t.view === view), [items, view]);
  const supply = filtered.reduce((s, t) => s + t.supplyAmount, 0);
  const vat = filtered.reduce((s, t) => s + t.vat, 0);
  const total = filtered.reduce((s, t) => s + t.total, 0);

  function fromForm(d: Record<string, string>): Taxbill {
    return {
      id: `tb-${Date.now()}`,
      companyCode: d.companyCode || 'CP01',
      view: (d.view as TaxbillView) || view,
      partner: d.partner || '',
      approvalNo: d.approvalNo || '',
      writeDate: d.writeDate || '',
      issueDate: d.issueDate || '',
      item: d.item || '',
      supplyAmount: Number(d.supplyAmount) || 0,
      vat: Number(d.vat) || 0,
      total: Number(d.total) || 0,
      matchedTx: d.matchedTx || undefined,
      status: (d.status as '발급' | '전송' | '예정') || '발급',
      note: d.note,
    };
  }
  const handleCreate = (d: Record<string, string>) => { setItems((p) => [fromForm(d), ...p]); setRegisterOpen(false); };
  const handleUpdate = (d: Record<string, string>) => {
    if (!selected) return;
    const u = { ...selected, ...fromForm(d), id: selected.id };
    setItems((p) => p.map((x) => x.id === selected.id ? u : x));
    setSelected(u); setEditOpen(false);
  };
  const handleDelete = () => {
    if (!selected) return;
    if (!confirm(`${selected.approvalNo} 세금계산서를 삭제할까요?`)) return;
    setItems((p) => p.filter((x) => x.id !== selected.id));
    setSelected(null);
  };
  const editInitial: Record<string, string> = selected ? Object.fromEntries(
    Object.entries(selected).map(([k, v]) => [k, v == null ? '' : String(v)])
  ) : { view };

  const ctxItems: ContextMenuItem[] = [
    { label: '수정', icon: <PencilSimple size={12} weight="bold" />, onClick: () => setEditOpen(true) },
    { label: '삭제', icon: <Trash size={12} weight="bold" />,        onClick: handleDelete, danger: true },
    { label: '', divider: true, onClick: () => {} },
    { label: `${view} 등록`, icon: <Plus size={12} weight="bold" />, onClick: () => setRegisterOpen(true) },
  ];

  return (
    <>
      <PageShell subTabs={FINANCE_SUBTABS}
        footerLeft={<>
          <div className="chip-group">
            <button className={cn('chip', view === '매출' && 'active')} onClick={() => setView('매출')}>매출 (발행)</button>
            <button className={cn('chip', view === '매입' && 'active')} onClick={() => setView('매입')}>매입 (수취)</button>
          </div>
          <span className="stat-divider" />
          <span className="stat-item">건수 <strong>{filtered.length}</strong></span>
          <span className="stat-item">공급가액 <strong>₩{supply.toLocaleString('ko-KR')}</strong></span>
          <span className="stat-item">부가세 <strong>₩{vat.toLocaleString('ko-KR')}</strong></span>
          <span className="stat-item">합계 <strong>₩{total.toLocaleString('ko-KR')}</strong></span>
        </>}
        footerRight={<>
          <button className="btn">홈택스 동기화</button>
          <button className="btn">엑셀</button>
          <button className="btn" disabled={!selected} onClick={() => setEditOpen(true)}><PencilSimple size={14} weight="bold" /> 수정</button>
          <button className="btn" disabled={!selected} onClick={handleDelete}><Trash size={14} weight="bold" /> 삭제</button>
          <button className="btn btn-primary" onClick={() => setRegisterOpen(true)}><Plus size={14} weight="bold" /> {view} 등록</button>
        </>}>
        <div className="table-wrap">
          <table className="table">
            <thead><tr>
              <th>회사코드</th><th>{view === '매출' ? '공급받는자' : '공급자'}</th><th>승인번호</th>
              <th className="date">작성일</th><th className="date">발급일</th><th>품목</th>
              <th className="num">공급가액</th><th className="num">부가세</th><th className="num">합계</th>
              <th>결제 매칭</th><th className="center">상태</th><th>비고</th>
            </tr></thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={12} className="center dim" style={{ padding: '24px 0' }}>{view} 데이터 없음</td></tr>
              ) : (
                filtered.map((t) => (
                  <tr key={t.id} className={cn(selected?.id === t.id && 'selected')}
                      onClick={() => setSelected(t)}
                      onContextMenu={(e) => { e.preventDefault(); setSelected(t); setCtxMenu({ open: true, x: e.clientX, y: e.clientY }); }}>
                    <td className="plate">{t.companyCode}</td>
                    <td>{t.partner}</td>
                    <td className="mono">{t.approvalNo}</td>
                    <td className="date">{t.writeDate}</td>
                    <td className="date">{t.issueDate}</td>
                    <td>{t.item}</td>
                    <td className="num">{t.supplyAmount.toLocaleString('ko-KR')}</td>
                    <td className="num dim">{t.vat.toLocaleString('ko-KR')}</td>
                    <td className="num">{t.total.toLocaleString('ko-KR')}</td>
                    <td className="mono dim">{t.matchedTx ?? ''}</td>
                    <td className="center"><span className={cn('badge', t.status === '발급' ? 'badge-green' : 'badge')}>{t.status}</span></td>
                    <td className="dim">{t.note ?? ''}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </PageShell>
      <ContextMenu open={ctxMenu.open} x={ctxMenu.x} y={ctxMenu.y}
        onClose={() => setCtxMenu({ open: false, x: 0, y: 0 })} items={selected ? ctxItems : []} />
      <EntityFormDialog open={registerOpen} onOpenChange={setRegisterOpen}
        title={`${view} 등록`} fields={FIELDS(view)} initial={{ view }} onSubmit={handleCreate} />
      <EntityFormDialog open={editOpen} onOpenChange={setEditOpen}
        title="세금계산서 수정" fields={FIELDS(view)} initial={editInitial}
        submitLabel="수정" onSubmit={handleUpdate} />
    </>
  );
}
