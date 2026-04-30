'use client';

import { useState, useMemo } from 'react';
import { Plus, Trash, PencilSimple, Copy } from '@phosphor-icons/react';
import { PageShell } from '@/components/layout/page-shell';
import { FINANCE_SUBTABS } from '@/lib/finance-subtabs';
import { SAMPLE_EXPENSE, EXPENSE_SUBJECTS, type Expense } from '@/lib/sample-finance';
import { EntityFormDialog, type FieldDef } from '@/components/ui/entity-form-dialog';
import { ContextMenu, type ContextMenuItem } from '@/components/ui/context-menu';
import { PERIODS, periodRange, isInRange, type Period } from '@/lib/period-filter';
import { exportToExcel } from '@/lib/excel-export';
import { cn } from '@/lib/cn';

const FIELDS: FieldDef[] = [
  { key: 'companyCode',   label: '회사코드',  placeholder: 'CP01', required: true },
  { key: 'plate',         label: '차량번호 (선택)' },
  { key: 'expenseNo',     label: '지출번호',  placeholder: 'EX-YYYY-NNNN' },
  { key: 'occurDate',     label: '발생일',    type: 'date', required: true },
  { key: 'partner',       label: '거래처',    required: true, colSpan: 2 },
  { key: 'category',      label: '계정과목',  type: 'select', options: EXPENSE_SUBJECTS as unknown as string[] },
  { key: 'memo',          label: '적요',      colSpan: 4 },
  { key: 'supplyAmount',  label: '공급가액',  type: 'number', required: true },
  { key: 'vat',           label: '부가세',    type: 'number' },
  { key: 'total',         label: '합계',      type: 'number' },
  { key: 'payMethod',     label: '결제수단',  type: 'select', options: ['카드', '자동이체', '인터넷뱅킹', '현금', '기타'] },
  { key: 'taxbillNo',     label: '세금계산서 번호' },
  { key: 'status',        label: '상태',      type: 'select', options: ['확정', '대기'] },
];

export default function FinanceExpensePage() {
  const [items, setItems] = useState<Expense[]>(SAMPLE_EXPENSE);
  const [selected, setSelected] = useState<Expense | null>(null);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [ctxMenu, setCtxMenu] = useState({ open: false, x: 0, y: 0 });
  const [period, setPeriod] = useState<Period>('이번달');

  const filtered = useMemo(() => {
    const range = periodRange(period);
    return items.filter((e) => isInRange(e.occurDate, range));
  }, [items, period]);

  const total = filtered.reduce((s, e) => s + e.total, 0);
  const byCat: Record<string, number> = {};
  for (const e of filtered) byCat[e.category] = (byCat[e.category] ?? 0) + e.total;

  function fromForm(d: Record<string, string>): Expense {
    return {
      id: `ex-${Date.now()}`,
      companyCode: d.companyCode || 'CP01',
      plate: d.plate || undefined,
      expenseNo: d.expenseNo || `EX-${new Date().getFullYear()}-NEW`,
      occurDate: d.occurDate || new Date().toISOString().slice(0, 10),
      partner: d.partner || '',
      category: d.category || '기타',
      memo: d.memo || '',
      supplyAmount: Number(d.supplyAmount) || 0,
      vat: Number(d.vat) || 0,
      total: Number(d.total) || 0,
      payMethod: d.payMethod || '카드',
      taxbillNo: d.taxbillNo || undefined,
      status: (d.status as '확정' | '대기') || '확정',
    };
  }
  const handleCreate = (d: Record<string, string>) => { setItems((p) => [fromForm(d), ...p]); setRegisterOpen(false); };
  const handleUpdate = (d: Record<string, string>) => {
    if (!selected) return;
    const u = { ...selected, ...fromForm(d), id: selected.id };
    setItems((p) => p.map((x) => x.id === selected.id ? u : x));
    setSelected(u); setEditOpen(false);
  };
  const handleDuplicate = (d: Record<string, string>) => { setItems((p) => [fromForm(d), ...p]); setDuplicateOpen(false); };
  const handleDelete = () => {
    if (!selected) return;
    if (!confirm(`${selected.expenseNo} 지출을 삭제할까요?`)) return;
    setItems((p) => p.filter((x) => x.id !== selected.id));
    setSelected(null);
  };
  const editInitial: Record<string, string> = selected ? Object.fromEntries(
    Object.entries(selected).map(([k, v]) => [k, v == null ? '' : String(v)])
  ) : {};
  const dupInitial: Record<string, string> = { ...editInitial, expenseNo: '', occurDate: '' };

  const ctxItems: ContextMenuItem[] = [
    { label: '수정', icon: <PencilSimple size={12} weight="bold" />, onClick: () => setEditOpen(true) },
    { label: '복사', icon: <Copy size={12} weight="bold" />,         onClick: () => setDuplicateOpen(true) },
    { label: '삭제', icon: <Trash size={12} weight="bold" />,        onClick: handleDelete, danger: true },
    { label: '', divider: true, onClick: () => {} },
    { label: '지출 입력', icon: <Plus size={12} weight="bold" />,    onClick: () => setRegisterOpen(true) },
  ];

  return (
    <>
      <PageShell subTabs={FINANCE_SUBTABS}
        footerLeft={<>
          <div className="chip-group">
            {PERIODS.map((p) => (
              <button key={p} className={cn('chip', period === p && 'active')} onClick={() => setPeriod(p)}>{p}</button>
            ))}
          </div>
          <span className="stat-divider" />
          <span className="stat-item">건수 <strong>{filtered.length}</strong></span>
          <span className="stat-item">합계 <strong>₩{total.toLocaleString('ko-KR')}</strong></span>
          {Object.entries(byCat).map(([cat, sum]) => (
            <span key={cat} className="stat-item">{cat} <strong>₩{sum.toLocaleString('ko-KR')}</strong></span>
          ))}
        </>}
        footerRight={<>
          <button className="btn" onClick={() => exportToExcel({
            title: '지출내역',
            subtitle: `${period} · 기준일 ${new Date().toLocaleDateString('ko-KR')}`,
            columns: [
              { key: 'companyCode',  header: '회사코드', type: 'mono' },
              { key: 'plate',        header: '차량번호', type: 'mono' },
              { key: 'expenseNo',    header: '지출번호', type: 'mono' },
              { key: 'occurDate',    header: '발생일',   type: 'date' },
              { key: 'partner',      header: '거래처', width: 22 },
              { key: 'category',     header: '계정과목' },
              { key: 'memo',         header: '적요', width: 28 },
              { key: 'supplyAmount', header: '공급가액', type: 'number' },
              { key: 'vat',          header: '부가세',   type: 'number' },
              { key: 'total',        header: '합계',     type: 'number' },
              { key: 'payMethod',    header: '결제수단' },
              { key: 'taxbillNo',    header: '세금계산서', type: 'mono' },
              { key: 'status',       header: '상태' },
            ],
            rows: filtered as unknown as Record<string, unknown>[],
          })}>엑셀</button>
          <button className="btn" disabled={!selected} onClick={() => setEditOpen(true)}><PencilSimple size={14} weight="bold" /> 수정</button>
          <button className="btn" disabled={!selected} onClick={() => setDuplicateOpen(true)}><Copy size={14} weight="bold" /> 복사</button>
          <button className="btn" disabled={!selected} onClick={handleDelete}><Trash size={14} weight="bold" /> 삭제</button>
          <button className="btn btn-primary" onClick={() => setRegisterOpen(true)}><Plus size={14} weight="bold" /> 지출 입력</button>
        </>}>
        <div className="table-wrap">
          <table className="table">
            <thead><tr>
              <th>회사코드</th><th>차량번호</th><th>지출번호</th><th className="date">발생일</th>
              <th>거래처</th><th>구분</th><th>적요</th>
              <th className="num">공급가액</th><th className="num">부가세</th><th className="num">합계</th>
              <th>결제수단</th><th>세금계산서</th><th className="center">상태</th>
            </tr></thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id} className={cn(selected?.id === e.id && 'selected')}
                    onClick={() => setSelected(e)}
                    onContextMenu={(ev) => { ev.preventDefault(); setSelected(e); setCtxMenu({ open: true, x: ev.clientX, y: ev.clientY }); }}>
                  <td className="plate">{e.companyCode}</td>
                  <td className="plate">{e.plate ?? <span className="text-muted">-</span>}</td>
                  <td className="mono">{e.expenseNo}</td>
                  <td className="date">{e.occurDate}</td>
                  <td>{e.partner}</td>
                  <td className="dim">{e.category}</td>
                  <td>{e.memo}</td>
                  <td className="num">{e.supplyAmount.toLocaleString('ko-KR')}</td>
                  <td className="num dim">{e.vat.toLocaleString('ko-KR')}</td>
                  <td className="num">{e.total.toLocaleString('ko-KR')}</td>
                  <td className="dim">{e.payMethod}</td>
                  <td className="mono dim">{e.taxbillNo ?? ''}</td>
                  <td className="center"><span className={cn('badge', e.status === '확정' ? 'badge-green' : 'badge')}>{e.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PageShell>
      <ContextMenu open={ctxMenu.open} x={ctxMenu.x} y={ctxMenu.y}
        onClose={() => setCtxMenu({ open: false, x: 0, y: 0 })} items={selected ? ctxItems : []} />
      <EntityFormDialog open={registerOpen} onOpenChange={setRegisterOpen}
        title="지출 입력" fields={FIELDS} onSubmit={handleCreate} />
      <EntityFormDialog open={editOpen} onOpenChange={setEditOpen}
        title="지출 수정" fields={FIELDS} initial={editInitial}
        submitLabel="수정" onSubmit={handleUpdate} />
      <EntityFormDialog open={duplicateOpen} onOpenChange={setDuplicateOpen}
        title="지출 복사" fields={FIELDS} initial={dupInitial} onSubmit={handleDuplicate} />
    </>
  );
}
