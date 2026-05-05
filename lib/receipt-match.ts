import type { Contract, ScheduleEvent } from './sample-contracts';
import type { LedgerEntry } from './sample-finance';

/**
 * 자금일보 입금 ↔ 계약 수납 회차 매칭 — 수납관리의 핵심 사이클.
 *
 * 흐름:
 *  1. ledger.deposit > 0, subject='대여료' (또는 미분류)
 *  2. 같은 companyCode 의 미수 회차 (수납 events status !== '완료') 후보
 *  3. counterparty (예금주명) ↔ customerName 일치, 금액 일치 우선 정렬
 *  4. 매칭 선택 → ledger + contract.events 양쪽 update
 *
 * 매칭 시:
 *  - ledger: matchedContract / matchedCycle / matchedEventId 채움
 *  - contract.events[eventId]: status='완료', doneDate = ledger.txDate 의 YYYY-MM-DD
 *
 * 해제 시:
 *  - ledger: 위 3 필드 제거
 *  - 회차: status 도래분이면 '지연', 미도래면 '예정'. doneDate 제거.
 */

export type ReceiptCandidate = {
  contract: Contract;
  event: ScheduleEvent;     // 수납 회차 (cycle 보유)
  score: number;            // 매칭 적합도 — counterparty 일치 + 금액 일치 등
};

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dateOnly(txDate: string): string {
  // 'YYYY-MM-DD HH:mm' → 'YYYY-MM-DD'
  return (txDate ?? '').slice(0, 10);
}

function nameOverlap(a: string, b: string): number {
  const x = a.replace(/\s/g, '');
  const y = b.replace(/\s/g, '');
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) return 0.7;
  return 0;
}

/** 같은 회사의 모든 미수 수납 회차 후보 — 점수 매겨서 내림차순. */
export function findReceiptCandidates(
  ledger: LedgerEntry,
  contracts: readonly Contract[],
): ReceiptCandidate[] {
  if (!ledger.companyCode || !ledger.deposit) return [];
  const today = todayStr();
  const out: ReceiptCandidate[] = [];

  for (const c of contracts) {
    if (c.deletedAt) continue;
    if (c.companyCode !== ledger.companyCode) continue;
    if (c.status === '해지') continue;
    for (const e of c.events ?? []) {
      if (e.type !== '수납') continue;
      if (e.status === '완료') continue;

      const nameScore = ledger.counterparty
        ? nameOverlap(ledger.counterparty, c.customerName)
        : 0;
      const amountScore = ledger.deposit && e.amount && Math.abs(ledger.deposit - e.amount) < 1
        ? 1
        : 0;
      const overdueBoost = e.dueDate < today ? 0.2 : 0;
      const score = nameScore * 2 + amountScore * 1.5 + overdueBoost;
      out.push({ contract: c, event: e, score });
    }
  }
  // 점수 내림차순, 같으면 오래된 dueDate 우선
  out.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (a.event.dueDate ?? '').localeCompare(b.event.dueDate ?? '');
  });
  return out;
}

/**
 * 매칭 적용 — ledger 업데이트 + contract.events 의 해당 회차 완료 처리.
 * 호출자가 양쪽 store 의 setter 를 받아서 한 번에 처리.
 */
export function applyReceiptMatch(
  ledger: LedgerEntry,
  candidate: ReceiptCandidate,
): { ledgerPatch: Partial<LedgerEntry>; eventPatch: { id: string; status: ScheduleEvent['status']; doneDate: string } } {
  return {
    ledgerPatch: {
      matchedContract: candidate.contract.contractNo,
      matchedCycle: candidate.event.cycle,
      matchedEventId: candidate.event.id,
      // subject 가 비어있으면 자동 '대여료'
      subject: ledger.subject ?? '대여료',
    },
    eventPatch: {
      id: candidate.event.id,
      status: '완료',
      doneDate: dateOnly(ledger.txDate),
    },
  };
}

/** 매칭 해제 — 회차 상태를 도래분이면 '지연' 미도래면 '예정' 으로 복원. doneDate 제거. */
export function reverseReceiptMatch(
  ledger: LedgerEntry,
  contracts: readonly Contract[],
): { ledgerPatch: Partial<LedgerEntry>; eventPatch: { contractId: string; eventId: string; status: ScheduleEvent['status'] } | null } {
  const ledgerPatch: Partial<LedgerEntry> = {
    matchedContract: undefined,
    matchedCycle: undefined,
    matchedEventId: undefined,
  };
  if (!ledger.matchedEventId) return { ledgerPatch, eventPatch: null };

  // 어느 계약·회차였는지 찾기
  const today = todayStr();
  for (const c of contracts) {
    const ev = c.events?.find((e) => e.id === ledger.matchedEventId);
    if (!ev) continue;
    const nextStatus: ScheduleEvent['status'] = ev.dueDate < today ? '지연' : '예정';
    return { ledgerPatch, eventPatch: { contractId: c.id, eventId: ev.id, status: nextStatus } };
  }
  return { ledgerPatch, eventPatch: null };
}
