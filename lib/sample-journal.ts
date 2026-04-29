/**
 * 업무일지 카테고리 — v3 input/operation/op-types.ts 기반.
 * 9종 운영 + 기타. 모두 입력 작업장(목록이 아님). 카테고리별 입력 폼이 다름.
 */

export type JournalKind =
  | 'ioc'              // 입출고센터 — 출고·반납·회수·이동
  | 'pc'               // 차량케어센터 — 정비·사고수리·세차·상품화
  | 'contact'          // 고객센터 — 통화·방문·문자
  | 'accident'         // 사고접수
  | 'ignition'         // 시동제어
  | 'insurance'        // 보험관리
  | 'product_register' // 상품등록
  | 'penalty_notice'   // 과태료작업
  | 'disposal'         // 자산처분
  | 'etc';             // 기타

export const JOURNAL_KINDS: JournalKind[] = [
  'contact', 'ioc', 'pc', 'accident', 'ignition',
  'insurance', 'product_register', 'penalty_notice', 'disposal', 'etc',
];

export const KIND_LABEL: Record<JournalKind, string> = {
  ioc: '입출고',
  pc: '차량수선',
  contact: '고객응대',
  accident: '사고접수',
  ignition: '시동제어',
  insurance: '보험배서',
  product_register: '상품등록',
  penalty_notice: '과태료작업',
  disposal: '자산처분',
  etc: '기타',
};

export const KIND_HINT: Record<JournalKind, string> = {
  ioc: '출고·반납·회수·이동',
  pc: '정비·사고수리·세차·상품화',
  contact: '통화·방문·문자',
  accident: '사고 발생/보험접수',
  ignition: '시동 잠금·해제·회수',
  insurance: '신규·갱신·해지·연령변경',
  product_register: '휴차 → 상품대기',
  penalty_notice: '과태료 OCR·확인서',
  disposal: '매각·폐차·반환·전손',
  etc: '위 카테고리 외',
};

/** 업무일지 단건 — kind 에 따라 다른 필드 (data) */
export type JournalEntry = {
  id: string;
  no: string;
  companyCode: string;
  kind: JournalKind;
  at: string;          // YYYY-MM-DD HH:mm
  staff: string;
  data: Record<string, string>;
};

export const SAMPLE_JOURNAL: JournalEntry[] = [];
