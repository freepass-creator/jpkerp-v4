/**
 * 클라이언트 IP 반환 — audit log 메타 첨부용.
 *
 * Vercel 은 `x-forwarded-for` 헤더에 client IP 를 넣어줌 (첫 항목이 진짜 client).
 * 이 IP 는 사용자가 콘솔에서 위조 가능한 클라이언트 측 데이터가 아니라
 * 인프라가 본 실제 연결 IP — audit 추적용.
 *
 * 인증 없는 endpoint — anonymous 상태 (예: 로그인 시도 실패) 도 IP 캡처 필요.
 * 응답에 캐시 금지 헤더로 매 요청 fresh.
 */
import { NextResponse, type NextRequest } from 'next/server';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export function GET(req: NextRequest) {
  const ip = extractClientIp(req);
  return NextResponse.json(
    { ip },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  );
}

function extractClientIp(req: NextRequest): string | null {
  // Vercel 표준 — 첫 IP 가 실제 client (이후는 proxy chain)
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  // CDN / 일부 proxy fallback
  return req.headers.get('x-real-ip')
      ?? req.headers.get('cf-connecting-ip')
      ?? null;
}
