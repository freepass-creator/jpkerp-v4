'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { normalizePlate, normalizeIdent } from '@/lib/customer-match';

/**
 * 손님 페이지 진입 — 차량번호 + 등록번호 입력 → /customer/[plate]?ident=... 로 이동.
 * 인증·로그인 X. 매칭 자체가 인증 역할.
 */
export default function CustomerEntryPage() {
  const router = useRouter();
  const [plate, setPlate] = useState('');
  const [ident, setIdent] = useState('');
  const [busy, setBusy] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const p = normalizePlate(plate);
    const i = normalizeIdent(ident);
    if (!p || !i) return;
    setBusy(true);
    router.push(`/customer/${encodeURIComponent(p)}?ident=${encodeURIComponent(i)}`);
  }

  return (
    <>
      <main className="cx-main">
        <section className="cx-card">
          <h1 className="cx-h1">내 계약 조회</h1>
          <p className="cx-lead">차량번호와 등록번호로 본인 계약·수납 내역을 확인하실 수 있습니다.</p>

          <form className="cx-form" onSubmit={handleSubmit} noValidate>
            <div className="cx-field">
              <label htmlFor="cx-plate">차량번호</label>
              <input
                id="cx-plate"
                inputMode="text"
                autoComplete="off"
                placeholder="예) 12가3456"
                value={plate}
                onChange={(e) => setPlate(e.target.value)}
                required
              />
            </div>
            <div className="cx-field">
              <label htmlFor="cx-ident">등록번호</label>
              <input
                id="cx-ident"
                inputMode="numeric"
                autoComplete="off"
                placeholder="생년월일 / 사업자번호 / 법인번호 / 전화번호"
                value={ident}
                onChange={(e) => setIdent(e.target.value)}
                required
              />
              <span className="cx-field-hint">
                다음 중 아무거나 — 생년월일 6자리(900101) · 사업자번호 10자리 · 법인번호 13자리 · 전화번호. 하이픈은 자동 처리.
              </span>
            </div>
            <button type="submit" className="cx-submit" disabled={busy || !plate.trim() || !ident.trim()}>
              {busy ? '조회 중...' : '계약 조회'}
            </button>
          </form>
        </section>

        <p className="cx-field-hint" style={{ textAlign: 'center', marginTop: 4 }}>
          정보가 일치하지 않으면 계약이 표시되지 않습니다. 등록번호는 즉시 마스킹되며 외부에 노출되지 않습니다.
        </p>
      </main>
    </>
  );
}
