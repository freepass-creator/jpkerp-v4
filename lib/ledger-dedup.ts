/**
 * 계좌내역 거래 중복 검출.
 *
 * txKey 시그니처: {accountDigits}|{txDate}|{direction}|{amount}|{balance}|{counterparty}
 *  - 같은 통장의 같은 일시·금액·잔액·상대 거래는 완전 동일 거래로 판정
 *  - 계좌 미지정(account 비어있음)이면 accountDigits 가 빈 문자열이라 더 느슨한 매칭
 *  - 잔액(balance)이 시그니처에 들어가서 같은 일자에 같은 금액·상대가 여러 번 있어도 잔액으로 구분
 */
import type { LedgerEntry } from './sample-finance';
import { digitsOnly } from './account-normalize';

export function makeTxKey(
  e: Pick<LedgerEntry, 'account' | 'txDate' | 'deposit' | 'withdraw' | 'balance' | 'counterparty'>,
): string {
  const accountKey = digitsOnly(e.account);
  const direction = e.deposit ? 'in' : 'out';
  const amount = e.deposit ?? e.withdraw ?? 0;
  const counterparty = (e.counterparty ?? '').trim();
  return `${accountKey}|${e.txDate}|${direction}|${amount}|${e.balance}|${counterparty}`;
}

export type DedupResult = {
  unique: LedgerEntry[];
  duplicates: LedgerEntry[];
};

/** incoming 을 existing 에 대해 dedup. unique 는 txKey 가 채워진 채 반환. */
export function dedupAgainst(incoming: LedgerEntry[], existing: readonly LedgerEntry[]): DedupResult {
  const existingKeys = new Set(existing.map((e) => e.txKey ?? makeTxKey(e)));
  const seenKeys = new Set<string>();
  const unique: LedgerEntry[] = [];
  const duplicates: LedgerEntry[] = [];
  for (const e of incoming) {
    const key = e.txKey ?? makeTxKey(e);
    if (existingKeys.has(key) || seenKeys.has(key)) {
      duplicates.push(e);
    } else {
      seenKeys.add(key);
      unique.push({ ...e, txKey: key });
    }
  }
  return { unique, duplicates };
}
