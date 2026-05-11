/**
 * contract-import.ts — 계약 엑셀 → Contract[] 일괄 등록.
 *
 * 양식은 자산·계좌내역과 동일 패턴:
 *   ① downloadTemplate 으로 헤더 + 예시 1행 다운로드
 *   ② 사용자 작성 후 업로드
 *   ③ detectHeaderRow + mapColumns 로 자동 매칭
 *   ④ 행마다 errors 수집 (회사코드/차량번호/금액/일자 검증)
 *
 * 계약번호는 비워두면 자동발급, 회사코드 누락 시 defaultCompanyCode fallback.
 */

import {
  readExcel,
  detectHeaderRow,
  mapColumns,
  cellToNumber,
  cellToDateTime,
  cellToString,
} from './excel-import';
import type { Contract, CustomerKind } from './sample-contracts';

export type ContractImportContext = {
  defaultCompanyCode: string;
};

export type ContractImportRow = {
  data: Partial<Contract>;
  errors: string[];
};

export type ContractImportResult = {
  rows: ContractImportRow[];
  total: number;
  skipped: number;
  detected: boolean;
};

const DETECT_KEYWORDS = ['차량번호', '임차인', '시작일', '계약', '월', '대여료'];

const COLUMN_MAP = {
  companyCode:        ['회사코드', '회사'],
  contractNo:         ['계약번호'],
  plate:              ['차량번호'],
  customerName:       ['임차인', '고객명', '성명'],
  customerKind:       ['신분', '구분'],
  customerIdent:      ['고객등록번호', '주민/사업자번호', '주민번호', '사업자번호'],
  customerPhone:      ['연락처', '전화'],
  customerLicenseNo:  ['면허번호', '운전면허번호'],
  customerEmail:      ['이메일'],
  customerAddress:    ['주소', '거주지'],
  emergencyPhone:     ['비상연락처'],
  emergencyRelation:  ['비상관계'],
  startDate:          ['시작일', '계약시작일'],
  endDate:            ['만기일', '종료일', '계약만기'],
  contractDate:       ['계약일'],
  monthlyAmount:      ['월대여료', '월이체액', '월 대여료'],
  deposit:            ['보증금'],
  advancePayment:     ['선수금'],
  driverScope:        ['운전자범위'],
  driverAgeLimit:     ['연령제한'],
  mileageLimitKm:     ['주행한도', '주행거리한도'],
  paymentMethod:      ['결제방법', '결제수단'],
  paymentDay:         ['결제일', '이체일'],
  /** 미수회차 — auto / all-paid / "3,5" / "5-" 같은 자유표기. events 자동생성 시 회차 상태 결정. */
  overdueCycles:      ['미수회차', '미납회차'],
  note:               ['비고', '메모'],
};

const PLATE_RE = /^\d{2,3}[가-힣]\d{4}$/;
const KIND_NORM: Record<string, CustomerKind> = {
  개인: '개인', 사업자: '사업자', 법인: '법인',
  '개인사업자': '사업자', '자영업': '사업자',
};

function rowsToContracts(rows: unknown[][], ctx: ContractImportContext): ContractImportResult {
  const headerIdx = detectHeaderRow(rows, DETECT_KEYWORDS, 3);
  if (headerIdx < 0) return { rows: [], total: 0, skipped: 0, detected: false };

  const headers = (rows[headerIdx] ?? []).map((c) => cellToString(c));
  const cols = mapColumns(headers, COLUMN_MAP);

  const out: ContractImportRow[] = [];
  let skipped = 0;

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const plate = cellToString(row[cols.plate]).trim().replace(/\s/g, '');
    const customerName = cellToString(row[cols.customerName]).trim();
    if (!plate && !customerName) { skipped++; continue; }   // 완전 빈 행

    const companyCode = cellToString(row[cols.companyCode]).trim() || ctx.defaultCompanyCode;
    const errors: string[] = [];
    if (!companyCode) errors.push('회사코드 누락');
    if (!plate) errors.push('차량번호 누락');
    else if (!PLATE_RE.test(plate)) errors.push(`차량번호 형식 오류: ${plate}`);
    if (!customerName) errors.push('임차인 누락');

    const kindRaw = cellToString(row[cols.customerKind]).trim();
    const customerKind: CustomerKind = KIND_NORM[kindRaw] ?? '개인';

    const startDate = cellToDateTime(row[cols.startDate])?.slice(0, 10) || '';
    const endDate   = cellToDateTime(row[cols.endDate])?.slice(0, 10) || '';
    if (!startDate) errors.push('시작일 누락');
    if (!endDate)   errors.push('만기일 누락');

    const monthlyAmount = cellToNumber(row[cols.monthlyAmount]) ?? 0;
    if (monthlyAmount <= 0) errors.push('월대여료 누락/0');

    const data: Partial<Contract> & { overdueCycles?: string } = {
      companyCode,
      contractNo: cellToString(row[cols.contractNo]).trim() || undefined,    // 비우면 자동발급
      plate,
      customerName,
      customerKind,
      customerIdent: cellToString(row[cols.customerIdent]).trim(),
      customerPhone: cellToString(row[cols.customerPhone]).trim(),
      customerLicenseNo: cellToString(row[cols.customerLicenseNo]).trim() || undefined,
      customerEmail: cellToString(row[cols.customerEmail]).trim() || undefined,
      customerAddress: cellToString(row[cols.customerAddress]).trim() || undefined,
      emergencyPhone: cellToString(row[cols.emergencyPhone]).trim() || undefined,
      emergencyRelation: cellToString(row[cols.emergencyRelation]).trim() || undefined,
      startDate,
      endDate,
      contractDate: cellToDateTime(row[cols.contractDate])?.slice(0, 10) || undefined,
      monthlyAmount,
      deposit: cellToNumber(row[cols.deposit]) ?? 0,
      advancePayment: cellToNumber(row[cols.advancePayment]) ?? undefined,
      driverScope: cellToString(row[cols.driverScope]).trim() || undefined,
      driverAgeLimit: cellToString(row[cols.driverAgeLimit]).trim() || undefined,
      mileageLimitKm: cellToNumber(row[cols.mileageLimitKm]) ?? undefined,
      paymentMethod: cellToString(row[cols.paymentMethod]).trim() || undefined,
      paymentDay: cellToNumber(row[cols.paymentDay]) ?? undefined,
      // 등록 시 page handleCreate → fromDraft 에서 buildEventsWithOverdue 호출 시 활용.
      overdueCycles: cellToString(row[cols.overdueCycles]).trim() || undefined,
      status: '운행중',
      events: [],
    };

    out.push({ data, errors });
  }

  return { rows: out, total: rows.length - headerIdx - 1, skipped, detected: true };
}

export async function parseContractExcel(file: File, ctx: ContractImportContext): Promise<ContractImportResult> {
  const { rows } = await readExcel(file);
  return rowsToContracts(rows, ctx);
}

/** 필수 입력 — 양식 헤더에 ` *` 접미 표시. */
export const CONTRACT_EXCEL_REQUIRED = [
  '회사코드',
  '차량번호',
  '임차인',
  '신분',
  '고객등록번호',
  '연락처',
  '시작일',
  '만기일',
  '월대여료',
  '보증금',
] as const;

/** 부가 입력 — 빈칸 허용. */
export const CONTRACT_EXCEL_OPTIONAL = [
  '계약번호',     // 비우면 자동발급
  '계약일',
  '선수금',
  '결제방법',
  '결제일',
  /**
   * 미수회차 — 수납 스케줄 생성 시 어느 회차를 「지연」으로 둘지.
   *   "all-paid" — 모든 도래 회차 완료
   *   "3,5"      — 3·5회차만 미수, 나머지 도래 완료
   *   "5-"       — 5회차부터 모두 미수
   *   비우면 auto — 도래 회차 완료, 미래 예정
   */
  '미수회차',
  '면허번호',
  '이메일',
  '주소',
  '비상연락처',
  '비상관계',
  '운전자범위',
  '연령제한',
  '주행한도',
  '비고',
] as const;

/** 양식에 들어가는 최종 헤더 — 필수에 ` *` 표시. mapColumns 는 `*` 무시. */
export const CONTRACT_EXCEL_HEADERS: string[] = [
  ...CONTRACT_EXCEL_REQUIRED.map((h) => `${h} *`),
  ...CONTRACT_EXCEL_OPTIONAL,
];
