import 'server-only';
import { headers } from 'next/headers';

/**
 * 단순 in-memory 슬라이딩 윈도우 rate limit.
 *
 * 한계: Vercel 다중 인스턴스에서 인스턴스별로 카운트 (글로벌 X). 콜드스타트 시 리셋.
 * 효과: 단일 IP 가 1초에 100회 brute-force 같은 명백한 abuse 차단.
 * 글로벌 정합성 필요하면 RTDB/Redis 기반으로 교체.
 */

const buckets = new Map<string, { count: number; resetAt: number }>();

/**
 * @returns true 면 통과, false 면 차단
 */
export function checkRateLimit(
  key: string,
  options: { max?: number; windowMs?: number } = {},
): boolean {
  const max = options.max ?? 10;
  const windowMs = options.windowMs ?? 60_000;
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry || entry.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    cleanupOldBuckets(now);
    return true;
  }
  entry.count++;
  if (entry.count > max) return false;
  return true;
}

/** 호출 IP 키 — x-forwarded-for 우선, 없으면 'unknown'. */
export async function getClientIp(): Promise<string> {
  const h = await headers();
  const xff = h.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return h.get('x-real-ip') ?? 'unknown';
}

/** 만료된 버킷 정리 (Map 무한 증가 방지) — buckets.size > 1000 일 때만. */
function cleanupOldBuckets(now: number) {
  if (buckets.size < 1000) return;
  for (const [k, v] of buckets) {
    if (v.resetAt < now) buckets.delete(k);
  }
}
