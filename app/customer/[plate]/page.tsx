'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { ArrowLeft } from '@phosphor-icons/react';
import { useContractStore } from '@/lib/use-contract-store';
import { useAssetStore } from '@/lib/use-asset-store';
import { useCompanyStore } from '@/lib/use-company-store';
import { findCustomerContract, maskIdent, normalizePlate, normalizeIdent } from '@/lib/customer-match';
import type { Contract, ScheduleEvent } from '@/lib/sample-contracts';

/**
 * 손님 페이지 본문 — /customer/[plate]?ident=...
 *
 * 흐름:
 *  1. URL 의 ?ident= 와 plate 매칭
 *  2. ident 는 즉시 sessionStorage 로 옮기고 URL 에서 제거 (history.replaceState)
 *  3. 새로고침 시 sessionStorage 에서 복구
 *  4. 일치하는 계약 → 카드 렌더, 미일치 → 안내 + [다시 조회]
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
      // URL 에서 ident 제거 (히스토리 갱신 X)
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
          <ArrowLeft size={14} /> 다시 조회
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

  return (
    <main className="cx-main">
        <button type="button" className="cx-back" onClick={() => router.push('/customer')}>
          <ArrowLeft size={14} /> 다른 차량 조회
        </button>

        <Hero contract={contract} asset={asset} />

        <ExpireCard contract={contract} />

        <ContractInfoCard contract={contract} />

        <PaymentScheduleCard events={contract.events} />

        {asset && <VehicleCard asset={asset} />}

        {company && <CompanyCard company={company} />}

        <p className="cx-field-hint" style={{ textAlign: 'center', marginTop: 8 }}>
          등록번호: {maskIdent(contract.customerIdent)} · 표시 정보는 마스킹되어 있습니다.
        </p>
      </main>
  );
}

/* ─── 카드들 ─── */

function Hero({ contract, asset }: { contract: Contract; asset: Asset | null }) {
  return (
    <section className="cx-hero">
      <span className="cx-hero-greeting">안녕하세요</span>
      <span className="cx-hero-name">{contract.customerName}님</span>
      <div className="cx-hero-plate">
        <span className="cx-plate-pill">{contract.plate}</span>
        {asset?.vehicleName && <span>· {asset.vehicleName}</span>}
        <StatusBadge status={contract.status} />
      </div>
    </section>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === '운행중' ? 'cx-cycle-status-done' :
    status === '만기' || status === '해지' ? 'cx-cycle-status-overdue' :
    status === '대기' ? 'cx-cycle-status-soon' :
    '';
  return <span className={`cx-cycle-status ${cls}`}>{status}</span>;
}

function ExpireCard({ contract }: { contract: Contract }) {
  const today = todayStr();
  const days = daysBetween(today, contract.endDate);
  if (!Number.isFinite(days)) return null;

  const expired = days < 0;
  const ddayLabel = expired ? `D+${Math.abs(days)}` : days === 0 ? 'D-Day' : `D-${days}`;
  const subText = expired
    ? '만기일이 지났습니다 — 회사에 문의해주세요'
    : days === 0
      ? '오늘이 만기일입니다'
      : `만기일까지 ${days}일 남았습니다`;

  return (
    <section className="cx-card cx-card-tight">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div>
          <div className={`cx-dday ${expired ? 'cx-dday-warn' : ''}`}>{ddayLabel}</div>
          <div className="cx-dday-sub">{subText}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="cx-row-label" style={{ fontSize: 12 }}>만기일</div>
          <div className="cx-row-value-strong">{formatDate(contract.endDate)}</div>
        </div>
      </div>
    </section>
  );
}

function ContractInfoCard({ contract }: { contract: Contract }) {
  return (
    <section className="cx-card">
      <h2 className="cx-h2">계약 정보</h2>
      <div className="cx-row">
        <span className="cx-row-label">계약기간</span>
        <span className="cx-row-value">
          {formatDate(contract.startDate)} ~ {formatDate(contract.endDate)}
        </span>
      </div>
      <div className="cx-row">
        <span className="cx-row-label">월 대여료</span>
        <span className="cx-row-value-strong">{formatMoney(contract.monthlyAmount)}원</span>
      </div>
      <div className="cx-row">
        <span className="cx-row-label">보증금</span>
        <span className="cx-row-value">{contract.deposit > 0 ? `${formatMoney(contract.deposit)}원` : '없음'}</span>
      </div>
      <div className="cx-row">
        <span className="cx-row-label">계약번호</span>
        <span className="cx-row-value" style={{ fontFamily: 'var(--font-mono)' }}>{contract.contractNo}</span>
      </div>
    </section>
  );
}

function PaymentScheduleCard({ events }: { events: ScheduleEvent[] }) {
  const payments = useMemo(
    () => events.filter((e) => e.type === '수납').sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [events],
  );
  const today = todayStr();

  return (
    <section className="cx-card">
      <h2 className="cx-h2">수납 스케줄</h2>
      {payments.length === 0 ? (
        <div className="cx-empty">등록된 수납 회차가 없습니다</div>
      ) : (
        payments.map((ev) => {
          const cycleNo = ev.cycle ?? 0;
          const overdue = ev.status !== '완료' && ev.dueDate < today;
          const soon = ev.status !== '완료' && !overdue && daysBetween(today, ev.dueDate) <= 7;
          const cls = ev.status === '완료'
            ? 'cx-cycle-status-done'
            : overdue
              ? 'cx-cycle-status-overdue'
              : soon
                ? 'cx-cycle-status-soon'
                : '';
          const label = ev.status === '완료'
            ? '완료'
            : overdue
              ? '지연'
              : soon
                ? '곧 납부'
                : '예정';
          return (
            <div key={ev.id} className="cx-cycle-row">
              <span className="cx-cycle-no">{cycleNo}회차</span>
              <span className="cx-cycle-due">{formatDate(ev.dueDate)}</span>
              <span className="cx-cycle-amt">{ev.amount ? `${formatMoney(ev.amount)}원` : '-'}</span>
              <span className={`cx-cycle-status ${cls}`}>{label}</span>
            </div>
          );
        })
      )}
    </section>
  );
}

function VehicleCard({ asset }: { asset: Asset }) {
  return (
    <section className="cx-card">
      <h2 className="cx-h2">차량 정보</h2>
      <div className="cx-row">
        <span className="cx-row-label">차명</span>
        <span className="cx-row-value">{asset.vehicleName || '-'}</span>
      </div>
      {asset.modelType && (
        <div className="cx-row">
          <span className="cx-row-label">형식</span>
          <span className="cx-row-value">{asset.modelType}</span>
        </div>
      )}
      {asset.manufactureDate && (
        <div className="cx-row">
          <span className="cx-row-label">제작연월</span>
          <span className="cx-row-value">{asset.manufactureDate}</span>
        </div>
      )}
      {asset.fuelType && (
        <div className="cx-row">
          <span className="cx-row-label">연료</span>
          <span className="cx-row-value">{asset.fuelType}</span>
        </div>
      )}
    </section>
  );
}

function CompanyCard({ company }: { company: Company }) {
  return (
    <section className="cx-card">
      <h2 className="cx-h2">회사 정보</h2>
      <div className="cx-row">
        <span className="cx-row-label">상호</span>
        <span className="cx-row-value">{company.name}</span>
      </div>
      {company.phone && (
        <div className="cx-row">
          <span className="cx-row-label">대표전화</span>
          <span className="cx-row-value">
            <a href={`tel:${company.phone.replace(/[^0-9+]/g, '')}`} style={{ color: 'var(--brand)', textDecoration: 'none' }}>
              {company.phone}
            </a>
          </span>
        </div>
      )}
      {company.hqAddress && (
        <div className="cx-row">
          <span className="cx-row-label">주소</span>
          <span className="cx-row-value">{company.hqAddress}</span>
        </div>
      )}
      {company.accounts && company.accounts.length > 0 && (
        <div className="cx-row">
          <span className="cx-row-label">납부계좌</span>
          <span className="cx-row-value">
            {company.accounts[0].bank} {company.accounts[0].accountNo}
          </span>
        </div>
      )}
    </section>
  );
}

/* ─── helpers ─── */

type Asset = NonNullable<ReturnType<typeof useAssetStore>[0][number]>;
type Company = NonNullable<ReturnType<typeof useCompanyStore>[0][number]>;

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysBetween(from: string, to: string): number {
  const a = new Date(from);
  const b = new Date(to);
  if (!Number.isFinite(a.getTime()) || !Number.isFinite(b.getTime())) return NaN;
  const ms = b.getTime() - a.getTime();
  return Math.round(ms / 86_400_000);
}

function formatDate(s: string): string {
  if (!s) return '-';
  return s.replace(/-/g, '. ');
}

function formatMoney(n: number): string {
  if (!Number.isFinite(n)) return '-';
  return n.toLocaleString('ko-KR');
}
