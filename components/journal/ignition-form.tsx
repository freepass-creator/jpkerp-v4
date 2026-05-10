'use client';

import { forwardRef, useImperativeHandle, useMemo, useState } from 'react';
import { X } from '@phosphor-icons/react';
import type { Contract } from '@/lib/sample-contracts';
import type { Asset } from '@/lib/sample-assets';
import type { JournalEntry } from '@/lib/sample-journal';
import { cn } from '@/lib/cn';
import { daysBetween as daysFromTo } from '@/lib/date-utils';

export interface IgnitionFormHandle {
  /** 페이지 footer +추가 버튼에서 호출 — 인라인 추가 폼 펼침 */
  startAdd: () => void;
}

const OVERDUE_AUTO_DAYS = 3;
/** 신규 등록 가능 사유 — 미납은 자동 후보라서 수동 등록에선 제외 */
const MANUAL_REASONS = ['검사미이행', '계약위반', '연락두절', '기타'];

interface Props {
  contracts: readonly Contract[];
  assets: readonly Asset[];
  entries: readonly JournalEntry[];
  onAction: (params: { plate: string; action: '시동잠금' | '시동해제'; reason: string }) => void;
}

interface Row {
  plate: string;
  contract: Contract | null;
  asset: Asset | null;
  isLocked: boolean;       // 잠금 중 (entry.action === '시동잠금')
  reason: string;          // 잠금 중이면 entry.reason / 미납 후보면 '미납 (Nd)'
  at: string;              // 잠금 중이면 lockedAt / 미납 후보면 ''
  source: 'locked' | 'overdue' | 'manual';
}

/**
 * 시동제어 — 잠금 중 차량 + 미납 3일+ 자동 후보를 한 목록에.
 *  - 미납은 자동으로 계속 노출 (잠그기 전이라도 후보로)
 *  - 검사미이행·계약위반·연락두절·기타는 +추가 버튼으로 직접 잠금
 *  - 잠금 중 → [해제] / 후보 → [제어]
 */
export const IgnitionForm = forwardRef<IgnitionFormHandle, Props>(function IgnitionForm({ contracts, assets, entries, onAction }, ref) {
  const [showAdd, setShowAdd] = useState(false);
  const [addPlate, setAddPlate] = useState('');
  const [addReason, setAddReason] = useState('검사미이행');
  /** 세션 동안 list 에 유지할 plate (해제했어도 즉시 재제어 가능하도록).
   *  ✕ 버튼으로 dismiss 시 제거. 페이지 reload 면 초기화. */
  const [stickyPlates, setStickyPlates] = useState<Set<string>>(new Set());
  /** ✕ 로 dismiss 한 plate — 해당 차량을 list 에서 명시적으로 숨김 */
  const [dismissedPlates, setDismissedPlates] = useState<Set<string>>(new Set());

  useImperativeHandle(ref, () => ({
    startAdd: () => setShowAdd(true),
  }));

  const today = new Date().toISOString().slice(0, 10);

  const rows = useMemo<Row[]>(() => {
    // 차량별 가장 최근 ignition entry
    const latestByPlate = new Map<string, { date: string; action: string; reason: string }>();
    for (const e of entries) {
      if (e.kind !== 'ignition') continue;
      const p = e.data?.plate;
      if (!p) continue;
      const cur = latestByPlate.get(p);
      if (!cur || e.at > cur.date) {
        latestByPlate.set(p, { date: e.at, action: e.data?.action ?? '', reason: e.data?.reason ?? '' });
      }
    }

    const assetMap = new Map<string, Asset>();
    for (const a of assets) if (a.plate) assetMap.set(a.plate, a);
    const activeContractMap = new Map<string, Contract>();
    for (const c of contracts) {
      if (c.deletedAt) continue;
      if (c.status !== '운행중' || !c.plate) continue;
      activeContractMap.set(c.plate, c);
    }

    const list: Row[] = [];
    const seen = new Set<string>();

    // 1) 잠금 중인 차량 (계약 없어도 표시)
    for (const [plate, ev] of latestByPlate) {
      if (ev.action !== '시동잠금') continue;
      if (dismissedPlates.has(plate)) continue;
      list.push({
        plate,
        asset: assetMap.get(plate) ?? null,
        contract: activeContractMap.get(plate) ?? null,
        isLocked: true,
        reason: ev.reason || '미납',
        at: ev.date,
        source: 'locked',
      });
      seen.add(plate);
    }

    // 2) 미납 3일+ 자동 후보 — 운행중 계약 + events.수납 미납
    for (const c of contracts) {
      if (c.deletedAt) continue;
      if (c.status !== '운행중' || !c.plate) continue;
      if (seen.has(c.plate)) continue;
      if (dismissedPlates.has(c.plate)) continue;
      let maxOverdue = 0;
      for (const ev of c.events ?? []) {
        if (ev.type !== '수납') continue;
        if (ev.status === '완료' || ev.status === '취소') continue;
        if (!ev.dueDate || ev.dueDate >= today) continue;
        const d = daysFromTo(ev.dueDate, today);
        if (d > maxOverdue) maxOverdue = d;
      }
      if (maxOverdue >= OVERDUE_AUTO_DAYS) {
        list.push({
          plate: c.plate,
          asset: assetMap.get(c.plate) ?? null,
          contract: c,
          isLocked: false,
          reason: `미납 (${maxOverdue}일)`,
          at: '',
          source: 'overdue',
        });
        seen.add(c.plate);
      }
    }

    // 3) sticky — 잠금 안 됐고 미납도 아니지만 세션 중 토글한 차량 (해제 직후 재제어 가능하도록)
    for (const plate of stickyPlates) {
      if (seen.has(plate)) continue;
      if (dismissedPlates.has(plate)) continue;
      const ev = latestByPlate.get(plate);
      list.push({
        plate,
        asset: assetMap.get(plate) ?? null,
        contract: activeContractMap.get(plate) ?? null,
        isLocked: ev?.action === '시동잠금',
        reason: ev?.reason || '—',
        at: ev?.date ?? '',
        source: 'manual',
      });
      seen.add(plate);
    }

    return list.sort((a, b) => {
      if (a.isLocked !== b.isLocked) return a.isLocked ? -1 : 1;
      return b.at.localeCompare(a.at);
    });
  }, [contracts, assets, entries, today, stickyPlates, dismissedPlates]);

  const lockedCount = rows.filter((r) => r.isLocked).length;

  function commitAdd() {
    const plate = addPlate.trim();
    if (!plate) return;
    onAction({ plate, action: '시동잠금', reason: addReason });
    setStickyPlates((s) => new Set(s).add(plate));
    setAddPlate('');
    setShowAdd(false);
  }

  function toggleRow(r: Row) {
    if (r.isLocked) {
      onAction({ plate: r.plate, action: '시동해제', reason: '납부완료' });
    } else {
      const reason = r.source === 'overdue' ? '미납' : (r.reason !== '—' ? r.reason : '검사미이행');
      onAction({ plate: r.plate, action: '시동잠금', reason });
    }
    // 토글 후에도 row 유지 — 즉시 재토글 가능
    setStickyPlates((s) => new Set(s).add(r.plate));
  }

  function dismissRow(plate: string) {
    setDismissedPlates((s) => new Set(s).add(plate));
    setStickyPlates((s) => {
      const n = new Set(s); n.delete(plate); return n;
    });
  }

  return (
    <div className="block" style={{ gridColumn: 'span 4' }}>
      {/* 인라인 추가 폼 — footer +추가 버튼 (검사미이행/계약위반/연락두절/기타) */}
      {showAdd && (
        <div className="filterbar" style={{ gap: 4 }}>
          <span style={{ fontSize: 12, color: 'var(--text-sub)' }}>미납 외 사유 잠금</span>
          <input
            className="input mono"
            type="text"
            value={addPlate}
            onChange={(e) => setAddPlate(e.target.value)}
            placeholder="차량번호"
            style={{ width: 140 }}
            autoFocus
          />
          <select
            className="input"
            value={addReason}
            onChange={(e) => setAddReason(e.target.value)}
          >
            {MANUAL_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <button type="button" className="btn btn-primary" onClick={commitAdd} disabled={!addPlate.trim()}>제어</button>
          <button type="button" className="btn" onClick={() => { setShowAdd(false); setAddPlate(''); }}>취소</button>
        </div>
      )}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th className="center" style={{ width: 32 }}>#</th>
              <th>차량번호</th>
              <th>모델 · 고객</th>
              <th>사유</th>
              <th className="center">잠근 시각</th>
              <th className="center" style={{ width: 70 }}>제어</th>
              <th className="center" style={{ width: 36 }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="center dim" style={{ padding: '24px 0' }}>
                  시동제어 대상 차량 없음 — 미납 3일+ 자동 후보 / +추가로 검사·계약위반 등 잠금
                </td>
              </tr>
            ) : (
              rows.map((r, idx) => (
                <tr key={r.plate}>
                  <td className="center dim mono">{idx + 1}</td>
                  <td className="plate"><strong>{r.plate}</strong></td>
                  <td>
                    <span>{[r.asset?.maker, r.asset?.modelName].filter(Boolean).join(' ') || '—'}</span>
                    {r.contract?.customerName && (
                      <span style={{ color: 'var(--text-weak)', marginLeft: 6 }}>· {r.contract.customerName}</span>
                    )}
                  </td>
                  <td className={cn(r.source === 'overdue' && !r.isLocked && 'alert')}>{r.reason}</td>
                  <td className="center mono dim">{r.at || '—'}</td>
                  <td className="center">
                    <button
                      type="button"
                      className={cn('toggle-switch', r.isLocked && 'on')}
                      onClick={() => toggleRow(r)}
                      aria-pressed={r.isLocked}
                      title={r.isLocked ? '시동해제' : '시동제어'}
                    >
                      <span className="track" />
                      <span className="dot" />
                    </button>
                  </td>
                  <td className="center">
                    <button
                      type="button"
                      className="btn"
                      onClick={() => dismissRow(r.plate)}
                      title="목록에서 제거 (해당 차량 시동제어 대상에서 벗어남)"
                      style={{ width: 24, padding: 0 }}
                    >
                      <X size={11} weight="bold" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
});
