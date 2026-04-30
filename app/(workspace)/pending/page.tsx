'use client';

import { useState, useMemo } from 'react';
import { Hourglass, CurrencyKrw, Pause, Notebook } from '@phosphor-icons/react';
import { PageShell } from '@/components/layout/page-shell';
import { useJournalStore } from '@/lib/use-journal-store';
import { useAssetStore } from '@/lib/use-asset-store';
import { useContractStore } from '@/lib/use-contract-store';
import { KIND_LABEL } from '@/lib/sample-journal';
import {
  collectPending, collectOverdue, collectIdle,
  type PendingItem, type OverdueRow, type IdleRow,
} from '@/lib/pending-aggregators';
import { cn } from '@/lib/cn';

/**
 * 업무현황 — 운영 메뉴 진입점.
 *  · 미결업무 — 검사만기·미수납·출고미완 (자산+계약 events 집계)
 *  · 미납현황 — 계약 단위 미납 회차/금액/연체일
 *  · 휴차현황 — 활성 계약 없는 자산
 *  · 업무일지 — 업무작성에서 입력한 entries 누적
 *
 * 4개 섹션 모두 footer 좌측 토글 버튼으로 전환. 각 버튼에 카운트 배지.
 */

type SectionKey = 'pending' | 'overdue' | 'idle' | 'journal';

export default function PendingPage() {
  const [section, setSection] = useState<SectionKey>('pending');
  const [assets] = useAssetStore();
  const [contracts] = useContractStore();
  const [entries] = useJournalStore();

  const pending = useMemo(() => collectPending(assets, contracts), [assets, contracts]);
  const overdue = useMemo(() => collectOverdue(contracts), [contracts]);
  const idle = useMemo(() => collectIdle(assets, contracts), [assets, contracts]);

  const counts = {
    pending: pending.length,
    overdue: overdue.length,
    idle: idle.length,
    journal: entries.length,
  };

  const SECTIONS: Array<{ key: SectionKey; label: string; icon: typeof Hourglass; count: number }> = [
    { key: 'pending', label: '미결업무', icon: Hourglass,    count: counts.pending },
    { key: 'overdue', label: '미납현황', icon: CurrencyKrw,  count: counts.overdue },
    { key: 'idle',    label: '휴차현황', icon: Pause,        count: counts.idle },
    { key: 'journal', label: '업무일지', icon: Notebook,     count: counts.journal },
  ];

  // 미납현황 합계
  const overdueTotalAmount = useMemo(
    () => overdue.reduce((sum, r) => sum + r.totalAmount, 0),
    [overdue],
  );

  // 푸터 통계 — 섹션별 다른 정보
  const footerLeft = (() => {
    switch (section) {
      case 'pending':
        return <span className="stat-item">미결 <strong>{counts.pending}</strong></span>;
      case 'overdue':
        return (
          <>
            <span className="stat-item">미납 계약 <strong>{counts.overdue}</strong></span>
            {overdueTotalAmount > 0 && <span className="stat-item alert">미납 합계 <strong>{overdueTotalAmount.toLocaleString('ko-KR')}원</strong></span>}
          </>
        );
      case 'idle':
        return <span className="stat-item">휴차 <strong>{counts.idle}</strong></span>;
      case 'journal':
        return <span className="stat-item">기록 <strong>{counts.journal}</strong></span>;
    }
  })();

  return (
    <PageShell
      filterbar={
        <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          {SECTIONS.map((s, i) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setSection(s.key)}
              className={section === s.key ? 'btn btn-primary' : 'btn'}
              style={{
                borderRadius: 0,
                border: 'none',
                borderRight: i < SECTIONS.length - 1 ? '1px solid var(--border)' : 'none',
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}
            >
              <s.icon size={12} weight="bold" />
              {s.label}
              <span className={cn('badge', section === s.key ? '' : '')} style={{ marginLeft: 2, padding: '0 5px', background: section === s.key ? 'rgba(255,255,255,0.2)' : undefined }}>
                {s.count}
              </span>
            </button>
          ))}
        </div>
      }
      footerLeft={footerLeft}
    >
      {section === 'pending' && <PendingSection items={pending} />}
      {section === 'overdue' && <OverdueSection rows={overdue} />}
      {section === 'idle'    && <IdleSection rows={idle} />}
      {section === 'journal' && <JournalSection />}
    </PageShell>
  );
}

/* ─── 미결업무 ─── */
function PendingSection({ items }: { items: readonly PendingItem[] }) {
  if (items.length === 0) {
    return <Empty icon={Hourglass} label="미결업무 없음" hint="검사 만기 · 미수납 · 출고 미완료가 모두 해결된 상태입니다." />;
  }
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>구분</th>
            <th>회사</th>
            <th>차량</th>
            <th>대상</th>
            <th className="date">기한</th>
            <th className="num">D-day</th>
            <th className="num">금액</th>
          </tr>
        </thead>
        <tbody>
          {items.map((p) => (
            <tr key={p.id}>
              <td><KindBadge kind={p.kind} /></td>
              <td className="plate">{p.companyCode}</td>
              <td className="plate">{p.plate}</td>
              <td className="dim truncate" style={{ maxWidth: 280 }} title={p.target}>{p.target}</td>
              <td className="date">{p.dueDate}</td>
              <td className={cn('num', p.daysLeft < 0 && 'text-red', p.daysLeft >= 0 && p.daysLeft <= 7 && 'text-amber')}>
                {p.daysLeft < 0 ? `${-p.daysLeft}일 경과` : p.daysLeft === 0 ? '오늘' : `D-${p.daysLeft}`}
              </td>
              <td className="num">{p.amount ? p.amount.toLocaleString('ko-KR') : '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function KindBadge({ kind }: { kind: PendingItem['kind'] }) {
  const tone =
    kind === '미수납' ? 'badge-red' :
    kind === '출고미완' ? 'badge-orange' :
    kind === '검사만기' ? 'badge-orange' :
    kind === '보험만기' ? 'badge-orange' : '';
  return <span className={`badge ${tone}`}>{kind}</span>;
}

/* ─── 미납현황 ─── */
function OverdueSection({ rows }: { rows: readonly OverdueRow[] }) {
  if (rows.length === 0) {
    return <Empty icon={CurrencyKrw} label="미납 없음" hint="모든 계약의 만기 도래 회차가 납부 완료 상태입니다." />;
  }
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>회사</th>
            <th>계약번호</th>
            <th>차량</th>
            <th>임차인</th>
            <th>연락처</th>
            <th className="num">미납 회차</th>
            <th className="num">미납 금액</th>
            <th className="num">최장 연체</th>
            <th className="date">최오래된 만기일</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.contractId}>
              <td className="plate">{r.companyCode}</td>
              <td className="mono text-medium">{r.contractNo}</td>
              <td className="plate">{r.plate}</td>
              <td>{r.customerName}</td>
              <td className="mono dim">{r.customerPhone || '-'}</td>
              <td className="num text-red"><strong>{r.unpaidCycles}</strong></td>
              <td className="num text-red">{r.totalAmount.toLocaleString('ko-KR')}</td>
              <td className="num text-red">{r.longestOverdueDays}일</td>
              <td className="date dim">{r.oldestDueDate}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── 휴차현황 ─── */
function IdleSection({ rows }: { rows: readonly IdleRow[] }) {
  if (rows.length === 0) {
    return <Empty icon={Pause} label="휴차 없음" hint="모든 자산이 매각 또는 운행중 계약과 매칭됩니다." />;
  }
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>구분</th>
            <th>회사</th>
            <th>차량번호</th>
            <th>차명</th>
            <th>현재 상태</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.assetId}>
              <td>
                <span className={cn('badge', r.reason === '운행중미매칭' ? 'badge-red' : 'badge-orange')}>
                  {r.reason === '운행중미매칭' ? '⚠ 정합성' : r.reason}
                </span>
              </td>
              <td className="plate">{r.companyCode}</td>
              <td className="plate">{r.plate}</td>
              <td>{r.vehicleName || '-'}</td>
              <td className="dim">{r.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── 업무일지 ─── */
function JournalSection() {
  const [entries] = useJournalStore();
  if (entries.length === 0) {
    return <Empty icon={Notebook} label="업무일지 없음" hint="업무작성 메뉴에서 입력한 기록이 여기에 누적됩니다." />;
  }
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

/** entry.data → 한 줄 요약. */
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

/* ─── 공용 빈 상태 ─── */
function Empty({ icon: Icon, label, hint }: { icon: typeof Hourglass; label: string; hint: string }) {
  return (
    <div className="page-section-center">
      <Icon size={32} className="mx-auto text-weak" />
      <div className="mt-2 text-medium">{label}</div>
      <div className="mt-1 text-weak">{hint}</div>
    </div>
  );
}
