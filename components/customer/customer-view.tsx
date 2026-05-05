'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, FileText, IdentificationCard, ShieldCheck, Download, Phone } from '@phosphor-icons/react';
import type { Contract, ScheduleEvent } from '@/lib/sample-contracts';
import type { Asset } from '@/lib/sample-assets';
import type { InsurancePolicy } from '@/lib/sample-insurance';
import type { Company } from '@/lib/sample-companies';
import { maskIdent } from '@/lib/customer-match';

/**
 * 손님 페이지 본문 — 실데이터/샘플 모두 동일 컴포넌트로 렌더.
 *
 * /customer/[plate] 는 매칭 후 이 컴포넌트로,
 * /customer/sample 은 SAMPLE_* 직접 주입하여 디자인 미리보기.
 */
export function CustomerView({
  contract,
  asset,
  insurance,
  company,
  isSample = false,
}: {
  contract: Contract;
  asset: Asset | null;
  insurance: InsurancePolicy | null;
  company: Company | null;
  isSample?: boolean;
}) {
  const router = useRouter();

  return (
    <main className="cx-main">
      <button type="button" className="cx-back" onClick={() => router.push('/customer')}>
        <ArrowLeft size={14} weight="bold" /> 다른 차량 조회
      </button>

      {isSample && (
        <div
          style={{
            background: '#fef3c7', color: '#92400e',
            padding: '10px 14px', borderRadius: 6,
            fontSize: 13, fontWeight: 600, textAlign: 'center',
          }}
        >
          샘플 미리보기 — 실데이터 아닙니다
        </div>
      )}

      <Hero contract={contract} asset={asset} />

      <ExpireCard contract={contract} />

      <ContractInfoCard contract={contract} />

      <PaymentScheduleCard events={contract.events} />

      <DocumentsCard asset={asset} insurance={insurance} contract={contract} />

      {asset && <VehicleCard asset={asset} />}

      {company && <CompanyCard company={company} />}

      <p className="cx-field-hint" style={{ textAlign: 'center', marginTop: 8 }}>
        등록번호: {maskIdent(contract.customerIdent)} · 표시 정보는 마스킹되어 있습니다.
      </p>
    </main>
  );
}

/* ─── Hero ─── */
function Hero({ contract, asset }: { contract: Contract; asset: Asset | null }) {
  return (
    <section className="cx-hero">
      <span className="cx-hero-greeting">안녕하세요</span>
      <span className="cx-hero-name">{contract.customerName}님</span>
      <div className="cx-hero-meta">
        <span className="cx-plate-pill">{contract.plate}</span>
        {asset?.vehicleName && <span>{asset.vehicleName}</span>}
        <span className="cx-status">{contract.status}</span>
      </div>
    </section>
  );
}

/* ─── D-Day ─── */
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
    <section className="cx-dday-card">
      <div>
        <div className={`cx-dday ${expired ? 'cx-dday-warn' : ''}`}>{ddayLabel}</div>
        <div className="cx-dday-sub">{subText}</div>
      </div>
      <div className="cx-dday-side">
        <div className="cx-dday-side-label">만기일</div>
        <div className="cx-dday-side-value">{formatDate(contract.endDate)}</div>
      </div>
    </section>
  );
}

/* ─── 계약 정보 ─── */
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
        <span className="cx-row-value">{contract.contractNo}</span>
      </div>
    </section>
  );
}

/* ─── 수납 스케줄 ─── */
function PaymentScheduleCard({ events }: { events: ScheduleEvent[] }) {
  const payments = useMemo(
    () => events.filter((e) => e.type === '수납').sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [events],
  );
  const today = todayStr();

  const summary = useMemo(() => {
    const done = payments.filter((p) => p.status === '완료').length;
    return { done, total: payments.length };
  }, [payments]);

  return (
    <section className="cx-card">
      <h2 className="cx-h2">
        수납 스케줄
        {payments.length > 0 && (
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--cx-text-sub)', marginLeft: 8 }}>
            {summary.done}/{summary.total}
          </span>
        )}
      </h2>
      {payments.length === 0 ? (
        <div className="cx-empty">등록된 수납 회차가 없습니다</div>
      ) : (
        <div className="cx-cycle">
          {payments.map((ev) => {
            const cycleNo = ev.cycle ?? 0;
            const overdue = ev.status !== '완료' && ev.dueDate < today;
            const soon = ev.status !== '완료' && !overdue && daysBetween(today, ev.dueDate) <= 7;
            const stateClass = ev.status === '완료'
              ? 'is-done'
              : overdue
                ? 'is-overdue'
                : soon
                  ? 'is-soon'
                  : '';
            const label = ev.status === '완료'
              ? `완료 · ${ev.doneDate ? formatDate(ev.doneDate) : ''}`
              : overdue
                ? '미납 — 빠른 납부 필요'
                : soon
                  ? '곧 납부일'
                  : '예정';
            return (
              <div key={ev.id} className={`cx-cycle-row ${stateClass}`}>
                <span className="cx-cycle-no">{cycleNo}</span>
                <div className="cx-cycle-mid">
                  <span className="cx-cycle-due">{formatDate(ev.dueDate)}</span>
                  <span className="cx-cycle-status-text">{label}</span>
                </div>
                <span className="cx-cycle-amt">{ev.amount ? `${formatMoney(ev.amount)}원` : '-'}</span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* ─── 다운로드 ─── */
function DocumentsCard({
  asset,
  insurance,
  contract,
}: {
  asset: Asset | null;
  insurance: InsurancePolicy | null;
  contract: Contract;
}) {
  const docs: { key: string; label: string; sub: string; icon: React.ReactNode; url?: string; filename?: string }[] = [
    {
      key: 'registration',
      label: '자동차등록증',
      sub: asset?.documentImageUrl ? '등록증 사본' : '준비 중',
      icon: <IdentificationCard size={20} weight="duotone" />,
      url: asset?.documentImageUrl,
      filename: asset?.documentFileName ?? `${contract.plate}-등록증.jpg`,
    },
    {
      key: 'insurance',
      label: '보험가입증명서',
      sub: insurance?.fileDataUrl ? `${insurance.insurer ?? ''} ${insurance.policyNo ?? ''}`.trim() : '준비 중',
      icon: <ShieldCheck size={20} weight="duotone" />,
      url: insurance?.fileDataUrl,
      filename: insurance?.fileName ?? `${contract.plate}-보험증명.pdf`,
    },
    {
      key: 'contract',
      label: '계약서',
      sub: '준비 중',
      icon: <FileText size={20} weight="duotone" />,
      url: undefined,
      filename: undefined,
    },
  ];

  return (
    <section className="cx-card">
      <h2 className="cx-h2">서류 다운로드</h2>
      <div className="cx-doc-list">
        {docs.map((d) => {
          const enabled = !!d.url;
          const inner = (
            <>
              <span className="cx-doc-icon">{d.icon}</span>
              <span className="cx-doc-text">
                <span className="cx-doc-label">{d.label}</span>
                <span className="cx-doc-sub">{d.sub}</span>
              </span>
              <span className="cx-doc-action">
                {enabled ? <Download size={16} weight="bold" /> : <span className="cx-doc-pending">준비 중</span>}
              </span>
            </>
          );
          if (enabled) {
            return (
              <a
                key={d.key}
                className="cx-doc-row"
                href={d.url}
                download={d.filename}
                target="_blank"
                rel="noopener"
              >
                {inner}
              </a>
            );
          }
          return (
            <div key={d.key} className="cx-doc-row is-disabled">
              {inner}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ─── 차량 ─── */
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

/* ─── 회사 ─── */
function CompanyCard({ company }: { company: Company }) {
  const phoneDigits = company.phone?.replace(/[^0-9+]/g, '') ?? '';
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
            <a href={`tel:${phoneDigits}`} className="cx-phone-btn">
              <Phone size={13} weight="bold" /> {company.phone}
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
