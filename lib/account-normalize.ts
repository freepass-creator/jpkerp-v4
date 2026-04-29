/**
 * 표기 정규화 + 검색 매칭 유틸 — 계좌·전화·사업자번호 등 숫자 식별자 공용.
 *
 * 사용자가 "110-123-456789" / "110 123 456789" / "110123456789" 어떻게 입력해도,
 * 데이터에 하이픈이 있든 없든 같은 값으로 매칭되어야 한다.
 *
 *   digitsOnly("010-1234-5678") → "01012345678"
 *   sameAccount("110-123-456789", "110123456789") → true
 *   searchMatch("01012", row.phone, row.account, row.bizNo) → true (하이픈 무시)
 *
 * 표시는 항상 원본 그대로. 비교/검색 시점에만 정규화.
 */

/** 숫자만 추출. null/undefined 안전. */
export function digitsOnly(s: string | null | undefined): string {
  return String(s ?? '').replace(/\D/g, '');
}

/** 계좌번호 비교 — 숫자만 동일하면 같은 계좌로 판정. 빈값은 false. */
export function sameAccount(a: string | null | undefined, b: string | null | undefined): boolean {
  const da = digitsOnly(a);
  const db = digitsOnly(b);
  if (!da || !db) return false;
  return da === db;
}

/** Map/Set 키로 사용. 빈 입력은 빈 문자열. */
export function accountKey(s: string | null | undefined): string {
  return digitsOnly(s);
}

/**
 * 검색 매칭 — query가 fields 중 하나라도 포함되면 true.
 *  - 텍스트는 case-insensitive 부분일치
 *  - 숫자가 포함된 query는 fields의 digits-only 표현에서도 부분일치 검사 (하이픈 무시)
 *
 * 빈 query → 항상 true (필터 무력화).
 */
export function searchMatch(query: string | null | undefined, ...fields: (string | null | undefined)[]): boolean {
  const q = String(query ?? '').trim();
  if (!q) return true;
  const qLower = q.toLowerCase();
  const qDigits = digitsOnly(q);
  for (const f of fields) {
    if (!f) continue;
    const text = String(f);
    if (text.toLowerCase().includes(qLower)) return true;
    if (qDigits && digitsOnly(text).includes(qDigits)) return true;
  }
  return false;
}

/** @deprecated digitsOnly 사용 — 이전 이름 호환용 */
export const normalizeAccountDigits = digitsOnly;
