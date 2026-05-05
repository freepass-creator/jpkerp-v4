import { NextResponse } from 'next/server';
import { getAdminRtdb } from '@/lib/firebase/admin';
import { findCustomerContract, normalizePlate } from '@/lib/customer-match';
import type { Contract } from '@/lib/sample-contracts';
import type { Asset } from '@/lib/sample-assets';
import type { InsurancePolicy } from '@/lib/sample-insurance';
import type { Company } from '@/lib/sample-companies';
import { asArray } from '@/lib/store-utils';

/**
 * 손님 페이지 매칭 — 서버에서 Firebase Admin SDK 로 RTDB 조회 후 1건만 반환.
 *
 * RTDB Rules 가 contracts/assets/companies/insurances 의 비인증 read 를 차단하므로
 * 클라이언트는 직접 못 읽음 → 이 API 통해서만 손님이 자기 계약 조회 가능.
 *
 * 입력  : POST { plate: string, ident: string }
 * 응답  : 200 { contract, asset, insurance, company }   매칭 시
 *         404 { error: 'not_found' }                    미매칭
 *         400 { error: 'bad_request' }                  입력 누락
 *         500 { error: 'server_error', detail: ... }   내부 오류
 *
 * 보안 노트:
 *  - rate limit 미적용 — 실 운영 전 추가 (IP 단위 분당 N회 등)
 *  - 응답에서 audit-fields 제거 (createdBy 등 직원 정보)
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type LookupResponse = {
  contract: SafeContract;
  asset: Asset | null;
  insurance: InsurancePolicy | null;
  company: SafeCompany | null;
};

/** 손님에게 노출할 Contract — audit fields 등 내부 정보 제거. */
type SafeContract = Omit<Contract, 'createdBy' | 'createdAt' | 'updatedBy' | 'updatedAt' | 'deletedBy'>;

/** 손님에게 노출할 Company — audit fields 제거. */
type SafeCompany = Omit<Company, 'createdBy' | 'createdAt' | 'updatedBy' | 'updatedAt' | 'deletedBy'>;

/** RTDB 가 sparse 배열 → 객체로 저장하는 케이스 대응 (events 정규화). */
function normalizeContract(c: Contract): Contract {
  const ev = (c as Contract & { events?: unknown }).events;
  if (ev && !Array.isArray(ev) && typeof ev === 'object') {
    return { ...c, events: Object.values(ev) as Contract['events'] };
  }
  return c;
}

function stripAudit<T extends Record<string, unknown>>(o: T): Omit<T, 'createdBy' | 'createdAt' | 'updatedBy' | 'updatedAt' | 'deletedBy'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { createdBy, createdAt, updatedBy, updatedAt, deletedBy, ...rest } = o;
  return rest;
}

export async function POST(req: Request) {
  let body: { plate?: string; ident?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const plate = (body.plate ?? '').toString();
  const ident = (body.ident ?? '').toString();
  if (!plate.trim() || !ident.trim()) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  try {
    const db = getAdminRtdb();

    const [contractsSnap, assetsSnap, companiesSnap, insurancesSnap] = await Promise.all([
      db.ref('contracts').once('value'),
      db.ref('assets').once('value'),
      db.ref('companies').once('value'),
      db.ref('insurances').once('value'),
    ]);

    const contracts = asArray<Contract>(contractsSnap.val()).map(normalizeContract);
    const assets = asArray<Asset>(assetsSnap.val());
    const companies = asArray<Company>(companiesSnap.val());
    const insurances = asArray<InsurancePolicy>(insurancesSnap.val());

    const contract = findCustomerContract(contracts, plate, ident);
    if (!contract) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    const np = normalizePlate(contract.plate);

    const asset = assets.find(
      (a) => !a.deletedAt && a.companyCode === contract.companyCode && normalizePlate(a.plate) === np,
    ) ?? null;

    const company = companies.find((c) => !c.deletedAt && c.code === contract.companyCode) ?? null;

    const today = new Date().toISOString().slice(0, 10);
    const candidates = insurances.filter(
      (p) => !p.deletedAt
        && p.companyCode === contract.companyCode
        && p.carNumber && normalizePlate(p.carNumber) === np,
    );
    candidates.sort((a, b) => {
      const aValid = (a.endDate ?? '') >= today ? 0 : 1;
      const bValid = (b.endDate ?? '') >= today ? 0 : 1;
      if (aValid !== bValid) return aValid - bValid;
      return (b.endDate ?? '').localeCompare(a.endDate ?? '');
    });
    const insurance = candidates[0] ?? null;

    const response: LookupResponse = {
      contract: stripAudit(contract as unknown as Record<string, unknown>) as unknown as SafeContract,
      asset,
      insurance,
      company: company ? (stripAudit(company as unknown as Record<string, unknown>) as unknown as SafeCompany) : null,
    };
    return NextResponse.json(response);
  } catch (e) {
    console.error('[customer/lookup] error', e);
    return NextResponse.json(
      { error: 'server_error', detail: (e as Error).message ?? 'unknown' },
      { status: 500 },
    );
  }
}
