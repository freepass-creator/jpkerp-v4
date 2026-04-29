'use client';

import { useState, useMemo, useRef } from 'react';
import { PencilSimple, Copy, Trash, TrashSimple, Plus } from '@phosphor-icons/react';
import { PageShell } from '@/components/layout/page-shell';
import { FINANCE_SUBTABS, FINANCE_SUBTAB_PENDING } from '@/lib/finance-subtabs';
import { type LedgerEntry, type LedgerMethod } from '@/lib/sample-finance';
import { EntityFormDialog, type FieldDef } from '@/components/ui/entity-form-dialog';
import { ContextMenu, type ContextMenuItem } from '@/components/ui/context-menu';
import { LedgerRegisterDialog } from '@/components/finance/ledger-register-dialog';
import { JpkTable, type JpkColumn, type JpkTableApi } from '@/components/shared/jpk-table';
import { useLedgerStore } from '@/lib/use-ledger-store';
import { useCompanyStore } from '@/lib/use-company-store';
import { dedupAgainst } from '@/lib/ledger-dedup';
import { exportToExcel } from '@/lib/excel-export';

const LEDGER_FIELDS: FieldDef[] = [
  { key: 'companyCode',     label: '회사코드',  placeholder: 'CP01', required: true },
  { key: 'account',         label: '계좌 (선택)', placeholder: '신한 110-123-456789', colSpan: 2 },
  { key: 'txDate',          label: '거래일시',  placeholder: 'YYYY-MM-DD HH:mm', required: true },
  { key: 'deposit',         label: '입금액',    type: 'number' },
  { key: 'withdraw',        label: '출금액',    type: 'number' },
  { key: 'balance',         label: '거래후 잔액', type: 'number', required: true },
  { key: 'memo',            label: '적요',      colSpan: 2, required: true },
  { key: 'counterparty',    label: '상대 계좌·예금주', colSpan: 2 },
  { key: 'method',          label: '거래방법',  type: 'select', options: ['자동이체', '카드', '인터넷뱅킹', '현금', '무통장', '기타'] },
  { key: 'note',            label: '비고',      colSpan: 4 },
];

const fmtNum = (v: unknown) => (typeof v === 'number' && v ? v.toLocaleString('ko-KR') : '');

export default function FinanceLedgerPage() {
  const [entries, setEntries] = useLedgerStore();
  const [companies] = useCompanyStore();
  const [selected, setSelected] = useState<LedgerEntry | null>(null);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [ctxMenu, setCtxMenu] = useState({ open: false, x: 0, y: 0 });
  const [filteredRows, setFilteredRows] = useState<readonly LedgerEntry[]>(entries);
  const filteredCount = filteredRows.length;
  const tableRef = useRef<JpkTableApi<LedgerEntry> | null>(null);

  function fromForm(d: Record<string, string>): Omit<LedgerEntry, 'subject' | 'matchedContract'> {
    return {
      id: `l-${Date.now()}`,
      companyCode: d.companyCode || 'CP01',
      account: d.account || undefined,
      txDate: d.txDate || new Date().toISOString().slice(0, 16).replace('T', ' '),
      deposit: d.deposit ? Number(d.deposit) : undefined,
      withdraw: d.withdraw ? Number(d.withdraw) : undefined,
      balance: Number(d.balance) || 0,
      memo: d.memo || '',
      counterparty: d.counterparty,
      method: (d.method as LedgerMethod) || '인터넷뱅킹',
      note: d.note,
      uploadedAt: new Date().toISOString(),
    };
  }

  const handleRegister = (newEntries: LedgerEntry[]) => {
    const { unique, duplicates } = dedupAgainst(newEntries, entries);
    setEntries((p) => [...unique, ...p]);
    if (duplicates.length > 0) {
      alert(`${unique.length}건 등록 / ${duplicates.length}건은 이미 등록된 거래로 판정되어 건너뜀.`);
    }
  };
  const handleUpdate = (d: Record<string, string>) => {
    if (!selected) return;
    const u = { ...selected, ...fromForm(d), id: selected.id };
    setEntries((p) => p.map((x) => x.id === selected.id ? u : x));
    setSelected(u); setEditOpen(false);
  };
  const handleDuplicate = (d: Record<string, string>) => {
    setEntries((p) => [{ ...fromForm(d), subject: undefined, matchedContract: undefined } as LedgerEntry, ...p]);
    setDuplicateOpen(false);
  };
  const handleDelete = () => {
    if (!selected) return;
    if (!confirm(`거래 ${selected.txDate} (${selected.memo}) 를 삭제할까요?`)) return;
    setEntries((p) => p.filter((x) => x.id !== selected.id));
    setSelected(null);
  };
  const handleDeleteFiltered = () => {
    const ids = new Set(filteredRows.map((r) => r.id));
    if (ids.size === 0) return;
    if (!confirm(`현재 화면(필터 적용 후) ${ids.size}건을 삭제할까요? 되돌릴 수 없습니다.`)) return;
    setEntries((p) => p.filter((x) => !ids.has(x.id)));
    setSelected(null);
  };
  const handleDeleteAll = () => {
    if (entries.length === 0) return;
    if (!confirm(`전체 ${entries.length}건을 삭제할까요? 되돌릴 수 없습니다.`)) return;
    setEntries([]);
    setSelected(null);
  };

  const editInitial: Record<string, string> = selected ? Object.fromEntries(
    Object.entries(selected).map(([k, v]) => [k, v == null ? '' : String(v)])
  ) : {};
  const dupInitial: Record<string, string> = { ...editInitial, txDate: '', memo: '', counterparty: '' };

  const totals = useMemo(() => {
    let inSum = 0, outSum = 0;
    for (const e of filteredRows) {
      inSum += e.deposit ?? 0;
      outSum += e.withdraw ?? 0;
    }
    return { inSum, outSum };
  }, [filteredRows]);

  const ctxItems: ContextMenuItem[] = [
    { label: '수정', icon: <PencilSimple size={12} weight="bold" />, onClick: () => setEditOpen(true) },
    { label: '복사', icon: <Copy size={12} weight="bold" />,         onClick: () => setDuplicateOpen(true) },
    { label: '삭제', icon: <Trash size={12} weight="bold" />,        onClick: handleDelete, danger: true },
    { label: '', divider: true, onClick: () => {} },
    { label: '거래 등록', icon: <Plus size={12} weight="bold" />,    onClick: () => setRegisterOpen(true) },
  ];

  const columns = useMemo<JpkColumn<LedgerEntry>[]>(() => [
    { headerName: '회사코드', field: 'companyCode', width: 80 },
    { headerName: '계좌', field: 'account', width: 200,
      cellRenderer: ({ value }) => value ? <span className="mono">{String(value)}</span> : <span className="text-muted">미지정</span> },
    { headerName: '거래일시', field: 'txDate', width: 130, sort: 'desc', filterType: 'date' },
    { headerName: '입금', field: 'deposit', width: 110, align: 'right',
      filterType: 'range', filterStep: 100000, filterUnit: 10000, filterUnitLabel: '만원',
      valueFormatter: ({ value }) => fmtNum(value) },
    { headerName: '출금', field: 'withdraw', width: 110, align: 'right',
      filterType: 'range', filterStep: 100000, filterUnit: 10000, filterUnitLabel: '만원',
      valueFormatter: ({ value }) => fmtNum(value) },
    { headerName: '잔액', field: 'balance', width: 120, align: 'right',
      filterType: 'range', filterStep: 1000000, filterUnit: 10000, filterUnitLabel: '만원',
      valueFormatter: ({ value }) => fmtNum(value) },
    { headerName: '적요', field: 'memo', minWidth: 140, flex: 1 },
    { headerName: '상대 계좌·예금주', field: 'counterparty', width: 180 },
    { headerName: '거래방법', field: 'method', width: 90 },
    { headerName: '계정과목', field: 'subject', width: 100 },
    { headerName: '매칭 계약', field: 'matchedContract', width: 110 },
    { headerName: '업로드', field: 'uploadedAt', width: 130, filterType: 'date',
      valueFormatter: ({ value }) => value ? String(value).slice(0, 16).replace('T', ' ') : '' },
  ], []);

  return (
    <>
      <PageShell subTabs={FINANCE_SUBTABS} subTabPending={FINANCE_SUBTAB_PENDING}
        footerLeft={<>
          <span className="stat-item">전체 <strong>{entries.length}</strong></span>
          <span className="stat-item">표시 <strong>{filteredCount}</strong></span>
          <span className="stat-divider" />
          <span className="stat-item">입금 <strong>₩{totals.inSum.toLocaleString('ko-KR')}</strong></span>
          <span className="stat-item">출금 <strong>₩{totals.outSum.toLocaleString('ko-KR')}</strong></span>
        </>}
        footerRight={<>
          <button className="btn" onClick={() => exportToExcel({
            title: '계좌내역',
            subtitle: `기준일 ${new Date().toLocaleDateString('ko-KR')}`,
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
              { key: 'uploadedAt',  header: '업로드', type: 'date' },
              { key: 'note',        header: '비고', width: 16 },
            ],
            rows: filteredRows as unknown as Record<string, unknown>[],
          })}>엑셀</button>
          <button className="btn" disabled={!selected} onClick={() => setEditOpen(true)}><PencilSimple size={14} weight="bold" /> 수정</button>
          <button className="btn" disabled={!selected} onClick={() => setDuplicateOpen(true)}><Copy size={14} weight="bold" /> 복사</button>
          <button className="btn" disabled={!selected} onClick={handleDelete}><Trash size={14} weight="bold" /> 삭제</button>
          <button className="btn" disabled={filteredCount === 0} onClick={handleDeleteFiltered} title="현재 필터 결과만 삭제">
            <Trash size={14} weight="bold" /> 화면 삭제 ({filteredCount})
          </button>
          <button className="btn" disabled={entries.length === 0} onClick={handleDeleteAll} title="전체 거래 일괄 삭제">
            <TrashSimple size={14} weight="bold" /> 전체 삭제
          </button>
          <LedgerRegisterDialog
            open={registerOpen}
            onOpenChange={setRegisterOpen}
            onCreate={handleRegister}
            companies={companies}
          />
        </>}>
        <JpkTable<LedgerEntry>
          ref={tableRef}
          columns={columns}
          rows={entries}
          getRowId={(r) => r.id}
          storageKey="finance.ledger"
          onRowClick={(r) => setSelected(r)}
          onRowContextMenu={(r, _i, ev) => {
            setSelected(r);
            setCtxMenu({ open: true, x: ev.clientX, y: ev.clientY });
          }}
          onFilteredChange={setFilteredRows}
          selectedKey={selected?.id ?? null}
        />
      </PageShell>
      <ContextMenu open={ctxMenu.open} x={ctxMenu.x} y={ctxMenu.y}
        onClose={() => setCtxMenu({ open: false, x: 0, y: 0 })} items={selected ? ctxItems : []} />
      <EntityFormDialog open={editOpen} onOpenChange={setEditOpen}
        title="거래 수정" fields={LEDGER_FIELDS} initial={editInitial}
        submitLabel="수정" onSubmit={handleUpdate} size="xl" />
      <EntityFormDialog open={duplicateOpen} onOpenChange={setDuplicateOpen}
        title="거래 복사" fields={LEDGER_FIELDS} initial={dupInitial} onSubmit={handleDuplicate} size="xl" />
    </>
  );
}
