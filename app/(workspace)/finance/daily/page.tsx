'use client';

import { useState, useMemo, useCallback } from 'react';
import { PageShell } from '@/components/layout/page-shell';
import { FINANCE_SUBTABS } from '@/lib/finance-subtabs';
import {
  ALL_SUBJECTS,
  RECEIPT_SUBJECTS,
  EXPENSE_SUBJECTS,
  INTERNAL_SUBJECTS,
  type LedgerEntry,
  type AccountSubject,
} from '@/lib/sample-finance';
import { useLedgerStore } from '@/lib/use-ledger-store';
import { useContractStore } from '@/lib/use-contract-store';
import { useAssetStore } from '@/lib/use-asset-store';
import type { Contract, ScheduleEvent } from '@/lib/sample-contracts';
import type { Asset } from '@/lib/sample-assets';
import { useAuditStamp } from '@/lib/audit-fields';
import { applyReceiptMatch, reverseReceiptMatch, autoMatchAll, type ReceiptCandidate } from '@/lib/receipt-match';
import { JpkTable, type JpkColumn } from '@/components/shared/jpk-table';
import { exportToExcel } from '@/lib/excel-export';
import { cn } from '@/lib/cn';
import { ReceiptMatchDialog } from '@/components/finance/receipt-match-dialog';
import { Link as LinkIcon } from '@phosphor-icons/react';

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

  const updateEntry = useCallback((id: string, patch: Partial<LedgerEntry>) => {
    setEntries((prev) => prev.map((e) => e.id === id ? { ...e, ...patch } : e));
  }, [setEntries]);

  // 수납 매칭 모달 — 행에서 [매칭] 클릭 시 열림
  const [matchTarget, setMatchTarget] = useState<LedgerEntry | null>(null);
  const [contracts, setContracts] = useContractStore();
  const [assets] = useAssetStore();
  const audit = useAuditStamp();

  // 매칭 contractNo → contract + asset(plate 매칭) 빠른 lookup
  const contractByNo = useMemo(() => {
    const m = new Map<string, Contract>();
    for (const c of contracts) if (!c.deletedAt) m.set(c.contractNo, c);
    return m;
  }, [contracts]);
  const assetByPlate = useMemo(() => {
    const m = new Map<string, Asset>();
    for (const a of assets) if (!a.deletedAt) m.set(a.plate, a);
    return m;
  }, [assets]);

  /** ledger entry 에 매칭된 계약·자산 정보 derive — 차량번호/임차인/세부차종 컬럼용. */
  function matchedInfo(e: LedgerEntry): { plate: string; customer: string; model: string } {
    if (!e.matchedContract) return { plate: '', customer: '', model: '' };
    const c = contractByNo.get(e.matchedContract);
    if (!c) return { plate: '', customer: '', model: '' };
    const a = assetByPlate.get(c.plate);
    return {
      plate: c.plate,
      customer: c.customerName,
      model: a?.vehicleName ?? a?.purchase?.vehicleSpecMemo ?? '',
    };
  }

  function handleMatch(candidate: ReceiptCandidate) {
    if (!matchTarget) return;
    const { ledgerPatch, eventPatch } = applyReceiptMatch(matchTarget, candidate);
    setEntries((p) => p.map((e) => e.id === matchTarget.id ? { ...e, ...ledgerPatch } : e));
    setContracts((prev) => prev.map((c) => {
      if (c.id !== candidate.contract.id) return c;
      return {
        ...c,
        events: c.events.map((e) => e.id === eventPatch.id
          ? { ...e, status: eventPatch.status, doneDate: eventPatch.doneDate }
          : e),
      };
    }));
    audit.log({
      action: 'update',
      entityType: 'contract',
      entityId: candidate.contract.id,
      label: `${candidate.contract.contractNo} ${candidate.event.cycle}회차 자동매칭 (입금 ${matchTarget.deposit?.toLocaleString('ko-KR')}원)`,
      after: { eventStatus: '완료', doneDate: eventPatch.doneDate, ledgerId: matchTarget.id },
    });
    setMatchTarget(null);
  }

  /**
   * 일괄 자동매칭 — 매칭 안된 입금에 대해 고정확도 후보 (이름+금액 일치) 일괄 적용.
   * confirm 후 ledger + contract.events 양쪽 patch.
   */
  function handleAutoMatchAll() {
    const results = autoMatchAll(entries, contracts);
    if (results.length === 0) {
      alert('자동 매칭 가능한 항목이 없습니다.\n(이름·금액 모두 일치하는 미매칭 입금이 없음)');
      return;
    }
    const preview = results.slice(0, 10).map((r) =>
      `· ${r.ledger.txDate.slice(0, 10)} ${r.ledger.deposit?.toLocaleString('ko-KR')}원 → ${r.candidate.contract.contractNo} ${r.candidate.event.cycle}회차`,
    ).join('\n');
    const more = results.length > 10 ? `\n... 외 ${results.length - 10}건` : '';
    if (!confirm(`자동 매칭 ${results.length}건 일괄 적용:\n\n${preview}${more}\n\n진행할까요?`)) return;

    // ledger 일괄 patch
    const ledgerPatchById = new Map<string, Partial<LedgerEntry>>();
    for (const r of results) ledgerPatchById.set(r.ledger.id, r.ledgerPatch);
    setEntries((p) => p.map((e) => {
      const patch = ledgerPatchById.get(e.id);
      return patch ? { ...e, ...patch } : e;
    }));

    // contract.events 일괄 patch
    const eventPatchByContract = new Map<string, Map<string, { status: ScheduleEvent['status']; doneDate: string }>>();
    for (const r of results) {
      const cMap = eventPatchByContract.get(r.eventPatch.contractId) ?? new Map();
      cMap.set(r.eventPatch.id, { status: r.eventPatch.status, doneDate: r.eventPatch.doneDate });
      eventPatchByContract.set(r.eventPatch.contractId, cMap);
    }
    setContracts((prev) => prev.map((c) => {
      const eMap = eventPatchByContract.get(c.id);
      if (!eMap) return c;
      return {
        ...c,
        events: c.events.map((ev) => {
          const p = eMap.get(ev.id);
          return p ? { ...ev, status: p.status, doneDate: p.doneDate } : ev;
        }),
      };
    }));

    audit.log({
      action: 'update',
      entityType: 'contract',
      entityId: 'batch',
      label: `자동매칭 일괄 ${results.length}건`,
      after: { count: results.length },
    });
    alert(`${results.length}건 자동 매칭 완료.`);
  }

  function handleReverse() {
    if (!matchTarget) return;
    const { ledgerPatch, eventPatch } = reverseReceiptMatch(matchTarget, contracts);
    setEntries((p) => p.map((e) => e.id === matchTarget.id ? { ...e, ...ledgerPatch } : e));
    if (eventPatch) {
      setContracts((prev) => prev.map((c) => {
        if (c.id !== eventPatch.contractId) return c;
        return {
          ...c,
          events: c.events.map((e) => e.id === eventPatch.eventId
            ? { ...e, status: eventPatch.status, doneDate: undefined }
            : e),
        };
      }));
    }
    audit.log({
      action: 'update',
      entityType: 'contract',
      entityId: matchTarget.id,
      label: `${matchTarget.matchedContract} ${matchTarget.matchedCycle}회차 매칭 해제`,
    });
    setMatchTarget(null);
  }

  // JpkTable row handler — 안정화
  const getEntryId = useCallback((r: LedgerEntry) => r.id, []);
  const getDailyId = useCallback((r: DailyRow) => r.key, []);

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
  /**
   * 자금일보 컬럼 — 한국식 자금일보 표준 레이아웃.
   *
   * 거래일시 · 적요(method) · 입금액 · 출금액 · 내용(memo) · 잔액 · 거래점(account)
   * · 계정과목 · 차량번호 · 임차인 · 세부차종 · 비고(note) · 구분(매칭상태)
   *
   * 차량번호/임차인/세부차종은 matchedContract → contract → asset 으로 derive.
   * 비고는 인라인 텍스트 편집.
   */
  const matchColumns = useMemo<JpkColumn<LedgerEntry>[]>(() => [
    {
      headerName: '구분', width: 84, align: 'center', filterable: true,
      valueGetter: ({ data }) => STATUS_LABEL[matchStatus(data)],
      cellRenderer: ({ data }) => {
        const s = matchStatus(data);
        const cls = s === 'matched' ? 'badge-green' : s === 'classified' ? 'badge-orange' : 'badge-red';
        return <span className={`badge ${cls}`}>{STATUS_LABEL[s]}</span>;
      },
    },
    { headerName: '회사', field: 'companyCode', width: 70, filterable: true },
    { headerName: '계좌', field: 'account', width: 160, filterable: true },
    { headerName: '거래일시', field: 'txDate', width: 140, sort: 'desc', filterType: 'date' },
    { headerName: '적요', field: 'method', width: 100 },
    { headerName: '입금액', field: 'deposit', width: 110, align: 'right',
      filterType: 'range', filterStep: 100000, filterUnit: 10000, filterUnitLabel: '만원',
      valueFormatter: ({ value }) => fmtNum(value) },
    { headerName: '출금액', field: 'withdraw', width: 110, align: 'right',
      filterType: 'range', filterStep: 100000, filterUnit: 10000, filterUnitLabel: '만원',
      valueFormatter: ({ value }) => fmtNum(value) },
    { headerName: '내용', field: 'memo', minWidth: 160, flex: 1 },
    { headerName: '잔액', field: 'balance', width: 120, align: 'right',
      valueFormatter: ({ value }) => fmtNum(value) },
    {
      headerName: '계정과목', field: 'subject', width: 130, filterable: true,
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
      headerName: '차량번호', width: 110, filterable: true,
      valueGetter: ({ data }) => matchedInfo(data).plate,
      cellRenderer: ({ data }) => {
        const info = matchedInfo(data);
        if (info.plate) {
          return (
            <button
              type="button"
              className="btn btn-sm"
              onClick={(e) => { e.stopPropagation(); setMatchTarget(data); }}
              style={{ width: '100%', height: 22, padding: '0 4px', fontSize: 12 }}
              title={`${data.matchedContract}${data.matchedCycle != null ? ` · ${data.matchedCycle}회` : ''} — 매칭 정보 / 해제`}
            >
              <span className="mono">{info.plate}</span>
            </button>
          );
        }
        if (!data.deposit) return <span className="text-weak" style={{ fontSize: 11 }}>-</span>;
        return (
          <button
            type="button"
            className="btn btn-sm"
            onClick={(e) => { e.stopPropagation(); setMatchTarget(data); }}
            style={{ width: '100%', height: 22, padding: '0 4px', fontSize: 12 }}
            title="미수 회차에 매칭"
          >
            <LinkIcon size={11} weight="bold" /> 매칭
          </button>
        );
      },
    },
    {
      headerName: '임차인', width: 110,
      valueGetter: ({ data }) => matchedInfo(data).customer,
    },
    {
      headerName: '세부차종', width: 130,
      valueGetter: ({ data }) => matchedInfo(data).model,
    },
    {
      headerName: '비고', field: 'note', minWidth: 140, flex: 1,
      cellRenderer: ({ data }) => (
        <input
          className="input"
          value={data.note ?? ''}
          onChange={(ev) => updateEntry(data.id, { note: ev.target.value || undefined })}
          onClick={(e) => e.stopPropagation()}
          placeholder="-"
          style={{ width: '100%', height: 22, padding: '0 4px', fontSize: 12, background: 'transparent' }}
        />
      ),
    },
  ], [contractByNo, assetByPlate, updateEntry]);

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
        view === 'match' ? (
          <button className="btn btn-primary" onClick={handleAutoMatchAll} title="이름·금액 일치하는 미매칭 입금 일괄 매칭">
            자동매칭
          </button>
        ) : (
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
        )
      }
    >
      {view === 'match' ? (
        <JpkTable<LedgerEntry>
          columns={matchColumns}
          rows={entries}
          getRowId={getEntryId}
          storageKey="finance.daily.match"
          onFilteredChange={setFilteredEntries}
        />
      ) : (
        <JpkTable<DailyRow>
          columns={summaryColumns}
          rows={daily}
          getRowId={getDailyId}
          storageKey="finance.daily.summary"
          onFilteredChange={setFilteredDaily}
        />
      )}

      <ReceiptMatchDialog
        open={!!matchTarget}
        onOpenChange={(o) => !o && setMatchTarget(null)}
        ledger={matchTarget}
        contracts={contracts}
        onApply={handleMatch}
        onReverse={handleReverse}
      />
    </PageShell>
  );
}

function formatSubjects(subjects: Record<string, number>): string {
  return Object.entries(subjects).map(([s, v]) => `${s} ₩${v.toLocaleString('ko-KR')}`).join(' / ');
}
