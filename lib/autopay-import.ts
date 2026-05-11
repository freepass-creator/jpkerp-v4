/**
 * autopay-import.ts — 자동이체·카드 결제 결과 엑셀 → LedgerEntry[].
 *
 * 대상: CMS 자동이체 + 카드 결제 성공 임차인 통합 결과 엑셀 (PG 보고서).
 * 결제수단 컬럼 (CMS/카드) 로 method 분기.
 * 회원명 셀에서 한국 차량번호 자동 추출 (예: "정유라 145가1796" → name="정유라", plate="145가1796").
 *
 * 회사코드·계좌는 외부 주입 (한 파일 = 한 결제 batch 가정).
 */

import {
  readExcel,
  detectHeaderRow,
  mapColumns,
  cellToNumber,
  cellToDateTime,
  cellToString,
} from './excel-import';
import type { LedgerEntry, LedgerMethod } from './sample-finance';
import { makeTxKey } from './ledger-dedup';

export type AutopayImportContext = {
  companyCode: string;
  account: string;
};

export type AutopayImportRow = {
  txDate: string;
  customerName: string;
  plate?: string;                  // 회원명 셀에서 추출한 차량번호 (한국 패턴)
  amount: number;
  method: LedgerMethod;             // 결제수단 → 자동이체 (CMS) / 카드
  approvalNo?: string;
  phone?: string;
  memberNo?: string;
  /** LedgerEntry 변환 결과 — push 대상. */
  entry: LedgerEntry;
};

export type AutopayImportResult = {
  rows: AutopayImportRow[];
  total: number;
  skipped: number;
  detected: boolean;
};

const DETECT_KEYWORDS = ['결제', '수납', '회원', '청구', '승인', '카드', '자동결제', 'CMS'];

const COLUMN_MAP = {
  txDate:    ['결제일', '납부일', '거래일', '거래일자', '실시일자', '처리일'],
  customer:  ['회원명', '손님이름', '고객명', '예금주', '거래처', '거래처명'],
  amount:    ['수납금액', '금액', '이체액', '결제금액', '청구금액'],
  payMethod: ['결제수단', '수단', '이체수단'],
  payStatus: ['결제상태', '상태', '처리결과'],
  approval:  ['승인번호'],
  phone:     ['휴대전화', '연락처', '전화'],
  memberNo:  ['회원번호'],
  note:      ['비고', '메모'],
};

/** 한국 차량번호 패턴 — "12가1234" / "123가1234" / 4-7자리. */
const PLATE_RE = /\b\d{2,3}[가-힣]\d{4}\b/;

/** "정유라 145가1796" → { name: "정유라", plate: "145가1796" } */
function splitNameAndPlate(raw: string): { name: string; plate?: string } {
  const t = raw.trim();
  const m = t.match(PLATE_RE);
  if (!m) return { name: t };
  const plate = m[0];
  const name = t.replace(plate, '').trim();
  return { name: name || t, plate };
}

/** 결제수단 라벨 → LedgerMethod 매핑. */
function mapPayMethod(raw: string): LedgerMethod {
  const t = raw.trim().toUpperCase();
  if (t.includes('CMS') || t.includes('자동')) return '자동이체';
  if (t.includes('카드')) return '카드';
  if (t.includes('현금')) return '현금';
  if (t.includes('이체')) return '인터넷뱅킹';
  return '기타';
}

function rowsToEntries(rows: unknown[][], ctx: AutopayImportContext): AutopayImportResult {
  const headerIdx = detectHeaderRow(rows, DETECT_KEYWORDS, 3);
  if (headerIdx < 0) return { rows: [], total: 0, skipped: 0, detected: false };

  const headers = (rows[headerIdx] ?? []).map((c) => cellToString(c));
  const cols = mapColumns(headers, COLUMN_MAP);

  const out: AutopayImportRow[] = [];
  let skipped = 0;
  const stamp = Date.now();
  const uploadedAt = new Date().toISOString();

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const txDate = cellToDateTime(row[cols.txDate]);
    const customerRaw = cellToString(row[cols.customer]);
    const amount = cellToNumber(row[cols.amount]) ?? 0;
    if (!txDate || !customerRaw || !amount) { skipped++; continue; }

    const { name: customerName, plate } = splitNameAndPlate(customerRaw);
    const method = mapPayMethod(cellToString(row[cols.payMethod]));
    const approvalNo = cellToString(row[cols.approval]) || undefined;
    const phone = cellToString(row[cols.phone]) || undefined;
    const memberNo = cellToString(row[cols.memberNo]) || undefined;
    const noteCell = cellToString(row[cols.note]) || '';

    // summary (자금일보 「적요」 컬럼): 결제 채널 표기 — 자동이체면 "CMS 자동이체", 그 외 enum 라벨
    const summary = method === '자동이체' ? 'CMS 자동이체' : method;

    // memo (자금일보 「내용」 컬럼): 손님 + 차량 (통장 「내용」과 동등한 식별 텍스트)
    const memoParts = [customerName];
    if (plate) memoParts.push(`(${plate})`);
    const memo = memoParts.join(' ');

    // note: 승인번호 + 비고 셀
    const noteParts: string[] = [];
    if (approvalNo) noteParts.push(`승인 ${approvalNo}`);
    if (noteCell) noteParts.push(noteCell);
    if (memberNo) noteParts.push(`회원 ${memberNo}`);
    const note = noteParts.length > 0 ? noteParts.join(' / ') : undefined;

    const entry: LedgerEntry = {
      id: `ap-${stamp}-${i}`,
      companyCode: ctx.companyCode,
      account: ctx.account || undefined,
      txDate,
      deposit: amount,
      withdraw: 0,
      balance: 0,                       // 자동이체 batch 는 잔액 정보 없음
      summary,
      memo,
      counterparty: customerName,
      method,
      note,
      uploadedAt,
    };
    entry.txKey = makeTxKey(entry);

    out.push({ txDate, customerName, plate, amount, method, approvalNo, phone, memberNo, entry });
  }
  return { rows: out, total: rows.length - headerIdx - 1, skipped, detected: true };
}

export async function parseAutopayExcel(file: File, ctx: AutopayImportContext): Promise<AutopayImportResult> {
  const { rows } = await readExcel(file);
  return rowsToEntries(rows, ctx);
}
