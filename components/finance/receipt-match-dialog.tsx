'use client';

import { useMemo, useState } from 'react';
import { Link as LinkIcon, ArrowCounterClockwise } from '@phosphor-icons/react';
import { Dialog, DialogContent, DialogClose, DialogFooter } from '@/components/ui/dialog';
import {
  findReceiptCandidates,
  type ReceiptCandidate,
} from '@/lib/receipt-match';
import type { LedgerEntry } from '@/lib/sample-finance';
import type { Contract } from '@/lib/sample-contracts';

/**
 * 자금일보 입금 → 수납 회차 매칭 모달.
 *
 *  · 같은 회사의 모든 미수 수납 회차를 점수 정렬해서 표시
 *  · counterparty 이름 / 금액 일치도 우선 (점수 ≥ 0.7 행은 highlight)
 *  · 행 클릭 또는 [매칭] → onApply(candidate)
 *  · 이미 매칭된 항목은 [매칭 해제] 버튼만 → onReverse()
 *
 * 실제 ledger / contract.events / audit 갱신은 부모 (page.tsx) 에서 일괄 처리.
 */
export function ReceiptMatchDialog({
  open,
  onOpenChange,
  ledger,
  contracts,
  onApply,
  onReverse,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ledger: LedgerEntry | null;
  contracts: readonly Contract[];
  onApply: (candidate: ReceiptCandidate) => void;
  onReverse: () => void;
}) {
  const [filter, setFilter] = useState('');

  const candidates = useMemo(() => {
    if (!ledger) return [];
    return findReceiptCandidates(ledger, contracts);
  }, [ledger, contracts]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((c) => {
      const hay = `${c.contract.customerName} ${c.contract.plate} ${c.contract.contractNo}`.toLowerCase();
      return hay.includes(q);
    });
  }, [candidates, filter]);

  if (!ledger) return null;

  const isMatched = !!ledger.matchedEventId;

  function handleApply(candidate: ReceiptCandidate) {
    onApply(candidate);
  }

  function handleReverse() {
    onReverse();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="수납 매칭" size="lg">
        {/* 거래 요약 */}
        <div className="alert" style={{ background: 'var(--bg-stripe)', fontSize: 12 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <span><strong className="mono">{ledger.txDate}</strong></span>
            <span className="dim">·</span>
            <span>{ledger.companyCode}</span>
            <span className="dim">·</span>
            <span>입금 <strong className="mono">{ledger.deposit?.toLocaleString('ko-KR') ?? 0}원</strong></span>
            {ledger.counterparty && <><span className="dim">·</span><span>예금주 <strong>{ledger.counterparty}</strong></span></>}
          </div>
          {ledger.memo && <div className="dim mt-1">적요: {ledger.memo}</div>}
          {isMatched && (
            <div className="mt-2" style={{ color: 'var(--brand)' }}>
              현재 매칭됨 — <strong>{ledger.matchedContract}</strong> {ledger.matchedCycle}회차
            </div>
          )}
        </div>

        {!isMatched && (
          <>
            <input
              className="input w-full"
              placeholder="이름 / 차량 / 계약번호로 좁히기"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              style={{ marginTop: 10, marginBottom: 6 }}
            />

            <div style={{ maxHeight: 380, overflow: 'auto', border: '1px solid var(--border)' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th className="center">점수</th>
                    <th>회사</th>
                    <th>차량</th>
                    <th>고객</th>
                    <th className="num">회차</th>
                    <th className="date">예정일</th>
                    <th className="num">금액</th>
                    <th className="center">상태</th>
                    <th className="center" style={{ width: 80 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={9} className="empty-row">매칭 가능한 미수 회차 없음</td></tr>
                  ) : filtered.map((c) => {
                    const amountMatch = ledger.deposit && c.event.amount && Math.abs(ledger.deposit - c.event.amount) < 1;
                    const isStrong = c.score >= 0.7;
                    return (
                      <tr
                        key={`${c.contract.id}-${c.event.id}`}
                        onClick={() => handleApply(c)}
                        style={{
                          cursor: 'pointer',
                          background: isStrong ? 'var(--bg-highlight, rgba(34,197,94,0.08))' : undefined,
                        }}
                      >
                        <td className="center mono"><strong>{c.score.toFixed(1)}</strong></td>
                        <td>{c.contract.companyCode}</td>
                        <td className="mono">{c.contract.plate}</td>
                        <td>{c.contract.customerName}</td>
                        <td className="num">{c.event.cycle ?? '-'}</td>
                        <td className="date">{c.event.dueDate}</td>
                        <td className={`num ${amountMatch ? 'text-medium' : ''}`}>
                          {c.event.amount?.toLocaleString('ko-KR') ?? '-'}
                          {amountMatch && <span className="text-green ml-1" style={{ fontSize: 10 }}>=</span>}
                        </td>
                        <td className="center">
                          <span className={`badge ${c.event.status === '지연' ? 'badge-red' : 'badge-blue'}`}>
                            {c.event.status}
                          </span>
                        </td>
                        <td className="center">
                          <button
                            className="btn btn-sm btn-primary"
                            onClick={(ev) => { ev.stopPropagation(); handleApply(c); }}
                          >
                            <LinkIcon size={11} /> 매칭
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="text-weak text-xs mt-2">
              행 클릭 또는 [매칭] → 회차 즉시 완료 처리 (doneDate = 거래일). 적합도 ≥ 0.7 은 highlight.
            </div>
          </>
        )}

        <DialogFooter>
          {isMatched && (
            <button className="btn" onClick={handleReverse} style={{ marginRight: 'auto' }}>
              <ArrowCounterClockwise size={12} weight="bold" /> 매칭 해제
            </button>
          )}
          <DialogClose asChild><button className="btn">닫기</button></DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
