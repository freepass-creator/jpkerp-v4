import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * 모바일 자동 라우팅 — User-Agent 가 모바일이고 / 또는 (workspace) 라우트 진입 시 /m 으로 리다이렉트.
 * /m, /api, /customer, _next, 정적자원, /m으로 시작하는 경로는 통과.
 * `?desktop=1` 쿼리로 강제 PC 모드 가능.
 */
const MOBILE_UA_RE = /Mobi|Android|iPhone|iPod|IEMobile|BlackBerry|webOS|Opera Mini/i;

const SKIP_PREFIXES = ['/m', '/api', '/customer', '/_next', '/icon', '/manifest'];

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // 강제 PC 모드 — ?desktop=1
  if (req.nextUrl.searchParams.get('desktop') === '1') return NextResponse.next();

  // 모바일 라우트·API·정적자원은 통과
  if (SKIP_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  const ua = req.headers.get('user-agent') ?? '';
  if (!MOBILE_UA_RE.test(ua)) return NextResponse.next();

  // PC 라우트로 들어온 모바일 → /m 으로
  const url = req.nextUrl.clone();
  url.pathname = '/m';
  url.search = search;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next|api|.*\\..*).*)'],
};
