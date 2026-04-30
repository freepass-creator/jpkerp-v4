'use client';

import { useState } from 'react';
import { Hourglass, CurrencyKrw, Pause } from '@phosphor-icons/react';
import { PageShell } from '@/components/layout/page-shell';

/**
 * 업무현황 — 운영 메뉴 진입점.
 *  · 미결업무: 처리되지 않은 업무 (등록/재인도/검사 만기 임박 등)
 *  · 미납현황: 계약 단위 미납 임차료
 *  · 휴차현황: 운행 중지 / 회수 차량
 *
 * 현재는 placeholder. 데이터 store 연결되면 각 섹션이 실데이터를 표시.
 */
const SECTIONS = [
  { key: 'pending', label: '미결업무', icon: Hourglass, hint: '처리되지 않은 업무를 한 곳에 모아서 봅니다.' },
  { key: 'overdue', label: '미납현황', icon: CurrencyKrw, hint: '계약별 미납 임차료 및 연체 일수.' },
  { key: 'idle',    label: '휴차현황', icon: Pause,      hint: '운행 중지 / 회수 / 정비 대기 차량.' },
] as const;

type SectionKey = typeof SECTIONS[number]['key'];

export default function PendingPage() {
  const [section, setSection] = useState<SectionKey>('pending');
  const current = SECTIONS.find((s) => s.key === section)!;
  const Icon = current.icon;

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
      <div style={{ padding: '40px 24px', textAlign: 'center' }}>
        <Icon size={32} className="mx-auto text-weak" />
        <div className="mt-2 text-medium">{current.label}</div>
        <div className="mt-1 text-weak">{current.hint}</div>
        <div className="mt-3 text-weak text-xs">데이터 store 연결 전 placeholder</div>
      </div>
    </PageShell>
  );
}
