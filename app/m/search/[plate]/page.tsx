'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Car, FileText, Phone, UploadSimple, Image as ImageIcon, IdentificationCard, ShieldCheck,
} from '@phosphor-icons/react';
import { ref, query, orderByChild, equalTo, get } from 'firebase/database';
import { useAssetStore } from '@/lib/use-asset-store';
import { useContractStore } from '@/lib/use-contract-store';
import { useCompanyStore } from '@/lib/use-company-store';
import { useInsuranceStore } from '@/lib/use-insurance-store';
import { getRtdb } from '@/lib/firebase/client';
import { asArray } from '@/lib/store-utils';
import { todayStr, daysBetween, formatDate, formatMoney, formatDday } from '@/lib/date-utils';
import { normalizePlate } from '@/lib/customer-match';
import type { EventUploadEntry } from '@/lib/use-event-uploads-store';

/**
 * 모바일 차량/계약 상세 — 검색 결과 클릭 시 진입.
 *
 * 한 화면에 직원이 알고 싶은 것:
 *  · 차량 카드 (차명·연식·상태)
 *  · 활성 계약 (있으면) — 임차인·기간·만기 D-day·미납 회차/금액
 *  · 보험 (만료 D-day)
 *  · 최근 업로드 (출고/반납/상품화/기타) — 사진 썸네일 그리드
 *  · CTA: [📷 업로드] [📞 손님 전화] [데스크탑 상세]
 */
export default function MobileVehicleDetailPage() {
  const params = useParams();
  const router = useRouter();
  const plate = decodeURIComponent((params?.plate as string) ?? '');

  const [allAssets] = useAssetStore();
  const [allContracts] = useContractStore();
  const [allCompanies] = useCompanyStore();
  const [allPolicies] = useInsuranceStore();

  const asset = useMemo(
    () => allAssets.find((a) => !a.deletedAt && normalizePlate(a.plate) === normalizePlate(plate)) ?? null,
    [allAssets, plate],
  );
  const contract = useMemo(() => {
    if (!asset) return null;
    return allContracts.find(
      (c) => !c.deletedAt && c.plate === asset.plate && c.companyCode === asset.companyCode
        && c.status !== '만기' && c.status !== '해지'
    ) ?? null;
  }, [allContracts, asset]);

  const company = useMemo(
    () => (asset ? allCompanies.find((c) => !c.deletedAt && c.code === asset.companyCode) ?? null : null),
    [allCompanies, asset],
  );

  const policy = useMemo(() => {
    if (!asset) return null;
    const today = todayStr();
    const matches = allPolicies.filter(
      (p) => !p.deletedAt && p.companyCode === asset.companyCode
        && p.carNumber && normalizePlate(p.carNumber) === normalizePlate(asset.plate),
    );
    matches.sort((a, b) => {
      const aValid = (a.endDate ?? '') >= today ? 0 : 1;
      const bValid = (b.endDate ?? '') >= today ? 0 : 1;
      if (aValid !== bValid) return aValid - bValid;
      return (b.endDate ?? '').localeCompare(a.endDate ?? '');
    });
    return matches[0] ?? null;
  }, [allPolicies, asset]);

  // 미납 요약
  const overdueSummary = useMemo(() => {
    if (!contract) return null;
    const today = todayStr();
    const overdue = (contract.events ?? []).filter(
      (e) => e.type === '수납' && e.status !== '완료' && e.dueDate < today,
    );
    if (overdue.length === 0) return null;
    const total = overdue.reduce((s, e) => s + (e.amount ?? 0), 0);
    const oldest = [...overdue].sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
    return { count: overdue.length, total, oldestCycle: oldest.cycle, oldestDate: oldest.dueDate };
  }, [contract]);

  // 만기 D-day
  const expireDays = contract ? daysBetween(todayStr(), contract.endDate) : NaN;
  const expireLabel = Number.isFinite(expireDays) ? formatDday(expireDays) : '';

  // 보험 만기 D-day
  const insuranceDays = policy?.endDate ? daysBetween(todayStr(), policy.endDate) : NaN;
  const insuranceLabel = Number.isFinite(insuranceDays) ? formatDday(insuranceDays) : '';

  // 최근 업로드 — RTDB 직접 한 번 조회 (구독 X)
  const [recentUploads, setRecentUploads] = useState<EventUploadEntry[]>([]);
  const [uploadsLoading, setUploadsLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setUploadsLoading(true);
      try {
        const q = query(ref(getRtdb(), 'event_uploads'), orderByChild('plate'), equalTo(normalizePlate(plate)));
        const snap = await get(q);
        if (cancelled) return;
        const list = asArray<EventUploadEntry>(snap.val());
        list.sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''));
        setRecentUploads(list.slice(0, 12));
      } catch (e) {
        console.warn('[m/detail] uploads fetch failed', e);
      } finally {
        if (!cancelled) setUploadsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [plate]);

  if (!asset && !contract) {
    return (
      <>
        <header className="m-topbar">
          <button type="button" className="m-topbar-back" onClick={() => router.push('/m/search')}>
            <ArrowLeft size={16} weight="bold" /> 조회
          </button>
          <div className="m-topbar-title">{plate}</div>
          <span style={{ width: 40 }} />
        </header>
        <main className="m-main">
          <div className="m-empty">
            <Car size={36} className="m-empty-icon" />
            <div>등록된 차량 없음</div>
            <div className="text-weak text-xs mt-1">차량번호 <strong>{plate}</strong> 가 자산/계약 어느 쪽에도 없습니다.</div>
          </div>
        </main>
      </>
    );
  }

  const phoneDigits = contract?.customerPhone?.replace(/[^0-9+]/g, '') ?? '';

  return (
    <>
      <header className="m-topbar">
        <button type="button" className="m-topbar-back" onClick={() => router.back()}>
          <ArrowLeft size={16} weight="bold" /> 뒤로
        </button>
        <div className="m-topbar-title">{plate}</div>
        <span style={{ width: 40 }} />
      </header>

      <main className="m-main">
        {/* 차량 카드 */}
        <div className="m-card">
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>
                {asset?.vehicleName ?? '(차명 미상)'}
              </div>
              <div style={{ fontSize: 13, color: 'var(--m-text-sub)', marginTop: 4 }}>
                {asset?.modelType && <>{asset.modelType} · </>}
                {asset?.manufactureDate && <>{asset.manufactureDate} · </>}
                {asset?.companyCode}
              </div>
            </div>
            {asset?.status && (
              <span className={`m-result-status ${
                asset.status === '운행중' ? 'm-result-status-active'
                : asset.status === '매각' ? 'm-result-status-danger'
                : 'm-result-status-warn'
              }`}>{asset.status}</span>
            )}
          </div>
        </div>

        {/* 미납 알림 (있을 때만) */}
        {overdueSummary && (
          <div className="m-card" style={{ background: 'var(--m-danger-bg)', borderColor: '#fecaca' }}>
            <div style={{ fontSize: 12, color: 'var(--m-danger)', fontWeight: 600 }}>미납 알림</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--m-danger)', marginTop: 4 }}>
              {overdueSummary.count}건 · {formatMoney(overdueSummary.total)}원
            </div>
            <div style={{ fontSize: 13, color: 'var(--m-danger)', opacity: 0.85, marginTop: 2 }}>
              최초 {formatDate(overdueSummary.oldestDate)} ({overdueSummary.oldestCycle}회차)부터
            </div>
          </div>
        )}

        {/* 계약 카드 (활성 계약 있을 때) */}
        {contract ? (
          <div className="m-card">
            <div style={{ fontSize: 13, color: 'var(--m-text-sub)', fontWeight: 600, marginBottom: 8 }}>
              <FileText size={13} weight="bold" style={{ display: 'inline', marginRight: 4 }} />
              계약 · {contract.contractNo}
            </div>
            <div style={{ fontSize: 17, fontWeight: 700 }}>{contract.customerName}</div>
            <div style={{ fontSize: 13, color: 'var(--m-text-sub)', marginTop: 2 }}>
              {contract.customerKind} · {contract.customerPhone || '연락처 없음'}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--m-text-sub)' }}>기간</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  {formatDate(contract.startDate)} ~ {formatDate(contract.endDate)}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 12, color: 'var(--m-text-sub)' }}>만기</div>
                <div style={{
                  fontSize: 16, fontWeight: 800,
                  color: expireDays < 0 ? 'var(--m-danger)' : expireDays <= 30 ? 'var(--m-warn)' : 'var(--m-brand)',
                }}>
                  {expireLabel}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
              <div style={{ fontSize: 13 }}>
                <span className="text-weak">월 </span>{formatMoney(contract.monthlyAmount)}원
              </div>
              <div style={{ fontSize: 13 }}>
                <span className="text-weak">보증금 </span>{contract.deposit > 0 ? formatMoney(contract.deposit) + '원' : '없음'}
              </div>
            </div>
          </div>
        ) : (
          <div className="m-card">
            <div style={{ fontSize: 13, color: 'var(--m-text-sub)', fontWeight: 600 }}>활성 계약 없음</div>
            <div style={{ fontSize: 13, color: 'var(--m-text-weak)', marginTop: 4 }}>휴차 또는 종료 상태</div>
          </div>
        )}

        {/* 보험 카드 */}
        {policy && (
          <div className="m-card" style={{ padding: '12px 18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, color: 'var(--m-text-sub)', fontWeight: 600 }}>
                  <ShieldCheck size={13} weight="bold" style={{ display: 'inline', marginRight: 4 }} />
                  보험
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {policy.insurer ?? '-'} {policy.policyNo && <span className="text-weak"> · {policy.policyNo}</span>}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 12, color: 'var(--m-text-sub)' }}>만기</div>
                <div style={{
                  fontSize: 14, fontWeight: 700,
                  color: insuranceDays < 0 ? 'var(--m-danger)' : insuranceDays <= 30 ? 'var(--m-warn)' : 'var(--m-text)',
                }}>
                  {insuranceLabel}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* CTA */}
        <div style={{ display: 'flex', gap: 8 }}>
          <Link
            href={`/m/upload?plate=${encodeURIComponent(plate)}`}
            style={{
              flex: 1,
              padding: '14px',
              fontSize: 15, fontWeight: 700,
              background: 'var(--m-brand)', color: '#fff',
              border: 0, borderRadius: 8,
              cursor: 'pointer', textAlign: 'center', textDecoration: 'none',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <UploadSimple size={16} weight="bold" /> 사진 업로드
          </Link>
          {phoneDigits && (
            <a
              href={`tel:${phoneDigits}`}
              style={{
                flex: 1,
                padding: '14px',
                fontSize: 15, fontWeight: 700,
                background: 'var(--m-brand-soft)', color: 'var(--m-brand)',
                border: 0, borderRadius: 8,
                cursor: 'pointer', textAlign: 'center', textDecoration: 'none',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              <Phone size={16} weight="bold" /> 손님 전화
            </a>
          )}
        </div>

        {/* 최근 업로드 */}
        <div className="m-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 13, color: 'var(--m-text-sub)', fontWeight: 600 }}>
              <ImageIcon size={13} weight="bold" style={{ display: 'inline', marginRight: 4 }} />
              최근 업로드
            </div>
            {recentUploads.length > 0 && <span className="text-weak text-xs">{recentUploads.length}건</span>}
          </div>
          {uploadsLoading ? (
            <div className="text-weak text-xs">불러오는 중...</div>
          ) : recentUploads.length === 0 ? (
            <div className="text-weak text-xs">업로드 없음 — [사진 업로드] 로 시작</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {recentUploads.map((u, i) => (
                <UploadCard key={i} upload={u} />
              ))}
            </div>
          )}
        </div>

        {/* 회사 정보 (작게) */}
        {company && (
          <div className="m-card" style={{ padding: '12px 18px' }}>
            <div style={{ fontSize: 12, color: 'var(--m-text-sub)' }}>회사</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{company.name}</div>
            {company.phone && (
              <a href={`tel:${company.phone.replace(/[^0-9+]/g, '')}`} style={{ fontSize: 13, color: 'var(--m-brand)', textDecoration: 'none' }}>
                {company.phone}
              </a>
            )}
          </div>
        )}
      </main>
    </>
  );
}

function UploadCard({ upload }: { upload: EventUploadEntry }) {
  const images = upload.files.filter((f) => f.mime?.startsWith('image/'));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 13 }}>
        <div>
          <span style={{
            fontSize: 11, fontWeight: 700,
            padding: '2px 8px', borderRadius: 4,
            background: 'var(--m-brand-soft)', color: 'var(--m-brand)',
          }}>{upload.kind}</span>
          <span style={{ marginLeft: 8, color: 'var(--m-text-sub)' }}>{upload.at?.slice(0, 16).replace('T', ' ')}</span>
        </div>
        <span className="text-weak text-xs">{upload.uploader?.name ?? upload.uploader?.email ?? ''}</span>
      </div>
      {images.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
          {images.slice(0, 4).map((f, i) => (
            <a
              key={i}
              href={f.dataUrl}
              target="_blank"
              rel="noopener"
              style={{ aspectRatio: '1 / 1', overflow: 'hidden', borderRadius: 4, background: 'var(--m-divider)' }}
            >
              <img
                src={f.dataUrl}
                alt={f.name}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </a>
          ))}
          {images.length > 4 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', aspectRatio: '1 / 1', background: 'var(--m-divider)', borderRadius: 4, fontSize: 11, color: 'var(--m-text-sub)' }}>
              +{images.length - 4}
            </div>
          )}
        </div>
      )}
      {upload.note && <div style={{ fontSize: 12, color: 'var(--m-text-sub)' }}>{upload.note}</div>}
    </div>
  );
}
