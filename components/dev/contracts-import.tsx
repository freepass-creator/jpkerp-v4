'use client';

import { useMemo, useState } from 'react';
import { CheckCircle, Warning, ArrowCounterClockwise, FileXls } from '@phosphor-icons/react';
import { type Contract, type CustomerKind, type AdditionalDriver } from '@/lib/sample-contracts';
import { useContractStore } from '@/lib/use-contract-store';
import { useAuditStamp } from '@/lib/audit-fields';
import { nextDateScopedCode } from '@/lib/code-gen';
import { buildEventsWithOverdue } from '@/lib/contract-events';
import { todayStr } from '@/lib/date-utils';

/**
 * 계약 일괄 import — 운영 데이터 마이그레이션 전용 (/dev 탭).
 *
 * 입력: TSV (Tab-Separated Values), 첫 줄 = 헤더 (한글 라벨)
 *
 * 헤더:
 *   회사코드 | 계약번호 | 차량번호 | 고객명 | 신분 | 등록번호 | 연락처 |
 *   시작일 | 만기일 | 월대여료 | 보증금 | 미수회차 | 운전자범위 | 연령제한 |
 *   주행거리한도(km) | 인도장소 | 반납장소 | 결제방법 | 결제일 | 특약사항
 *
 * 핵심 — "미수회차" 컬럼:
 *   "3,4,5" → 3·4·5회차만 미수 (status='예정' 또는 '지연')
 *   ""      → 자동: dueDate ≤ 오늘 회차 모두 완료, 이후 회차는 예정
 *   "0" 또는 "없음" → 모든 회차 완료 처리 (만기 임박이라도)
 *
 * 등록 정책:
 *   계약번호 일치 → 기존 update (events 만 미수회차 기준 재계산)
 *   계약번호 미일치 → 신규 push (자동 부여)
 *
 * 신분: '개인' | '사업자' | '법인'. 미입력 시 '개인'.
 */

const SHEET_HEADERS = [
  ['companyCode',     '회사코드'],
  ['contractNo',      '계약번호'],
  ['plate',           '차량번호'],
  ['customerName',    '고객명'],
  ['customerKind',    '신분'],
  ['customerIdent',   '등록번호'],
  ['customerPhone',   '연락처'],
  ['startDate',       '시작일'],
  ['endDate',         '만기일'],
  ['monthlyAmount',   '월대여료'],
  ['deposit',         '보증금'],
  ['overdueCycles',   '미수회차'],
  ['driverScope',     '운전자범위'],
  ['driverAgeLimit',  '연령제한'],
  ['mileageLimitKm',  '주행거리한도(km)'],
  ['deliveryAddress', '인도장소'],
  ['returnAddress',   '반납장소'],
  ['paymentMethod',   '결제방법'],
  ['paymentDay',      '결제일'],
  ['specialTerms',    '특약사항'],
] as const;

type ImportRow = {
  data: Partial<Contract> & { overdueCyclesRaw?: string };
  errors: string[];
  warning?: string;     // 기존 계약 update 등 경고
  isUpdate: boolean;    // true = 기존 contractNo 매칭 (events 갱신만)
  matchedId?: string;
};


function parseTSV(text: string, existingContracts: readonly Contract[]): ImportRow[] {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return [];
  const headerCols = lines[0].split('\t').map((s) => s.trim());
  const headerKeys: Array<string | null> = headerCols.map((label) =>
    SHEET_HEADERS.find(([, l]) => l === label)?.[0] ?? null
  );
  const looksLikeHeader = headerKeys.some((k) => k !== null);
  const dataLines = looksLikeHeader ? lines.slice(1) : lines;
  const effectiveKeys: string[] = looksLikeHeader
    ? (headerKeys.filter((k): k is string => k !== null) as string[])
    : (SHEET_HEADERS.map(([k]) => k) as string[]);
  const effectiveOrder: string[] = looksLikeHeader
    ? (headerKeys.map((k, i) => k ?? `__skip_${i}`) as string[])
    : (SHEET_HEADERS.map(([k]) => k) as string[]);

  return dataLines.map((line) => {
    const cols = line.split('\t').map((s) => s.trim());
    const data: Partial<Contract> & { overdueCyclesRaw?: string } = {};
    const errors: string[] = [];

    effectiveOrder.forEach((key, i) => {
      const val = cols[i] ?? '';
      if (!effectiveKeys.includes(key)) return;
      if (!val) return;
      switch (key) {
        case 'monthlyAmount':
        case 'deposit':
        case 'mileageLimitKm':
        case 'paymentDay': {
          const n = Number(val.replace(/,/g, ''));
          if (!Number.isFinite(n)) errors.push(`${key} 숫자 아님: ${val}`);
          else (data as Record<string, unknown>)[key] = n;
          break;
        }
        case 'customerKind': {
          if (val === '개인' || val === '사업자' || val === '법인') data.customerKind = val as CustomerKind;
          else errors.push(`신분 값 오류: ${val} (개인/사업자/법인)`);
          break;
        }
        case 'overdueCycles':
          data.overdueCyclesRaw = val;
          break;
        default:
          (data as Record<string, unknown>)[key] = val;
      }
    });

    if (!data.companyCode) errors.push('회사코드 누락');
    if (!data.plate) errors.push('차량번호 누락');
    if (!data.customerName) errors.push('고객명 누락');
    if (!data.customerIdent) errors.push('등록번호 누락');
    if (!data.startDate) errors.push('시작일 누락');
    if (!data.endDate) errors.push('만기일 누락');

    // 기존 계약 매칭 — 계약번호로
    let isUpdate = false;
    let matchedId: string | undefined;
    let warning: string | undefined;
    if (data.contractNo) {
      const matched = existingContracts.find((c) => c.contractNo === data.contractNo && !c.deletedAt);
      if (matched) {
        isUpdate = true;
        matchedId = matched.id;
        warning = '기존 계약 — events 갱신';
      }
    }

    return { data, errors, warning, isUpdate, matchedId };
  });
}

const SAMPLE_TSV = SHEET_HEADERS.map(([, l]) => l).join('\t') + '\n' + [
  'CP01', '', '12가3456', '홍길동', '개인', '900101-1234567', '010-1234-5678',
  '2025-01-01', '2026-12-31', '500000', '1000000', '5',
  '가족한정', '만 26세 이상', '30000', '강남구 사무소', '강남구 사무소',
  '자동이체', '5', '특약 없음',
].join('\t');

export function ContractsImportPanel() {
  const [contracts, setContracts] = useContractStore();
  const audit = useAuditStamp();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => parseTSV(text, contracts), [text, contracts]);
  const okRows = rows.filter((r) => r.errors.length === 0);
  const errRows = rows.filter((r) => r.errors.length > 0);

  function commitImport() {
    if (okRows.length === 0) return;
    if (!confirm(`총 ${okRows.length}건 import (신규 ${okRows.filter((r) => !r.isUpdate).length} / 업데이트 ${okRows.filter((r) => r.isUpdate).length}). 계속할까요?`)) return;
    setBusy(true);
    try {
      setContracts((prev) => {
        const map = new Map(prev.map((c) => [c.id, c] as const));
        const usedContractNos = new Set(prev.map((c) => c.contractNo));

        for (const r of okRows) {
          const d = r.data;
          const startDate = d.startDate ?? '';
          const endDate = d.endDate ?? '';
          const monthlyAmount = d.monthlyAmount ?? 0;
          const events = buildEventsWithOverdue(startDate, endDate, monthlyAmount, d.overdueCyclesRaw ?? '');
          const computedStatus: Contract['status'] = endDate && endDate < todayStr() ? '만기' : '운행중';

          if (r.isUpdate && r.matchedId) {
            const existing = map.get(r.matchedId);
            if (!existing) continue;
            // 모든 필드 update + events 재계산. id/contractNo 보존.
            const updated: Contract = {
              ...existing,
              companyCode:   d.companyCode      ?? existing.companyCode,
              plate:         d.plate            ?? existing.plate,
              customerName:  d.customerName     ?? existing.customerName,
              customerKind:  d.customerKind     ?? existing.customerKind,
              customerIdent: d.customerIdent    ?? existing.customerIdent,
              customerPhone: d.customerPhone    ?? existing.customerPhone,
              startDate:     startDate,
              endDate:       endDate,
              monthlyAmount: monthlyAmount,
              deposit:       d.deposit ?? existing.deposit,
              status:        computedStatus,
              events,
              driverScope:    d.driverScope ?? existing.driverScope,
              driverAgeLimit: d.driverAgeLimit ?? existing.driverAgeLimit,
              mileageLimitKm: d.mileageLimitKm ?? existing.mileageLimitKm,
              deliveryAddress: d.deliveryAddress ?? existing.deliveryAddress,
              returnAddress:   d.returnAddress ?? existing.returnAddress,
              paymentMethod:   d.paymentMethod ?? existing.paymentMethod,
              paymentDay:      d.paymentDay ?? existing.paymentDay,
              specialTerms:    d.specialTerms ?? existing.specialTerms,
              ...audit.update(),
            };
            map.set(updated.id, updated);
          } else {
            // 신규 — id/contractNo 자동 부여
            const id = `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            const contractNo = d.contractNo?.trim()
              ? d.contractNo.trim()
              : nextDateScopedCode('C', Array.from(usedContractNos));
            usedContractNos.add(contractNo);
            const created: Contract = {
              id,
              companyCode:   d.companyCode ?? '',
              contractNo,
              plate:         d.plate ?? '',
              customerName:  d.customerName ?? '',
              customerKind:  d.customerKind ?? '개인',
              customerIdent: d.customerIdent ?? '',
              customerPhone: d.customerPhone ?? '',
              startDate,
              endDate,
              monthlyAmount,
              deposit: d.deposit ?? 0,
              status: computedStatus,
              events,
              driverScope:    d.driverScope,
              driverAgeLimit: d.driverAgeLimit,
              mileageLimitKm: d.mileageLimitKm,
              deliveryAddress: d.deliveryAddress,
              returnAddress:   d.returnAddress,
              paymentMethod:   d.paymentMethod,
              paymentDay:      d.paymentDay,
              specialTerms:    d.specialTerms,
              additionalDrivers: d.additionalDrivers as AdditionalDriver[] | undefined,
              ...audit.create(),
            };
            map.set(id, created);
            audit.log({ action: 'create', entityType: 'contract', entityId: id, label: contractNo, after: created });
          }
        }

        return Array.from(map.values());
      });
      setText('');
    } finally {
      setBusy(false);
    }
  }

  function copyHeader() {
    navigator.clipboard.writeText(SHEET_HEADERS.map(([, l]) => l).join('\t')).catch(() => {});
  }
  function copySample() {
    navigator.clipboard.writeText(SAMPLE_TSV).catch(() => {});
  }

  return (
    <div className="space-y-2" style={{ padding: '8px 0' }}>
      <div className="alert alert-info" style={{ fontSize: 12 }}>
        <strong>계약 일괄 import (운영 데이터 마이그레이션)</strong>
        <div className="mt-1 dim">
          단건 신규 등록(/contract)은 항상 자동생성(모두 예정) — 운영 진입한 마이그레이션 데이터만 여기서 처리.
          첫 줄 헤더 (한글 라벨). 계약번호가 비면 자동 부여, 있으면 기존 매칭 → events 갱신.
          <br />
          <strong>미수회차</strong>:
          {' '}<code>5</code> = 5회차부터 미수 (1~4 자동 완료, 5 이후 미수) — 가장 일반
          {' / '}<code>3,4,5</code> = 명시 회차만 미수 (드문 비연속)
          {' / '}빈값 = 도래분 모두 완료
          {' / '}<code>0</code> 또는 <code>없음</code> = 미수 없음 (모두 완료)
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-sm" onClick={copyHeader}>
            <FileXls size={11} weight="bold" /> 헤더 복사
          </button>
          <button className="btn btn-sm" onClick={copySample}>
            <FileXls size={11} weight="bold" /> 샘플 복사
          </button>
        </div>
      </div>

      <textarea
        className="input"
        rows={8}
        style={{ width: '100%', fontFamily: 'monospace', fontSize: 12 }}
        value={text}
        placeholder={'헤더 한 줄 + 데이터 — 구글시트 복사붙여넣기 (탭 구분)'}
        onChange={(e) => setText(e.target.value)}
      />

      {rows.length > 0 && (
        <>
          <div className="border" style={{ borderColor: 'var(--border)', overflowX: 'auto', maxHeight: 320 }}>
            <table className="table">
              <thead>
                <tr>
                  <th className="center" style={{ width: 70 }}>상태</th>
                  <th>회사</th>
                  <th>계약번호</th>
                  <th>차량</th>
                  <th>고객</th>
                  <th className="date">시작</th>
                  <th className="date">만기</th>
                  <th className="num">월</th>
                  <th>미수회차</th>
                  <th>오류 / 메모</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td className="center">
                      {r.errors.length > 0 ? (
                        <span className="badge badge-red"><Warning size={11} weight="fill" /> 오류</span>
                      ) : r.isUpdate ? (
                        <span className="badge badge-orange"><ArrowCounterClockwise size={11} weight="fill" /> 갱신</span>
                      ) : (
                        <span className="badge badge-green"><CheckCircle size={11} weight="fill" /> 신규</span>
                      )}
                    </td>
                    <td className="plate">{r.data.companyCode || '-'}</td>
                    <td className="mono">{r.data.contractNo || '(자동)'}</td>
                    <td className="plate">{r.data.plate || '-'}</td>
                    <td>{r.data.customerName || '-'}</td>
                    <td className="date">{r.data.startDate || '-'}</td>
                    <td className="date">{r.data.endDate || '-'}</td>
                    <td className="num">{r.data.monthlyAmount?.toLocaleString('ko-KR') || '-'}</td>
                    <td className="dim">{r.data.overdueCyclesRaw || '(자동)'}</td>
                    <td className={r.errors.length > 0 ? 'text-red text-xs' : 'text-weak text-xs'}>
                      {r.errors.join(', ') || r.warning || ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="text-weak text-xs" style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>
              총 {rows.length}건 · 등록 가능 <strong>{okRows.length}</strong>
              {errRows.length > 0 && <> · 오류 <span className="text-red">{errRows.length}건 제외</span></>}
            </span>
            <button
              className="btn btn-primary"
              disabled={okRows.length === 0 || busy}
              onClick={commitImport}
            >
              {okRows.length > 0 ? `${okRows.length}건 일괄 등록` : '등록'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
