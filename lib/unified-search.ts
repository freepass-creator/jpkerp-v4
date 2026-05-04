'use client';

/**
 * 통합 검색 — 차량 / 계약 / 임차인 한 입력창에서.
 *
 * 결과는 그룹별로 (계약·차량). 검색어는 정확/prefix/초성 매칭.
 * 페이지·폼에서 동일하게 사용:
 *   const results = useUnifiedSearch(query);
 *   // results.contracts / .assets
 */

import { useMemo } from 'react';
import { useAssetStore } from './use-asset-store';
import { useContractStore } from './use-contract-store';
import type { Asset } from './sample-assets';
import type { Contract } from './sample-contracts';
import { fuzzyMatch } from './hangul';

export type SearchHit =
  | { kind: 'contract'; contract: Contract; asset?: Asset }
  | { kind: 'asset'; asset: Asset; contract?: Contract };

const MAX_RESULTS = 30;

function contractText(c: Contract): string {
  return [c.companyCode, c.contractNo, c.plate, c.customerName, c.customerPhone, c.customerIdent]
    .filter(Boolean).join(' ');
}

function assetText(a: Asset): string {
  return [a.companyCode, a.plate, a.vehicleName, a.vehicleClass, a.vin, a.ownerName]
    .filter(Boolean).join(' ');
}

export function useUnifiedSearch(query: string): SearchHit[] {
  const [assets] = useAssetStore();
  const [contracts] = useContractStore();

  return useMemo(() => {
    const q = query.trim();
    if (q.length < 1) return [];

    const hits: SearchHit[] = [];
    const assetByPlate = new Map<string, Asset>();
    for (const a of assets) assetByPlate.set(a.plate, a);
    const contractByPlate = new Map<string, Contract>();
    for (const c of contracts) {
      if (c.status === '운행중') contractByPlate.set(c.plate, c);
    }

    // 1) 계약 — 활성/모두 다 검색
    for (const c of contracts) {
      if (fuzzyMatch(contractText(c), q)) {
        hits.push({ kind: 'contract', contract: c, asset: assetByPlate.get(c.plate) });
        if (hits.length >= MAX_RESULTS) break;
      }
    }

    // 2) 자산 — 위 계약에서 plate 잡힌 건 중복 제외
    if (hits.length < MAX_RESULTS) {
      const usedPlates = new Set(hits
        .filter((h): h is Extract<SearchHit, { kind: 'contract' }> => h.kind === 'contract')
        .map((h) => h.contract.plate));
      for (const a of assets) {
        if (usedPlates.has(a.plate)) continue;
        if (fuzzyMatch(assetText(a), q)) {
          hits.push({ kind: 'asset', asset: a, contract: contractByPlate.get(a.plate) });
          if (hits.length >= MAX_RESULTS) break;
        }
      }
    }

    return hits;
  }, [query, assets, contracts]);
}
