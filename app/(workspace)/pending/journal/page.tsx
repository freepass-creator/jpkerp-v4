'use client';

import { useMemo, useState } from 'react';
import { Notebook } from '@phosphor-icons/react';
import { PageShell } from '@/components/layout/page-shell';
import { ListFilterbar, applyListFilter } from '@/components/ui/list-filterbar';
import { PENDING_SUBTABS, usePendingSubtabPending } from '@/lib/pending-subtabs';
import { useJournalStore } from '@/lib/use-journal-store';
import { KIND_LABEL } from '@/lib/sample-journal';

/** 업무일지 — 업무작성에서 입력한 entries 누적 (최신순). */
export default function PendingJournalPage() {
  const [entries] = useJournalStore();
  const subTabPending = usePendingSubtabPending();
  const [company, setCompany] = useState('');
  const [search, setSearch] = useState('');
  const sorted = useMemo(() => {
    const filtered = applyListFilter(
      entries,
      { company, search },
      (r) => r.companyCode,
      (r) => `${r.data?.plate ?? ''} ${r.staff ?? ''} ${KIND_LABEL[r.kind] ?? ''} ${Object.values(r.data ?? {}).join(' ')}`,
    );
    return [...filtered].sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  }, [entries, company, search]);

  return (
    <PageShell
      subTabs={PENDING_SUBTABS}
      subTabPending={subTabPending}
      filterbar={
        <ListFilterbar
          company={company} onCompanyChange={setCompany}
          search={search}   onSearchChange={setSearch}
          searchPlaceholder="차량 / 담당 / 분류 / 메모 검색"
        />
      }
      footerLeft={<span className="stat-item">기록 <strong>{sorted.length}</strong>{sorted.length !== entries.length && <span className="text-weak"> / {entries.length}</span>}</span>}
    >
      {sorted.length === 0 ? (
        <div className="page-section-center">
          <Notebook size={32} className="mx-auto text-weak" />
          <div className="mt-2 text-medium">업무일지 없음</div>
          <div className="mt-1 text-weak">업무작성 메뉴에서 입력한 기록이 여기에 누적됩니다.</div>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>회사</th>
                <th>차량</th>
                <th>분류</th>
                <th className="date">일시</th>
                <th>담당</th>
                <th>요약</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((e) => (
                <tr key={e.id}>
                  <td className="plate">{e.companyCode || '-'}</td>
                  <td className="plate">{e.data?.plate || '-'}</td>
                  <td className="dim">{KIND_LABEL[e.kind] ?? e.kind}</td>
                  <td className="date mono">{e.at}</td>
                  <td>{e.staff || '-'}</td>
                  <td className="dim truncate" style={{ maxWidth: 380 }} title={summarize(e.data)}>{summarize(e.data)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageShell>
  );
}

function summarize(data: Record<string, string> | undefined): string {
  if (!data) return '';
  const candidates = ['memo', 'detail', 'note', 'description', 'subkind', 'contactType'];
  for (const k of candidates) if (data[k]) return String(data[k]);
  for (const [k, v] of Object.entries(data)) {
    if (k === 'plate') continue;
    if (v) return `${k}: ${v}`;
  }
  return '';
}
