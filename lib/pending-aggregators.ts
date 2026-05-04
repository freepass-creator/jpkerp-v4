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

/**
 * 통일 vocab — 작업 종류 7가지 + 자산 정비 상태.
 *  · 수납 = 만기 도래(과거)인데 아직 미납 → '미납'
 *  · 그 외 = 만기 임박(D-30 이내)인데 아직 미완료 → '미완료'
 */
export type PendingKind = '검사' | '수납' | '출고' | '정비' | '보험' | '반납' | '기타';

export const PENDING_LABELS: Record<PendingKind, string> = {
  검사: '검사 미완료',
  수납: '수납 미납',
  출고: '출고 미완료',
  정비: '정비 미완료',
  보험: '보험 미완료',
  반납: '반납 예정',
  기타: '기타 미완료',
};

export const PENDING_TONES: Record<PendingKind, 'red' | 'orange'> = {
  수납: 'red',
  검사: 'orange',
  출고: 'orange',
  정비: 'orange',
  보험: 'orange',
  반납: 'orange',
  기타: 'orange',
};

export type PendingStatus = '미완료' | '미납';
export type PendingSource = '계약' | '자산';

export type PendingItem = {
  id: string;
  /** 업무구분 — 검사/수납/출고/정비/보험/반납/기타 */
  kind: PendingKind;
  /** 상태 — 수납은 '미납', 그 외는 '미완료' */
  status: PendingStatus;
  /** 출처 — 계약 events 또는 자산 자체 */
  source: PendingSource;
  companyCode: string;
  plate: string;
  /** 차명/차종 (자산 매칭 시 채움) */
  vehicleName: string;
  /** 임차인명 (계약 매칭 시 채움) */
  customerName: string;
  /** 임차인 연락처 */
  customerPhone: string;
  /** 회차 (수납 회차 등) — 있으면 표시 */
  cycle?: number;
  dueDate: string;
  amount?: number;
  /** 0 미만 = 경과(빨강), 0~30 = 임박(주황) */
  daysLeft: number;
  /** 메모 (자산 정비 등 부가 설명) */
  note?: string;
};

const PENDING_HORIZON_DAYS = 30;

export function collectPending(
  assets: readonly Asset[],
  contracts: readonly Contract[],
): PendingItem[] {
  const today = Date.now();
  const horizon = today + PENDING_HORIZON_DAYS * DAY_MS;
  const items: PendingItem[] = [];

  // plate → asset 빠른 lookup
  const assetByPlate = new Map<string, Asset>();
  for (const a of assets) assetByPlate.set(a.plate, a);

  // 1) 자산 검사 만기 임박 (자산 자체 inspectionTo)
  for (const a of assets) {
    if (!a.inspectionTo || a.status === '매각') continue;
    const t = Date.parse(a.inspectionTo);
    if (!Number.isFinite(t) || t > horizon) continue;
    const contract = contracts.find((c) => c.plate === a.plate && c.status === '운행중');
    items.push({
      id: `insp-${a.id}`,
      kind: '검사',
      status: '미완료',
      source: '자산',
      companyCode: a.companyCode,
      plate: a.plate,
      vehicleName: a.vehicleName || a.vehicleClass || '',
      customerName: contract?.customerName ?? '',
      customerPhone: contract?.customerPhone ?? '',
      dueDate: a.inspectionTo,
      daysLeft: daysBetween(a.inspectionTo, today),
    });
  }

  // 2) 자산 정비 진행중 (asset.status='정비')
  for (const a of assets) {
    if (a.status !== '정비') continue;
    const contract = contracts.find((c) => c.plate === a.plate && c.status === '운행중');
    items.push({
      id: `repair-${a.id}`,
      kind: '정비',
      status: '미완료',
      source: '자산',
      companyCode: a.companyCode,
      plate: a.plate,
      vehicleName: a.vehicleName || a.vehicleClass || '',
      customerName: contract?.customerName ?? '',
      customerPhone: contract?.customerPhone ?? '',
      dueDate: '',
      daysLeft: 0,
      note: '자산 상태 정비중',
    });
  }

  // 3) 계약 events 전체 7타입 — 출고/수납/검사/정비/보험/반납/기타
  for (const c of contracts) {
    if (c.status === '만기' || c.status === '해지') continue;
    const asset = assetByPlate.get(c.plate);
    const vehicleName = asset?.vehicleName || asset?.vehicleClass || '';
    for (const e of c.events) {
      if (e.status !== '예정') continue;
      const t = Date.parse(e.dueDate);
      if (!Number.isFinite(t)) continue;

      // 수납: 만기 도래 (과거)만 미납 / 그 외: D-30 이내 미완료
      const isReceipt = e.type === '수납';
      if (isReceipt) {
        if (t > today) continue;
      } else {
        if (t > horizon) continue;
      }

      // contract.event type 그대로 PendingKind (모두 동일 vocab)
      const kind: PendingKind = e.type;
      const status: PendingStatus = isReceipt ? '미납' : '미완료';
      items.push({
        id: `evt-${c.id}-${e.id}`,
        kind,
        status,
        source: '계약',
        companyCode: c.companyCode,
        plate: c.plate,
        vehicleName,
        customerName: c.customerName,
        customerPhone: c.customerPhone,
        cycle: e.cycle,
        dueDate: e.dueDate,
        amount: e.amount ?? (kind === '출고' ? c.monthlyAmount : undefined),
        daysLeft: daysBetween(e.dueDate, today),
        note: e.note,
      });
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
