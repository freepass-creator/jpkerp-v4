'use client';

import { useMemo, useState, useCallback, useRef } from 'react';
import { Notebook } from '@phosphor-icons/react';
import { PageShell } from '@/components/layout/page-shell';
import { PENDING_SUBTABS, usePendingSubtabPending } from '@/lib/pending-subtabs';
import { useJournalStore } from '@/lib/use-journal-store';
import { KIND_LABEL, type JournalEntry } from '@/lib/sample-journal';
import { JpkTable, type JpkColumn, type JpkTableApi } from '@/components/shared/jpk-table';
import { EmptyState } from '@/components/ui/empty-state';
import { useTopbarSearch } from '@/lib/use-topbar-search';

/** 업무일지 — 업무작성 entries 누적 (최신순). 컬럼 헤더 필터. */
export default function PendingJournalPage() {
  const [entries] = useJournalStore();
  const subTabPending = usePendingSubtabPending();
  const { search } = useTopbarSearch();
  const [filtered, setFiltered] = useState<readonly JournalEntry[]>([]);
  const tableRef = useRef<JpkTableApi<JournalEntry> | null>(null);

  const columns = useMemo<JpkColumn<JournalEntry>[]>(() => [
    { headerName: '회사', field: 'companyCode', width: 80, filterable: true },
    {
      headerName: '차량번호', width: 110, filterable: true,
      valueGetter: ({ data }) => data.data?.plate ?? '',
      cellRenderer: ({ value }) => <span className="plate text-medium">{(value as string) || '-'}</span>,
    },
    {
      headerName: '분류', width: 110, filterable: true,
      valueGetter: ({ data }) => KIND_LABEL[data.kind] ?? data.kind,
      cellRenderer: ({ value }) => <span className="badge">{value as string}</span>,
    },
    {
      headerName: '처리현황', width: 90, filterable: true,
      valueGetter: ({ data }) => data.data?.status ?? '진행중',
    },
    { headerName: '일시', field: 'at', width: 130, filterType: 'date', sort: 'desc' },
    { headerName: '담당', field: 'staff', width: 90, filterable: true },
    {
      headerName: '요약', minWidth: 220, flex: 1,
      valueGetter: ({ data }) => summarize(data.data),
      cellRenderer: ({ value }) => <span className="dim">{(value as string) || '-'}</span>,
    },
  ], []);

  const getRowId = useCallback((r: JournalEntry) => r.id, []);

  return (
    <PageShell
      subTabs={PENDING_SUBTABS}
      subTabPending={subTabPending}
      footerLeft={<span className="stat-item">기록 <strong>{filtered.length}</strong>{filtered.length !== entries.length && <span className="text-weak"> / {entries.length}</span>}</span>}
    >
      {entries.length === 0 ? (
        <EmptyState
          icon={Notebook}
          title="업무일지 없음"
          description="아직 입력된 업무 기록이 없습니다."
          hint={<>좌측 [업무작성] 메뉴 → 카테고리 (입출고/차량수선/고객응대/사고접수/시동제어/보험배서/상품등록/과태료/자산처분/기타) 선택 → 입력 → 자동 누적</>}
        />
      ) : (
        <JpkTable<JournalEntry>
          ref={tableRef}
          columns={columns}
          rows={entries}
          getRowId={getRowId}
          storageKey="pending.journal-all"
          onFilteredChange={setFiltered}
          globalSearch={search}
        />
      )}
    </PageShell>
  );
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
