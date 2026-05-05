import type { Contract } from './sample-contracts';
import type { Asset } from './sample-assets';
import type { InsurancePolicy } from './sample-insurance';
import type { Company } from './sample-companies';

/**
 * 손님 페이지 디자인 미리보기용 샘플 데이터.
 * 실제 RTDB 데이터와 무관 — /customer/sample 경로에서만 노출.
 *
 * 디자인 검토를 위해 모든 카드(Hero · D-day · 계약 · 수납 · 차량 · 다운로드 · 회사) 가
 * 자연스럽게 채워지도록 균형 있는 값 사용.
 */

const TODAY = new Date();
function ymd(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function addMonths(base: Date, n: number): Date {
  return new Date(base.getFullYear(), base.getMonth() + n, base.getDate());
}

const CONTRACT_START = addMonths(TODAY, -8);
const CONTRACT_END   = addMonths(TODAY, 4);

export const SAMPLE_CUSTOMER_CONTRACT: Contract = {
  id: 'sample-contract-1',
  companyCode: 'CP01',
  contractNo: 'C-2025-0042',
  plate: '12가3456',
  customerName: '박영협',
  customerKind: '개인',
  customerIdent: '8801011234567',
  customerPhone: '010-1234-5678',
  customerLicenseNo: '11-22-345678-90',
  customerEmail: 'younghyup@example.com',
  startDate: ymd(CONTRACT_START),
  endDate:   ymd(CONTRACT_END),
  monthlyAmount: 880_000,
  deposit: 1_000_000,
  status: '운행중',
  driverScope: '가족한정',
  driverAgeLimit: '만 26세 이상',
  additionalDrivers: [
    { name: '박지영', relation: '배우자', phone: '010-9876-5432', licenseNo: '11-22-987654-32', birthDate: '1990-03-15' },
    { name: '박서준', relation: '자녀',   phone: '010-1111-2222', birthDate: '2002-08-22' },
  ],
  mileageLimitKm: 30_000,
  deliveryAddress: '서울특별시 강남구 테헤란로 123, 5층 (jpk렌터카)',
  returnAddress:   '서울특별시 강남구 테헤란로 123, 5층 (jpk렌터카)',
  paymentMethod: '자동이체 (신한 110-***-456789)',
  paymentDay: 5,
  specialTerms: '・ 만기 1개월 전까지 연장 의사 미통보 시 자동 종료\n・ 사고 발생 시 즉시 통보 의무 (24시간 이내)\n・ 차량 외부 광고 부착 시 사전 승인 필요',
  fileDataUrl: 'data:application/pdf;base64,JVBERi0xLjQKJeL=',  // placeholder — 실제로는 업로드된 PDF dataUrl
  fileName: 'C-2025-0042-계약서.pdf',
  events: Array.from({ length: 12 }, (_, i) => {
    const due = addMonths(CONTRACT_START, i);
    const cycle = i + 1;
    const dueStr = ymd(due);
    const isPast = due < TODAY;
    return {
      id: `s-${cycle}`,
      type: '수납' as const,
      cycle,
      dueDate: dueStr,
      doneDate: isPast ? dueStr : undefined,
      amount: 880_000,
      status: isPast ? ('완료' as const) : ('예정' as const),
    };
  }),
};

export const SAMPLE_CUSTOMER_ASSET: Asset = {
  id: 'sample-asset-1',
  companyCode: 'CP01',
  assetCode: 'AS-CP01-042',
  documentNo: 'DOC-20250115-0042',
  firstRegistDate: '2024-08-21',
  certIssueDate: '2024-08-21',
  plate: '12가3456',
  vehicleClass: '승용자동차',
  usage: '대여용',
  vehicleName: '벤츠 E300',
  modelType: 'W214',
  manufactureDate: '2024-06',
  vin: 'WDDZF8KB9NA123456',
  engineType: 'M254 E20',
  ownerLocation: '서울특별시 강남구',
  ownerName: '주식회사 제이피케이렌터카',
  ownerRegNumber: '1234567890123',
  fuelType: '가솔린+전기',
  capacity: 5,
  displacement: 1991,
  status: '운행중',
};

export const SAMPLE_CUSTOMER_INSURANCE: InsurancePolicy = {
  id: 'sample-insurance-1',
  companyCode: 'CP01',
  insurer: 'DB손해보험',
  productName: '프로미카다이렉트업무용(베이직형)자동차보험',
  policyNo: 'DB-2025-0042-001',
  contractor: '주식회사 제이피케이렌터카',
  insured:    '주식회사 제이피케이렌터카',
  bizNo: '158-81-12345',
  startDate: ymd(addMonths(TODAY, -3)),
  endDate:   ymd(addMonths(TODAY, 9)),
  carNumber: '12가3456',
  carName: '벤츠 E300',
  carYear: 2024,
  driverScope: '누구나운전',
  driverAge: '만26세이상한정',
};

export const SAMPLE_CUSTOMER_COMPANY: Company = {
  code: 'CP01',
  name: '(주)제이피케이렌터카',
  ceo: '박영협',
  bizNo: '158-81-12345',
  corpNo: '110111-1234567',
  hqAddress: '서울특별시 강남구 테헤란로 123, 5층',
  bizType: '서비스',
  bizCategory: '자동차 임대업',
  phone: '02-1234-5678',
  email: 'help@jpkrental.kr',
  entityType: 'corporate',
  accounts: [
    { bank: '신한', accountNo: '110-123-456789', alias: '월대여료 입금' },
  ],
};
