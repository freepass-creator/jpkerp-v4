/**
 * SMS byte 계산 — 한글/유니코드 = 2 byte, ASCII = 1 byte.
 * Aligo 기준: 90 byte 이하 SMS, 초과 LMS 자동 전환.
 */
export function smsByteLength(s: string): number {
  let n = 0;
  for (const ch of s) {
    n += ch.charCodeAt(0) > 127 ? 2 : 1;
  }
  return n;
}
