/**
 * 회사정보 — admin/company 페이지의 데이터를 lib에서 재사용 가능하게 분리.
 * 과태료 변경부과 PDF 도장에 사용 (계약의 companyCode로 lookup).
 */

export type Company = {
  code: string;
  name: string;
  ceo: string;
  bizNo: string;
  corpNo: string;
  hqAddress: string;
  bizType: string;
  bizCategory: string;
  phone: string;
};

export const SAMPLE_COMPANIES: Company[] = [
  {
    code: 'CP01',
    name: '스위치플랜(주)',
    ceo: '김대표',
    bizNo: '110-11-12345',
    corpNo: '110111-8596368',
    hqAddress: '경기도 연천군 전곡읍 은천로 97',
    bizType: '서비스',
    bizCategory: '차량렌탈',
    phone: '02-1234-5678',
  },
  {
    code: 'CP02',
    name: 'JPK렌터카(주)',
    ceo: '이대표',
    bizNo: '220-22-23456',
    corpNo: '220222-1234567',
    hqAddress: '경기도 김포시',
    bizType: '서비스',
    bizCategory: '장기렌터카',
    phone: '031-9876-5432',
  },
];

export function findCompany(code?: string): Company | undefined {
  if (!code) return undefined;
  return SAMPLE_COMPANIES.find((c) => c.code === code);
}

export function defaultCompany(): Company {
  return SAMPLE_COMPANIES[0];
}
