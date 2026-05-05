'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { ArrowLeft } from '@phosphor-icons/react';
import { normalizePlate, normalizeIdent } from '@/lib/customer-match';
import type { Contract } from '@/lib/sample-contracts';
import type { Asset } from '@/lib/sample-assets';
import type { InsurancePolicy } from '@/lib/sample-insurance';
import type { Company } from '@/lib/sample-companies';
import { CustomerView } from '@/components/customer/customer-view';

/**
 * 손님 페이지 본문 — /customer/[plate]?ident=...
 *
 * 흐름:
 *  1. URL 의 ?ident= 와 plate → sessionStorage 로 옮기고 URL 정리
 *  2. /api/customer/lookup POST { plate, ident } 서버 매칭 (Firebase Admin SDK)
 *  3. 결과 → CustomerView 렌더, 미매칭 → 안내
 *
 * 보안: 클라이언트는 RTDB 직접 구독하지 않음. RTDB Rules 가 비인증 read 차단.
 */

type LookupResponse = {
  contract: Contract;
  asset: Asset | null;
  insurance: InsurancePolicy | null;
  company: Company | null;
};

type LoadState =
  | { kind: 'init' }
  | { kind: 'loading' }
  | { kind: 'no-ident' }
  | { kind: 'not-found' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; data: LookupResponse };

export default function CustomerViewPage() {
  const params = useParams();
  const search = useSearchParams();
  const router = useRouter();
  const plate = decodeURIComponent((params?.plate as string) ?? '');

  const [state, setState] = useState<LoadState>({ kind: 'init' });

  useEffect(() => {
    const KEY = `cx:ident:${normalizePlate(plate)}`;
    const fromUrl = search?.get('ident');
    let ident: string | null = null;

    if (fromUrl) {
      ident = normalizeIdent(fromUrl);
      sessionStorage.setItem(KEY, ident);
      // URL 에서 ident 제거 (뒤로가기 시에도 노출 안 되게)
      window.history.replaceState(null, '', window.location.pathname);
    } else {
      ident = sessionStorage.getItem(KEY);
    }

    if (!ident) {
      setState({ kind: 'no-ident' });
      return;
    }

    setState({ kind: 'loading' });

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/customer/lookup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plate, ident }),
        });
        if (cancelled) return;
        if (res.status === 404) {
          setState({ kind: 'not-found' });
          return;
        }
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          setState({ kind: 'error', message: err?.detail ?? `${res.status}` });
          return;
        }
        const data = (await res.json()) as LookupResponse;
        setState({ kind: 'ready', data });
      } catch (e) {
        if (cancelled) return;
        setState({ kind: 'error', message: (e as Error).message });
      }
    })();

    return () => { cancelled = true; };
  }, [plate, search]);

  if (state.kind === 'init' || state.kind === 'loading') {
    return (
      <main className="cx-main">
        <div className="cx-card cx-empty">조회 중...</div>
      </main>
    );
  }

  if (state.kind === 'no-ident') {
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

  if (state.kind === 'not-found') {
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

  if (state.kind === 'error') {
    return (
      <main className="cx-main">
        <button type="button" className="cx-back" onClick={() => router.push('/customer')}>
          <ArrowLeft size={14} weight="bold" /> 다시 조회
        </button>
        <div className="cx-card">
          <h1 className="cx-h1">조회 중 오류</h1>
          <p className="cx-lead">잠시 후 다시 시도해주세요.</p>
          <p className="cx-field-hint" style={{ marginTop: 8 }}>{state.message}</p>
        </div>
      </main>
    );
  }

  const { contract, asset, insurance, company } = state.data;
  return <CustomerView contract={contract} asset={asset} insurance={insurance} company={company} />;
}
