'use client';

import { useMemo, useState } from 'react';
import { Plus, Lock, LockOpen } from '@phosphor-icons/react';
import type { Contract } from '@/lib/sample-contracts';
import type { Asset } from '@/lib/sample-assets';
import type { JournalEntry } from '@/lib/sample-journal';
import { cn } from '@/lib/cn';

const REASONS = ['미납', '검사미이행', '계약위반', '연락두절', '기타'];

interface Props {
  contracts: readonly Contract[];
  assets: readonly Asset[];
  entries: readonly JournalEntry[];
  /** 시동 잠금/해제 처리 — 새 journal entry 생성으로 처리 (kind=ignition) */
  onAction: (params: { plate: string; action: '시동잠금' | '시동해제'; reason: string }) => void;
}

interface Row {
  contract: Contract;
  asset: Asset | null;
  unpaidAmount: number;     // (TODO: billing 데이터 도입되면 계산)
  maxOverdueDays: number;
  isLocked: boolean;
  lastIgnitionDate: string;
  lastIgnitionReason: string;
}

/**
 * 시동제어 — 운행중 계약 중 시동제어 대상(미납·계약위반·검사미이행 등) 차량 리스트.
 * v3 ignition-form 의 단순화 포팅. billing 데이터가 v4 에 아직 없으므로 미납금액은 0.
 *  - 차량별 잠금/해제 토글
 *  - 수동 추가(미납 외 사유) — 차량번호 + 사유 입력
 */
export function IgnitionForm({ contracts, assets, entries, onAction }: Props) {
  const [reasonMap, setReasonMap] = useState<Record<string, string>>({});
  const [showAdd, setShowAdd] = useState(false);
  const [addPlate, setAddPlate] = useState('');
  const [addReason, setAddReason] = useState('검사미이행');
  const [manualPlates, setManualPlates] = useState<Set<string>>(new Set());

  const rows = useMemo<Row[]>(() => {
    const assetMap = new Map<string, Asset>();
    for (const a of assets) if (a.plate) assetMap.set(a.plate, a);

    // 차량별 가장 최근 ignition entry
    const ignitionMap = new Map<string, { date: string; action: string; reason: string }>();
    for (const e of entries) {
      if (e.kind !== 'ignition') continue;
      const p = e.data?.plate;
      if (!p) continue;
      const cur = ignitionMap.get(p);
      if (!cur || e.at > cur.date) {
        ignitionMap.set(p, {
          date: e.at,
          action: e.data?.action ?? '',
          reason: e.data?.reason ?? '',
        });
      }
    }

    const list: Row[] = [];
    for (const c of contracts) {
      if (c.status !== '운행중') continue;
      const ign = ignitionMap.get(c.plate);
      const isLocked = ign?.action === '시동잠금';
      const isManual = manualPlates.has(c.plate);
      // TODO: billing 도입 후 unpaidAmount 계산
      const unpaidAmount = 0;
      const maxOverdueDays = 0;
      // 미납·잠금 중·수동 추가 차량만 표시
      if (unpaidAmount > 0 || isLocked || isManual) {
        list.push({
          contract: c,
          asset: assetMap.get(c.plate) ?? null,
          unpaidAmount,
          maxOverdueDays,
          isLocked,
          lastIgnitionDate: ign?.date ?? '',
          lastIgnitionReason: ign?.reason ?? '',
        });
      }
    }
    return list.sort((a, b) => {
      if (a.isLocked !== b.isLocked) return a.isLocked ? -1 : 1;
      return b.maxOverdueDays - a.maxOverdueDays;
    });
  }, [contracts, assets, entries, manualPlates]);

  const lockedCount = rows.filter((r) => r.isLocked).length;

  function toggle(r: Row) {
    const action = r.isLocked ? '시동해제' : '시동잠금';
    const reason = r.isLocked ? '납부완료' : (reasonMap[r.contract.id] ?? '미납');
    onAction({ plate: r.contract.plate, action, reason });
  }

  function commitAdd() {
    const plate = addPlate.trim();
    if (!plate) return;
    setManualPlates((s) => new Set(s).add(plate));
    const target = contracts.find((c) => c.plate === plate && c.status === '운행중');
    if (target) setReasonMap((m) => ({ ...m, [target.id]: addReason }));
    setAddPlate('');
    setShowAdd(false);
  }

  return (
    <div className="block" style={{ gridColumn: 'span 4' }}>
      {/* 헤드 — 통계 + 추가 */}
      <div className="panel-head" style={{ border: '1px solid var(--border)', borderBottom: 'none' }}>
        <span>총 <strong style={{ color: 'var(--text)' }}>{rows.length}</strong>대 · 제어 중 <strong style={{ color: 'var(--alert-red-text)' }}>{lockedCount}</strong>대</span>
        <span className="panel-head-right" style={{ display: 'flex', gap: 4 }}>
          {showAdd ? (
            <>
              <input
                className="input mono"
                type="text"
                value={addPlate}
                onChange={(e) => setAddPlate(e.target.value)}
                placeholder="차량번호"
                style={{ width: 120 }}
              />
              <select
                className="input"
                value={addReason}
                onChange={(e) => setAddReason(e.target.value)}
              >
                {REASONS.filter((r) => r !== '미납').map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <button type="button" className="btn btn-primary" onClick={commitAdd} disabled={!addPlate.trim()}>확인</button>
              <button type="button" className="btn" onClick={() => { setShowAdd(false); setAddPlate(''); }}>취소</button>
            </>
          ) : (
            <button type="button" className="btn" onClick={() => setShowAdd(true)}>
              <Plus size={12} weight="bold" /> 추가
            </button>
          )}
        </span>
      </div>

      {rows.length === 0 ? (
        <div style={{
          padding: 24,
          textAlign: 'center',
          color: 'var(--text-weak)',
          fontSize: 12,
          border: '1px solid var(--border)',
          borderRadius: 4,
        }}>
          시동제어 대상 차량 없음
          <div style={{ marginTop: 4, fontSize: 11 }}>+추가로 검사미이행·계약위반 등 사유로 수동 등록 가능</div>
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
                <th>제어사유</th>
                <th className="center">제어일</th>
                <th className="center">상태</th>
                <th className="center" style={{ width: 60 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr key={r.contract.id}>
                  <td className="center dim mono">{idx + 1}</td>
                  <td className="plate"><strong>{r.contract.plate}</strong></td>
                  <td className="dim">{[r.asset?.maker, r.asset?.modelName].filter(Boolean).join(' ') || '—'}</td>
                  <td>{r.contract.customerName}</td>
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
                        value={reasonMap[r.contract.id] ?? '미납'}
                        onChange={(e) => setReasonMap((m) => ({ ...m, [r.contract.id]: e.target.value }))}
                      >
                        {REASONS.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    )}
                  </td>
                  <td className="center mono dim">{r.lastIgnitionDate ? r.lastIgnitionDate.slice(5, 10) : '—'}</td>
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
