/**
 * 자동차보험증권 / 렌터카공제 데이터 모델.
 * OCR 결과를 그대로 담을 수 있게 모든 필드 optional. 회차 분납은 installments 배열.
 */

export type Installment = {
  cycle: number;
  dueDate: string;       // YYYY-MM-DD
  amount: number;        // 원
  paid?: boolean;        // 납부완료 여부 (1회차 = 가입시 납입 → true 기본)
  paidDate?: string;
};

export type InsurancePolicy = {
  id: string;
  /** 매칭된 자산(차량) 회사코드 — 매칭 실패 시 비어있음 */
  companyCode?: string;
  /** OCR 한 원본 PDF/이미지 dataUrl (증권 사본 보관용) */
  fileDataUrl?: string;
  fileName?: string;

  // 보험사·증권 정보
  insurer?: string;             // DB손해보험 / 전국렌터카공제조합 등
  productName?: string;         // 프로미카다이렉트업무용(베이직형)자동차보험
  policyNo?: string;            // 증권번호 / 공제번호
  contractor?: string;          // 계약자
  insured?: string;             // 피보험자
  bizNo?: string;               // 158-81-*****

  // 기간
  startDate?: string;           // YYYY-MM-DD
  endDate?: string;

  // 차량
  carNumber?: string;           // 정확히 \\d{2,3}[가-힣]\\d{4}
  carName?: string;
  carYear?: number;
  carClass?: string;
  displacement?: number;
  seats?: number;
  vehicleValueMan?: number;     // 만원
  accessoryValueMan?: number;
  accessories?: string;

  // 운전 조건
  driverScope?: string;         // 누구나운전 / 임직원한정 / 가족운전
  driverAge?: string;           // 만21세이상한정 등
  deductibleMan?: number;       // 물적사고할증금액(만원)

  // 가입담보 — 텍스트 그대로 저장
  covPersonal1?: string;        // 대인배상Ⅰ
  covPersonal2?: string;        // 대인배상Ⅱ
  covProperty?: string;         // 대물배상
  covSelfAccident?: string;     // 자기신체사고 또는 자동차상해
  covUninsured?: string;        // 무보험차상해
  covSelfVehicle?: string;      // 자기차량손해
  covEmergency?: string;        // 긴급출동

  // 보험료
  paidPremium?: number;         // 납입한 보험료
  totalPremium?: number;        // 총보험료

  // 자동이체 + 분납
  autoDebitBank?: string;
  autoDebitAccount?: string;
  autoDebitHolder?: string;
  installments?: Installment[];
};

/** end_date까지 남은 일수 */
export function daysToExpiry(p: InsurancePolicy, today = new Date()): number | null {
  if (!p.endDate) return null;
  const end = new Date(p.endDate);
  if (isNaN(end.getTime())) return null;
  return Math.floor((end.getTime() - today.getTime()) / 86400000);
}

/** 분납 합계 (검산용) */
export function installmentSum(p: InsurancePolicy): number {
  return (p.installments ?? []).reduce((s, i) => s + (i.amount ?? 0), 0);
}

export const SAMPLE_INSURANCE: InsurancePolicy[] = [];
