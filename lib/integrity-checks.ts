/**
 * 데이터 정합성 점검 — 자산/계약/계좌내역 간 모순/누락 탐지.
 *
 * 항목:
 *   1. 회사 미매칭 자산 — asset.companyCode === ''
 *   2. 회사 미매칭 계약 — contract.companyCode === ''
 *   3. 자산-계약 plate 불일치 — 운행중 계약 plate 가 자산에 없음
 *   4. 이번달 계좌내역 미업로드 회사 — 회사 등록 O 인데 ledger this-month entries 0
 *
 * 모두 O(N) lookup — Set/Map 기반.
 */
import type { Asset } from './sample-assets';
import type { Contract } from './sample-contracts';
import type { Company } from './sample-companies';
import type { LedgerEntry } from './sample-finance';

export type IntegrityKind = '회사미매칭자산' | '회사미매칭계약' | 'plate불일치' | '계좌내역누락';

export type IntegrityRow = {
  id: string;
  kind: IntegrityKind;
  /** 영향받는 회사코드 (있으면) */
  companyCode: string;
  /** 차량번호 (자산·계약 정합성에서 채움) */
  plate: string;
  /** 임차인 / 회사명 등 식별 텍스트 */
  target: string;
  /** 사람이 읽는 설명 */
  description: string;
  /** 클릭 시 이동할 라우트 (있으면) */
  href?: string;
  /** 라벨링용 추가 정보 — 회차·금액·일자 등 */
  extra?: string;
};

/** 회사 미매칭 자산 — OCR 후 회사 자동 매칭 실패한 자산. */
export function checkCompanyMissingAssets(assets: readonly Asset[]): IntegrityRow[] {
  return assets
    .filter((a) => !a.companyCode && a.status !== '매각')
    .map((a) => ({
      id: `cma-${a.id}`,
      kind: '회사미매칭자산' as const,
      companyCode: '',
      plate: a.plate,
      target: a.vehicleName || a.vehicleClass || '',
      description: '회사코드 비어있음 — 자산수정에서 회사 지정 필요',
      href: `/asset?selected=${a.id}`,
      extra: a.ownerName ? `명의: ${a.ownerName}` : undefined,
    }));
}

/** 회사 미매칭 계약. */
export function checkCompanyMissingContracts(contracts: readonly Contract[]): IntegrityRow[] {
  return contracts
    .filter((c) => !c.companyCode && c.status !== '만기' && c.status !== '해지')
    .map((c) => ({
      id: `cmc-${c.id}`,
      kind: '회사미매칭계약' as const,
      companyCode: '',
      plate: c.plate,
      target: c.customerName,
      description: '회사코드 비어있음 — 계약수정에서 회사 지정 필요',
      href: `/contract?selected=${c.id}`,
      extra: c.contractNo,
    }));
}

/** 자산-계약 plate 불일치 — 운행중 계약 plate 가 자산 store 에 없음. */
export function checkPlateMismatch(
  assets: readonly Asset[],
  contracts: readonly Contract[],
): IntegrityRow[] {
  const assetPlates = new Set(assets.map((a) => a.plate));
  return contracts
    .filter((c) => c.status === '운행중' && !assetPlates.has(c.plate))
    .map((c) => ({
      id: `pm-${c.id}`,
      kind: 'plate불일치' as const,
      companyCode: c.companyCode,
      plate: c.plate,
      target: c.customerName,
      description: '운행중 계약인데 해당 차량이 자산에 등록 안 됨',
      href: `/contract?selected=${c.id}`,
      extra: c.contractNo,
    }));
}

/** 이번 달 계좌내역 미업로드 회사. */
export function checkMissingLedgerThisMonth(
  companies: readonly Company[],
  entries: readonly LedgerEntry[],
): IntegrityRow[] {
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const companiesWithEntries = new Set<string>();
  for (const e of entries) {
    if (!e.txDate) continue;
    if (e.txDate.startsWith(thisMonth) && e.companyCode) {
      companiesWithEntries.add(e.companyCode);
    }
  }

  return companies
    .filter((c) => !companiesWithEntries.has(c.code))
    .map((c) => ({
      id: `ml-${c.code}`,
      kind: '계좌내역누락' as const,
      companyCode: c.code,
      plate: '',
      target: c.name,
      description: `${thisMonth} 계좌내역 미업로드`,
      href: `/finance`,
      extra: `회사: ${c.code}`,
    }));
}

/** 모두 합쳐서 한 배열. 정렬: 종류 → 회사 → plate */
export function collectIntegrity(
  assets: readonly Asset[],
  contracts: readonly Contract[],
  companies: readonly Company[],
  entries: readonly LedgerEntry[],
): IntegrityRow[] {
  const all: IntegrityRow[] = [
    ...checkCompanyMissingAssets(assets),
    ...checkCompanyMissingContracts(contracts),
    ...checkPlateMismatch(assets, contracts),
    ...checkMissingLedgerThisMonth(companies, entries),
  ];
  all.sort((a, b) => a.kind.localeCompare(b.kind) || a.companyCode.localeCompare(b.companyCode) || a.plate.localeCompare(b.plate));
  return all;
}
