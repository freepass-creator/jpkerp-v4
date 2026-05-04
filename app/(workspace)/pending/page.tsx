'use client';

import { useMemo, useState, useCallback, useRef } from 'react';
import { Hourglass } from '@phosphor-icons/react';
import { PageShell } from '@/components/layout/page-shell';
import { PENDING_SUBTABS, usePendingSubtabPending } from '@/lib/pending-subtabs';
import { useJournalStore } from '@/lib/use-journal-store';
import { KIND_LABEL, type JournalEntry } from '@/lib/sample-journal';
import { JpkTable, type JpkColumn, type JpkTableApi } from '@/components/shared/jpk-table';
import { cn } from '@/lib/cn';

/**
 * 미결업무 — 업무작성 entries 중 처리완료가 아닌 것.
 *  · data.status: 진행중 / 보류 / 처리불가 / 처리완료
 *  · 처리완료 외 = 미결
 *
 * 컬럼 헤더 클릭 → 엑셀식 필터 (set / date). 정렬·검색·체크박스 선택 모두 헤더에서.
 */
export default function PendingPage() {
  const [entries] = useJournalStore();
  const subTabPending = usePendingSubtabPending();
  const [filteredRows, setFilteredRows] = useState<readonly JournalEntry[]>([]);
  const tableRef = useRef<JpkTableApi<JournalEntry> | null>(null);

  const items = useMemo(
    () => entries.filter((e) => (e.data?.status ?? '진행중') !== '처리완료'),
    [entries],
  );

  const columns = useMemo<JpkColumn<JournalEntry>[]>(() => [
    { headerName: '회사', field: 'companyCode', width: 80, filterable: true },
    {
      headerName: '차량번호', width: 110, filterable: true,
      valueGetter: ({ data }) => data.data?.plate ?? '',
      cellRenderer: ({ value }) => <span className="plate text-medium">{(value as string) || '-'}</span>,
    },
    {
      headerName: '업무구분', width: 110, filterable: true,
      valueGetter: ({ data }) => KIND_LABEL[data.kind] ?? data.kind,
      cellRenderer: ({ value }) => <span className="badge">{value as string}</span>,
    },
    {
      headerName: '처리현황', width: 90, filterable: true,
      valueGetter: ({ data }) => data.data?.status ?? '진행중',
      cellRenderer: ({ value }) => <StatusBadge status={value as string} />,
    },
    {
      headerName: '일시', field: 'at', width: 130, filterType: 'date', sort: 'desc',
    },
    { headerName: '담당', field: 'staff', width: 90, filterable: true },
    {
      headerName: '요약', minWidth: 200, flex: 1,
      valueGetter: ({ data }) => summarize(data.data),
      cellRenderer: ({ value }) => <span className="dim">{(value as string) || '-'}</span>,
    },
  ], []);

  const getRowId = useCallback((r: JournalEntry) => r.id, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of items) {
      const label = KIND_LABEL[e.kind] ?? e.kind;
      c[label] = (c[label] ?? 0) + 1;
    }
    return c;
  }, [items]);

  return (
    <PageShell
      subTabs={PENDING_SUBTABS}
      subTabPending={subTabPending}
      footerLeft={
        <>
          <span className="stat-item">전체 <strong>{items.length}</strong></span>
          {filteredRows.length !== items.length && (
            <span className="stat-item">표시 <strong>{filteredRows.length}</strong></span>
          )}
          <span className="stat-divider" />
          {Object.entries(counts).map(([label, n]) => (
            <span key={label} className="stat-item">{label} <strong>{n}</strong></span>
          ))}
        </>
      }
    >
      {items.length === 0 ? (
        <div className="page-section-center">
          <Hourglass size={32} className="mx-auto text-weak" />
          <div className="mt-2 text-medium">미결업무 없음</div>
          <div className="mt-1 text-weak">업무작성에서 입력한 작업 중 처리완료 안 된 항목이 여기에 모입니다.</div>
        </div>
      ) : (
        <JpkTable<JournalEntry>
          ref={tableRef}
          columns={columns}
          rows={items}
          getRowId={getRowId}
          storageKey="pending.journal"
          onFilteredChange={setFilteredRows}
        />
      )}
    </PageShell>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === '처리불가' ? 'badge-red' :
    status === '보류' ? 'badge-orange' :
    status === '진행중' ? 'badge-blue' :
    '';
  return <span className={cn('badge', tone)}>{status}</span>;
}

function summarize(data: Record<string, string> | undefined): string {
  if (!data) return '';
  const candidates = ['memo', 'detail', 'note', 'description', 'subkind', 'contactType', 'reason', 'action'];
  for (const k of candidates) if (data[k]) return String(data[k]);
  for (const [k, v] of Object.entries(data)) {
    if (k === 'plate' || k === 'status') continue;
    if (v) return `${k}: ${v}`;
  }
  return '';
}
