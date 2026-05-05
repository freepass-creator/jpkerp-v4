import type { AuditFields } from './audit-fields';

export type ContractStatus = '운행중' | '대기' | '만기' | '해지';
export type ScheduleType = '출고' | '수납' | '검사' | '정비' | '보험' | '반납' | '기타';
export type ScheduleStatus = '예정' | '완료' | '지연' | '취소';

export type ScheduleEvent = {
  id: string;
  type: ScheduleType;
  cycle?: number;       // 회차 (수납만 의미)
  dueDate: string;      // 예정일
  doneDate?: string;    // 실시일
  amount?: number;      // 금액 (수납만)
  status: ScheduleStatus;
  note?: string;
};

export type CustomerKind = '개인' | '사업자' | '법인';

/** 추가 운전자 — 본 임차인 외에 운전 가능한 사람. */
export type AdditionalDriver = {
  name: string;
  relation?: string;       // 본인과의 관계 — 배우자 / 자녀 / 직원 등
  phone?: string;
  licenseNo?: string;      // 운전면허번호 (마스킹해서 노출)
  birthDate?: string;      // YYYY-MM-DD — 연령 제한 검증용
};

export type Contract = {
  id: string;
  companyCode: string;
  contractNo: string;            // 계약번호 (C-YYYY-NNNN)
  plate: string;                 // 차량번호
  customerName: string;          // 고객명
  customerKind: CustomerKind;    // 신분 — 등록번호 형식 결정
  customerIdent: string;         // 고객등록번호 (주민/사업자/법인등록번호)
  customerPhone: string;         // 연락처 (미납·만기 통지용)
  customerLicenseNo?: string;    // 임차인 운전면허번호 (마스킹 노출용)
  customerEmail?: string;        // 임차인 이메일

  startDate: string;             // 계약 시작일
  endDate: string;               // 만기일
  monthlyAmount: number;         // 월 대여료
  deposit: number;               // 보증금 (없으면 0)
  status: ContractStatus;
  events: ScheduleEvent[];

  /* ── 운전 조건 ── */
  /** 운전자 범위 — 누구나운전 / 가족한정 / 임직원한정 / 1인지정 등 */
  driverScope?: string;
  /** 연령 제한 — 예: 만 26세 이상 / 만 21세 이상 */
  driverAgeLimit?: string;
  /** 추가 운전자 명단 (본 임차인 제외) */
  additionalDrivers?: AdditionalDriver[];
  /** 연간 주행거리 한도 (km). 0 또는 미설정이면 무제한. */
  mileageLimitKm?: number;

  /* ── 인도 / 반납 ── */
  /** 차량 인도 장소 */
  deliveryAddress?: string;
  /** 차량 반납 장소 (보통 인도 장소와 동일하나 다를 수 있음) */
  returnAddress?: string;

  /* ── 결제 ── */
  /** 결제 방법 — 자동이체 / 계좌이체 / 카드 / 현금 등 */
  paymentMethod?: string;
  /** 매월 결제일 (1-31) — 자동이체/정기결제 일자 */
  paymentDay?: number;

  /* ── 특약 ── */
  /** 특약사항 (자유 텍스트, 다중 줄 허용) */
  specialTerms?: string;

  /* ── 계약서 사본 ── */
  /** 계약서 PDF/이미지 dataUrl (손님 페이지에서 다운로드). asset.documentImageUrl, insurance.fileDataUrl 와 동일 패턴. */
  fileDataUrl?: string;
  fileName?: string;

  /** 소프트 삭제 — 코드 영구 보존 (재발급 금지). */
  deletedAt?: string;  // ISO 시각. 미설정이면 active.
} & AuditFields;

/**
 * 계약 등록 시 자동 생성되는 계약 단위 events — 출고·수납·반납만.
 *
 * 자산 단위 일정 (검사·자동차세·보험만기 등) 은 자산/보험 store 에서
 * 별도로 추적 — /pending/inspection, /pending/tax, /pending/insurance 가 직접 도출.
 *
 *  · 출고  — startDate (차량 인도)
 *  · 수납  — startDate ~ endDate 매월 시작일 같은 일자
 *  · 반납  — endDate (차량 회수·검수)
 *
 *  잘못된 날짜·만기 < 시작 → 빈 배열.
 */
export function generateContractSchedule(
  startDate: string,
  endDate: string,
  monthlyAmount: number,
): ScheduleEvent[] {
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return [];
  if (end < start) return [];

  const events: ScheduleEvent[] = [];

  // 0번: 출고 — 계약 시작일에 차량 인도.
  events.push({
    id: `d-${startDate}`,
    type: '출고',
    dueDate: startDate,
    status: '예정',
    note: '차량 인도 — 외관/주행거리/연료 점검 + 키 전달 후 완료 처리',
  });

  // 수납 — 매월 startDate 일자
  const dayOfMonth = start.getDate();
  let cycle = 1;
  let cursor = new Date(start.getFullYear(), start.getMonth(), dayOfMonth);

  while (cursor <= end) {
    const dueStr = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
    events.push({
      id: `r-${startDate}-${cycle}`,
      type: '수납',
      cycle,
      dueDate: dueStr,
      amount: monthlyAmount,
      status: '예정',
    });
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, dayOfMonth);
    cycle++;
  }

  // 반납 — 만기일에 차량 회수·검수
  events.push({
    id: `rt-${endDate}`,
    type: '반납',
    dueDate: endDate,
    status: '예정',
    note: '차량 반납 — 외관/주행거리/연료/손상 점검 후 보증금 정산',
  });

  // 시간순 정렬
  events.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return events;
}

/** 실데이터는 사용자가 입력. 샘플 없음. */
export const SAMPLE_CONTRACTS: Contract[] = [];

/* 계약별 이행 요약 — Master 그리드용 */
export type ContractSummary = {
  contract: Contract;
  totalEvents: number;
  doneEvents: number;
  pendingEvents: number;
  delayedEvents: number;
  receiptDone: number;        // 완료 회차
  receiptTotal: number;       // 총 회차
  receiptOverdue: number;     // 미납 회차
  inspectionDone: boolean;
  maintenanceDone: number;
  maintenanceTotal: number;
  nextEvent?: ScheduleEvent;  // 가장 가까운 예정 이벤트
};

export function summarizeContract(c: Contract): ContractSummary {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let totalEvents = c.events.length;
  let doneEvents = 0;
  let delayedEvents = 0;
  let receiptDone = 0;
  let receiptTotal = 0;
  let receiptOverdue = 0;
  let inspectionDoneAny = false;
  let inspectionExists = false;
  let maintenanceDone = 0;
  let maintenanceTotal = 0;
  let nextEvent: ScheduleEvent | undefined;
  let nextEventDays = Infinity;

  for (const e of c.events) {
    if (e.status === '완료') doneEvents++;
    if (e.status === '지연') delayedEvents++;

    if (e.type === '수납') {
      receiptTotal++;
      if (e.status === '완료') receiptDone++;
      else {
        const due = new Date(e.dueDate);
        if (due < today) receiptOverdue++;
      }
    }
    if (e.type === '검사') {
      inspectionExists = true;
      if (e.status === '완료') inspectionDoneAny = true;
    }
    if (e.type === '정비') {
      maintenanceTotal++;
      if (e.status === '완료') maintenanceDone++;
    }

    if (e.status === '예정') {
      const days = (new Date(e.dueDate).getTime() - today.getTime()) / 86400000;
      if (days >= 0 && days < nextEventDays) {
        nextEventDays = days;
        nextEvent = e;
      }
    }
  }

  return {
    contract: c,
    totalEvents,
    doneEvents,
    pendingEvents: totalEvents - doneEvents - delayedEvents,
    delayedEvents,
    receiptDone,
    receiptTotal,
    receiptOverdue,
    inspectionDone: inspectionExists ? inspectionDoneAny : false,
    maintenanceDone,
    maintenanceTotal,
    nextEvent,
  };
}
