'use client';

import { useState, useMemo } from 'react';
import { PageShell } from '@/components/layout/page-shell';
import { FINANCE_SUBTABS, FINANCE_SUBTAB_PENDING } from '@/lib/finance-subtabs';
import {
  ALL_SUBJECTS,
  RECEIPT_SUBJECTS,
  EXPENSE_SUBJECTS,
  INTERNAL_SUBJECTS,
  type LedgerEntry,
  type AccountSubject,
} from '@/lib/sample-finance';
import { useLedgerStore } from '@/lib/use-ledger-store';
import { JpkTable, type JpkColumn } from '@/components/shared/jpk-table';
import { exportToExcel } from '@/lib/excel-export';
import { cn } from '@/lib/cn';

/**
 * 자금일보 — 두 뷰:
 *  1) 매칭 (default) — 거래별 인라인 [계정과목 select] + [매칭계약 input]. JpkTable 컬럼 헤더 필터로 좁히고 일괄 매칭 가능.
 *  2) 집계         — 회사·일자별 입출금 합계 (세무사 공유용 엑셀).
 */

type View = 'match' | 'summary';

function applicableSubjects(e: LedgerEntry): readonly string[] {
  if (e.deposit) return [...RECEIPT_SUBJECTS, ...INTERNAL_SUBJECTS];
  if (e.withdraw) return [...EXPENSE_SUBJECTS, ...INTERNAL_SUBJECTS];
  return ALL_SUBJECTS;
}

function matchStatus(e: LedgerEntry): 'unmatched' | 'classified' | 'matched' {
  if (!e.subject) return 'unmatched';
  if (!e.matchedContract) return 'classified';
  return 'matched';
}

const STATUS_LABEL: Record<ReturnType<typeof matchStatus>, string> = {
  unmatched: '미매칭',
  classified: '분류완료',
  matched: '매칭완료',
};

const STATUS_COLOR: Record<ReturnType<typeof matchStatus>, string> = {
  unmatched: 'var(--text-weak)',
  classified: 'var(--success, #10b981)',
  matched: 'var(--brand)',
};

const fmtNum = (v: unknown) => (typeof v === 'number' && v ? v.toLocaleString('ko-KR') : '');

type DailyRow = {
  key: string;
  companyCode: string;
  date: string;
  txCount: number;
  deposit: number;
  withdraw: number;
  netChange: number;
  endBalance: number;
  depositSubjectsText: string;
  withdrawSubjectsText: string;
};

export default function FinanceDailyPage() {
  const [view, setView] = useState<View>('match');
  const [entries, setEntries] = useLedgerStore();
  const [filteredEntries, setFilteredEntries] = useState<readonly LedgerEntry[]>(entries);
  const [filteredDaily, setFilteredDaily] = useState<readonly DailyRow[]>([]);

  const counts = useMemo(() => {
    const c = { unmatched: 0, classified: 0, matched: 0 };
    for (const e of filteredEntries) c[matchStatus(e)]++;
    return c;
  }, [filteredEntries]);

  function updateEntry(id: string, patch: Partial<LedgerEntry>) {
    setEntries((prev) => prev.map((e) => e.id === id ? { ...e, ...patch } : e));
  }

  /** 일자×회사 집계 */
  const daily = useMemo<DailyRow[]>(() => {
    const m = new Map<string, DailyRow & { _depo: Record<string, number>; _draw: Record<string, number> }>();
    for (const e of entries) {
      const day = e.txDate.slice(0, 10);
      const k = `${e.companyCode}|${day}`;
      const cur = m.get(k) ?? {
        key: k, companyCode: e.companyCode, date: day,
        txCount: 0, deposit: 0, withdraw: 0, netChange: 0, endBalance: 0,
        depositSubjectsText: '', withdrawSubjectsText: '',
        _depo: {}, _draw: {},
      };
      cur.deposit += e.deposit ?? 0;
      cur.withdraw += e.withdraw ?? 0;
      cur.netChange = cur.deposit - cur.withdraw;
      cur.endBalance = e.balance;
      if (e.subject && e.deposit) cur._depo[e.subject] = (cur._depo[e.subject] ?? 0) + (e.deposit ?? 0);
      if (e.subject && e.withdraw) cur._draw[e.subject] = (cur._draw[e.subject] ?? 0) + (e.withdraw ?? 0);
      cur.txCount++;
      m.set(k, cur);
    }
    return Array.from(m.values()).map(({ _depo, _draw, ...rest }) => ({
      ...rest,
      depositSubjectsText: formatSubjects(_depo),
      withdrawSubjectsText: formatSubjects(_draw),
    }));
  }, [entries]);

  const totals = useMemo(() => {
    let inSum = 0, outSum = 0;
    for (const r of filteredDaily) { inSum += r.deposit; outSum += r.withdraw; }
    return { inSum, outSum };
  }, [filteredDaily]);

  /* ─── 매칭 뷰 컬럼 ─── */
  const matchColumns = useMemo<JpkColumn<LedgerEntry>[]>(() => [
    { headerName: '회사', field: 'companyCode', width: 80 },
    { headerName: '거래일시', field: 'txDate', width: 130, sort: 'desc', filterType: 'date' },
    { headerName: '입금', field: 'deposit', width: 110, align: 'right',
      filterType: 'range', filterStep: 100000, filterUnit: 10000, filterUnitLabel: '만원',
      valueFormatter: ({ value }) => fmtNum(value) },
    { headerName: '출금', field: 'withdraw', width: 110, align: 'right',
      filterType: 'range', filterStep: 100000, filterUnit: 10000, filterUnitLabel: '만원',
      valueFormatter: ({ value }) => fmtNum(value) },
    { headerName: '적요', field: 'memo', minWidth: 140, flex: 1 },
    { headerName: '상대', field: 'counterparty', width: 160 },
    {
      headerName: '계정과목', field: 'subject', width: 140, filterable: true,
      cellRenderer: ({ data }) => (
        <select
          className="input"
          value={data.subject ?? ''}
          onChange={(ev) => updateEntry(data.id, {
            subject: (ev.target.value || undefined) as AccountSubject | undefined,
          })}
          onClick={(e) => e.stopPropagation()}
          style={{ width: '100%', height: 22, padding: '0 4px', fontSize: 12 }}
        >
          <option value="">- 선택 -</option>
          {applicableSubjects(data).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      ),
    },
    {
      headerName: '매칭 계약·항목', field: 'matchedContract', width: 150, filterable: false,
      cellRenderer: ({ data }) => (
        <input
          className="input"
          type="text"
          value={data.matchedContract ?? ''}
          onChange={(ev) => updateEntry(data.id, { matchedContract: ev.target.value || undefined })}
          onClick={(e) => e.stopPropagation()}
          placeholder="C-NNNN-NNNN"
          style={{ width: '100%', height: 22, padding: '0 4px', fontSize: 12 }}
        />
      ),
    },
    {
      headerName: '상태', width: 80, align: 'center',
      valueGetter: ({ data }) => STATUS_LABEL[matchStatus(data)],
      cellStyle: ({ data }) => ({ color: STATUS_COLOR[matchStatus(data)], fontWeight: 500 }),
    },
  ], []);

  /* ─── 집계 뷰 컬럼 ─── */
  const summaryColumns = useMemo<JpkColumn<DailyRow>[]>(() => [
    { headerName: '회사코드', field: 'companyCode', width: 90 },
    { headerName: '일자', field: 'date', width: 110, sort: 'desc', filterType: 'date' },
    { headerName: '거래건수', field: 'txCount', width: 80, align: 'right', filterType: 'range', filterStep: 1 },
    { headerName: '입금합계', field: 'deposit', width: 120, align: 'right',
      filterType: 'range', filterStep: 100000, filterUnit: 10000, filterUnitLabel: '만원',
      valueFormatter: ({ value }) => fmtNum(value) },
    { headerName: '출금합계', field: 'withdraw', width: 120, align: 'right',
      filterType: 'range', filterStep: 100000, filterUnit: 10000, filterUnitLabel: '만원',
      valueFormatter: ({ value }) => fmtNum(value) },
    { headerName: '순증감', field: 'netChange', width: 120, align: 'right',
      valueFormatter: ({ value }) => {
        const n = Number(value) || 0;
        return (n >= 0 ? '+' : '') + n.toLocaleString('ko-KR');
      },
      cellStyle: ({ value }) => ({ color: Number(value) < 0 ? 'var(--c-danger, #dc2626)' : undefined }),
    },
    { headerName: '잔액', field: 'endBalance', width: 130, align: 'right',
      valueFormatter: ({ value }) => fmtNum(value) },
    { headerName: '주요 입금 (계정과목별)', field: 'depositSubjectsText', minWidth: 200, flex: 1 },
    { headerName: '주요 출금 (계정과목별)', field: 'withdrawSubjectsText', minWidth: 200, flex: 1 },
  ], []);

  return (
    <PageShell
      subTabs={FINANCE_SUBTABS}
      subTabPending={FINANCE_SUBTAB_PENDING}
      footerLeft={
        <>
          <div className="chip-group" role="tablist" aria-label="자금일보 뷰">
            <button
              type="button"
              className={cn('chip', view === 'match' && 'active')}
              onClick={() => setView('match')}
            >
              매칭 ({counts.unmatched + counts.classified} / {filteredEntries.length})
            </button>
            <button
              type="button"
              className={cn('chip', view === 'summary' && 'active')}
              onClick={() => setView('summary')}
            >
              일자별 집계
            </button>
          </div>
          <span className="stat-divider" />
          {view === 'match' ? (
            <>
              <span className="stat-item">전체 <strong>{entries.length}</strong></span>
              <span className="stat-item">표시 <strong>{filteredEntries.length}</strong></span>
              <span className="stat-divider" />
              <span className="stat-item" style={{ color: STATUS_COLOR.unmatched }}>미매칭 <strong>{counts.unmatched}</strong></span>
              <span className="stat-item" style={{ color: STATUS_COLOR.classified }}>분류 <strong>{counts.classified}</strong></span>
              <span className="stat-item" style={{ color: STATUS_COLOR.matched }}>매칭 <strong>{counts.matched}</strong></span>
            </>
          ) : (
            <>
              <span className="stat-item">일자 <strong>{daily.length}</strong></span>
              <span className="stat-item">표시 <strong>{filteredDaily.length}</strong></span>
              <span className="stat-divider" />
              <span className="stat-item">입금 <strong>₩{totals.inSum.toLocaleString('ko-KR')}</strong></span>
              <span className="stat-item">출금 <strong>₩{totals.outSum.toLocaleString('ko-KR')}</strong></span>
            </>
          )}
        </>
      }
      footerRight={
        view === 'summary' ? (
          <button className="btn" onClick={() => exportToExcel({
            title: '자금일보',
            subtitle: `기준일 ${new Date().toLocaleDateString('ko-KR')}`,
            columns: [
              { key: 'companyCode', header: '회사코드', type: 'mono' },
              { key: 'date',        header: '일자', type: 'date' },
              { key: 'txCount',     header: '거래건수', type: 'number' },
              { key: 'deposit',     header: '입금합계', type: 'number' },
              { key: 'withdraw',    header: '출금합계', type: 'number' },
              { key: 'netChange',   header: '순증감', type: 'number' },
              { key: 'endBalance',  header: '잔액', type: 'number' },
              { key: 'depositSubjectsText', header: '주요 입금 (계정과목)', width: 36 },
              { key: 'withdrawSubjectsText', header: '주요 출금 (계정과목)', width: 36 },
            ],
            rows: filteredDaily as unknown as Record<string, unknown>[],
            fileName: `자금일보-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.xlsx`,
          })}>엑셀 (세무사 공유용)</button>
        ) : null
      }
    >
      {view === 'match' ? (
        <JpkTable<LedgerEntry>
          columns={matchColumns}
          rows={entries}
          getRowId={(r) => r.id}
          storageKey="finance.daily.match"
          onFilteredChange={setFilteredEntries}
        />
      ) : (
        <JpkTable<DailyRow>
          columns={summaryColumns}
          rows={daily}
          getRowId={(r) => r.key}
          storageKey="finance.daily.summary"
          onFilteredChange={setFilteredDaily}
        />
      )}
    </PageShell>
  );
}

function formatSubjects(subjects: Record<string, number>): string {
  return Object.entries(subjects).map(([s, v]) => `${s} ₩${v.toLocaleString('ko-KR')}`).join(' / ');
}
