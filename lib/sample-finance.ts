/* 재무관리 — 각 sub-tab sample 데이터 */

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
  account: string;          // 계좌 (은행 + 번호)
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
};

export const SAMPLE_LEDGER: LedgerEntry[] = [
  {
    id: 'l-001', companyCode: 'CP01', account: '신한 110-123-456789',
    txDate: '2026-04-21 09:32', deposit: 500000, balance: 23_500_000,
    memo: '홍길동님 4월 임대료', counterparty: '홍길동 / 신한 222-333',
    method: '인터넷뱅킹', subject: '대여료', matchedContract: 'C-2024-001',
  },
  {
    id: 'l-002', companyCode: 'CP01', account: '신한 110-123-456789',
    txDate: '2026-04-20 14:00', withdraw: 320000, balance: 23_000_000,
    memo: '카드대금 결제', counterparty: '신한카드',
    method: '자동이체', subject: '카드대금',
  },
  {
    id: 'l-003', companyCode: 'CP02', account: 'KB 222-987-654321',
    txDate: '2026-04-19 11:15', deposit: 380000, balance: 18_400_000,
    memo: '김영희 4월 임대료', counterparty: '김영희',
    method: '인터넷뱅킹', subject: '대여료', matchedContract: 'C-2025-001',
  },
  {
    id: 'l-004', companyCode: 'CP02', account: 'KB 222-987-654321',
    txDate: '2026-04-18 16:42', withdraw: 110000, balance: 18_020_000,
    memo: '정비비 — 34나5678 엔진오일', counterparty: '카프로 정비',
    method: '카드', subject: '정비',
  },
  {
    id: 'l-005', companyCode: 'CP02', account: 'KB 222-987-654321',
    txDate: '2026-04-15 10:00', withdraw: 850000, balance: 18_130_000,
    memo: 'DB손해보험 자동차보험', counterparty: 'DB손해보험',
    method: '자동이체', subject: '보험료',
  },
  {
    id: 'l-006', companyCode: 'CP01', account: '신한 110-123-456789',
    txDate: '2026-04-10 11:00', deposit: 300000, balance: 23_820_000,
    memo: '홍길동 단독사고 면책금 입금', counterparty: '홍길동',
    method: '인터넷뱅킹', subject: '면책금', matchedContract: 'C-2024-001',
  },
  {
    id: 'l-007', companyCode: 'CP02', account: 'KB 222-987-654321',
    txDate: '2026-04-08 14:25', deposit: 700000, balance: 18_980_000,
    memo: '中途해지 위약금 — 박철수', counterparty: '박철수',
    method: '인터넷뱅킹', subject: '위약금', matchedContract: 'C-2025-002',
  },
  {
    id: 'l-008', companyCode: 'CP02', account: 'KB 222-987-654321',
    txDate: '2026-04-05 09:00', withdraw: 380000, balance: 18_280_000,
    memo: '현대캐피탈 할부원리금', counterparty: '현대캐피탈',
    method: '자동이체', subject: '할부',
  },
];

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

export const SAMPLE_AUTOPAY: Autopay[] = [
  {
    id: 'ap-001', companyCode: 'CP01', fromAccount: '신한 110-123-456789',
    regNo: 'CMS-001', partner: 'DB손해보험', category: '보험료',
    monthlyAmount: 850000, payDay: 15, startDate: '2024-04-15',
    nextDate: '2026-05-15', status: '활성',
  },
  {
    id: 'ap-002', companyCode: 'CP02', fromAccount: 'KB 222-987-654321',
    regNo: 'CMS-002', partner: '현대캐피탈', category: '할부',
    monthlyAmount: 380000, payDay: 5, startDate: '2025-01-05',
    nextDate: '2026-05-05', status: '활성',
  },
  {
    id: 'ap-003', companyCode: 'CP01', fromAccount: '신한 110-123-456789',
    regNo: 'CMS-003', partner: '신한카드', category: '카드대금',
    monthlyAmount: 320000, payDay: 20, startDate: '2024-01-20',
    nextDate: '2026-05-20', status: '활성',
  },
];

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

export const SAMPLE_CARD: CardUsage[] = [
  {
    id: 'cd-001', companyCode: 'CP02', cardName: '법인 신한 ****-1234',
    approvalNo: '40123456', txDate: '2026-04-18 16:42',
    merchant: '카프로 정비', category: '정비',
    amount: 110000, installment: 0, payDate: '2026-05-20',
    matchedPlate: '34나5678',
  },
  {
    id: 'cd-002', companyCode: 'CP01', cardName: '법인 KB ****-5678',
    approvalNo: '40123457', txDate: '2026-04-17 11:08',
    merchant: 'GS칼텍스 김포', category: '주유',
    amount: 78000, installment: 0, payDate: '2026-05-15',
    matchedPlate: '01도9893',
  },
  {
    id: 'cd-003', companyCode: 'CP01', cardName: '법인 신한 ****-1234',
    approvalNo: '40123458', txDate: '2026-04-15 09:30',
    merchant: '하이패스', category: '통행료',
    amount: 12500, installment: 0, payDate: '2026-05-20',
  },
];

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

export const SAMPLE_EXPENSE: Expense[] = [
  {
    id: 'ex-001', companyCode: 'CP02', plate: '34나5678',
    expenseNo: 'EX-2026-0001', occurDate: '2026-04-18',
    partner: '카프로 정비', category: '정비', memo: '엔진오일+에어필터',
    supplyAmount: 100000, vat: 10000, total: 110000,
    payMethod: '카드', taxbillNo: 'TB-2026-0042', status: '확정',
  },
  {
    id: 'ex-002', companyCode: 'CP01', plate: '01도9893',
    expenseNo: 'EX-2026-0002', occurDate: '2026-04-17',
    partner: 'GS칼텍스 김포', category: '주유', memo: '디젤 35L',
    supplyAmount: 70909, vat: 7091, total: 78000,
    payMethod: '카드', status: '확정',
  },
  {
    id: 'ex-003', companyCode: 'CP01',
    expenseNo: 'EX-2026-0003', occurDate: '2026-04-15',
    partner: 'DB손해보험', category: '보험', memo: '4월분 자동차보험료',
    supplyAmount: 850000, vat: 0, total: 850000,
    payMethod: '자동이체', status: '확정',
  },
];

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

export const SAMPLE_TAXBILL: Taxbill[] = [
  {
    id: 'tb-001', companyCode: 'CP01', view: '매출',
    partner: '홍길동(개인)', approvalNo: '202604210001',
    writeDate: '2026-04-21', issueDate: '2026-04-21',
    item: '4월분 임대료', supplyAmount: 454545, vat: 45455, total: 500000,
    matchedTx: 'l-001', status: '발급',
  },
  {
    id: 'tb-002', companyCode: 'CP02', view: '매입',
    partner: '카프로 정비', approvalNo: '202604180042',
    writeDate: '2026-04-18', issueDate: '2026-04-18',
    item: '엔진오일 교환', supplyAmount: 100000, vat: 10000, total: 110000,
    matchedTx: 'l-004', status: '발급',
  },
  {
    id: 'tb-003', companyCode: 'CP02', view: '매출',
    partner: '동방주식회사', approvalNo: '202604190017',
    writeDate: '2026-04-19', issueDate: '2026-04-19',
    item: '4월분 임대료', supplyAmount: 345455, vat: 34545, total: 380000,
    matchedTx: 'l-003', status: '발급',
  },
];
