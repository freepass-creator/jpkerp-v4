/**
 * 한글 초성 추출 + 매칭.
 *
 * "홍길동" → 초성 "ㅎㄱㄷ"
 * 검색어 "ㅎㄱㄷ" 또는 "홍길" 모두 "홍길동" 매칭.
 *
 * 가-힣 (U+AC00 ~ U+D7A3) 만 처리. 영문/숫자는 그대로 유지.
 */

const CHO_LIST = [
  'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ',
  'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
];

/** 한글 음절 → 초성. 한글 아니면 그대로 반환. */
function getCho(ch: string): string {
  const code = ch.charCodeAt(0);
  if (code < 0xAC00 || code > 0xD7A3) return ch;
  const idx = Math.floor((code - 0xAC00) / 588);
  return CHO_LIST[idx] ?? ch;
}

/** 문자열 → 초성 시퀀스 (한글만 변환). */
export function toChosung(text: string): string {
  let result = '';
  for (const ch of text) result += getCho(ch);
  return result;
}

/**
 * needle 가 haystack 안에 있는지 (대소문자 무시 + 초성 매칭).
 *  · "ㅎㄱㄷ" → "홍길동" 매칭 ✓
 *  · "홍" → "홍길동" 매칭 ✓
 *  · "01도" → "01도1234" 매칭 ✓
 */
export function fuzzyMatch(haystack: string, needle: string): boolean {
  if (!needle) return true;
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase().trim();
  if (h.includes(n)) return true;
  // 검색어가 초성만이면 haystack 의 초성으로 비교
  const isChosungOnly = /^[ㄱ-ㅎ]+$/.test(needle);
  if (isChosungOnly) {
    return toChosung(haystack).includes(needle);
  }
  return false;
}
