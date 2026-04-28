'use client';

import { useState, useMemo } from 'react';
import { PencilSimple, Copy, Trash, Plus } from '@phosphor-icons/react';
import { PageShell } from '@/components/layout/page-shell';
import { FINANCE_SUBTABS, FINANCE_SUBTAB_PENDING } from '@/lib/finance-subtabs';
import { SAMPLE_LEDGER, ALL_SUBJECTS, type LedgerEntry, type LedgerMethod, type AccountSubject } from '@/lib/sample-finance';
import { EntityFormDialog, type FieldDef } from '@/components/ui/entity-form-dialog';
import { ContextMenu, type ContextMenuItem } from '@/components/ui/context-menu';
import { PERIODS, periodRange, isInRange, type Period } from '@/lib/period-filter';
import { exportToExcel } from '@/lib/excel-export';
import { cn } from '@/lib/cn';

const LEDGER_FIELDS: FieldDef[] = [
  { key: 'companyCode',     label: '회사코드',  placeholder: 'CP01', required: true },
  { key: 'account',         label: '계좌',      placeholder: '신한 110-123-456789', required: true, colSpan: 2 },
  { key: 'txDate',          label: '거래일시',  placeholder: 'YYYY-MM-DD HH:mm', required: true },
  { key: 'deposit',         label: '입금액',    type: 'number' },
  { key: 'withdraw',        label: '출금액',    type: 'number' },
  { key: 'balance',         label: '거래후 잔액', type: 'number', required: true },
  { key: 'memo',            label: '적요',      colSpan: 2, required: true },
  { key: 'counterparty',    label: '상대 계좌·예금주', colSpan: 2 },
  { key: 'method',          label: '거래방법',  type: 'select', options: ['자동이체', '카드', '인터넷뱅킹', '현금', '무통장', '기타'] },
  { key: 'subject',         label: '계정과목',  type: 'select', options: ALL_SUBJECTS as unknown as string[] },
  { key: 'matchedContract', label: '매칭 계약번호' },
  { key: 'note',            label: '비고',      colSpan: 4 },
];

export default function FinanceLedgerPage() {
  const [entries, setEntries] = useState<LedgerEntry[]>(SAMPLE_LEDGER);
  const [selected, setSelected] = useState<LedgerEntry | null>(null);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [ctxMenu, setCtxMenu] = useState({ open: false, x: 0, y: 0 });
  const [period, setPeriod] = useState<Period>('이번달');

  const filtered = useMemo(() => {
    const range = periodRange(period);
    return entries.filter((e) => isInRange(e.txDate, range));
  }, [entries, period]);

  const totalIn = filtered.reduce((s, e) => s + (e.deposit ?? 0), 0);
  const totalOut = filtered.reduce((s, e) => s + (e.withdraw ?? 0), 0);

  function fromForm(d: Record<string, string>): LedgerEntry {
    return {
      id: `l-${Date.now()}`,
      companyCode: d.companyCode || 'CP01',
      account: d.account || '',
      txDate: d.txDate || new Date().toISOString().slice(0, 16).replace('T', ' '),
      deposit: d.deposit ? Number(d.deposit) : undefined,
      withdraw: d.withdraw ? Number(d.withdraw) : undefined,
      balance: Number(d.balance) || 0,
      memo: d.memo || '',
      counterparty: d.counterparty,
      method: (d.method as LedgerMethod) || '인터넷뱅킹',
      subject: d.subject ? (d.subject as AccountSubject) : undefined,
      matchedContract: d.matchedContract || undefined,
      note: d.note,
    };
  }
  const handleCreate = (d: Record<string, string>) => { setEntries((p) => [fromForm(d), ...p]); setRegisterOpen(false); };
  const handleUpdate = (d: Record<string, string>) => {
    if (!selected) return;
    const u = { ...selected, ...fromForm(d), id: selected.id };
    setEntries((p) => p.map((x) => x.id === selected.id ? u : x));
    setSelected(u); setEditOpen(false);
  };
  const handleDuplicate = (d: Record<string, string>) => { setEntries((p) => [fromForm(d), ...p]); setDuplicateOpen(false); };
  const handleDelete = () => {
    if (!selected) return;
    if (!confirm(`거래 ${selected.txDate} (${selected.memo}) 를 삭제할까요?`)) return;
    setEntries((p) => p.filter((x) => x.id !== selected.id));
    setSelected(null);
  };

  const editInitial: Record<string, string> = selected ? Object.fromEntries(
    Object.entries(selected).map(([k, v]) => [k, v == null ? '' : String(v)])
  ) : {};
  const dupInitial: Record<string, string> = { ...editInitial, txDate: '', memo: '', counterparty: '', matchedContract: '' };

  const ctxItems: ContextMenuItem[] = [
    { label: '수정', icon: <PencilSimple size={12} weight="bold" />, onClick: () => setEditOpen(true) },
    { label: '복사', icon: <Copy size={12} weight="bold" />,         onClick: () => setDuplicateOpen(true) },
    { label: '삭제', icon: <Trash size={12} weight="bold" />,        onClick: handleDelete, danger: true },
    { label: '', divider: true, onClick: () => {} },
    { label: '거래 입력', icon: <Plus size={12} weight="bold" />,    onClick: () => setRegisterOpen(true) },
  ];

  return (
    <>
      <PageShell subTabs={FINANCE_SUBTABS} subTabPending={FINANCE_SUBTAB_PENDING}
        footerLeft={<>
          <div className="chip-group">
            {PERIODS.map((p) => (
              <button key={p} className={cn('chip', period === p && 'active')} onClick={() => setPeriod(p)}>{p}</button>
            ))}
          </div>
          <span className="stat-divider" />
          <span className="stat-item">건수 <strong>{filtered.length}</strong></span>
          <span className="stat-item">입금 <strong>₩{totalIn.toLocaleString('ko-KR')}</strong></span>
          <span className="stat-item">출금 <strong>₩{totalOut.toLocaleString('ko-KR')}</strong></span>
        </>}
        footerRight={<>
          <button className="btn" onClick={() => exportToExcel({
            title: '계좌내역',
            subtitle: `${period} · 기준일 ${new Date().toLocaleDateString('ko-KR')}`,
            columns: [
              { key: 'companyCode', header: '회사코드', type: 'mono', width: 10 },
              { key: 'account',     header: '계좌',     type: 'mono', width: 24 },
              { key: 'txDate',      header: '거래일시', type: 'date', width: 18 },
              { key: 'deposit',     header: '입금',     type: 'number' },
              { key: 'withdraw',    header: '출금',     type: 'number' },
              { key: 'balance',     header: '잔액',     type: 'number' },
              { key: 'memo',        header: '적요',     width: 28 },
              { key: 'counterparty',header: '상대 계좌·예금주', width: 22 },
              { key: 'method',      header: '거래방법' },
              { key: 'subject',     header: '계정과목' },
              { key: 'matchedContract', header: '매칭 계약', type: 'mono' },
              { key: 'note',        header: '비고', width: 16 },
            ],
            rows: filtered as unknown as Record<string, unknown>[],
          })}>엑셀</button>
          <button className="btn" disabled={!selected} onClick={() => setEditOpen(true)}><PencilSimple size={14} weight="bold" /> 수정</button>
          <button className="btn" disabled={!selected} onClick={() => setDuplicateOpen(true)}><Copy size={14} weight="bold" /> 복사</button>
          <button className="btn" disabled={!selected} onClick={handleDelete}><Trash size={14} weight="bold" /> 삭제</button>
          <button className="btn btn-primary" onClick={() => setRegisterOpen(true)}><Plus size={14} weight="bold" /> 거래 입력</button>
        </>}>
        <div className="table-wrap">
          <table className="table">
            <thead><tr>
              <th>회사코드</th><th>계좌</th><th className="date">거래일시</th>
              <th className="num">입금</th><th className="num">출금</th><th className="num">잔액</th>
              <th>적요</th><th>상대 계좌</th><th>거래방법</th>
              <th>계정과목</th><th>매칭 계약</th>
            </tr></thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id} className={cn(selected?.id === e.id && 'selected')}
                    onClick={() => setSelected(e)}
                    onContextMenu={(ev) => { ev.preventDefault(); setSelected(e); setCtxMenu({ open: true, x: ev.clientX, y: ev.clientY }); }}>
                  <td className="plate">{e.companyCode}</td>
                  <td className="mono dim">{e.account}</td>
                  <td className="date mono">{e.txDate}</td>
                  <td className="num">{e.deposit ? e.deposit.toLocaleString('ko-KR') : ''}</td>
                  <td className="num">{e.withdraw ? e.withdraw.toLocaleString('ko-KR') : ''}</td>
                  <td className="num">{e.balance.toLocaleString('ko-KR')}</td>
                  <td>{e.memo}</td>
                  <td className="dim">{e.counterparty ?? ''}</td>
                  <td><span className="badge">{e.method}</span></td>
                  <td className="dim">{e.subject ?? <span className="text-muted">-</span>}</td>
                  <td className="mono dim">{e.matchedContract ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PageShell>
      <ContextMenu open={ctxMenu.open} x={ctxMenu.x} y={ctxMenu.y}
        onClose={() => setCtxMenu({ open: false, x: 0, y: 0 })} items={selected ? ctxItems : []} />
      <EntityFormDialog open={registerOpen} onOpenChange={setRegisterOpen}
        title="거래 입력" fields={LEDGER_FIELDS} onSubmit={handleCreate} size="xl" />
      <EntityFormDialog open={editOpen} onOpenChange={setEditOpen}
        title="거래 수정" fields={LEDGER_FIELDS} initial={editInitial}
        submitLabel="수정" onSubmit={handleUpdate} size="xl" />
      <EntityFormDialog open={duplicateOpen} onOpenChange={setDuplicateOpen}
        title="거래 복사" fields={LEDGER_FIELDS} initial={dupInitial} onSubmit={handleDuplicate} size="xl" />
    </>
  );
}
