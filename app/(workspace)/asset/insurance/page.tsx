'use client';

import { useState, useMemo, Fragment } from 'react';
import { Trash, FileArrowDown, X, Shield } from '@phosphor-icons/react';
import { PageShell } from '@/components/layout/page-shell';
import { EmptyState } from '@/components/ui/empty-state';
import { ASSET_SUBTABS, useAssetSubtabPending } from '@/lib/asset-subtabs';
import dynamic from 'next/dynamic';
const InsuranceRegisterDialog = dynamic(
  () => import('@/components/insurance/insurance-register-dialog').then((m) => m.InsuranceRegisterDialog),
  { ssr: false },
);
import { type InsurancePolicy, daysToExpiry } from '@/lib/sample-insurance';
import { useInsuranceStore } from '@/lib/use-insurance-store';
import { useAuditStamp } from '@/lib/audit-fields';
import { exportToExcel } from '@/lib/excel-export';

const COMPANY_COL_WIDTH = 56;
const PLATE_COL_WIDTH = 96;
const MAX_CYCLES = 6;  // 표준 자동차보험 6회 분납

export default function AssetInsurancePage() {
  const [allPolicies, setPolicies] = useInsuranceStore();
  // active 만 — 소프트 삭제는 목록·집계에서 제외 (증권번호 등 영구 보존)
  const policies = useMemo(() => allPolicies.filter((p) => !p.deletedAt), [allPolicies]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const subTabPending = useAssetSubtabPending();
  const audit = useAuditStamp();

  function handleCreate(items: InsurancePolicy[]) {
    const stamped = items.map((i) => ({ ...i, ...audit.create() }));
    setPolicies((prev) => [...stamped, ...prev]);
  }

  function removeOne(id: string) {
    setPolicies((p) => p.map((i) => i.id === id ? { ...i, ...audit.delete() } : i));
    if (selectedId === id) setSelectedId(null);
  }

  function clearAll() {
    if (!confirm(`전체 ${policies.length}건 보험증권을 삭제할까요? (증권번호 영구 보존 — 재발급 안 됨)`)) return;
    setPolicies((p) => p.map((i) => i.deletedAt ? i : { ...i, ...audit.delete() }));
    setSelectedId(null);
  }

  async function handleExcel() {
    if (policies.length === 0) return;
    const cycleCols = Array.from({ length: MAX_CYCLES }, (_, i) => i + 1).flatMap((c) => [
      {
        key: `cycle${c}_date`, header: `${c}회차일`, type: 'date' as const,
        getter: (r: Record<string, unknown>) => {
          const ins = toInstallments((r as unknown as InsurancePolicy).installments).find((it) => it.cycle === c);
          return ins?.dueDate ?? '';
        },
      },
      {
        key: `cycle${c}_amt`, header: `${c}회차금액`, type: 'number' as const,
        getter: (r: Record<string, unknown>) => {
          const ins = toInstallments((r as unknown as InsurancePolicy).installments).find((it) => it.cycle === c);
          return ins?.amount ?? '';
        },
      },
    ]);
    await exportToExcel({
      title: '보험관리',
      subtitle: `${new Date().toLocaleDateString('ko-KR')} 기준 ${policies.length}건`,
      columns: [
        { key: 'companyCode', header: '회사', type: 'mono', width: 8 },
        { key: 'carNumber', header: '차량번호', type: 'mono', width: 12 },
        { key: 'insurer', header: '보험사', width: 16 },
        { key: 'productName', header: '상품', width: 30 },
        { key: 'policyNo', header: '증권번호', type: 'mono', width: 22 },
        { key: 'startDate', header: '시작일', type: 'date' },
        { key: 'endDate', header: '만기일', type: 'date' },
        { key: 'carName', header: '차명', width: 20 },
        { key: 'carYear', header: '연식', type: 'number', width: 8 },
        { key: 'displacement', header: '배기량', type: 'number' },
        { key: 'driverScope', header: '운전범위' },
        { key: 'driverAge', header: '연령' },
        { key: 'covPersonal2', header: '대인Ⅱ' },
        { key: 'covProperty', header: '대물' },
        { key: 'covSelfVehicle', header: '자기차량' },
        { key: 'totalPremium', header: '총보험료', type: 'number' },
        { key: 'paidPremium', header: '납입보험료', type: 'number' },
        { key: 'autoDebitBank', header: '자동이체은행' },
        { key: 'autoDebitAccount', header: '자동이체계좌', type: 'mono', width: 18 },
        ...cycleCols,
      ],
      rows: policies as unknown as Record<string, unknown>[],
    });
  }

  const matchedCount = policies.filter((p) => p.companyCode).length;
  const expiringSoon = policies.filter((p) => {
    const d = daysToExpiry(p);
    return d !== null && d <= 30 && d >= 0;
  }).length;
  const expired = policies.filter((p) => {
    const d = daysToExpiry(p);
    return d !== null && d < 0;
  }).length;

  return (
    <PageShell
      subTabs={ASSET_SUBTABS}
      subTabPending={subTabPending}
      footerLeft={
        <>
          <span className="stat-item">전체 <strong>{policies.length}</strong></span>
          <span className="stat-item">차량 매칭 <strong>{matchedCount}</strong></span>
          {expiringSoon > 0 && <span className="stat-item alert">만기 30일 이내 <strong>{expiringSoon}</strong></span>}
          {expired > 0 && <span className="stat-item alert">만기 경과 <strong>{expired}</strong></span>}
        </>
      }
      footerRight={
        <>
          <button className="btn" onClick={handleExcel} disabled={policies.length === 0}>
            <FileArrowDown size={14} weight="bold" /> 엑셀
          </button>
          <button className="btn" onClick={clearAll} disabled={policies.length === 0}>
            <Trash size={14} weight="bold" /> 전체 비우기
          </button>
          <InsuranceRegisterDialog onCreate={handleCreate} />
        </>
      }
    >
      {policies.length === 0 ? (
        <EmptyState
          icon={Shield}
          title="등록된 보험증권 없음"
          description="자동차보험증권/공제 가입증명서를 OCR로 업로드하세요."
          hint={<>① 우측 하단 [+ 보험 등록] 클릭 → PDF/이미지 다중 업로드 → 즉시 OCR 분석<br />② 차량번호로 자산 자동 매칭<br />③ 분납 회차·자동이체·만기 자동 추출</>}
        />
      ) : (
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th className="sticky-col" style={{ left: 0, minWidth: COMPANY_COL_WIDTH }}>회사코드</th>
              <th className="sticky-col-2" style={{ left: COMPANY_COL_WIDTH, minWidth: PLATE_COL_WIDTH }}>차량번호</th>
              <th>보험사</th>
              <th>상품명</th>
              <th>증권번호</th>
              <th className="date">시작일</th>
              <th className="date">만기일</th>
              <th className="num">잔여(일)</th>
              <th>차명</th>
              <th className="num">연식</th>
              <th>차종</th>
              <th className="num">배기량</th>
              <th className="num">정원</th>
              <th className="num">차량가액(만원)</th>
              <th className="num">부속가액(만원)</th>
              <th>부속품</th>
              <th>운전범위</th>
              <th>연령한정</th>
              <th className="num">할증(만원)</th>
              <th>대인Ⅰ</th>
              <th>대인Ⅱ</th>
              <th>대물</th>
              <th>자기신체/자동차상해</th>
              <th>무보험</th>
              <th>자기차량</th>
              <th>긴급출동</th>
              <th className="num">총보험료</th>
              <th className="num">납입보험료</th>
              <th>자동이체 은행</th>
              <th>자동이체 계좌</th>
              <th>예금주</th>
              {Array.from({ length: MAX_CYCLES }, (_, i) => i + 1).map((c) => (
                <Fragment key={c}>
                  <th className="date">{c}회차일</th>
                  <th className="num">{c}회차금액</th>
                </Fragment>
              ))}
              <th>파일</th>
              <th className="center" style={{ width: 50, position: 'sticky', right: 0, background: 'var(--bg-header)' }}></th>
            </tr>
          </thead>
          <tbody>
            {policies.map((p) => {
                const days = daysToExpiry(p);
                const expClass = days !== null && days < 0 ? 'text-red'
                  : days !== null && days <= 30 ? 'text-amber' : 'dim';
                return (
                  <tr
                    key={p.id}
                    className={selectedId === p.id ? 'selected' : ''}
                    onClick={() => setSelectedId(p.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td className="plate text-medium sticky-col" style={{ left: 0, minWidth: COMPANY_COL_WIDTH }}>
                      {p.companyCode || <span className="text-muted">-</span>}
                    </td>
                    <td className="plate text-medium sticky-col-2" style={{ left: COMPANY_COL_WIDTH, minWidth: PLATE_COL_WIDTH }}>
                      {p.carNumber || <span className="text-muted">-</span>}
                    </td>
                    <td>{val(p.insurer)}</td>
                    <td className="dim truncate" style={{ maxWidth: 200 }} title={p.productName}>{val(p.productName)}</td>
                    <td className="mono dim truncate" style={{ maxWidth: 160 }}>{val(p.policyNo)}</td>
                    <td className="date mono">{val(p.startDate)}</td>
                    <td className="date mono">{val(p.endDate)}</td>
                    <td className={`num ${expClass}`}>{days !== null ? `D${days >= 0 ? '-' : '+'}${Math.abs(days)}` : ''}</td>
                    <td>{val(p.carName)}</td>
                    <td className="num">{numFmt(p.carYear)}</td>
                    <td className="dim">{val(p.carClass)}</td>
                    <td className="num">{numFmt(p.displacement)}</td>
                    <td className="num">{numFmt(p.seats)}</td>
                    <td className="num">{numFmt(p.vehicleValueMan)}</td>
                    <td className="num">{numFmt(p.accessoryValueMan)}</td>
                    <td className="dim truncate" style={{ maxWidth: 200 }} title={p.accessories}>{val(p.accessories)}</td>
                    <td className="dim">{val(p.driverScope)}</td>
                    <td className="dim">{val(p.driverAge)}</td>
                    <td className="num dim">{numFmt(p.deductibleMan)}</td>
                    <td className="dim truncate" style={{ maxWidth: 160 }}>{val(p.covPersonal1)}</td>
                    <td className="dim">{val(p.covPersonal2)}</td>
                    <td className="dim">{val(p.covProperty)}</td>
                    <td className="dim truncate" style={{ maxWidth: 200 }}>{val(p.covSelfAccident)}</td>
                    <td className="dim">{val(p.covUninsured)}</td>
                    <td className="dim">{val(p.covSelfVehicle)}</td>
                    <td className="dim truncate" style={{ maxWidth: 200 }} title={p.covEmergency}>{val(p.covEmergency)}</td>
                    <td className="num">{numFmt(p.totalPremium)}</td>
                    <td className="num dim">{numFmt(p.paidPremium)}</td>
                    <td className="dim">{val(p.autoDebitBank)}</td>
                    <td className="mono dim">{val(p.autoDebitAccount)}</td>
                    <td className="dim">{val(p.autoDebitHolder)}</td>
                    {Array.from({ length: MAX_CYCLES }, (_, i) => i + 1).map((c) => {
                      const ins = toInstallments(p.installments).find((it) => it.cycle === c);
                      return (
                        <Fragment key={c}>
                          <td className="date mono dim">{ins?.dueDate || ''}</td>
                          <td className="num">{ins?.amount ? ins.amount.toLocaleString('ko-KR') : ''}</td>
                        </Fragment>
                      );
                    })}
                    <td className="mono dim truncate" style={{ maxWidth: 160 }} title={p.fileName}>{val(p.fileName)}</td>
                    <td className="center" style={{ position: 'sticky', right: 0, background: 'var(--bg-card)' }}>
                      <button
                        className="btn-ghost btn btn-sm"
                        onClick={(e) => { e.stopPropagation(); removeOne(p.id); }}
                      >
                        <X size={11} />
                      </button>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
      )}
    </PageShell>
  );
}

function val(s?: string | number): React.ReactNode {
  return s !== undefined && s !== null && s !== '' ? s : '';
}

function numFmt(n?: number): React.ReactNode {
  if (n === undefined || n === null) return '';
  return n.toLocaleString('ko-KR');
}

/** RTDB가 sparse 배열을 object로 저장하는 케이스 방어 — 항상 배열 보장. */
function toInstallments(v: InsurancePolicy['installments']): NonNullable<InsurancePolicy['installments']> {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  if (typeof v === 'object') return Object.values(v as Record<string, NonNullable<InsurancePolicy['installments']>[number]>);
  return [];
}
