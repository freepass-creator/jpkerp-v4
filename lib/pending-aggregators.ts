/**
 * 업무현황 집계 함수 — 미결업무 / 미납현황 / 휴차현황.
 *
 * 페이지에서 인라인으로 풀어쓰지 않고 표준 시그니처로 추출:
 *   collect{Pending,Overdue,Idle}(...stores) → ReadonlyArray<{...}>
 *
 * O(N) — Set/Map 기반 lookup. 페이지는 useMemo 로 호출.
 */

import type { Asset } from './sample-assets';
import type { Contract, ScheduleEvent } from './sample-contracts';

const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(date: string, ref: number): number {
  const t = Date.parse(date);
  if (!Number.isFinite(t)) return Number.NaN;
  return Math.round((t - ref) / DAY_MS);
}

/* ─────────────── 미결업무 ─────────────── */

export type PendingKind = '검사만기' | '미수납' | '출고미완' | '보험만기';

export type PendingItem = {
  id: string;
  kind: PendingKind;
  companyCode: string;
  plate: string;
  target: string;             // 임차인명 또는 차량명 등 식별
  dueDate: string;
  amount?: number;
  /** 0 미만 = 경과(빨강), 0~30 = 임박(주황), 그 외 표시 안 함 */
  daysLeft: number;
};

const PENDING_HORIZON_DAYS = 30;

export function collectPending(
  assets: readonly Asset[],
  contracts: readonly Contract[],
): PendingItem[] {
  const today = Date.now();
  const horizon = today + PENDING_HORIZON_DAYS * DAY_MS;
  const items: PendingItem[] = [];

  // 1) 자산 검사 만기 임박
  for (const a of assets) {
    if (!a.inspectionTo || a.status === '매각') continue;
    const t = Date.parse(a.inspectionTo);
    if (!Number.isFinite(t) || t > horizon) continue;
    items.push({
      id: `insp-${a.id}`,
      kind: '검사만기',
      companyCode: a.companyCode,
      plate: a.plate,
      target: a.vehicleName || a.vehicleClass || '',
      dueDate: a.inspectionTo,
      daysLeft: daysBetween(a.inspectionTo, today),
    });
  }

  // 2) 계약 출고 미완 + 미수납 (만기 도래)
  for (const c of contracts) {
    if (c.status === '만기' || c.status === '해지') continue;
    for (const e of c.events) {
      if (e.status !== '예정') continue;
      const t = Date.parse(e.dueDate);
      if (!Number.isFinite(t)) continue;

      if (e.type === '출고' && t <= horizon) {
        items.push({
          id: `del-${c.id}-${e.id}`,
          kind: '출고미완',
          companyCode: c.companyCode,
          plate: c.plate,
          target: c.customerName,
          dueDate: e.dueDate,
          daysLeft: daysBetween(e.dueDate, today),
        });
      }
      if (e.type === '수납' && t <= today) {
        items.push({
          id: `rcv-${c.id}-${e.id}`,
          kind: '미수납',
          companyCode: c.companyCode,
          plate: c.plate,
          target: `${c.customerName}${e.cycle ? ` ${e.cycle}회차` : ''}`,
          dueDate: e.dueDate,
          amount: e.amount,
          daysLeft: daysBetween(e.dueDate, today),
        });
      }
    }
  }

  // 만료 가까운 순서 (음수가 먼저, 큰 양수는 뒤)
  items.sort((a, b) => a.daysLeft - b.daysLeft);
  return items;
}

/* ─────────────── 미납현황 (계약 단위 집계) ─────────────── */

export type OverdueRow = {
  contractId: string;
  contractNo: string;
  companyCode: string;
  plate: string;
  customerName: string;
  customerPhone: string;
  unpaidCycles: number;
  totalAmount: number;
  /** 가장 오래된 미납 회차의 경과일 (양수) */
  longestOverdueDays: number;
  oldestDueDate: string;
};

export function collectOverdue(contracts: readonly Contract[]): OverdueRow[] {
  const today = Date.now();
  const rows: OverdueRow[] = [];

  for (const c of contracts) {
    if (c.status === '만기' || c.status === '해지') continue;
    let unpaidCycles = 0;
    let totalAmount = 0;
    let oldestDueDate = '';
    let longestOverdueDays = 0;

    for (const e of c.events) {
      if (e.type !== '수납' || e.status !== '예정') continue;
      const t = Date.parse(e.dueDate);
      if (!Number.isFinite(t) || t >= today) continue;  // 만기 미도래는 미납 아님

      unpaidCycles += 1;
      totalAmount += e.amount ?? 0;
      const overdue = Math.round((today - t) / DAY_MS);
      if (overdue > longestOverdueDays) {
        longestOverdueDays = overdue;
        oldestDueDate = e.dueDate;
      }
    }

    if (unpaidCycles > 0) {
      rows.push({
        contractId: c.id,
        contractNo: c.contractNo,
        companyCode: c.companyCode,
        plate: c.plate,
        customerName: c.customerName,
        customerPhone: c.customerPhone,
        unpaidCycles,
        totalAmount,
        longestOverdueDays,
        oldestDueDate,
      });
    }
  }

  rows.sort((a, b) => b.longestOverdueDays - a.longestOverdueDays);
  return rows;
}

/* ─────────────── 휴차현황 ─────────────── */

export type IdleReason = '등록예정' | '대기' | '정비' | '계약종료' | '운행중미매칭';

export type IdleRow = {
  assetId: string;
  companyCode: string;
  plate: string;
  vehicleName: string;
  reason: IdleReason;
  status: Asset['status'];
  /** 휴차 상태가 된 후 추정 일수 (확정 정보 없으면 N/A 의미로 -1) */
  daysIdle: number;
};

/**
 * 휴차 정의:
 *  · asset.status === '대기' — 출고 대기 중
 *  · asset.status === '정비'
 *  · asset.status === '등록예정'
 *  · asset.status === '운행중' 인데 매칭 운행중 계약 없음 (불일치 케이스 — 데이터 정합성 경보)
 */
export function collectIdle(
  assets: readonly Asset[],
  contracts: readonly Contract[],
): IdleRow[] {
  const platesWithActiveContract = new Set<string>();
  for (const c of contracts) {
    if (c.status === '운행중') platesWithActiveContract.add(c.plate);
  }

  const rows: IdleRow[] = [];
  for (const a of assets) {
    if (a.status === '매각') continue;
    let reason: IdleReason | null = null;
    if (a.status === '등록예정') reason = '등록예정';
    else if (a.status === '대기') reason = '대기';
    else if (a.status === '정비') reason = '정비';
    else if (a.status === '운행중' && !platesWithActiveContract.has(a.plate)) reason = '운행중미매칭';
    // 그 외(운행중 + 계약 매칭) 은 휴차 아님

    if (!reason) continue;

    rows.push({
      assetId: a.id,
      companyCode: a.companyCode,
      plate: a.plate,
      vehicleName: a.vehicleName || a.vehicleClass || '',
      reason,
      status: a.status,
      daysIdle: -1,  // 확정 정보 없음 — 추후 status 변경 timestamp 추가 시 계산
    });
  }

  // 정합성 경보(운행중미매칭) 가장 위로
  rows.sort((a, b) => {
    const wA = a.reason === '운행중미매칭' ? 0 : 1;
    const wB = b.reason === '운행중미매칭' ? 0 : 1;
    if (wA !== wB) return wA - wB;
    return a.companyCode.localeCompare(b.companyCode);
  });
  return rows;
}

/* ─────────────── 페이지에서 빠르게 카운트 ─────────────── */

export type PendingCounts = {
  pending: number;
  overdue: number;
  idle: number;
};

export function pendingCounts(
  assets: readonly Asset[],
  contracts: readonly Contract[],
): PendingCounts {
  return {
    pending: collectPending(assets, contracts).length,
    overdue: collectOverdue(contracts).length,
    idle: collectIdle(assets, contracts).length,
  };
}
