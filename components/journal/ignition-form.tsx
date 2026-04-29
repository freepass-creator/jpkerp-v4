'use client';

import { useMemo, useState } from 'react';
import { Plus, Lock, LockOpen } from '@phosphor-icons/react';
import type { Contract } from '@/lib/sample-contracts';
import type { Asset } from '@/lib/sample-assets';
import type { JournalEntry } from '@/lib/sample-journal';
import { cn } from '@/lib/cn';

const OVERDUE_AUTO_DAYS = 3;
const REASONS_OTHER = ['검사미이행', '계약위반', '연락두절', '기타'];
const ALL_REASONS = ['미납', ...REASONS_OTHER];

interface Props {
  contracts: readonly Contract[];
  assets: readonly Asset[];
  entries: readonly JournalEntry[];
  /** 시동 잠금/해제 — 새 journal entry 생성 (kind=ignition) */
  onAction: (params: { plate: string; action: '시동잠금' | '시동해제'; reason: string }) => void;
}

interface Row {
  contract: Contract | null;
  plate: string;
  asset: Asset | null;
  unpaidAmount: number;
  maxOverdueDays: number;
  isLocked: boolean;
  lastIgnitionDate: string;
  lastIgnitionReason: string;
  /** 자동(미납) / 수동 / 잠금 중 — 정렬·표시용 */
  source: 'overdue' | 'locked' | 'manual';
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a);
  const db = new Date(b);
  return Math.floor((da.getTime() - db.getTime()) / 86400000);
}

/**
 * 시동제어 — v3 ignition-form 의 핵심 로직 포팅.
 *  - 미납 OVERDUE_AUTO_DAYS+ 일 차량 자동 후보
 *  - 현재 잠금 중인 차량
 *  - 수동 추가 차량 (검사미이행·계약위반 등 미납 외 사유)
 *  → 행마다 [제어/해제] 토글
 */
export function IgnitionForm({ contracts, assets, entries, onAction }: Props) {
  const [reasonMap, setReasonMap] = useState<Record<string, string>>({});
  const [showAdd, setShowAdd] = useState(false);
  const [addPlate, setAddPlate] = useState('');
  const [addReason, setAddReason] = useState('검사미이행');
  const [manualPlates, setManualPlates] = useState<Set<string>>(new Set());

  const today = new Date().toISOString().slice(0, 10);

  // 차량별 가장 최근 ignition entry 의 action/reason
  const ignitionMap = useMemo(() => {
    const m = new Map<string, { date: string; action: string; reason: string }>();
    for (const e of entries) {
      if (e.kind !== 'ignition') continue;
      const p = e.data?.plate;
      if (!p) continue;
      const cur = m.get(p);
      if (!cur || e.at > cur.date) {
        m.set(p, { date: e.at, action: e.data?.action ?? '', reason: e.data?.reason ?? '' });
      }
    }
    return m;
  }, [entries]);

  const rows = useMemo<Row[]>(() => {
    const assetMap = new Map<string, Asset>();
    for (const a of assets) if (a.plate) assetMap.set(a.plate, a);

    const list: Row[] = [];
    const seen = new Set<string>();

    function pushFromContract(c: Contract, source: Row['source']) {
      if (!c.plate || seen.has(c.plate)) return;
      // 미납 — events 의 수납·지연/예정 + 과거 dueDate 누적
      let unpaidAmount = 0;
      let maxOverdueDays = 0;
      for (const ev of c.events ?? []) {
        if (ev.type !== '수납') continue;
        if (ev.status === '완료' || ev.status === '취소') continue;
        if (!ev.dueDate || ev.dueDate >= today) continue;
        unpaidAmount += ev.amount ?? 0;
        const d = daysBetween(today, ev.dueDate);
        if (d > maxOverdueDays) maxOverdueDays = d;
      }
      const ign = ignitionMap.get(c.plate);
      const isLocked = ign?.action === '시동잠금';
      list.push({
        contract: c,
        plate: c.plate,
        asset: assetMap.get(c.plate) ?? null,
        unpaidAmount,
        maxOverdueDays,
        isLocked,
        lastIgnitionDate: ign?.date ?? '',
        lastIgnitionReason: ign?.reason ?? '',
        source,
      });
      seen.add(c.plate);
    }

    // 1) 잠금 중인 모든 차량 (계약 없어도)
    for (const [plate, ev] of ignitionMap) {
      if (ev.action !== '시동잠금') continue;
      const c = contracts.find((x) => x.plate === plate) ?? null;
      if (c) {
        pushFromContract(c, 'locked');
      } else {
        list.push({
          contract: null,
          plate,
          asset: assetMap.get(plate) ?? null,
          unpaidAmount: 0,
          maxOverdueDays: 0,
          isLocked: true,
          lastIgnitionDate: ev.date,
          lastIgnitionReason: ev.reason,
          source: 'locked',
        });
        seen.add(plate);
      }
    }

    // 2) 운행중 계약 중 미납 OVERDUE_AUTO_DAYS+ 자동 후보
    for (const c of contracts) {
      if (c.status !== '운행중') continue;
      if (!c.plate) continue;
      // 이미 잠금으로 추가됨
      if (seen.has(c.plate)) continue;
      // 미납 계산
      let maxOverdueDays = 0;
      for (const ev of c.events ?? []) {
        if (ev.type !== '수납' || ev.status === '완료' || ev.status === '취소') continue;
        if (!ev.dueDate || ev.dueDate >= today) continue;
        const d = daysBetween(today, ev.dueDate);
        if (d > maxOverdueDays) maxOverdueDays = d;
      }
      if (maxOverdueDays >= OVERDUE_AUTO_DAYS) {
        pushFromContract(c, 'overdue');
      }
    }

    // 3) 수동 추가
    for (const plate of manualPlates) {
      if (seen.has(plate)) continue;
      const c = contracts.find((x) => x.plate === plate);
      if (c) {
        pushFromContract(c, 'manual');
      } else {
        list.push({
          contract: null,
          plate,
          asset: assetMap.get(plate) ?? null,
          unpaidAmount: 0,
          maxOverdueDays: 0,
          isLocked: false,
          lastIgnitionDate: '',
          lastIgnitionReason: '',
          source: 'manual',
        });
        seen.add(plate);
      }
    }

    // 정렬: 잠금 중 먼저, 다음 미납일 많은 순
    return list.sort((a, b) => {
      if (a.isLocked !== b.isLocked) return a.isLocked ? -1 : 1;
      return b.maxOverdueDays - a.maxOverdueDays;
    });
  }, [contracts, assets, ignitionMap, manualPlates, today]);

  const lockedCount = rows.filter((r) => r.isLocked).length;

  function toggle(r: Row) {
    if (r.isLocked) {
      onAction({ plate: r.plate, action: '시동해제', reason: '납부완료' });
    } else {
      const reason = reasonMap[r.plate] ?? (r.maxOverdueDays > 0 ? '미납' : '검사미이행');
      onAction({ plate: r.plate, action: '시동잠금', reason });
    }
  }

  function commitAdd() {
    const p = addPlate.trim();
    if (!p) return;
    setManualPlates((s) => new Set(s).add(p));
    setReasonMap((m) => ({ ...m, [p]: addReason }));
    setAddPlate('');
    setShowAdd(false);
  }

  return (
    <div className="block" style={{ gridColumn: 'span 4' }}>
      <div className="panel-head" style={{ border: '1px solid var(--border)', borderBottom: 'none' }}>
        <span>총 <strong style={{ color: 'var(--text)' }}>{rows.length}</strong>대 · 제어 중 <strong style={{ color: 'var(--alert-red-text)' }}>{lockedCount}</strong>대 · 미납 자동(3일+) 포함</span>
        <span className="panel-head-right" style={{ display: 'flex', gap: 4 }}>
          {showAdd ? (
            <>
              <input
                className="input mono"
                type="text"
                value={addPlate}
                onChange={(e) => setAddPlate(e.target.value)}
                placeholder="차량번호"
                style={{ width: 140 }}
              />
              <select
                className="input"
                value={addReason}
                onChange={(e) => setAddReason(e.target.value)}
              >
                {REASONS_OTHER.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <button type="button" className="btn btn-primary" onClick={commitAdd} disabled={!addPlate.trim()}>확인</button>
              <button type="button" className="btn" onClick={() => { setShowAdd(false); setAddPlate(''); }}>취소</button>
            </>
          ) : (
            <button type="button" className="btn" onClick={() => setShowAdd(true)}>
              <Plus size={12} weight="bold" /> 추가 (미납 외)
            </button>
          )}
        </span>
      </div>

      {rows.length === 0 ? (
        <div style={{
          padding: 32,
          textAlign: 'center',
          color: 'var(--text-weak)',
          fontSize: 12,
          border: '1px solid var(--border)',
          borderTop: 'none',
        }}>
          시동제어 대상 차량 없음
          <div style={{ marginTop: 4, fontSize: 11 }}>
            미납 3일 이상이면 자동 표시 / +추가로 검사미이행·계약위반 등 수동 등록
          </div>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th className="center" style={{ width: 32 }}>#</th>
                <th>차량번호</th>
                <th>모델</th>
                <th>고객</th>
                <th className="num">미납금액</th>
                <th className="num">연체</th>
                <th>제어 사유</th>
                <th className="center">제어 시각</th>
                <th className="center">상태</th>
                <th className="center" style={{ width: 60 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr key={r.plate}>
                  <td className="center dim mono">{idx + 1}</td>
                  <td className="plate"><strong>{r.plate}</strong></td>
                  <td className="dim">{[r.asset?.maker, r.asset?.modelName].filter(Boolean).join(' ') || '—'}</td>
                  <td>{r.contract?.customerName ?? <span className="dim">—</span>}</td>
                  <td className={cn('num', r.unpaidAmount > 0 && 'alert')}>
                    {r.unpaidAmount > 0 ? r.unpaidAmount.toLocaleString('ko-KR') : '—'}
                  </td>
                  <td className={cn('num', r.maxOverdueDays > 30 ? 'alert' : r.maxOverdueDays > 0 ? 'warn' : 'dim')}>
                    {r.maxOverdueDays > 0 ? `${r.maxOverdueDays}일` : '—'}
                  </td>
                  <td>
                    {r.isLocked ? (
                      <span className="dim">{r.lastIgnitionReason || '미납'}</span>
                    ) : (
                      <select
                        className="input"
                        value={reasonMap[r.plate] ?? (r.maxOverdueDays > 0 ? '미납' : '검사미이행')}
                        onChange={(e) => setReasonMap((m) => ({ ...m, [r.plate]: e.target.value }))}
                      >
                        {ALL_REASONS.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    )}
                  </td>
                  <td className="center mono dim">{r.lastIgnitionDate ? r.lastIgnitionDate.slice(5) : '—'}</td>
                  <td className="center">
                    {r.isLocked
                      ? <Lock size={14} weight="fill" style={{ color: 'var(--alert-red-text)' }} />
                      : <LockOpen size={14} style={{ color: 'var(--text-weak)' }} />}
                  </td>
                  <td className="center">
                    <button
                      type="button"
                      className={cn('btn', !r.isLocked && 'btn-primary')}
                      onClick={() => toggle(r)}
                    >
                      {r.isLocked ? '해제' : '제어'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
