/**
 * receipt-import.ts — 수납 일괄 엑셀 → 계약 회차 status/doneDate 갱신.
 *
 * 양식 (9 컬럼):
 *   필수: 계약번호 / 회차 / 상태   — 매칭 + 처리
 *   참조: 차량번호 · 임차인 · 회차금액 · 회차예정일  (read-only, 사용자가 식별만)
 *   부가: 입금일 · 비고
 *
 * 처리:
 *   - 상태 '완료'   → event.status='완료', doneDate=입금일 또는 회차예정일
 *   - 상태 '지연'   → event.status='지연' (입금일 무시)
 *   - 상태 '취소'   → event.status='취소'
 *   - 상태 '예정'   → event.status='예정' (보류)
 *
 * 매칭 키: contractNo + cycle. 일치하는 type='수납' event 찾아서 patch.
 */

import {
  readExcel,
  detectHeaderRow,
  mapColumns,
  cellToNumber,
  cellToDateTime,
  cellToString,
} from './excel-import';
import type { ScheduleStatus } from './sample-contracts';

export type ReceiptImportRow = {
  contractNo: string;
  cycle: number;
  status: ScheduleStatus;
  doneDate?: string;
  note?: string;
  errors: string[];
  /** 미리보기 표시용 — 양식 참조 컬럼. */
  refPlate?: string;
  refCustomer?: string;
  refAmount?: number;
  refDueDate?: string;
};

export type ReceiptImportResult = {
  rows: ReceiptImportRow[];
  total: number;
  skipped: number;
  detected: boolean;
};

const DETECT_KEYWORDS = ['계약번호', '회차', '상태'];

const COLUMN_MAP = {
  contractNo: ['계약번호'],
  plate:      ['차량번호'],
  customer:   ['임차인', '고객명'],
  cycle:      ['회차'],
  amount:     ['회차금액', '월대여료'],
  dueDate:    ['회차예정일', '예정일'],
  status:     ['상태'],
  doneDate:   ['입금일', '실시일'],
  note:       ['비고', '메모'],
};

const STATUS_VALID: ReadonlySet<ScheduleStatus> = new Set(['예정', '완료', '지연', '취소']);

function rowsToReceipts(rows: unknown[][]): ReceiptImportResult {
  const headerIdx = detectHeaderRow(rows, DETECT_KEYWORDS, 2);
  if (headerIdx < 0) return { rows: [], total: 0, skipped: 0, detected: false };

  const headers = (rows[headerIdx] ?? []).map((c) => cellToString(c));
  const cols = mapColumns(headers, COLUMN_MAP);

  const out: ReceiptImportRow[] = [];
  let skipped = 0;

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const contractNo = cellToString(row[cols.contractNo]).trim();
    const cycleRaw = cellToNumber(row[cols.cycle]);
    if (!contractNo && cycleRaw == null) { skipped++; continue; }

    const errors: string[] = [];
    if (!contractNo) errors.push('계약번호 누락');
    if (cycleRaw == null) errors.push('회차 누락');

    const statusRaw = cellToString(row[cols.status]).trim();
    if (!statusRaw) errors.push('상태 누락');
    else if (!STATUS_VALID.has(statusRaw as ScheduleStatus)) errors.push(`상태 값 오류: ${statusRaw}`);

    const status = (STATUS_VALID.has(statusRaw as ScheduleStatus) ? statusRaw : '예정') as ScheduleStatus;
    const doneDate = cellToDateTime(row[cols.doneDate])?.slice(0, 10);

    if (status === '완료' && !doneDate) {
      // 완료인데 입금일 없으면 예정일로 fallback (양식 참조 컬럼)
      const refDueDate = cellToDateTime(row[cols.dueDate])?.slice(0, 10);
      if (!refDueDate) errors.push('완료 처리하려면 입금일 또는 회차예정일 필요');
    }

    out.push({
      contractNo,
      cycle: cycleRaw ?? 0,
      status,
      doneDate,
      note: cellToString(row[cols.note]).trim() || undefined,
      refPlate: cellToString(row[cols.plate]).trim() || undefined,
      refCustomer: cellToString(row[cols.customer]).trim() || undefined,
      refAmount: cellToNumber(row[cols.amount]) ?? undefined,
      refDueDate: cellToDateTime(row[cols.dueDate])?.slice(0, 10),
      errors,
    });
  }
  return { rows: out, total: rows.length - headerIdx - 1, skipped, detected: true };
}

export async function parseReceiptExcel(file: File): Promise<ReceiptImportResult> {
  const { rows } = await readExcel(file);
  return rowsToReceipts(rows);
}

/** 필수: 계약번호·회차·상태. 양식 헤더에 ` *` 표시. */
export const RECEIPT_EXCEL_REQUIRED = [
  '계약번호',
  '회차',
  '상태',
] as const;

/** 부가: 참조용(차량·임차인·회차금액·예정일) + 처리값(입금일·비고). */
export const RECEIPT_EXCEL_OPTIONAL = [
  '차량번호',
  '임차인',
  '회차금액',
  '회차예정일',
  '입금일',
  '비고',
] as const;

export const RECEIPT_EXCEL_HEADERS: string[] = [
  ...RECEIPT_EXCEL_REQUIRED.map((h) => `${h} *`),
  ...RECEIPT_EXCEL_OPTIONAL,
];
