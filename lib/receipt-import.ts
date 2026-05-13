/**
 * receipt-import.ts — 수납 일괄 마이그레이션 엑셀 → 계약 events 일괄 재생성.
 *
 * 입력: 계약별 1행 + 현재 미수금액 (한 숫자).
 * 처리: buildEventsWithOutstanding 로 가장 최근 도래 회차부터 거꾸로 차감.
 *   · 미수 0     → 도래 회차 모두 완료, 미도래 예정
 *   · 미수 30만  → 마지막 회차 부분납입 (예: 입금 20만 / 미수 30만)
 *   · 미수 130만 → 마지막 2회차 전체미수 + 그 전 회차 부분납입
 *
 * 양식 (6 컬럼):
 *   필수: 계약번호 / 미수금액
 *   참조(read-only): 차량번호 · 임차인 · 월대여료 · 만기일  → 사용자가 식별만, 검증엔 미사용
 */

import {
  readExcel,
  detectHeaderRow,
  mapColumns,
  cellToNumber,
  cellToString,
} from './excel-import';

export type ReceiptImportRow = {
  contractNo: string;
  outstandingAmount: number;
  errors: string[];
  refPlate?: string;
  refCustomer?: string;
  refMonthly?: number;
  refEndDate?: string;
};

export type ReceiptImportResult = {
  rows: ReceiptImportRow[];
  total: number;
  skipped: number;
  detected: boolean;
};

const DETECT_KEYWORDS = ['계약번호', '미수금액'];

const COLUMN_MAP = {
  contractNo: ['계약번호'],
  plate:      ['차량번호'],
  customer:   ['임차인', '고객명'],
  monthly:    ['월대여료'],
  endDate:    ['만기일'],
  outstanding:['미수금액', '현재미수', '미수금'],
};

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
    if (!contractNo) { skipped++; continue; }

    const errors: string[] = [];
    const outstandingCell = cellToNumber(row[cols.outstanding]);
    if (outstandingCell == null) errors.push('미수금액 누락 (수납 완료면 0 입력)');

    out.push({
      contractNo,
      outstandingAmount: outstandingCell ?? 0,
      errors,
      refPlate: cellToString(row[cols.plate]).trim() || undefined,
      refCustomer: cellToString(row[cols.customer]).trim() || undefined,
      refMonthly: cellToNumber(row[cols.monthly]) ?? undefined,
      refEndDate: cellToString(row[cols.endDate]).trim() || undefined,
    });
  }
  return { rows: out, total: rows.length - headerIdx - 1, skipped, detected: true };
}

export async function parseReceiptExcel(file: File): Promise<ReceiptImportResult> {
  const { rows } = await readExcel(file);
  return rowsToReceipts(rows);
}

/** 필수: 계약번호·미수금액. 양식 헤더에 ` *` 표시. */
export const RECEIPT_EXCEL_REQUIRED = [
  '계약번호',
  '미수금액',
] as const;

/** 참조 (read-only — 사용자 식별용). */
export const RECEIPT_EXCEL_OPTIONAL = [
  '차량번호',
  '임차인',
  '월대여료',
  '만기일',
] as const;

export const RECEIPT_EXCEL_HEADERS: string[] = [
  ...RECEIPT_EXCEL_REQUIRED.map((h) => `${h} *`),
  ...RECEIPT_EXCEL_OPTIONAL,
];
