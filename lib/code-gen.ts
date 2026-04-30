/**
 * 엔티티 코드 자동 생성 유틸 — 일관된 ID 체계.
 *
 * ┌─ 코드 컨벤션 (모두 회사 scoped 4자리 일련번호) ────────────────┐
 * │ 회사       CP01, CP02, ... CP99       (사용자 부여, nextCompanyCode)      │
 * │ 자산       AS-CP01-0001               (회사 scoped, ~9999/회사)            │
 * │ 계약       C-CP01-0001                (회사 scoped)                        │
 * │ 고객       LS-CP01-0001               (회사 scoped, Lessee)                │
 * │ 직원       E-CP01-0001                (회사 scoped, Employee)              │
 * │ 거래처     V-CP01-0001                (회사 scoped, Vendor)                │
 * │ 보험       IN-CP01-0001               (회사 scoped, Insurance)             │
 * │ 할부       LN-CP01-0001               (회사 scoped, Loan)                  │
 * │ 과태료     PN-CP01-0001               (회사 scoped)                        │
 * │ 일지       J-CP01-0001                (회사 scoped, Journal)               │
 * │ 거래(원장) l-{ts}-{rand}              (RTDB key, 자동 — 시퀀스 X)          │
 * └────────────────────────────────────────────────────────────────┘
 *
 * 회사별 1번부터 시작. 9999까지 안전. 모든 함수는 기존 코드 배열을 받아 다음 코드 반환.
 */

/** 회사코드 — CP01 ~ CP99 중 비어있는 다음 번호 */
export function nextCompanyCode(existing: string[]): string {
  const used = new Set(existing);
  for (let i = 1; i < 100; i++) {
    const code = `CP${String(i).padStart(2, '0')}`;
    if (!used.has(code)) return code;
  }
  return 'CP99';
}

/**
 * 연-순번 코드 생성 (PREFIX-YYYY-NNNN).
 *
 *   nextSequenceCode('C', existingContractNos)              → 'C-2026-0001'
 *   nextSequenceCode('LS', existingLesseeCodes, { pad: 3 }) → 'LS-2026-001'
 *   nextSequenceCode('IN', list, { year: 2025 })            → 'IN-2025-NNNN'
 *
 * 다른 연도 코드는 무시. 같은 prefix·연도에서만 max+1 추적.
 */
export function nextSequenceCode(
  prefix: string,
  existing: ReadonlyArray<string | null | undefined>,
  opts?: { year?: number; pad?: number },
): string {
  const year = opts?.year ?? new Date().getFullYear();
  const pad = opts?.pad ?? 4;
  const yearPrefix = `${prefix}-${year}-`;
  let max = 0;
  for (const c of existing) {
    if (typeof c !== 'string' || !c.startsWith(yearPrefix)) continue;
    const n = parseInt(c.slice(yearPrefix.length), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${yearPrefix}${String(max + 1).padStart(pad, '0')}`;
}

/**
 * 회사별 순번 코드 (PREFIX-CP01-NNN). 회사 내 일련번호.
 *
 *   nextCompanyScopedCode('AS', 'CP01', existingAssetCodes) → 'AS-CP01-001'
 *   nextCompanyScopedCode('E', 'CP02', existingStaffCodes)  → 'E-CP02-001'
 */
export function nextCompanyScopedCode(
  prefix: string,
  companyCode: string,
  existing: ReadonlyArray<string | null | undefined>,
  opts?: { pad?: number },
): string {
  const pad = opts?.pad ?? 3;
  const compPrefix = `${prefix}-${companyCode}-`;
  let max = 0;
  for (const c of existing) {
    if (typeof c !== 'string' || !c.startsWith(compPrefix)) continue;
    const n = parseInt(c.slice(compPrefix.length), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${compPrefix}${String(max + 1).padStart(pad, '0')}`;
}
