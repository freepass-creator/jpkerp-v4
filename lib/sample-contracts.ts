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

export type Contract = {
  id: string;
  companyCode: string;
  contractNo: string;       // 계약번호
  plate: string;            // 차량번호
  customerName: string;     // 고객명
  customerPhone?: string;
  customerKind?: '개인' | '사업자';
  startDate: string;
  endDate: string;
  monthlyAmount: number;
  deposit?: number;
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

export const SAMPLE_CONTRACTS: Contract[] = [
  {
    id: 'c-001',
    companyCode: 'CP01',
    contractNo: 'C-2024-001',
    plate: '01도9893',
    customerName: '홍길동',
    customerPhone: '010-1234-5678',
    customerKind: '개인',
    startDate: '2024-04-01',
    endDate: '2027-03-31',
    monthlyAmount: 500000,
    deposit: 1000000,
    status: '운행중',
    events: [
      ...makeReceiptEvents('2024-04-01', 36, 500000, 24), // 24/36 수납완료
      { id: 'i-001-1', type: '검사', dueDate: '2026-08-20', status: '예정', note: '정기검사 (등록증 만기)' },
      { id: 'm-001-1', type: '정비', dueDate: '2026-04-25', doneDate: '2026-04-25', status: '완료', note: '엔진오일 교환' },
      { id: 'm-001-2', type: '정비', dueDate: '2026-10-25', status: '예정', note: '6개월 점검' },
      { id: 'b-001-1', type: '보험', dueDate: '2027-03-31', status: '예정', note: '만기 갱신 필요' },
      { id: 'rt-001-1', type: '반납', dueDate: '2027-03-31', status: '예정', note: '계약 만기 반납' },
    ],
  },
  {
    id: 'c-002',
    companyCode: 'CP02',
    contractNo: 'C-2025-001',
    plate: '34나5678',
    customerName: '김영희',
    customerPhone: '010-9876-5432',
    customerKind: '사업자',
    startDate: '2025-01-15',
    endDate: '2027-01-14',
    monthlyAmount: 380000,
    deposit: 800000,
    status: '운행중',
    events: [
      ...makeReceiptEvents('2025-01-15', 24, 380000, 14),
      { id: 'i-002-1', type: '검사', dueDate: '2026-12-31', status: '예정' },
      { id: 'm-002-1', type: '정비', dueDate: '2026-07-15', status: '예정', note: '12개월 점검' },
      { id: 'rt-002-1', type: '반납', dueDate: '2027-01-14', status: '예정' },
    ],
  },
  {
    id: 'c-003',
    companyCode: 'CP02',
    contractNo: 'C-2025-002',
    plate: '56다7890',
    customerName: '박철수',
    customerPhone: '010-2222-3333',
    customerKind: '개인',
    startDate: '2025-09-01',
    endDate: '2028-08-31',
    monthlyAmount: 750000,
    deposit: 1500000,
    status: '운행중',
    events: [
      ...makeReceiptEvents('2025-09-01', 36, 750000, 7), // 미수 1회 발생
      { id: 'i-003-1', type: '검사', dueDate: '2027-08-31', status: '예정' },
      { id: 'rt-003-1', type: '반납', dueDate: '2028-08-31', status: '예정' },
    ],
  },
];

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
