'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { ArrowLeft } from '@phosphor-icons/react';
import { useContractStore } from '@/lib/use-contract-store';
import { useAssetStore } from '@/lib/use-asset-store';
import { useCompanyStore } from '@/lib/use-company-store';
import { useInsuranceStore } from '@/lib/use-insurance-store';
import { findCustomerContract, normalizePlate, normalizeIdent } from '@/lib/customer-match';
import type { Contract } from '@/lib/sample-contracts';
import { CustomerView } from '@/components/customer/customer-view';

/**
 * 손님 페이지 본문 — /customer/[plate]?ident=...
 *
 * 흐름:
 *  1. URL 의 ?ident= 와 plate 매칭
 *  2. ident 는 즉시 sessionStorage 로 옮기고 URL 에서 제거 (history.replaceState)
 *  3. 새로고침 시 sessionStorage 에서 복구
 *  4. 일치하는 계약 → CustomerView 렌더, 미일치 → 안내 + [다시 조회]
 */
export default function CustomerViewPage() {
  const params = useParams();
  const search = useSearchParams();
  const router = useRouter();
  const plate = decodeURIComponent((params?.plate as string) ?? '');

  const [ident, setIdent] = useState<string | null>(null);
  const [identReady, setIdentReady] = useState(false);

  // ident 한 번만 로드: URL → sessionStorage → URL 정리
  useEffect(() => {
    const KEY = `cx:ident:${normalizePlate(plate)}`;
    const fromUrl = search?.get('ident');
    if (fromUrl) {
      const norm = normalizeIdent(fromUrl);
      sessionStorage.setItem(KEY, norm);
      setIdent(norm);
      const cleanUrl = window.location.pathname;
      window.history.replaceState(null, '', cleanUrl);
    } else {
      const stored = sessionStorage.getItem(KEY);
      setIdent(stored);
    }
    setIdentReady(true);
  }, [plate, search]);

  const [contracts] = useContractStore();
  const [assets] = useAssetStore();
  const [companies] = useCompanyStore();
  const [policies] = useInsuranceStore();

  const contract = useMemo<Contract | null>(() => {
    if (!ident) return null;
    return findCustomerContract(contracts, plate, ident);
  }, [contracts, plate, ident]);

  const asset = useMemo(() => {
    if (!contract) return null;
    return assets.find(
      (a) => normalizePlate(a.plate) === normalizePlate(contract.plate) && a.companyCode === contract.companyCode,
    ) ?? null;
  }, [assets, contract]);

  const company = useMemo(() => {
    if (!contract) return null;
    return companies.find((c) => c.code === contract.companyCode) ?? null;
  }, [companies, contract]);

  const insurance = useMemo(() => {
    if (!contract) return null;
    const today = new Date().toISOString().slice(0, 10);
    const matches = policies.filter(
      (p) => !p.deletedAt
        && p.carNumber && normalizePlate(p.carNumber) === normalizePlate(contract.plate)
        && p.companyCode === contract.companyCode,
    );
    // 유효(미만료) 우선, 다음 가장 최근 endDate
    matches.sort((a, b) => {
      const aValid = (a.endDate ?? '') >= today ? 0 : 1;
      const bValid = (b.endDate ?? '') >= today ? 0 : 1;
      if (aValid !== bValid) return aValid - bValid;
      return (b.endDate ?? '').localeCompare(a.endDate ?? '');
    });
    return matches[0] ?? null;
  }, [policies, contract]);

  if (!identReady) {
    return (
      <main className="cx-main">
        <div className="cx-card cx-empty">조회 중...</div>
      </main>
    );
  }

  if (!ident) {
    return (
      <main className="cx-main">
        <div className="cx-card">
          <h1 className="cx-h1">조회 정보 없음</h1>
          <p className="cx-lead">새로고침 등으로 정보가 사라졌습니다. 다시 조회해주세요.</p>
          <Link href="/customer" className="cx-submit" style={{ display: 'inline-block', textDecoration: 'none', textAlign: 'center' }}>
            다시 조회
          </Link>
        </div>
      </main>
    );
  }

  if (!contract) {
    return (
      <main className="cx-main">
        <button type="button" className="cx-back" onClick={() => router.push('/customer')}>
          <ArrowLeft size={14} weight="bold" /> 다시 조회
        </button>
        <div className="cx-card">
          <h1 className="cx-h1">일치하는 계약이 없습니다</h1>
          <p className="cx-lead">
            차량번호 <strong>{plate}</strong> 와 입력하신 등록번호가 일치하는 계약을 찾을 수 없습니다.
            차량번호와 등록번호를 다시 확인해주세요.
          </p>
        </div>
      </main>
    );
  }

  return <CustomerView contract={contract} asset={asset} insurance={insurance} company={company} />;
}
