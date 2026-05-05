import { NextResponse } from 'next/server';
import { sendSms } from '@/lib/sms/aligo';
import { renderTemplate, type SmsTemplateContext, type SmsTemplateKind } from '@/lib/sms/templates';
import { getAdminRtdb } from '@/lib/firebase/admin';
import { getFirebaseAuth } from '@/lib/firebase/admin-auth';
import { headers } from 'next/headers';

/**
 * SMS 수동 발송 — 직원이 손님에게 직접 발송.
 *
 * 입력:
 *   POST { to, content }                       — 직접 작성한 본문 발송
 *   POST { to, kind: 'welcome'|'overdue'|'expire', context: {...} }
 *                                              — 템플릿 + 자리표시자
 *
 * 인증: Firebase ID 토큰 (Authorization: Bearer <token>) — 직원만.
 *      AuthGate 가 client 에서 가드하지만 server 에서도 검증.
 *
 * 발송 결과는 sms_logs/ 에 push (audit_logs 와 별도 — 외부 발송 비용 추적용).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ManualBody = { to: string | string[]; content: string };
type TemplateBody = { to: string | string[]; kind: SmsTemplateKind; context: SmsTemplateContext };
type Body = ManualBody | TemplateBody;

function isTemplate(b: Body): b is TemplateBody {
  return 'kind' in b && 'context' in b;
}

export async function POST(req: Request) {
  // 인증 — Authorization: Bearer <Firebase ID token>
  const h = await headers();
  const auth = h.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let actorUid = '';
  let actorEmail = '';
  try {
    const decoded = await getFirebaseAuth().verifyIdToken(token);
    actorUid = decoded.uid;
    actorEmail = decoded.email ?? '';
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const content = isTemplate(body) ? renderTemplate(body.kind, body.context) : body.content;
  if (!content || !content.trim()) {
    return NextResponse.json({ error: 'empty_content' }, { status: 400 });
  }

  const result = await sendSms({ to: body.to, content });

  // sms_logs/ 적재 (성공/실패 모두)
  try {
    const db = getAdminRtdb();
    await db.ref('sms_logs').push({
      at: new Date().toISOString(),
      actor: { uid: actorUid, email: actorEmail || undefined },
      to: body.to,
      kind: isTemplate(body) ? body.kind : 'custom',
      content,
      result: {
        ok: result.ok,
        msgId: result.msgId,
        msgType: result.msgType,
        resultCode: result.resultCode,
        message: result.message,
      },
    });
  } catch (e) {
    console.warn('[sms/send] log write failed', e);
  }

  if (!result.ok) {
    return NextResponse.json({ error: 'send_failed', detail: result.message ?? result.resultCode }, { status: 500 });
  }
  return NextResponse.json({
    ok: true, msgId: result.msgId, msgType: result.msgType,
    successCount: result.successCount, errorCount: result.errorCount,
  });
}
