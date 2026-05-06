/**
 * 고객 (Customer) 마스터 — 계약과 별개로 관리되는 master entity.
 *
 * 한 고객이 여러 계약을 가질 수 있음 (재계약·다중차량). 코드는 회사 scoped 영구 보존.
 * 계약서·법률 문서엔 "임차인" 표기, 시스템 UI 와 코드는 "고객".
 *
 * 매칭 우선순위 (같은 사람 식별):
 *   1. ident (주민/사업자/법인등록번호) 정확 일치
 *   2. fallback: phone (하이픈/공백 제거 후 비교)
 *
 * 위 둘 모두 매칭 안 되면 신규 고객 코드 발급.
 */

import type { AuditFields } from './audit-fields';

export type CustomerKind = '개인' | '사업자' | '법인';

export type Customer = {
  code: string;              // CP01CU0001 — 회사+CU+4자리, 등록 시 자동 부여, 변경 불가
  companyCode: string;       // 어느 회사의 고객인지 (CP01)
  name: string;              // 성명 (개인) 또는 상호 (사업자/법인)
  kind: CustomerKind;
  ident?: string;            // 주민번호(앞 6자리만 보존 권장) / 사업자번호 / 법인번호
  phone: string;             // 휴대전화 — 매칭 fallback 키
  emergencyPhone?: string;   // 비상연락처 / 가족연락처
  email?: string;
  address?: string;
  licenseNo?: string;        // 운전면허번호 (XX-XX-XXXXXX-XX)
  bizName?: string;          // 개인사업자 상호 (kind=사업자 일 때 추가 정보)
  bizAddress?: string;       // 사업장 소재지

  /** 소프트 삭제 — 코드 영구 보존 (재발급 금지). */
  deletedAt?: string;
} & AuditFields;

/** 고객 데이터는 계약 등록 시 자동 누적 또는 직접 입력. 샘플 없음. */
export const SAMPLE_CUSTOMERS: Customer[] = [];

/** 식별번호 / 전화번호 정규화 — 매칭 비교용. */
function normIdent(s?: string): string {
  return (s ?? '').replace(/[\s\-]/g, '');
}

/**
 * 같은 고객 찾기 — ident 우선, phone fallback. 같은 회사 안에서만 검색.
 * 매칭되면 그 Customer 반환. 없으면 null (신규 고객).
 */
export function findCustomerMatch(
  customers: readonly Customer[],
  companyCode: string,
  ident: string | undefined,
  phone: string | undefined,
): Customer | null {
  const i = normIdent(ident);
  const p = normIdent(phone);
  const sameCompany = customers.filter((c) => c.companyCode === companyCode && !c.deletedAt);
  if (i) {
    const byIdent = sameCompany.find((c) => normIdent(c.ident) === i);
    if (byIdent) return byIdent;
  }
  if (p) {
    const byPhone = sameCompany.find((c) => normIdent(c.phone) === p);
    if (byPhone) return byPhone;
  }
  return null;
}

/** active 고객만 (UI 드롭다운·신규 매칭용). */
export function activeCustomers(customers: readonly Customer[]): Customer[] {
  return customers.filter((c) => !c.deletedAt);
}
