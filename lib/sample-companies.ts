/**
 * 회사정보 — admin/company 페이지 + lib 재사용 (과태료 도장, 계좌내역 매칭 등).
 * 사업자등록증 OCR 결과 + 계좌/카드 정보까지 한 회사에 묶음.
 */

export type CompanyAccount = {
  bank: string;          // 은행명 (예: 신한, 국민)
  accountNo: string;     // 계좌번호
  holder?: string;       // 예금주 (회사명과 다를 때만)
  alias?: string;        // 별칭/용도 (예: 운영비, 자동이체 전용)
};

export type CompanyCard = {
  cardName: string;      // 카드 이름 (예: 법인 신한 BC)
  cardNo: string;        // 카드번호 (전체 또는 마스킹)
  brand?: string;        // 브랜드/카드사 (예: 신한, KB)
  alias?: string;        // 별칭/용도
};

export type Company = {
  code: string;                                    // CP01 — 사용자 부여
  name: string;                                    // 법인명/상호
  ceo: string;                                     // 대표자
  bizNo: string;                                   // 사업자등록번호
  corpNo?: string;                                 // 법인등록번호 (법인만)
  hqAddress: string;                               // 본점주소
  bizAddress?: string;                             // 사업장주소 (본점과 다를 때)
  bizType: string;                                 // 업태
  bizCategory: string;                             // 업종
  phone: string;                                   // 대표전화
  openDate?: string;                               // 개업연월일 YYYY-MM-DD
  email?: string;
  entityType?: 'corporate' | 'individual';         // 법인/개인
  accounts?: CompanyAccount[];
  cards?: CompanyCard[];
};

/** 회사 데이터는 사용자가 사업자등록증 OCR 또는 개별 입력으로 채움. 샘플 없음. */
export const SAMPLE_COMPANIES: Company[] = [];

export function findCompany(code?: string): Company | undefined {
  if (!code) return undefined;
  return SAMPLE_COMPANIES.find((c) => c.code === code);
}

/**
 * 자동차등록증 ⑨성명·⑩법인등록번호로 회사 찾기.
 *   매칭 우선순위: 법인등록번호(corpNo) > 사업자등록번호(bizNo) > 회사명(name).
 *   하이픈/공백 정규화 후 비교.
 */
export function findCompanyByOwner(
  ownerName: string | undefined,
  ownerRegNo: string | undefined,
  companies: readonly Company[],
): Company | undefined {
  const norm = (s?: string) => s?.replace(/[-\s]/g, '') ?? '';
  const reg = norm(ownerRegNo);
  if (reg) {
    const byCorp = companies.find((c) => norm(c.corpNo) === reg);
    if (byCorp) return byCorp;
    const byBiz = companies.find((c) => norm(c.bizNo) === reg);
    if (byBiz) return byBiz;
  }
  const name = ownerName?.trim();
  if (name) {
    const byName = companies.find((c) => c.name === name);
    if (byName) return byName;
  }
  return undefined;
}
