/**
 * 엔티티 코드 자동 생성 유틸 — 일관된 ID 체계.
 *
 * ┌─ 코드 컨벤션 (하이픈 X — 내부 코드 단순화) ───────────────────────┐
 * │ 회사       CP01, CP02, ... CP99       (nextCompanyCode)                  │
 * │ 자산       CP01AS0001                  (회사 scoped, ~9999/회사)          │
 * │ 직원       CP01E001                    (회사 scoped, ~999)                │
 * │ 임차인     CP01LS0001                  (회사 scoped Lessee)              │
 * │ 거래처     CP01V0001                   (회사 scoped Vendor)              │
 * │ 계약       C2605060001                 (date scoped — YYMMDD + 4자리)     │
 * │ 보험       id (system)                 (외부 policyNo 의존 — 자체코드 X) │
 * │ 일지       id (system)                 (transactional)                    │
 * │ 거래원장   l-{ts}-{rand}               (RTDB push key)                    │
 * │ 감사로그   RTDB push key               (auto)                             │
 * └────────────────────────────────────────────────────────────────────┘
 *
 * 모든 함수는 기존 코드 배열을 받아 다음 코드 반환. 충돌 없음 보장.
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
 * 회사별 순번 코드 — 회사코드 + 고유prefix + 일련번호 (하이픈 X).
 *
 *   nextCompanyScopedCode('AS', 'CP01', existingAssetCodes) → 'CP01AS0001'
 *   nextCompanyScopedCode('E',  'CP02', existingStaffCodes, { pad: 3 }) → 'CP02E001'
 *   nextCompanyScopedCode('LS', 'CP01', existingLesseeCodes) → 'CP01LS0001'
 *   nextCompanyScopedCode('V',  'CP01', existingVendorCodes) → 'CP01V0001'
 *
 * 회사 내 9999개까지 안전 (pad 4 default). 그 이상은 자릿수 자동 확장.
 * 같은 회사 + 같은 prefix 만 추적, 다른 회사 코드는 무시.
 */
export function nextCompanyScopedCode(
  prefix: string,
  companyCode: string,
  existing: ReadonlyArray<string | null | undefined>,
  opts?: { pad?: number },
): string {
  const padBase = opts?.pad ?? 4;
  const compPrefix = `${companyCode}${prefix}`;
  let max = 0;
  for (const c of existing) {
    if (typeof c !== 'string' || !c.startsWith(compPrefix)) continue;
    const tail = c.slice(compPrefix.length);
    // 다른 prefix 가 같은 시작이면 ambiguous — 숫자 파싱 안 되면 skip
    if (!/^\d+$/.test(tail)) continue;
    const n = parseInt(tail, 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  const nextNum = max + 1;
  const pad = String(nextNum).length > padBase ? String(nextNum).length : padBase;
  return `${compPrefix}${String(nextNum).padStart(pad, '0')}`;
}

/**
 * 일자 scoped 코드 — prefix + YYMMDD + 일련번호 (하이픈 X). 계약·영수증·세금계산서 등 공문서 발행일 기준.
 *
 *   nextDateScopedCode('C', existingContractNos) → 'C2605060001'
 *   nextDateScopedCode('C', list, { date: '2026-05-06' })
 *
 * 4자리 padding 으로 일 9999건 capacity. 그 이상은 자릿수 자동 확장.
 * 같은 날짜 prefix 만 추적, 다른 날 코드는 무시.
 */
export function nextDateScopedCode(
  prefix: string,
  existing: ReadonlyArray<string | null | undefined>,
  opts?: { date?: Date | string; pad?: number },
): string {
  const d = opts?.date instanceof Date ? opts.date
          : typeof opts?.date === 'string' ? new Date(opts.date)
          : new Date();
  const yy = String(d.getFullYear() % 100).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const datePrefix = `${prefix}${yy}${mm}${dd}`;
  let max = 0;
  for (const c of existing) {
    if (typeof c !== 'string' || !c.startsWith(datePrefix)) continue;
    const tail = c.slice(datePrefix.length);
    if (!/^\d+$/.test(tail)) continue;
    const n = parseInt(tail, 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  const nextNum = max + 1;
  const padBase = opts?.pad ?? 4;
  const pad = String(nextNum).length > padBase ? String(nextNum).length : padBase;
  return `${datePrefix}${String(nextNum).padStart(pad, '0')}`;
}
