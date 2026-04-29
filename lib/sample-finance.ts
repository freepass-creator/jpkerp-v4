/* 재무관리 — 각 sub-tab 데이터 타입. 실데이터는 사용자 입력으로 채움. 샘플 없음. */

export type LedgerMethod = '자동이체' | '카드' | '인터넷뱅킹' | '현금' | '무통장' | '기타';

/** 계정과목 — 자금일보에서 입출 분류 (수납/지출 모듈로 자동 라우팅) */
export const RECEIPT_SUBJECTS = ['대여료', '면책금', '위약금', '보증금환급', '기타수납'] as const;
export const EXPENSE_SUBJECTS = ['정비', '보험료', '할부', '주유', '통행료', '식대', '카드대금', '세금', '수수료', '기타지출'] as const;
export const INTERNAL_SUBJECTS = ['계좌이체', '환불', '미분류'] as const;

export type AccountSubject =
  | (typeof RECEIPT_SUBJECTS)[number]
  | (typeof EXPENSE_SUBJECTS)[number]
  | (typeof INTERNAL_SUBJECTS)[number];

export const ALL_SUBJECTS: AccountSubject[] = [
  ...RECEIPT_SUBJECTS,
  ...EXPENSE_SUBJECTS,
  ...INTERNAL_SUBJECTS,
];

export type LedgerEntry = {
  id: string;
  companyCode: string;
  /** 계좌 (은행 + 번호). 미지정 시 빈 문자열/undefined — 나중에 batch 단위로 매칭 가능. */
  account?: string;
  txDate: string;           // 거래일시 'YYYY-MM-DD HH:mm'
  deposit?: number;
  withdraw?: number;
  balance: number;
  memo: string;             // 적요
  counterparty?: string;    // 상대 계좌·예금주
  method: LedgerMethod;
  subject?: AccountSubject; // 계정과목 (분류)
  matchedContract?: string; // 매칭 계약
  note?: string;
  /** 업로드 시각 (ISO). 같은 batch 식별용 — 계좌 미지정 entry 일괄 갱신에 사용. */
  uploadedAt?: string;
  /** 중복 검출 signature. {accountDigits|date|direction|amount|balance|counterparty} */
  txKey?: string;
};

export const SAMPLE_LEDGER: LedgerEntry[] = [];

export type Autopay = {
  id: string;
  companyCode: string;
  fromAccount: string;
  regNo: string;             // 등록번호 (CMS-NNN)
  partner: string;
  category: string;
  monthlyAmount: number;
  payDay: number;            // 매월 N일
  startDate: string;
  nextDate: string;
  endDate?: string;
  status: '활성' | '중지';
  note?: string;
};

export const SAMPLE_AUTOPAY: Autopay[] = [];

export type CardUsage = {
  id: string;
  companyCode: string;
  cardName: string;          // 카드 별칭
  approvalNo: string;
  txDate: string;            // 승인일시
  merchant: string;
  category: string;
  amount: number;
  installment: number;       // 0=일시불, N=N개월 할부
  payDate: string;
  matchedPlate?: string;
  matchedContract?: string;
  note?: string;
};

export const SAMPLE_CARD: CardUsage[] = [];

export type Expense = {
  id: string;
  companyCode: string;
  plate?: string;
  expenseNo: string;         // EX-NNNN
  occurDate: string;
  partner: string;
  category: string;          // 정비/보험/할부/주유/세금/기타
  memo: string;
  supplyAmount: number;      // 공급가액
  vat: number;               // 부가세
  total: number;
  payMethod: string;
  taxbillNo?: string;
  status: '확정' | '대기';
};

export const SAMPLE_EXPENSE: Expense[] = [];

export type Taxbill = {
  id: string;
  companyCode: string;
  view: '매출' | '매입';
  partner: string;           // 매출=공급받는자, 매입=공급자
  approvalNo: string;
  writeDate: string;         // 작성일
  issueDate: string;         // 발급일
  item: string;
  supplyAmount: number;
  vat: number;
  total: number;
  matchedTx?: string;        // 결제 매칭
  status: '발급' | '전송' | '예정';
  note?: string;
};

export const SAMPLE_TAXBILL: Taxbill[] = [];
