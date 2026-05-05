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
 * 손님 페이지 본문 — 핵심만 펼쳐 노출, 나머지는 펼치기.
 *
 * 우선 노출 (손님이 가장 알고 싶어하는 것):
 *  1. Hero — 본인 확인 (이름/차량/상태)
 *  2. D-Day — 만기까지 며칠
 *  3. 다음 액션 — 미납 우선, 없으면 다음 납부일/금액
 *  4. 빠른 연락 — 회사 대표전화 (tap → 전화 걸기)
 *
 * 펼치기:
 *  · 수납 스케줄 — 요약 "N/M 완료, 다음 X" → 펼치면 회차별 전체
 *  · 계약 정보 — 계약번호/기간/월대여료/보증금
 *  · 차량 정보 — 차명/형식/제작연월/연료
 *  · 서류 다운로드 — 등록증/보험증명서/계약서
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

      {/* 1. 본인 확인 */}
      <Hero contract={contract} asset={asset} />

      {/* 2. 만기 D-day */}
      <ExpireCard contract={contract} />

      {/* 3. 다음 납부 (또는 미납 경고) */}
      <NextPaymentCard events={contract.events} />

      {/* 4. 빠른 연락 — 즉시 노출 */}
      {company && <QuickContact company={company} />}

      {/* 5. 펼치기 — 수납 스케줄 */}
      <PaymentScheduleCollapse events={contract.events} />

      {/* 6. 펼치기 — 계약 상세 */}
      <ContractInfoCollapse contract={contract} />

      {/* 7. 펼치기 — 차량 상세 */}
      {asset && <VehicleCollapse asset={asset} />}

      {/* 8. 펼치기 — 서류 */}
      <DocumentsCollapse asset={asset} insurance={insurance} contract={contract} />

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

/* ─── 다음 납부 (또는 미납 경고) ─── */
function NextPaymentCard({ events }: { events: ScheduleEvent[] }) {
  const today = todayStr();
  const payments = useMemo(
    () => events.filter((e) => e.type === '수납').sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [events],
  );
  if (payments.length === 0) return null;

  const overdueList = payments.filter((p) => p.status !== '완료' && p.dueDate < today);
  const nextPayment = payments.find((p) => p.status !== '완료' && p.dueDate >= today);

  if (overdueList.length > 0) {
    const total = overdueList.reduce((s, p) => s + (p.amount ?? 0), 0);
    const oldest = overdueList[0];
    return (
      <section className="cx-action-card is-overdue">
        <div>
          <div className="cx-action-label">미납</div>
          <div className="cx-action-value">{overdueList.length}건 · {formatMoney(total)}원</div>
          <div className="cx-action-sub">최초 {formatDate(oldest.dueDate)} ({oldest.cycle}회차)부터 미납</div>
        </div>
        <div className="cx-action-side">
          <div className="cx-action-side-label">즉시 납부</div>
          <div className="cx-action-side-value">필요</div>
        </div>
      </section>
    );
  }

  if (nextPayment) {
    const days = daysBetween(today, nextPayment.dueDate);
    const dday = days === 0 ? 'D-Day' : `D-${days}`;
    return (
      <section className="cx-action-card">
        <div>
          <div className="cx-action-label">다음 납부일</div>
          <div className="cx-action-value">{formatDate(nextPayment.dueDate)}</div>
          <div className="cx-action-sub">{nextPayment.cycle}회차 · {formatMoney(nextPayment.amount ?? 0)}원</div>
        </div>
        <div className="cx-action-side">
          <div className="cx-action-side-label">남은 일수</div>
          <div className="cx-action-side-value">{dday}</div>
        </div>
      </section>
    );
  }

  return (
    <section className="cx-action-card">
      <div>
        <div className="cx-action-label">수납</div>
        <div className="cx-action-value">모든 회차 완료</div>
        <div className="cx-action-sub">남은 회차가 없습니다</div>
      </div>
    </section>
  );
}

/* ─── 빠른 연락 ─── */
function QuickContact({ company }: { company: Company }) {
  if (!company.phone) return null;
  const digits = company.phone.replace(/[^0-9+]/g, '');
  return (
    <a href={`tel:${digits}`} className="cx-quick-contact" style={{ textDecoration: 'none' }}>
      <div className="cx-quick-contact-info">
        <span className="cx-quick-contact-label">{company.name}</span>
        <span className="cx-quick-contact-name">{company.phone}</span>
      </div>
      <span className="cx-phone-btn">
        <Phone size={13} weight="bold" /> 전화하기
      </span>
    </a>
  );
}

/* ─── 펼치기: 수납 스케줄 ─── */
function PaymentScheduleCollapse({ events }: { events: ScheduleEvent[] }) {
  const today = todayStr();
  const payments = useMemo(
    () => events.filter((e) => e.type === '수납').sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [events],
  );

  const summary = useMemo(() => {
    const done = payments.filter((p) => p.status === '완료').length;
    const overdue = payments.filter((p) => p.status !== '완료' && p.dueDate < today).length;
    const next = payments.find((p) => p.status !== '완료' && p.dueDate >= today);
    return { done, total: payments.length, overdue, next };
  }, [payments, today]);

  const subText = summary.total === 0
    ? '회차 없음'
    : summary.overdue > 0
      ? `미납 ${summary.overdue}건${summary.next ? ` · 다음 ${formatDate(summary.next.dueDate)}` : ''}`
      : summary.next
        ? `다음 ${formatDate(summary.next.dueDate)}`
        : '모두 완료';

  return (
    <details className="cx-collapse">
      <summary>
        <div className="cx-collapse-title">
          <span className="cx-collapse-title-main">수납 스케줄 — {summary.done}/{summary.total} 완료</span>
          <span className="cx-collapse-title-sub">{subText}</span>
        </div>
      </summary>
      <div className="cx-collapse-body">
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
                ? `완료${ev.doneDate ? ` · ${formatDate(ev.doneDate)}` : ''}`
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
      </div>
    </details>
  );
}

/* ─── 펼치기: 계약 ─── */
function ContractInfoCollapse({ contract }: { contract: Contract }) {
  return (
    <details className="cx-collapse">
      <summary>
        <div className="cx-collapse-title">
          <span className="cx-collapse-title-main">계약 정보</span>
          <span className="cx-collapse-title-sub">
            {contract.contractNo} · 월 {formatMoney(contract.monthlyAmount)}원
          </span>
        </div>
      </summary>
      <div className="cx-collapse-body">
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
      </div>
    </details>
  );
}

/* ─── 펼치기: 차량 ─── */
function VehicleCollapse({ asset }: { asset: Asset }) {
  const subText = [asset.vehicleName, asset.manufactureDate].filter(Boolean).join(' · ');
  return (
    <details className="cx-collapse">
      <summary>
        <div className="cx-collapse-title">
          <span className="cx-collapse-title-main">차량 정보</span>
          <span className="cx-collapse-title-sub">{subText || '-'}</span>
        </div>
      </summary>
      <div className="cx-collapse-body">
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
      </div>
    </details>
  );
}

/* ─── 펼치기: 서류 ─── */
function DocumentsCollapse({
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

  const ready = docs.filter((d) => d.url).length;

  return (
    <details className="cx-collapse">
      <summary>
        <div className="cx-collapse-title">
          <span className="cx-collapse-title-main">서류 다운로드</span>
          <span className="cx-collapse-title-sub">{ready}/{docs.length}건 다운로드 가능</span>
        </div>
      </summary>
      <div className="cx-collapse-body">
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
                <a key={d.key} className="cx-doc-row" href={d.url} download={d.filename} target="_blank" rel="noopener">
                  {inner}
                </a>
              );
            }
            return (
              <div key={d.key} className="cx-doc-row is-disabled">{inner}</div>
            );
          })}
        </div>
      </div>
    </details>
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
