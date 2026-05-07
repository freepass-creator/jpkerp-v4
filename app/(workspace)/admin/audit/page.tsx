'use client';

import { useMemo, useState } from 'react';
import { ClockCounterClockwise } from '@phosphor-icons/react';
import { PageShell } from '@/components/layout/page-shell';
import { EmptyState } from '@/components/ui/empty-state';
import { ADMIN_SUBTABS } from '@/lib/admin-subtabs';
import { useAuditLogStore } from '@/lib/use-audit-log-store';
import { useTopbarSearch } from '@/lib/use-topbar-search';
import type { AuditAction, AuditEntityType, AuditLogEntry } from '@/lib/audit-log';
import { cn } from '@/lib/cn';

const ACTION_FILTERS: Array<{ key: 'all' | AuditAction; label: string }> = [
  { key: 'all',         label: '전체' },
  { key: 'create',      label: '등록' },
  { key: 'update',      label: '수정' },
  { key: 'delete',      label: '삭제' },
  { key: 'bulk_delete', label: '일괄삭제' },
  { key: 'restore',     label: '복원' },
  { key: 'login',       label: '로그인' },
  { key: 'logout',      label: '로그아웃' },
];

const ENTITY_LABEL: Record<AuditEntityType, string> = {
  asset:     '자산',
  contract:  '계약',
  customer:  '고객',
  company:   '회사',
  insurance: '보험',
  journal:   '업무일지',
  auth:      '인증',
  system:    '시스템',
};

const ACTION_LABEL: Record<AuditAction, string> = {
  create:      '등록',
  update:      '수정',
  delete:      '삭제',
  bulk_delete: '일괄삭제',
  restore:     '복원',
  login:       '로그인',
  logout:      '로그아웃',
};

export default function AdminAuditPage() {
  const { entries, loading } = useAuditLogStore(500);
  const { search } = useTopbarSearch();
  const [filter, setFilter] = useState<'all' | AuditAction>('all');
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (filter !== 'all' && e.action !== filter) return false;
      if (!q) return true;
      const hay = [
        e.entityId,
        e.label ?? '',
        e.actor.email ?? '',
        e.actor.name ?? '',
        ENTITY_LABEL[e.entityType] ?? e.entityType,
      ].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [entries, filter, search]);

  const counts = useMemo(() => {
    const c: Record<AuditAction | 'total', number> = { total: entries.length, create: 0, update: 0, delete: 0, bulk_delete: 0, restore: 0, login: 0, logout: 0 };
    entries.forEach((e) => { c[e.action] = (c[e.action] ?? 0) + 1; });
    return c;
  }, [entries]);

  return (
    <PageShell
      subTabs={ADMIN_SUBTABS}
      footerLeft={
        <>
          <div className="chip-group" role="tablist" aria-label="action 필터">
            {ACTION_FILTERS.map((f) => (
              <button
                key={f.key}
                role="tab"
                aria-selected={filter === f.key}
                className={cn('chip', filter === f.key && 'active')}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
                {f.key !== 'all' && <span className="dim ml-1">{counts[f.key as AuditAction] ?? 0}</span>}
              </button>
            ))}
          </div>
          <span className="stat-divider" />
          <span className="stat-item">최근 <strong>{filtered.length}</strong> / {counts.total}</span>
        </>
      }
    >
      {loading ? (
        <div className="page-section-center">
          <span className="text-sub">로그 불러오는 중...</span>
        </div>
      ) : entries.length === 0 ? (
        <EmptyState
          icon={ClockCounterClockwise}
          title="감사 로그 없음"
          description="자산/계약/회사/보험/업무일지 entity 변경이 시계열로 누적됩니다."
          hint={<>① 어디서든 등록·수정·삭제 발생 → audit_logs/ 에 push<br />② 이 페이지에서 최근 500건 조회<br />③ 행 클릭 → before/after 펼쳐 확인</>}
        />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th className="date" style={{ width: 150 }}>시각</th>
                <th style={{ width: 180 }}>행위자</th>
                <th className="center" style={{ width: 70 }}>action</th>
                <th style={{ width: 80 }}>엔티티</th>
                <th style={{ width: 220 }}>식별자 / 라벨</th>
                <th>before → after</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e, i) => {
                const id = `${e.at}-${e.entityId}-${i}`;
                const isOpen = openId === id;
                const actorText = e.actor.name || e.actor.email || e.actor.uid;
                return (
                  <Row
                    key={id}
                    entry={e}
                    actorText={actorText}
                    isOpen={isOpen}
                    onToggle={() => setOpenId(isOpen ? null : id)}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </PageShell>
  );
}

function Row({
  entry,
  actorText,
  isOpen,
  onToggle,
}: {
  entry: AuditLogEntry;
  actorText: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const hasDetail = entry.before !== undefined || entry.after !== undefined;
  return (
    <>
      <tr
        onClick={hasDetail ? onToggle : undefined}
        style={{ cursor: hasDetail ? 'pointer' : 'default', background: isOpen ? 'var(--bg-selected)' : undefined }}
      >
        <td className="mono dim">{formatAt(entry.at)}</td>
        <td>
          <div>{actorText}</div>
          {entry.actor.email && entry.actor.name && (
            <div className="text-weak text-xs mono">{entry.actor.email}</div>
          )}
        </td>
        <td className="center">
          <ActionBadge action={entry.action} />
        </td>
        <td>{ENTITY_LABEL[entry.entityType] ?? entry.entityType}</td>
        <td>
          <div className="mono text-xs dim">{entry.entityId}</div>
          {entry.label && <div className="text-medium">{entry.label}</div>}
        </td>
        <td className="text-weak text-xs">
          {hasDetail ? (isOpen ? '접기 ↑' : '펼치기 ↓') : '-'}
        </td>
      </tr>
      {isOpen && hasDetail && (
        <tr>
          <td colSpan={6} style={{ background: 'var(--bg-stripe)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: 8 }}>
              <DetailBlock title="before" value={entry.before} />
              <DetailBlock title="after"  value={entry.after} />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function ActionBadge({ action }: { action: AuditAction }) {
  const tone =
    action === 'create' ? 'badge-green' :
    action === 'update' ? 'badge-blue' :
    action === 'delete' ? 'badge-red' :
    'badge-orange'; // restore
  return <span className={cn('badge', tone)}>{ACTION_LABEL[action]}</span>;
}

function DetailBlock({ title, value }: { title: string; value: unknown }) {
  if (value === undefined) {
    return (
      <div>
        <div className="text-xs text-weak mb-1">{title}</div>
        <div className="text-weak text-xs">(없음)</div>
      </div>
    );
  }
  return (
    <div>
      <div className="text-xs text-weak mb-1">{title}</div>
      <pre
        className="mono text-xs"
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          padding: 8,
          borderRadius: 4,
          maxHeight: 320,
          overflow: 'auto',
          margin: 0,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

/** ISO timestamp → "YYYY-MM-DD HH:MM:SS" (Asia/Seoul). */
function formatAt(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${yy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}
