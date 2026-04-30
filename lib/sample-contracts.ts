export type ContractStatus = '운행중' | '대기' | '만기' | '해지';
export type ScheduleType = '수납' | '검사' | '정비' | '보험' | '반납' | '기타';
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

export type Contract = {
  id: string;
  companyCode: string;
  contractNo: string;            // 계약번호 (C-YYYY-NNNN)
  plate: string;                 // 차량번호
  customerName: string;          // 고객명
  customerKind: CustomerKind;    // 신분 — 등록번호 형식 결정
  customerIdent: string;         // 고객등록번호 (주민/사업자/법인등록번호)
  customerPhone: string;         // 연락처 (미납·만기 통지용)
  startDate: string;             // 계약 시작일
  endDate: string;               // 만기일
  monthlyAmount: number;         // 월 대여료
  deposit: number;               // 보증금 (없으면 0)
  status: ContractStatus;
  events: ScheduleEvent[];
};

/* 회차별 수납 이벤트 자동 생성 */
function makeReceiptEvents(start: string, months: number, amount: number, paidUpTo: number): ScheduleEvent[] {
  const events: ScheduleEvent[] = [];
  const [y, m, d] = start.split('-').map(Number);
  for (let i = 0; i < months; i++) {
    const due = new Date(y, m - 1 + i, d);
    const dueStr = due.toISOString().slice(0, 10);
    const cycle = i + 1;
    const isPaid = cycle <= paidUpTo;
    events.push({
      id: `r-${start}-${cycle}`,
      type: '수납',
      cycle,
      dueDate: dueStr,
      doneDate: isPaid ? dueStr : undefined,
      amount,
      status: isPaid ? '완료' : '예정',
    });
  }
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
