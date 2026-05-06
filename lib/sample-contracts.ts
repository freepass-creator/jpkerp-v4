import type { AuditFields } from './audit-fields';

export type ContractStatus = '운행중' | '대기' | '만기' | '해지';
export type ScheduleType = '출고' | '수납' | '엔진오일' | '검사' | '정비' | '보험' | '반납' | '기타';
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
  contractNo: string;            // 계약번호 (CTYYMMDD####)
  customerCode?: string;         // 고객코드 FK (CP01CU0001) — 등록 시 자동 매칭/발급
  plate: string;                 // 차량번호
  customerName: string;          // 고객명 (denormalized — 빠른 표시 + 계약 시점 스냅샷)
  customerKind: CustomerKind;    // 신분 — 등록번호 형식 결정
  customerIdent: string;         // 고객등록번호 (주민/사업자/법인등록번호)
  customerPhone: string;         // 연락처 (미납·만기 통지용)
  customerLicenseNo?: string;    // 임차인 운전면허번호 (마스킹 노출용)
  customerEmail?: string;        // 임차인 이메일
  customerAddress?: string;      // 임차인 실거주지
  emergencyPhone?: string;       // 비상연락처
  emergencyRelation?: string;    // 비상연락처 관계 (부/모/배우자/자녀 등)

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
  /** 입금계좌 은행 */
  paymentBank?: string;
  /** 입금계좌번호 */
  paymentAccount?: string;
  /** 입금계좌 예금주 (보통 회사명) */
  paymentHolder?: string;
  /** 자동이체 출금 은행 (고객측) */
  autoDebitBank?: string;
  /** 자동이체 출금 계좌번호 */
  autoDebitAccount?: string;
  /** 자동이체 예금주 */
  autoDebitHolder?: string;

  /* ── 정비 / 서비스 ── */
  /** 정비상품 — 정비제외 / 엔진오일 연1회 / 종합 등 자유 텍스트 */
  maintenanceProduct?: string;
  /** 엔진오일 서비스 가입 — 매년 1회 자동 일정 생성 */
  engineOilService?: boolean;
  /** 검사대행 서비스 가입 — 정기/종합검사 회사 대행 */
  inspectionService?: boolean;

  /* ── 보험 (계약서에 명시된 정보, asset/insurance 와 별개) ── */
  /** 보험사 명 (예: DB손해보험) */
  insurer?: string;
  /** 자차 면책금 최소 (만원). 사고 1건당 고객 부담 최소액 */
  deductibleMin?: number;
  /** 자차 면책금 최대 (만원) */
  deductibleMax?: number;
  /** 자차 면책 계산식 — 사고처리비 비율 (예: 0.2 = 20%) */
  deductibleRate?: number;

  /* ── 주행거리 초과 부과 ── */
  /** 약정 초과 시 km당 부과 (국산차) */
  excessMileageFeeKr?: number;
  /** 약정 초과 시 km당 부과 (수입차) */
  excessMileageFeeForeign?: number;
  /** 인수 시점 주행거리 (km) — 계약서 시점 기준 */
  initialMileageKm?: number;

  /* ── 승계 (양도/양수 케이스) ── */
  /** 승계 (양도인) 이름 — 이전 계약자 */
  predecessorName?: string;
  /** 승계 (양도인) 연락처 */
  predecessorPhone?: string;
  /** 승계 일자 */
  succeededAt?: string;

  /* ── 인수 옵션 ── */
  /** 만기 인수가격 — '만기협의' 또는 숫자 또는 미설정 */
  purchaseOptionAmount?: string;

  /* ── 특약 ── */
  /** 특약사항 (자유 텍스트, 다중 줄 허용) */
  specialTerms?: string;

  /* ── 계약서 사본 ── */
  /** 계약서 PDF/이미지 dataUrl (손님 페이지에서 다운로드). 모든 entity 공통 키. */
  fileDataUrl?: string;
  fileName?: string;

  /** 소프트 삭제 — 코드 영구 보존 (재발급 금지). */
  deletedAt?: string;  // ISO 시각. 미설정이면 active.
} & AuditFields;

/**
 * 계약 등록 시 자동 생성되는 계약 단위 events.
 *
 *  · 출고      — startDate (차량 인도)
 *  · 수납      — autopayDay 기준 (없으면 startDate 일자) 매월
 *  · 엔진오일  — engineOilService=true 인 경우 startDate + 12·24·... 개월
 *  · 반납      — endDate (차량 회수·검수)
 *
 * 자산 단위 일정 (정기검사·자동차세·보험만기 등) 은 별도 — asset/insurance store 가 도출.
 *
 * 잘못된 날짜·만기 < 시작 → 빈 배열.
 */
type ScheduleOptions = {
  /** 자동이체일 (1~31). 미지정이면 startDate 의 일(day) 사용. */
  autopayDay?: number;
  /** 엔진오일 서비스 가입 여부. true 면 매년 1회 events 추가. */
  engineOilService?: boolean;
};

export function generateContractSchedule(
  startDate: string,
  endDate: string,
  monthlyAmount: number,
  opts: ScheduleOptions = {},
): ScheduleEvent[] {
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return [];
  if (end < start) return [];

  const events: ScheduleEvent[] = [];

  // 0번: 출고 — 계약 시작일에 차량 인도
  events.push({
    id: `d-${startDate}`,
    type: '출고',
    dueDate: startDate,
    status: '예정',
    note: '차량 인도 — 외관/주행거리/연료 점검 + 키 전달 후 완료 처리',
  });

  // 수납 — autopayDay 기준 (지정 안 됐으면 startDate 일자)
  const payDay = opts.autopayDay && opts.autopayDay >= 1 && opts.autopayDay <= 31
    ? opts.autopayDay
    : start.getDate();

  // 첫 자동이체 일자 — 출고 다음 도래하는 payDay
  let cursor = new Date(start.getFullYear(), start.getMonth(), payDay);
  if (cursor < start) {
    // payDay 가 출고일보다 이번 달에 이미 지났으면 다음 달부터
    cursor = new Date(start.getFullYear(), start.getMonth() + 1, payDay);
  }
  let cycle = 1;
  while (cursor <= end) {
    const dueStr = ymd(cursor);
    events.push({
      id: `r-${startDate}-${cycle}`,
      type: '수납',
      cycle,
      dueDate: dueStr,
      amount: monthlyAmount,
      status: '예정',
    });
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, payDay);
    cycle++;
  }

  // 엔진오일 — 가입 시 매 12개월
  if (opts.engineOilService) {
    let oilCursor = new Date(start.getFullYear() + 1, start.getMonth(), start.getDate());
    let oilCycle = 1;
    while (oilCursor <= end) {
      events.push({
        id: `eo-${startDate}-${oilCycle}`,
        type: '엔진오일',
        cycle: oilCycle,
        dueDate: ymd(oilCursor),
        status: '예정',
        note: `엔진오일 ${oilCycle}년차 — 지정 정비점 또는 제조사 공식 공업사 내방`,
      });
      oilCursor = new Date(oilCursor.getFullYear() + 1, oilCursor.getMonth(), oilCursor.getDate());
      oilCycle++;
    }
  }

  // 반납 — 만기일
  events.push({
    id: `rt-${endDate}`,
    type: '반납',
    dueDate: endDate,
    status: '예정',
    note: '차량 반납 — 외관/주행거리/연료/손상 점검 후 보증금 정산',
  });

  // 시간순 정렬 — 같은 일자면 출고/수납/엔진오일/반납 순
  const TYPE_ORDER: Record<ScheduleType, number> = { 출고: 0, 수납: 1, 엔진오일: 2, 검사: 3, 정비: 4, 보험: 5, 기타: 6, 반납: 7 };
  events.sort((a, b) => {
    const d = a.dueDate.localeCompare(b.dueDate);
    if (d !== 0) return d;
    return (TYPE_ORDER[a.type] ?? 99) - (TYPE_ORDER[b.type] ?? 99);
  });
  return events;
}

/** Date → 'YYYY-MM-DD' 로컬 시각 기반 (UTC 변환 X). */
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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

/** active 계약만 (UI 드롭다운·신규 매칭용). */
export function activeContracts(contracts: readonly Contract[]): Contract[] {
  return contracts.filter((c) => !c.deletedAt);
}
