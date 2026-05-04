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

export type IntegrityKind =
  | '회사미매칭자산'
  | '회사미매칭계약'
  | 'plate불일치'
  | '계좌내역누락'
  | '자산필드누락'
  | '계약필드누락'
  | '회사필드누락'
  | '매각자산계약중'   // asset 매각인데 운행중 계약 존재
  | '회사불일치'      // 같은 plate 자산회사 ≠ 계약회사
  | '날짜역전계약'    // 계약 시작일 > 만기일
  | '날짜역전검사'    // 검사 시작 > 만기
  | '보증금분납불일치'; // 보증금 분납 합 ≠ 보증금

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

/** 자산 필수 필드 누락 — 차량번호·차대번호·차명·최초등록일·소유자명. */
export function checkAssetRequiredFields(assets: readonly Asset[]): IntegrityRow[] {
  const out: IntegrityRow[] = [];
  for (const a of assets) {
    if (a.status === '매각') continue;
    const missing: string[] = [];
    if (!a.plate)            missing.push('차량번호');
    if (!a.vin)              missing.push('차대번호');
    if (!a.vehicleName)      missing.push('차명');
    if (!a.firstRegistDate)  missing.push('최초등록일');
    if (!a.ownerName)        missing.push('소유자명');
    if (missing.length === 0) continue;
    out.push({
      id: `arf-${a.id}`,
      kind: '자산필드누락',
      companyCode: a.companyCode,
      plate: a.plate ?? '',
      target: a.vehicleName || a.vehicleClass || '(차명 미입력)',
      description: `필수 항목 누락: ${missing.join(', ')}`,
      href: `/asset?selected=${a.id}`,
    });
  }
  return out;
}

/** 계약 필수 필드 누락 — 차량번호·고객명·신분·등록번호·연락처·시작/만기·월대여료. */
export function checkContractRequiredFields(contracts: readonly Contract[]): IntegrityRow[] {
  const out: IntegrityRow[] = [];
  for (const c of contracts) {
    if (c.status === '만기' || c.status === '해지') continue;
    const missing: string[] = [];
    if (!c.plate)          missing.push('차량번호');
    if (!c.customerName)   missing.push('고객명');
    if (!c.customerKind)   missing.push('신분');
    if (!c.customerIdent)  missing.push('등록번호');
    if (!c.customerPhone)  missing.push('연락처');
    if (!c.startDate)      missing.push('시작일');
    if (!c.endDate)        missing.push('만기일');
    if (!c.monthlyAmount)  missing.push('월대여료');
    if (missing.length === 0) continue;
    out.push({
      id: `crf-${c.id}`,
      kind: '계약필드누락',
      companyCode: c.companyCode,
      plate: c.plate ?? '',
      target: c.customerName || '(고객명 미입력)',
      description: `필수 항목 누락: ${missing.join(', ')}`,
      href: `/contract?selected=${c.id}`,
      extra: c.contractNo,
    });
  }
  return out;
}

/** 회사 필수 필드 누락 — 사업자번호·대표자·본점주소·업태·업종·대표전화. */
export function checkCompanyRequiredFields(companies: readonly Company[]): IntegrityRow[] {
  const out: IntegrityRow[] = [];
  for (const c of companies) {
    const missing: string[] = [];
    if (!c.name)         missing.push('회사명');
    if (!c.bizNo)        missing.push('사업자등록번호');
    if (!c.ceo)          missing.push('대표자');
    if (!c.hqAddress)    missing.push('본점주소');
    if (!c.bizType)      missing.push('업태');
    if (!c.bizCategory)  missing.push('업종');
    if (!c.phone)        missing.push('대표전화');
    if (missing.length === 0) continue;
    out.push({
      id: `corf-${c.code}`,
      kind: '회사필드누락',
      companyCode: c.code,
      plate: '',
      target: c.name || '(회사명 미입력)',
      description: `필수 항목 누락: ${missing.join(', ')}`,
      href: `/admin/company`,
    });
  }
  return out;
}

/** 매각된 자산인데 운행중 계약이 있음 — 말이 안 됨. */
export function checkSoldButActive(
  assets: readonly Asset[],
  contracts: readonly Contract[],
): IntegrityRow[] {
  const soldPlates = new Set(assets.filter((a) => a.status === '매각').map((a) => a.plate));
  return contracts
    .filter((c) => c.status === '운행중' && soldPlates.has(c.plate))
    .map((c) => ({
      id: `sba-${c.id}`,
      kind: '매각자산계약중' as const,
      companyCode: c.companyCode,
      plate: c.plate,
      target: c.customerName,
      description: '자산 상태 매각인데 계약은 운행중 — 자산/계약 중 하나 정정 필요',
      href: `/contract?selected=${c.id}`,
      extra: c.contractNo,
    }));
}

/** 같은 plate 인데 자산회사 ≠ 계약회사. */
export function checkCompanyMismatch(
  assets: readonly Asset[],
  contracts: readonly Contract[],
): IntegrityRow[] {
  const assetByPlate = new Map<string, Asset>();
  for (const a of assets) assetByPlate.set(a.plate, a);
  const out: IntegrityRow[] = [];
  for (const c of contracts) {
    if (c.status === '만기' || c.status === '해지') continue;
    if (!c.plate || !c.companyCode) continue;
    const a = assetByPlate.get(c.plate);
    if (!a || !a.companyCode) continue;
    if (a.companyCode === c.companyCode) continue;
    out.push({
      id: `cmm-${c.id}`,
      kind: '회사불일치' as const,
      companyCode: c.companyCode,
      plate: c.plate,
      target: c.customerName,
      description: `자산 회사(${a.companyCode}) ≠ 계약 회사(${c.companyCode}) — 회계 분리 위험`,
      href: `/contract?selected=${c.id}`,
      extra: c.contractNo,
    });
  }
  return out;
}

/** 계약 시작일 > 만기일 — 날짜 거꾸로. */
export function checkContractDateReversal(contracts: readonly Contract[]): IntegrityRow[] {
  return contracts
    .filter((c) => c.startDate && c.endDate && c.startDate > c.endDate)
    .map((c) => ({
      id: `cdr-${c.id}`,
      kind: '날짜역전계약' as const,
      companyCode: c.companyCode,
      plate: c.plate,
      target: c.customerName,
      description: `시작 ${c.startDate} > 만기 ${c.endDate} — 날짜 입력 오류`,
      href: `/contract?selected=${c.id}`,
      extra: c.contractNo,
    }));
}

/** 검사 시작 > 만기 — 자산 등록증 입력 오류. */
export function checkInspectionDateReversal(assets: readonly Asset[]): IntegrityRow[] {
  return assets
    .filter((a) => a.inspectionFrom && a.inspectionTo && a.inspectionFrom > a.inspectionTo)
    .map((a) => ({
      id: `idr-${a.id}`,
      kind: '날짜역전검사' as const,
      companyCode: a.companyCode,
      plate: a.plate,
      target: a.vehicleName || a.vehicleClass || '',
      description: `검사 시작 ${a.inspectionFrom} > 만기 ${a.inspectionTo}`,
      href: `/asset?selected=${a.id}`,
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
    ...checkAssetRequiredFields(assets),
    ...checkContractRequiredFields(contracts),
    ...checkCompanyRequiredFields(companies),
    ...checkSoldButActive(assets, contracts),
    ...checkCompanyMismatch(assets, contracts),
    ...checkContractDateReversal(contracts),
    ...checkInspectionDateReversal(assets),
  ];
  all.sort((a, b) => a.kind.localeCompare(b.kind) || a.companyCode.localeCompare(b.companyCode) || a.plate.localeCompare(b.plate));
  return all;
}
