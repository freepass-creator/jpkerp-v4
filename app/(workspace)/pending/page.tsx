'use client';

import { useMemo, useState } from 'react';
import { Hourglass } from '@phosphor-icons/react';
import { PageShell } from '@/components/layout/page-shell';
import { ListFilterbar, applyListFilter } from '@/components/ui/list-filterbar';
import { PENDING_SUBTABS, usePendingSubtabPending } from '@/lib/pending-subtabs';
import { useJournalStore } from '@/lib/use-journal-store';
import { JOURNAL_KINDS, KIND_LABEL, type JournalKind } from '@/lib/sample-journal';
import { cn } from '@/lib/cn';

/**
 * 미결업무 — 업무작성에서 입력한 entries 중 처리완료가 아닌 것.
 *
 *  · data.status: '진행중' | '보류' | '처리불가' | '처리완료'
 *  · 처리완료 외 = 미결 (이 페이지)
 *  · 처리완료 = 업무일지 에서만 보임
 *
 * 컬럼: 회사 → 차량번호 → 업무구분(분류) → 처리현황 → 일시 → 담당 → 메모 요약
 */

export default function PendingPage() {
  const [entries] = useJournalStore();
  const subTabPending = usePendingSubtabPending();
  const [company, setCompany] = useState('');
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<'' | JournalKind>('');
  const [status, setStatus] = useState('');

  const allPending = useMemo(
    () => entries.filter((e) => {
      const s = e.data?.status ?? '진행중';
      return s !== '처리완료';
    }),
    [entries],
  );

  const filtered = useMemo(() => {
    const base = applyListFilter(
      allPending,
      { company, search },
      (r) => r.companyCode,
      (r) => `${r.data?.plate ?? ''} ${r.staff ?? ''} ${KIND_LABEL[r.kind] ?? ''} ${Object.values(r.data ?? {}).join(' ')}`,
    );
    let result = base;
    if (kind) result = result.filter((r) => r.kind === kind);
    if (status) result = result.filter((r) => (r.data?.status ?? '진행중') === status);
    return [...result].sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  }, [allPending, company, search, kind, status]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of allPending) {
      const label = KIND_LABEL[e.kind] ?? e.kind;
      c[label] = (c[label] ?? 0) + 1;
    }
    return c;
  }, [allPending]);

  return (
    <PageShell
      subTabs={PENDING_SUBTABS}
      subTabPending={subTabPending}
      filterbar={
        <ListFilterbar
          company={company} onCompanyChange={setCompany}
          search={search}   onSearchChange={setSearch}
          searchPlaceholder="차량 / 담당 / 분류 / 메모 검색"
          extra={
            <>
              <select className="input" value={kind} onChange={(e) => setKind(e.target.value as JournalKind | '')} style={{ width: 120 }}>
                <option value="">전체 분류</option>
                {JOURNAL_KINDS.map((k) => (
                  <option key={k} value={k}>{KIND_LABEL[k]}</option>
                ))}
              </select>
              <select className="input" value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 100 }}>
                <option value="">전체 현황</option>
                <option value="진행중">진행중</option>
                <option value="보류">보류</option>
                <option value="처리불가">처리불가</option>
              </select>
            </>
          }
        />
      }
      footerLeft={
        <>
          <span className="stat-item">미결 <strong>{filtered.length}</strong>{filtered.length !== allPending.length && <span className="text-weak"> / {allPending.length}</span>}</span>
          {Object.entries(counts).map(([label, n]) => (
            <span key={label} className="stat-item">{label} <strong>{n}</strong></span>
          ))}
        </>
      }
    >
      {filtered.length === 0 ? (
        <div className="page-section-center">
          <Hourglass size={32} className="mx-auto text-weak" />
          <div className="mt-2 text-medium">미결업무 없음</div>
          <div className="mt-1 text-weak">업무작성에서 입력한 작업 중 처리완료 안 된 항목이 여기에 모입니다.</div>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>회사</th>
                <th>차량번호</th>
                <th>업무구분</th>
                <th>처리현황</th>
                <th className="date">일시</th>
                <th>담당</th>
                <th>요약</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => {
                const st = e.data?.status ?? '진행중';
                return (
                  <tr key={e.id}>
                    <td className="plate">{e.companyCode || '-'}</td>
                    <td className="plate text-medium">{e.data?.plate || '-'}</td>
                    <td><span className="badge">{KIND_LABEL[e.kind] ?? e.kind}</span></td>
                    <td><StatusBadge status={st} /></td>
                    <td className="date mono">{e.at}</td>
                    <td>{e.staff || '-'}</td>
                    <td className="dim truncate" style={{ maxWidth: 380 }} title={summarize(e.data)}>{summarize(e.data)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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

