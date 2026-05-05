import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { sendSms } from '@/lib/sms/aligo';
import { welcomeContent } from '@/lib/sms/templates';
import { getAdminRtdb } from '@/lib/firebase/admin';
import { getFirebaseAuth } from '@/lib/firebase/admin-auth';

/**
 * 새 계약 등록 직후 환영 SMS 발송 — 클라이언트 handleCreate 이후 호출.
 *
 * 입력: POST { contractId } — RTDB 의 해당 계약 조회해서 발송
 *      (또는 { contract, company } 직접 주입 — 회사 누락 fallback 용)
 *
 * 인증: Firebase ID 토큰 (직원만).
 *
 * 같은 계약의 환영 SMS 가 이미 발송되었으면 중복 방지 (sms_logs/ 조회).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = { contractId: string };

export async function POST(req: Request) {
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
  if (!body.contractId) return NextResponse.json({ error: 'bad_request' }, { status: 400 });

  const db = getAdminRtdb();
  const [contractsSnap, companiesSnap, logsSnap] = await Promise.all([
    db.ref('contracts').once('value'),
    db.ref('companies').once('value'),
    db.ref('sms_logs').orderByChild('at').limitToLast(500).once('value'),
  ]);

  const contractsVal = contractsSnap.val() ?? {};
  const contracts = Array.isArray(contractsVal) ? contractsVal : Object.values(contractsVal);
  const contract = contracts.find((c) => c && typeof c === 'object' && (c as { id?: string }).id === body.contractId);

  if (!contract) return NextResponse.json({ error: 'contract_not_found' }, { status: 404 });
  const c = contract as {
    id: string; companyCode: string; plate: string;
    customerName: string; customerIdent: string; customerPhone: string;
  };

  if (!c.customerPhone) {
    return NextResponse.json({ error: 'no_phone', detail: '계약에 customerPhone 누락' }, { status: 400 });
  }

  // 중복 방지 — 같은 contractId + welcome 이 sms_logs 에 이미 있으면 skip
  const logsVal = logsSnap.val() ?? {};
  const logs = Object.values(logsVal) as Array<{ kind?: string; meta?: { contractId?: string } }>;
  const already = logs.some((l) => l?.kind === 'welcome' && l?.meta?.contractId === c.id);
  if (already) {
    return NextResponse.json({ ok: true, skipped: 'already_sent' });
  }

  const companiesVal = companiesSnap.val() ?? {};
  const companies = Array.isArray(companiesVal) ? companiesVal : Object.values(companiesVal);
  const company = companies.find((co) => co && typeof co === 'object' && (co as { code?: string }).code === c.companyCode) as { name?: string; phone?: string } | undefined;

  const content = welcomeContent({
    companyName: company?.name,
    customerName: c.customerName,
    plate: c.plate,
    customerIdent: c.customerIdent,
  });

  const result = await sendSms({ to: c.customerPhone, content });

  // sms_logs 적재 — meta.contractId 포함 (중복 검사용)
  try {
    await db.ref('sms_logs').push({
      at: new Date().toISOString(),
      actor: { uid: actorUid, email: actorEmail || undefined },
      to: c.customerPhone,
      kind: 'welcome',
      content,
      meta: { contractId: c.id, plate: c.plate, contractNo: (contract as { contractNo?: string }).contractNo },
      result: {
        ok: result.ok,
        msgId: result.msgId,
        msgType: result.msgType,
        resultCode: result.resultCode,
        message: result.message,
      },
    });
  } catch (e) {
    console.warn('[sms/welcome] log write failed', e);
  }

  if (!result.ok) {
    return NextResponse.json({ error: 'send_failed', detail: result.message ?? result.resultCode }, { status: 500 });
  }
  return NextResponse.json({ ok: true, msgId: result.msgId, msgType: result.msgType });
}
