/**
 * 범용 엑셀 import 유틸.
 *
 * 도메인 (계좌내역 / 카드 / 자동이체 / 세금계산서 등) 마다 같은 패턴 — 엑셀 파일 업로드 →
 * 헤더 자동 검출 → 컬럼 매핑 → 도메인 entity 변환 — 이 반복되므로 표준 시그니처로 한 번만 정의.
 *
 * 사용:
 *   const { rows } = await readExcel(file);
 *   const headerIdx = detectHeaderRow(rows, ['거래일', '입금', '출금']);
 *   const headers = rows[headerIdx].map(String);
 *   const cols = mapColumns(headers, {
 *     date: ['거래일시', '거래일자'],
 *     amount: ['금액', '거래액'],
 *   });
 *   for (let i = headerIdx + 1; i < rows.length; i++) {
 *     const row = rows[i];
 *     // row[cols.date], row[cols.amount] ...
 *   }
 */

export interface ExcelImportResult {
  /** 첫 번째 시트의 모든 행 (raw values, 헤더 포함) */
  rows: unknown[][];
  /** 모든 시트 이름 */
  sheetNames: string[];
  /** 사용된 시트 이름 (보통 첫 번째) */
  activeSheet: string;
}

/** 엑셀 파일 → 첫 시트의 raw 2D 배열 */
export async function readExcel(file: File, sheetIndex = 0): Promise<ExcelImportResult> {
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheetNames = wb.SheetNames;
  const sheetName = sheetNames[sheetIndex] ?? sheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, raw: true }) as unknown[][];
  return { rows, sheetNames, activeSheet: sheetName };
}

/**
 * 헤더 행 자동 검출.
 * `keywords` 중 둘 이상을 한 행에서 발견하면 그 행을 헤더로 판정 (정확도↑).
 * 못 찾으면 -1.
 */
export function detectHeaderRow(rows: unknown[][], keywords: string[], minMatches = 2): number {
  for (let i = 0; i < Math.min(rows.length, 30); i++) { // 최상위 30행만 — 어떤 은행도 그보다 멀리 안 둠
    const cells = (rows[i] ?? []).map((c) => String(c ?? ''));
    const matchCount = keywords.filter((kw) => cells.some((cell) => cell.includes(kw))).length;
    if (matchCount >= minMatches) return i;
  }
  return -1;
}

/**
 * 헤더 컬럼 → 도메인 필드 매핑 인덱스 산출.
 * `mapping[field] = ['키워드1', '키워드2', ...]` 중 하나라도 헤더에 포함되면 해당 컬럼 인덱스 채택.
 * 매칭 안 된 필드는 결과에 포함 X.
 */
export function mapColumns(
  headers: string[],
  mapping: Record<string, string[]>,
): Record<string, number> {
  const result: Record<string, number> = {};
  const normalized = headers.map((h) => String(h ?? '').replace(/\s/g, ''));
  for (const [field, keywords] of Object.entries(mapping)) {
    const idx = normalized.findIndex((h) => keywords.some((kw) => h.includes(kw.replace(/\s/g, ''))));
    if (idx >= 0) result[field] = idx;
  }
  return result;
}

/**
 * 셀 값 → 숫자 (콤마/공백 제거).
 * 빈 값/parse 실패 → undefined.
 */
export function cellToNumber(v: unknown): number | undefined {
  if (v == null || v === '') return undefined;
  if (typeof v === 'number') return v;
  const n = Number(String(v).replace(/[,\s원]/g, ''));
  return isNaN(n) ? undefined : n;
}

/**
 * 셀 값 → 'YYYY-MM-DD HH:mm' 형식 문자열.
 * - Excel serial date number 자동 변환
 * - 'YYYY.MM.DD' / 'YYYY/MM/DD' / 'YYYY-MM-DD' → 'YYYY-MM-DD' 정규화
 * - 시간 부분 있으면 HH:mm 까지
 */
export function cellToDateTime(v: unknown): string {
  if (v == null || v === '') return '';
  // Excel serial date (1900-01-01 기준 일수)
  if (typeof v === 'number') {
    const ms = (v - 25569) * 86400 * 1000;
    const d = new Date(ms);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 16).replace('T', ' ');
  }
  const s = String(v).trim().replace(/[./]/g, '-');
  // YYYY-MM-DD 또는 YYYY-MM-DD HH:mm 또는 YYYY-M-D
  const m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})(?:[\sT](\d{1,2}):(\d{1,2}))?/);
  if (m) {
    const [, y, mo, d, h, mi] = m;
    const date = `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
    return h && mi ? `${date} ${h.padStart(2, '0')}:${mi.padStart(2, '0')}` : date;
  }
  return s;
}

export function cellToString(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}
