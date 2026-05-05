'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, MagnifyingGlass, Car } from '@phosphor-icons/react';
import { useAssetStore } from '@/lib/use-asset-store';
import { useContractStore } from '@/lib/use-contract-store';
import type { Asset } from '@/lib/sample-assets';
import type { Contract } from '@/lib/sample-contracts';

/**
 * 모바일 조회 — 차량번호/계약번호/이름/연락처 어느 것이든.
 *
 *  · 검색어 정규화: 공백/하이픈 제거 후 비교
 *  · 결과: 자산(차량) 위주, 매칭 contract 가 있으면 같이 표시
 *  · 행 클릭 → /m/search/[plate] 상세 (후속) — 일단 데스크탑 /asset 또는 /contract 로 이동
 */
export default function MobileSearch() {
  const router = useRouter();
  const [allAssets] = useAssetStore();
  const [allContracts] = useContractStore();
  const [q, setQ] = useState('');

  const assets = useMemo(() => allAssets.filter((a) => !a.deletedAt), [allAssets]);
  const contracts = useMemo(() => allContracts.filter((c) => !c.deletedAt), [allContracts]);

  const results = useMemo(() => {
    const norm = (s: string) => s.replace(/[\s-]/g, '').toLowerCase();
    const query = norm(q);
    if (!query) return [];

    type Hit = {
      asset: Asset | null;
      contract: Contract | null;
      plate: string;
      label: string;
    };

    const seen = new Set<string>(); // plate-companyCode key 중복 방지
    const hits: Hit[] = [];

    // 1) 자산 매칭 (차량번호 / 차명 / VIN / 임차인 명)
    for (const a of assets) {
      const fields = [a.plate, a.vehicleName, a.vin, a.ownerName].filter(Boolean) as string[];
      if (!fields.some((f) => norm(f).includes(query))) continue;
      const key = `${a.companyCode}|${a.plate}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const matchedContract = contracts.find((c) => c.plate === a.plate && c.companyCode === a.companyCode && c.status !== '만기' && c.status !== '해지');
      hits.push({ asset: a, contract: matchedContract ?? null, plate: a.plate, label: a.vehicleName ?? '' });
    }

    // 2) 계약 매칭 (계약번호 / 손님명 / 손님 식별번호 / 손님 연락처) 중 자산에 없는 추가
    for (const c of contracts) {
      const fields = [c.contractNo, c.customerName, c.customerIdent, c.customerPhone, c.plate].filter(Boolean) as string[];
      if (!fields.some((f) => norm(f).includes(query))) continue;
      const key = `${c.companyCode}|${c.plate}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const matchedAsset = assets.find((a) => a.plate === c.plate && a.companyCode === c.companyCode);
      hits.push({ asset: matchedAsset ?? null, contract: c, plate: c.plate, label: matchedAsset?.vehicleName ?? c.customerName });
    }

    // 운행중 계약 우선
    hits.sort((a, b) => {
      const av = a.contract?.status === '운행중' ? 0 : 1;
      const bv = b.contract?.status === '운행중' ? 0 : 1;
      if (av !== bv) return av - bv;
      return a.plate.localeCompare(b.plate);
    });

    return hits.slice(0, 50);
  }, [assets, contracts, q]);

  return (
    <>
      <header className="m-topbar">
        <button type="button" className="m-topbar-back" onClick={() => router.push('/m')}>
          <ArrowLeft size={16} weight="bold" /> 홈
        </button>
        <div className="m-topbar-title">조회</div>
        <span style={{ width: 40 }} />
      </header>

      <main className="m-main">
        <div className="m-search-bar">
          <MagnifyingGlass size={18} className="m-search-icon" />
          <input
            type="search"
            inputMode="search"
            autoFocus
            placeholder="차량번호 / 계약번호 / 이름 / 연락처"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {q.trim() === '' ? (
          <div className="m-empty">
            <Car size={36} className="m-empty-icon" />
            <div>검색어를 입력하세요</div>
            <div className="text-weak text-xs mt-1">공백·하이픈 무시. 부분 일치 가능.</div>
          </div>
        ) : results.length === 0 ? (
          <div className="m-empty">
            <MagnifyingGlass size={36} className="m-empty-icon" />
            <div>일치하는 결과 없음</div>
            <div className="text-weak text-xs mt-1">다른 키워드로 다시 시도해보세요.</div>
          </div>
        ) : (
          <div className="m-result-list">
            {results.map((r, i) => (
              <ResultRow key={`${r.plate}-${i}`} hit={r} />
            ))}
          </div>
        )}
      </main>
    </>
  );
}

function ResultRow({ hit }: { hit: { asset: import('@/lib/sample-assets').Asset | null; contract: import('@/lib/sample-contracts').Contract | null; plate: string; label: string } }) {
  const status = hit.contract?.status ?? hit.asset?.status ?? '';
  const cls =
    status === '운행중' ? 'm-result-status-active' :
    status === '만기' || status === '해지' || status === '매각' ? 'm-result-status-danger' :
    status === '대기' || status === '등록예정' || status === '정비' ? 'm-result-status-warn' :
    '';
  return (
    <Link href={`/m/upload?plate=${encodeURIComponent(hit.plate)}`} className="m-result-row">
      <div className="m-result-row-head">
        <span className="m-result-plate">{hit.plate}</span>
        {status && <span className={`m-result-status ${cls}`}>{status}</span>}
      </div>
      <div className="m-result-meta">
        {hit.asset?.vehicleName && <span>{hit.asset.vehicleName}</span>}
        {hit.contract && (
          <>
            {hit.asset?.vehicleName && <span> · </span>}
            <span>{hit.contract.customerName}</span>
            <span className="text-weak"> · {hit.contract.contractNo}</span>
          </>
        )}
        {!hit.contract && !hit.asset?.vehicleName && <span className="text-weak">정보 없음</span>}
      </div>
    </Link>
  );
}
