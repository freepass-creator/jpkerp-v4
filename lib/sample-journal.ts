export type JournalKind = '고객응대' | '차량입출고' | '사고접수' | '차량수선' | '보험접수' | '검사실시' | '청구수납' | '계약체결' | '과태료' | '기타';

export const JOURNAL_KINDS: JournalKind[] = [
  '고객응대',
  '차량입출고',
  '사고접수',
  '차량수선',
  '보험접수',
  '검사실시',
  '청구수납',
  '계약체결',
  '과태료',
  '기타',
];

export type JournalEntry = {
  id: string;
  no: string;             // 일지번호 (J-YYYY-NNNN)
  companyCode: string;
  plate?: string;         // 관련 차량 (있을 때)
  contractNo?: string;    // 관련 계약
  kind: JournalKind;
  at: string;             // 일시 (YYYY-MM-DD HH:mm)
  staff: string;          // 담당자
  customer?: string;      // 고객명 (응대 시)
  memo: string;           // 본문
};

export const SAMPLE_JOURNAL: JournalEntry[] = [
  {
    id: 'j-001',
    no: 'J-2026-0125',
    companyCode: 'CP01',
    plate: '01도9893',
    contractNo: 'C-2024-001',
    kind: '청구수납',
    at: '2026-04-21 14:32',
    staff: '담당자',
    customer: '홍길동',
    memo: '4월분 청구 50만원 입금 확인',
  },
  {
    id: 'j-002',
    no: 'J-2026-0124',
    companyCode: 'CP02',
    plate: '34나5678',
    kind: '차량수선',
    at: '2026-04-20 10:15',
    staff: '담당자',
    memo: '엔진오일 + 에어필터 교환, 부품 8만원 + 공임 3만원',
  },
  {
    id: 'j-003',
    no: 'J-2026-0123',
    companyCode: 'CP02',
    plate: '56다7890',
    contractNo: 'C-2025-002',
    kind: '고객응대',
    at: '2026-04-19 16:08',
    staff: '담당자',
    customer: '박철수',
    memo: '청구 미납 안내 통화 — 다음주 수납 약속',
  },
  {
    id: 'j-004',
    no: 'J-2026-0122',
    companyCode: 'CP01',
    plate: '01도9893',
    kind: '차량입출고',
    at: '2026-04-18 09:00',
    staff: '담당자',
    memo: '정기점검 입고 → 익일 출고',
  },
];
