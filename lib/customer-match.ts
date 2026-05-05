import type { Contract } from './sample-contracts';

/**
 * 차량번호 정규화 — 공백 제거 후 비교용.
 */
export function normalizePlate(plate: string): string {
  return plate.replace(/\s/g, '').trim();
}

/**
 * 식별번호 정규화 — 하이픈/공백 제거 후 숫자만 비교.
 * 주민번호: 880101-1234567 / 880101 1234567 / 8801011234567 → 8801011234567
 * 사업자번호: 158-81-12345 → 1588112345
 */
export function normalizeIdent(ident: string): string {
  return ident.replace(/[\s-]/g, '').trim();
}

/**
 * 차량번호 + 식별번호 매칭으로 손님 계약 찾기.
 *
 * - plate 정확 일치 + customerIdent 정규화 후 일치
 * - 운행중 우선, 없으면 가장 최근 (휴차여도 과거 응대 가능)
 * - 소프트 삭제(deletedAt) 된 계약은 제외
 */
export function findCustomerContract(
  contracts: readonly Contract[],
  plate: string,
  ident: string,
): Contract | null {
  const p = normalizePlate(plate);
  const i = normalizeIdent(ident);
  if (!p || !i) return null;

  const matches = contracts.filter((c) => {
    if (c.deletedAt) return false;
    if (normalizePlate(c.plate) !== p) return false;
    return normalizeIdent(c.customerIdent) === i;
  });
  if (matches.length === 0) return null;

  const STATUS_PRIORITY: Record<string, number> = { '운행중': 0, '대기': 1, '만기': 2, '해지': 3 };
  matches.sort((a, b) => {
    const pa = STATUS_PRIORITY[a.status] ?? 99;
    const pb = STATUS_PRIORITY[b.status] ?? 99;
    if (pa !== pb) return pa - pb;
    return (b.startDate ?? '').localeCompare(a.startDate ?? '');
  });
  return matches[0];
}

/**
 * 식별번호 마스킹 — 화면 표시용.
 * 주민번호 (13자리): 앞 6자리(생년월일) + "-*******"
 * 사업자번호 (10자리): 그대로 (기업식별이라 마스킹 의미 적음)
 * 그 외: 끝 4자리만 노출
 */
export function maskIdent(ident: string): string {
  const digits = normalizeIdent(ident);
  if (digits.length === 13) return `${digits.slice(0, 6)}-*******`;
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
  }
  if (digits.length <= 4) return digits;
  return `${'*'.repeat(digits.length - 4)}${digits.slice(-4)}`;
}
