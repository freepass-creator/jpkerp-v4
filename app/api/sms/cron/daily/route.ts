import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { sendSms } from '@/lib/sms/aligo';
import { overdueContent, expireContent, inspectionContent, insuranceContent } from '@/lib/sms/templates';
import { getAdminRtdb } from '@/lib/firebase/admin';
import type { Contract, ScheduleEvent } from '@/lib/sample-contracts';
import type { Company } from '@/lib/sample-companies';
import type { Asset } from '@/lib/sample-assets';
import type { InsurancePolicy } from '@/lib/sample-insurance';
import { todayStr, daysBetween } from '@/lib/date-utils';
import { asArray } from '@/lib/store-utils';

/**
 * 매일 cron — 미납·만기·검사·보험 SMS 자동 발송. Vercel Cron (vercel.json) 으로 09:00 KST 트리거.
 *
 * 보호: Authorization: Bearer <CRON_SECRET> (Vercel Cron 자동 첨부) 또는 ?secret= 매개변수.
 *
 * 발송 종류:
 *  1. 미납 — 계약별로 회차 dueDate < today AND status !== '완료' 인 가장 오래된 것
 *           같은 계약에 대해 24시간 이내 overdue 발송 이력 있으면 skip
 *  2. 만기(계약) — endDate 가 D-30, D-7, D-Day → 같은 계약·같은 단계 7일 이내 skip
 *  3. 검사 — asset.inspectionTo 가 D-30, D-7, D-Day → 그 차량의 active contract 임차인 → 7일 이내 skip
 *  4. 보험 — insurance policy endDate 가 D-30, D-7, D-Day → 같은 방식
 *
 * 결과: { processed, sent, skipped, errors }.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type LogEntry = {
  at: string;
  to?: string;
  kind?: string;
  meta?: { contractId?: string; stage?: string };
};


function authorize(req: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false; // 미설정 시 차단 — 운영 abuse 방지
  const url = new URL(req.url);
  const q = url.searchParams.get('secret');
  if (q && q === expected) return true;
  return false;
}

async function authorizeHeader(): Promise<boolean> {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const h = await headers();
  const auth = h.get('authorization') ?? '';
  if (auth === `Bearer ${expected}`) return true;
  return false;
}

export async function GET(req: Request) {
  return runCron(req);
}

export async function POST(req: Request) {
  return runCron(req);
}

async function runCron(req: Request) {
  if (!authorize(req) && !(await authorizeHeader())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const db = getAdminRtdb();
  const [contractsSnap, companiesSnap, assetsSnap, insuranceSnap, logsSnap] = await Promise.all([
    db.ref('contracts').once('value'),
    db.ref('companies').once('value'),
    db.ref('assets').once('value'),
    db.ref('insurance').once('value'),
    db.ref('sms_logs').orderByChild('at').limitToLast(2000).once('value'),
  ]);

  const contracts = asArray<Contract>(contractsSnap.val()).map((c) => {
    const ev = (c as Contract & { events?: unknown }).events;
    if (ev && !Array.isArray(ev) && typeof ev === 'object') {
      return { ...c, events: Object.values(ev) as ScheduleEvent[] };
    }
    return c;
  });
  const companies = asArray<Company>(companiesSnap.val());
  const assets = asArray<Asset>(assetsSnap.val());
  const policies = asArray<InsurancePolicy>(insuranceSnap.val());
  const logs = asArray<LogEntry>(logsSnap.val());

  // 차량번호 → 운행중 계약 매칭 (검사·보험 알림에서 임차인 phone/ident 찾을 때 사용)
  const activeByPlate = new Map<string, Contract>();
  for (const c of contracts) {
    if (c.deletedAt) continue;
    if (c.status === '해지' || c.status === '만기') continue;
    if (!c.plate) continue;
    if (!activeByPlate.has(c.plate)) activeByPlate.set(c.plate, c);
  }

  const today = todayStr();
  const now = Date.now();
  const HOURS_24 = 24 * 60 * 60 * 1000;
  const DAYS_7 = 7 * 24 * 60 * 60 * 1000;

  const result = { processed: 0, sent: 0, skipped: 0, errors: 0 };

  for (const c of contracts) {
    if (c.deletedAt) continue;
    if (c.status === '해지' || c.status === '만기') continue;
    if (!c.customerPhone) continue;
    result.processed += 1;

    const company = companies.find((co) => !co.deletedAt && co.code === c.companyCode);

    // 1. 미납 — 가장 오래된 미납 회차
    const overdueEvents = (c.events ?? [])
      .filter((e) => e.type === '수납' && e.status !== '완료' && e.dueDate < today)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    if (overdueEvents.length > 0) {
      // 24시간 이내 같은 계약 overdue 이력 검사
      const recent = logs.find((l) =>
        l.kind === 'overdue'
        && l.meta?.contractId === c.id
        && Date.parse(l.at) > now - HOURS_24,
      );
      if (recent) {
        result.skipped += 1;
      } else {
        const oldest = overdueEvents[0];
        const totalAmount = overdueEvents.reduce((s, e) => s + (e.amount ?? 0), 0);
        const content = overdueContent({
          companyName: company?.name,
          customerName: c.customerName,
          plate: c.plate,
          customerIdent: c.customerIdent,
          cycle: oldest.cycle,
          amount: totalAmount,
        });
        const sent = await sendSms({ to: c.customerPhone, content });
        await db.ref('sms_logs').push({
          at: new Date().toISOString(),
          actor: { uid: 'system:cron' },
          to: c.customerPhone,
          kind: 'overdue',
          content,
          meta: { contractId: c.id, plate: c.plate, contractNo: c.contractNo },
          result: { ok: sent.ok, msgId: sent.msgId, msgType: sent.msgType, resultCode: sent.resultCode, message: sent.message },
        });
        if (sent.ok) result.sent += 1;
        else result.errors += 1;
      }
    }

    // 2. 만기(계약) — D-30, D-7, D-Day
    const days = daysBetween(today, c.endDate);
    let stage: '30' | '7' | '0' | null = null;
    if (days === 30) stage = '30';
    else if (days === 7) stage = '7';
    else if (days === 0) stage = '0';

    if (stage) {
      // 같은 계약·같은 단계 7일 이내 발송 이력 검사
      const recent = logs.find((l) =>
        l.kind === 'expire'
        && l.meta?.contractId === c.id
        && l.meta?.stage === stage
        && Date.parse(l.at) > now - DAYS_7,
      );
      if (recent) {
        result.skipped += 1;
      } else {
        const content = expireContent({
          companyName: company?.name,
          customerName: c.customerName,
          plate: c.plate,
          customerIdent: c.customerIdent,
          daysLeft: days,
          endDate: c.endDate,
          companyPhone: company?.phone,
        });
        const sent = await sendSms({ to: c.customerPhone, content });
        await db.ref('sms_logs').push({
          at: new Date().toISOString(),
          actor: { uid: 'system:cron' },
          to: c.customerPhone,
          kind: 'expire',
          content,
          meta: { contractId: c.id, plate: c.plate, contractNo: c.contractNo, stage },
          result: { ok: sent.ok, msgId: sent.msgId, msgType: sent.msgType, resultCode: sent.resultCode, message: sent.message },
        });
        if (sent.ok) result.sent += 1;
        else result.errors += 1;
      }
    }
  }

  // 3. 검사 만기 — assets.inspectionTo 가 D-30/D-7/D-Day 면 active contract 임차인에게
  for (const a of assets) {
    if (a.deletedAt) continue;
    if (!a.inspectionTo) continue;
    const days = daysBetween(today, a.inspectionTo);
    let stage: '30' | '7' | '0' | null = null;
    if (days === 30) stage = '30';
    else if (days === 7) stage = '7';
    else if (days === 0) stage = '0';
    if (!stage) continue;

    const contract = activeByPlate.get(a.plate);
    if (!contract || !contract.customerPhone) { result.skipped += 1; continue; }
    const company = companies.find((co) => !co.deletedAt && co.code === a.companyCode);

    const recent = logs.find((l) =>
      l.kind === 'inspection'
      && l.meta?.contractId === contract.id
      && l.meta?.stage === stage
      && Date.parse(l.at) > now - DAYS_7,
    );
    if (recent) { result.skipped += 1; continue; }

    const content = inspectionContent({
      companyName: company?.name,
      customerName: contract.customerName,
      plate: a.plate,
      customerIdent: contract.customerIdent,
      daysLeft: days,
      endDate: a.inspectionTo,
      companyPhone: company?.phone,
    });
    const sent = await sendSms({ to: contract.customerPhone, content });
    await db.ref('sms_logs').push({
      at: new Date().toISOString(),
      actor: { uid: 'system:cron' },
      to: contract.customerPhone,
      kind: 'inspection',
      content,
      meta: { contractId: contract.id, plate: a.plate, contractNo: contract.contractNo, stage },
      result: { ok: sent.ok, msgId: sent.msgId, msgType: sent.msgType, resultCode: sent.resultCode, message: sent.message },
    });
    if (sent.ok) result.sent += 1;
    else result.errors += 1;
  }

  // 4. 보험 만기 — insurance.endDate 가 D-30/D-7/D-Day 면 그 차량 active contract 임차인에게
  for (const p of policies) {
    if (p.deletedAt) continue;
    if (!p.endDate || !p.carNumber) continue;
    const days = daysBetween(today, p.endDate);
    let stage: '30' | '7' | '0' | null = null;
    if (days === 30) stage = '30';
    else if (days === 7) stage = '7';
    else if (days === 0) stage = '0';
    if (!stage) continue;

    const contract = activeByPlate.get(p.carNumber);
    if (!contract || !contract.customerPhone) { result.skipped += 1; continue; }
    const company = companies.find((co) => !co.deletedAt && co.code === p.companyCode);

    const recent = logs.find((l) =>
      l.kind === 'insurance'
      && l.meta?.contractId === contract.id
      && l.meta?.stage === stage
      && Date.parse(l.at) > now - DAYS_7,
    );
    if (recent) { result.skipped += 1; continue; }

    const content = insuranceContent({
      companyName: company?.name,
      customerName: contract.customerName,
      plate: p.carNumber,
      customerIdent: contract.customerIdent,
      daysLeft: days,
      endDate: p.endDate,
      companyPhone: company?.phone,
    });
    const sent = await sendSms({ to: contract.customerPhone, content });
    await db.ref('sms_logs').push({
      at: new Date().toISOString(),
      actor: { uid: 'system:cron' },
      to: contract.customerPhone,
      kind: 'insurance',
      content,
      meta: { contractId: contract.id, plate: p.carNumber, contractNo: contract.contractNo, stage },
      result: { ok: sent.ok, msgId: sent.msgId, msgType: sent.msgType, resultCode: sent.resultCode, message: sent.message },
    });
    if (sent.ok) result.sent += 1;
    else result.errors += 1;
  }

  return NextResponse.json(result);
}
