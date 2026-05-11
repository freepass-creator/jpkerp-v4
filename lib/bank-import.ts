/**
 * bank-import.ts — 통장(은행) 거래내역 → LedgerEntry[].
 *
 * 입력 소스:
 *   parseBankExcel(file, ctx)   — .xlsx/.xls/.csv 파일
 *   parseBankSheet(text, ctx)   — 구글시트/엑셀에서 복사한 TSV/CSV 텍스트
 *
 * 헤더 자동 검출 (거래일·입금·출금·잔액 키워드 ≥3개) → 매핑 → 변환.
 * 회사코드·계좌는 파일/텍스트 외부에서 주입 (한 입력 = 한 통장 가정).
 */
import {
  readExcel,
  detectHeaderRow,
  mapColumns,
  cellToNumber,
  cellToDateTime,
  cellToString,
} from './excel-import';
import type { LedgerEntry } from './sample-finance';
import { makeTxKey } from './ledger-dedup';

export type BankImportContext = {
  companyCode: string;
  account: string;
};

export type BankImportResult = {
  entries: LedgerEntry[];
  total: number;
  skipped: number;
  detected: boolean;
};

const DETECT_KEYWORDS = ['거래일', '입금', '출금', '잔액'];

/**
 * 통장 컬럼 → LedgerEntry 매핑.
 *
 *   적요 (BZ뱅크 등 결제 채널 표기)  → summary
 *   내용 (정유라 (145가1796) 등 거래 메모) → memo
 *   메모 (사용자 별도 메모 컬럼)         → note
 *
 * 신한·국민 등 대부분 은행 export 는 「적요」+「내용」 2 컬럼 구조. 「상대계좌」 별도
 * 컬럼은 거의 없어 counterparty 는 memo 와 동일하게 fallback (dedup signature 호환).
 */
const COLUMN_MAP = {
  txDate:       ['거래일시', '거래일자', '거래일'],
  deposit:      ['입금액', '입금'],
  withdraw:     ['출금액', '출금'],
  balance:      ['잔액', '거래후잔액'],
  summary:      ['적요'],
  memo:         ['내용', '거래내용'],
  counterparty: ['상대계좌', '상대'],
  note:         ['메모', '비고'],
};

/**
 * 적요 원문 → LedgerMethod enum 파생. 키워드 매칭 (대소문자 무시).
 *
 *   CMS / 자동      → 자동이체
 *   카드 / BC / VISA → 카드
 *   ATM             → 무통장
 *   현금            → 현금
 *   그 외           → 인터넷뱅킹 (대부분 인터넷·모바일뱅킹 이체)
 */
function deriveMethod(summary: string): import('./sample-finance').LedgerMethod {
  const t = summary.trim().toUpperCase();
  if (!t) return '인터넷뱅킹';
  if (t.includes('CMS') || t.includes('자동')) return '자동이체';
  if (t.includes('카드') || t.includes('BC') || t.includes('VISA') || t.includes('마스터')) return '카드';
  if (t.includes('ATM') || t.includes('무통장')) return '무통장';
  if (t.includes('현금')) return '현금';
  return '인터넷뱅킹';
}

function rowsToEntries(rows: unknown[][], ctx: BankImportContext): BankImportResult {
  const headerIdx = detectHeaderRow(rows, DETECT_KEYWORDS, 3);
  if (headerIdx < 0) return { entries: [], total: 0, skipped: 0, detected: false };

  const headers = (rows[headerIdx] ?? []).map((c) => cellToString(c));
  const cols = mapColumns(headers, COLUMN_MAP);

  const entries: LedgerEntry[] = [];
  let skipped = 0;
  const stamp = Date.now();
  const uploadedAt = new Date().toISOString();
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const txDate = cellToDateTime(row[cols.txDate]);
    if (!txDate) { skipped++; continue; }
    const deposit = cellToNumber(row[cols.deposit]);
    const withdraw = cellToNumber(row[cols.withdraw]);
    if (!deposit && !withdraw) { skipped++; continue; }

    const balance = cellToNumber(row[cols.balance]) ?? 0;
    const summary = cellToString(row[cols.summary]);   // 적요 (BZ뱅크 등)
    const memo = cellToString(row[cols.memo]);         // 내용 (정유라 등)
    const counterpartyCol = cellToString(row[cols.counterparty]);
    const note = cellToString(row[cols.note]);

    const entry: LedgerEntry = {
      id: `bx-${stamp}-${i}`,
      companyCode: ctx.companyCode,
      account: ctx.account || undefined,
      txDate,
      deposit,
      withdraw,
      balance,
      summary: summary || undefined,
      memo: memo || summary,                            // 내용 비어있으면 적요로 fallback
      counterparty: counterpartyCol || memo || undefined,  // dedup signature 호환 — 내용을 상대 식별자로 사용
      method: deriveMethod(summary),
      note: note || undefined,
      uploadedAt,
    };
    entry.txKey = makeTxKey(entry);
    entries.push(entry);
  }
  return { entries, total: rows.length - headerIdx - 1, skipped, detected: true };
}

export async function parseBankExcel(file: File, ctx: BankImportContext): Promise<BankImportResult> {
  const { rows } = await readExcel(file);
  return rowsToEntries(rows, ctx);
}

/**
 * 구글시트·엑셀·표 형식 텍스트 → 행 배열.
 *
 * 분리자 자동 검출 우선순위: 탭 → 콤마 → 2+ 공백 (여러 칸 공백으로 정렬된 텍스트표 지원).
 *
 * 빈 체크박스 컬럼 처리: 신한 인터넷뱅킹 등에서 「전체선택」 처럼 데이터가 비어있는
 * UI 컬럼이 헤더 중간에 있으면, 공백 분리 시 데이터 행에선 그 셀이 사라져 컬럼 정렬이
 * 어긋남. 헤더에서 해당 컬럼을 제거하여 인덱스를 맞춤.
 */
const CHECKBOX_HEADER_RE = /^(전체\s*선택|선택|체크)$/;

export function parseBankSheet(text: string, ctx: BankImportContext): BankImportResult {
  if (!text.trim()) return { entries: [], total: 0, skipped: 0, detected: false };
  const lines = text.replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim().length > 0);

  const first = lines[0];
  const sep: RegExp = first.includes('\t') ? /\t/ : first.includes(',') ? /,/ : /\s{2,}/;
  const rawRows: string[][] = lines.map((line) => line.split(sep).map((c) => c.trim()));

  const headerIdx = detectHeaderRow(rawRows, DETECT_KEYWORDS, 3);
  if (headerIdx < 0) return { entries: [], total: 0, skipped: 0, detected: false };

  const headers = rawRows[headerIdx];
  const checkboxIdx = headers
    .map((h, i) => (CHECKBOX_HEADER_RE.test(h) ? i : -1))
    .filter((i) => i >= 0);

  // 헤더에서 체크박스 컬럼 제거. 데이터 행은:
  //   - 헤더와 길이 동일 (탭 분리, 빈 셀 보존) → 동일 인덱스 제거
  //   - 헤더보다 짧음 (공백 분리로 빈 셀이 사라짐) → 그대로 (이미 자연 정렬됨)
  const cleanedRows: unknown[][] = checkboxIdx.length === 0
    ? rawRows
    : rawRows.map((row, i) => {
        if (i === headerIdx) return row.filter((_, j) => !checkboxIdx.includes(j));
        return row.length === headers.length ? row.filter((_, j) => !checkboxIdx.includes(j)) : row;
      });

  return rowsToEntries(cleanedRows, ctx);
}
