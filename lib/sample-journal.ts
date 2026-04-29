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

/** 실데이터는 사용자가 입력. 샘플 없음. */
export const SAMPLE_JOURNAL: JournalEntry[] = [];
