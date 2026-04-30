'use client';

import { useState } from 'react';
import { Hourglass, CurrencyKrw, Pause, Notebook } from '@phosphor-icons/react';
import { PageShell } from '@/components/layout/page-shell';
import { useJournalStore } from '@/lib/use-journal-store';
import { KIND_LABEL } from '@/lib/sample-journal';

/**
 * 업무현황 — 운영 메뉴 진입점.
 *  · 미결업무: 처리되지 않은 업무 (등록/재인도/검사 만기 임박 등)
 *  · 미납현황: 계약 단위 미납 임차료
 *  · 휴차현황: 운행 중지 / 회수 차량
 *  · 업무일지: 업무작성에서 입력한 entries 누적 표시
 */
const SECTIONS = [
  { key: 'pending', label: '미결업무', icon: Hourglass, hint: '처리되지 않은 업무를 한 곳에 모아서 봅니다.' },
  { key: 'overdue', label: '미납현황', icon: CurrencyKrw, hint: '계약별 미납 임차료 및 연체 일수.' },
  { key: 'idle',    label: '휴차현황', icon: Pause,      hint: '운행 중지 / 회수 / 정비 대기 차량.' },
  { key: 'journal', label: '업무일지', icon: Notebook,   hint: '업무작성에서 입력한 모든 기록 누적.' },
] as const;

type SectionKey = typeof SECTIONS[number]['key'];

export default function PendingPage() {
  const [section, setSection] = useState<SectionKey>('journal');
  const current = SECTIONS.find((s) => s.key === section)!;

  return (
    <PageShell
      footerLeft={
        <>
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              className={`btn btn-sm ${section === s.key ? 'btn-primary' : ''}`}
              onClick={() => setSection(s.key)}
            >
              <s.icon size={12} weight="bold" /> {s.label}
            </button>
          ))}
        </>
      }
    >
      {section === 'journal' ? <JournalSection /> : <PlaceholderSection label={current.label} hint={current.hint} icon={current.icon} />}
    </PageShell>
  );
}

function PlaceholderSection({ label, hint, icon: Icon }: { label: string; hint: string; icon: typeof Hourglass }) {
  return (
    <div style={{ padding: '40px 24px', textAlign: 'center' }}>
      <Icon size={32} className="mx-auto text-weak" />
      <div className="mt-2 text-medium">{label}</div>
      <div className="mt-1 text-weak">{hint}</div>
      <div className="mt-3 text-weak text-xs">데이터 store 연결 전 placeholder</div>
    </div>
  );
}

/** 업무일지 — 업무작성에서 입력한 entries 누적 (최신순). */
function JournalSection() {
  const [entries] = useJournalStore();
  if (entries.length === 0) {
    return (
      <div style={{ padding: '40px 24px', textAlign: 'center' }}>
        <Notebook size={32} className="mx-auto text-weak" />
        <div className="mt-2 text-medium">업무일지 없음</div>
        <div className="mt-1 text-weak">업무작성 메뉴에서 입력한 기록이 여기에 누적됩니다.</div>
      </div>
    );
  }
  // 최신순 정렬 (at 기준 desc)
  const sorted = [...entries].sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th className="date">일시</th>
            <th>회사</th>
            <th>분류</th>
            <th>차량</th>
            <th>담당</th>
            <th>요약</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((e) => (
            <tr key={e.id}>
              <td className="date mono">{e.at}</td>
              <td className="plate">{e.companyCode || '-'}</td>
              <td className="dim">{KIND_LABEL[e.kind] ?? e.kind}</td>
              <td className="plate">{e.data?.plate || '-'}</td>
              <td>{e.staff || '-'}</td>
              <td className="dim truncate" style={{ maxWidth: 380 }} title={summarize(e.data)}>{summarize(e.data)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** entry.data 에서 사람이 읽을 수 있는 한 줄 요약 — 메모 / 메인 필드 우선. */
function summarize(data: Record<string, string> | undefined): string {
  if (!data) return '';
  const candidates = ['memo', 'detail', 'note', 'description', 'subkind', 'contactType'];
  for (const k of candidates) {
    if (data[k]) return String(data[k]);
  }
  // 위 키 없으면 첫 비어있지 않은 필드
  for (const [k, v] of Object.entries(data)) {
    if (k === 'plate') continue;
    if (v) return `${k}: ${v}`;
  }
  return '';
}
