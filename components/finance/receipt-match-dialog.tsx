'use client';

import { useMemo, useState } from 'react';
import { CheckCircle, Link as LinkIcon, ArrowCounterClockwise } from '@phosphor-icons/react';
import { Dialog, DialogContent, DialogClose, DialogFooter } from '@/components/ui/dialog';
import { useContractStore } from '@/lib/use-contract-store';
import { useLedgerStore } from '@/lib/use-ledger-store';
import { useAuditStamp } from '@/lib/audit-fields';
import {
  findReceiptCandidates,
  applyReceiptMatch,
  reverseReceiptMatch,
  type ReceiptCandidate,
} from '@/lib/receipt-match';
import type { LedgerEntry } from '@/lib/sample-finance';

/**
 * 자금일보 입금 → 수납 회차 매칭 모달.
 *
 *  · 같은 회사의 모든 미수 수납 회차를 점수 정렬해서 표시
 *  · counterparty 이름 / 금액 일치도 우선
 *  · 클릭 → ledger + contract.events 즉시 동시 update
 *  · 이미 매칭된 항목은 [매칭 해제] 버튼
 */
export function ReceiptMatchDialog({
  open, onOpenChange, ledger,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ledger: LedgerEntry | null;
}) {
  const [contracts, setContracts] = useContractStore();
  const [, setLedger] = useLedgerStore();
  const audit = useAuditStamp();
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

  function applyMatch(candidate: ReceiptCandidate) {
    if (!ledger) return;
    const { ledgerPatch, eventPatch } = applyReceiptMatch(ledger, candidate);
    setLedger((prev) => prev.map((l) => (l.id === ledger.id ? { ...l, ...ledgerPatch } : l)));
    setContracts((prev) => prev.map((c) =>
      c.id === candidate.contract.id
        ? {
            ...c,
            events: c.events.map((e) =>
              e.id === eventPatch.id ? { ...e, status: eventPatch.status, doneDate: eventPatch.doneDate } : e
            ),
            ...audit.update(),
          }
        : c
    ));
    onOpenChange(false);
  }

  function unmatch() {
    if (!ledger) return;
    const { ledgerPatch, eventPatch } = reverseReceiptMatch(ledger, contracts);
    setLedger((prev) => prev.map((l) => (l.id === ledger.id ? { ...l, ...ledgerPatch } : l)));
    if (eventPatch) {
      setContracts((prev) => prev.map((c) =>
        c.id === eventPatch.contractId
          ? {
              ...c,
              events: c.events.map((e) =>
                e.id === eventPatch.eventId ? { ...e, status: eventPatch.status, doneDate: undefined } : e
              ),
              ...audit.update(),
            }
          : c
      ));
    }
    onOpenChange(false);
  }

  if (!ledger) return null;

  const isMatched = !!ledger.matchedEventId;

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
              현재 매칭: <strong>{ledger.matchedContract}</strong> · {ledger.matchedCycle}회차
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
                    <th>계약</th>
                    <th>임차인</th>
                    <th className="num">회차</th>
                    <th className="date">예정일</th>
                    <th className="num">금액</th>
                    <th className="center">상태</th>
                    <th className="center">적합도</th>
                    <th className="center" style={{ width: 80 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={8} className="empty-row">매칭 가능한 미수 회차 없음</td></tr>
                  ) : filtered.map((c) => {
                    const amountMatch = ledger.deposit && c.event.amount && Math.abs(ledger.deposit - c.event.amount) < 1;
                    return (
                      <tr key={`${c.contract.id}-${c.event.id}`} onClick={() => applyMatch(c)} style={{ cursor: 'pointer' }}>
                        <td className="mono">{c.contract.contractNo}</td>
                        <td>{c.contract.customerName}<span className="text-weak ml-2">{c.contract.plate}</span></td>
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
                        <td className="center mono dim">{c.score.toFixed(1)}</td>
                        <td className="center">
                          <button className="btn btn-sm btn-primary" onClick={(ev) => { ev.stopPropagation(); applyMatch(c); }}>
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
              행 클릭 또는 [매칭] → 회차 즉시 완료 처리 (doneDate = 거래일). 적합도는 이름·금액 일치 + 미수 가산점.
            </div>
          </>
        )}

        <DialogFooter>
          {isMatched && (
            <button className="btn" onClick={unmatch} style={{ marginRight: 'auto' }}>
              <ArrowCounterClockwise size={12} weight="bold" /> 매칭 해제
            </button>
          )}
          <DialogClose asChild><button className="btn">닫기</button></DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
