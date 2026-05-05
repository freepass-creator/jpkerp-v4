/**
 * 날짜·금액 표시 헬퍼 — 모든 페이지 공용.
 *
 * 표준 (ISO date): 'YYYY-MM-DD'
 * 표시 (한글):     'YYYY. MM. DD' — formatDate
 *
 * 시간대: 클라이언트는 사용자 로컬 (한국이면 KST). toISOString().slice(0,10) 은 UTC 기준이라
 * 자정 직후엔 어제로 표시될 수 있음 — 주의.
 */

/** 오늘 날짜 'YYYY-MM-DD' (사용자 로컬 시간대 기준). */
export function todayStr(): string {
  const d = new Date();
  return ymd(d);
}

/** Date → 'YYYY-MM-DD'. */
export function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** ISO 또는 'YYYY-MM-DD' 문자열 두 개 사이 일수 차이 (to - from). 음수=과거. */
export function daysBetween(from: string, to: string): number {
  const a = new Date(from);
  const b = new Date(to);
  if (!Number.isFinite(a.getTime()) || !Number.isFinite(b.getTime())) return NaN;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** 'YYYY-MM-DD' → 'YYYY. MM. DD' (한국 표시 격식). 빈/잘못된 값은 '-'. */
export function formatDate(s: string | null | undefined): string {
  if (!s) return '-';
  return s.replace(/-/g, '. ');
}

/** 숫자 → 'X,XXX' (ko-KR). NaN/undefined 는 '-'. */
export function formatMoney(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '-';
  return n.toLocaleString('ko-KR');
}

/** D-day 라벨 — 양수=D-N, 0=D-Day, 음수=D+N. NaN=빈문자열. */
export function formatDday(daysLeft: number): string {
  if (!Number.isFinite(daysLeft)) return '';
  if (daysLeft === 0) return 'D-Day';
  return daysLeft > 0 ? `D-${daysLeft}` : `D+${Math.abs(daysLeft)}`;
}
