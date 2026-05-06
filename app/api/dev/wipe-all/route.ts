/**
 * 전체 RTDB 초기화 — /dev 페이지에서 호출. **운영에선 절대 사용 X.**
 *
 * Firebase Admin SDK 로 root 노드 set null. Rules 우회.
 * 호출자에게 단순 인증 (Bearer 토큰) 요구해 직원만 가능하게 함 — admin role 강제 검증은 추후.
 *
 * POST /api/dev/wipe-all
 *   Body: { confirm: 'WIPE-ALL' } — 안전핀
 *   Header: Authorization: Bearer <Firebase ID Token>
 */
import { NextResponse, type NextRequest } from 'next/server';
import { getAdminRtdb } from '@/lib/firebase/admin';
import { getFirebaseAuth } from '@/lib/firebase/admin-auth';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  // 1) 인증
  const auth = req.headers.get('authorization');
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return NextResponse.json({ ok: false, error: '인증 토큰 누락' }, { status: 401 });
  let uid: string;
  try {
    const decoded = await getFirebaseAuth().verifyIdToken(token);
    uid = decoded.uid;
  } catch (e) {
    return NextResponse.json({ ok: false, error: `토큰 검증 실패: ${(e as Error).message}` }, { status: 401 });
  }

  // 2) 안전핀
  let body: { confirm?: string };
  try { body = await req.json(); } catch { body = {}; }
  if (body.confirm !== 'WIPE-ALL') {
    return NextResponse.json({ ok: false, error: 'confirm 토큰 불일치' }, { status: 400 });
  }

  // 3) RTDB 루트 비우기
  try {
    const db = getAdminRtdb();
    const before = await db.ref('/').get();
    const beforeCount = before.exists() && before.val() && typeof before.val() === 'object'
      ? Object.keys(before.val() as Record<string, unknown>).length
      : 0;
    await db.ref('/').set(null);
    return NextResponse.json({ ok: true, removedNodes: beforeCount, by: uid });
  } catch (e) {
    return NextResponse.json({ ok: false, error: `RTDB wipe 실패: ${(e as Error).message}` }, { status: 500 });
  }
}
