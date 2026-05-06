/**
 * 내부 시스템 ID 생성 — transactional / log / sub-entity 용.
 *
 * 비즈니스 코드 (CP01, CP01VH0001, CT2605060001 등) 가 아니라 시스템이 부여하는 unique key.
 * 회사/차량/계약/직원/고객/거래처 같은 master 는 code-gen.ts 사용.
 *
 *   genId('a')  → 'a-1730812345678-x4f2b9'  (자산 placeholder id, 차량코드 발급 전)
 *   genId('c')  → 'c-...'                   (계약 id)
 *   genId('j')  → 'j-...'                   (일지)
 *   genId('l')  → 'l-...'                   (거래원장)
 *   genId('eu') → 'eu-...'                  (이벤트 업로드)
 */
export function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
