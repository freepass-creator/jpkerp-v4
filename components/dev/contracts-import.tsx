'use client';

import { useMemo, useState } from 'react';
import { CheckCircle, Warning, ArrowCounterClockwise, FileXls, Upload, DownloadSimple } from '@phosphor-icons/react';
import { type Contract, type CustomerKind, type AdditionalDriver } from '@/lib/sample-contracts';
import { useContractStore } from '@/lib/use-contract-store';
import { useAssetStore } from '@/lib/use-asset-store';
import { useLedgerStore } from '@/lib/use-ledger-store';
import { useAuditStamp } from '@/lib/audit-fields';
import { nextDateScopedCode } from '@/lib/code-gen';
import { buildEventsWithOverdue } from '@/lib/contract-events';
import { todayStr } from '@/lib/date-utils';
import type { LedgerEntry } from '@/lib/sample-finance';

/**
 * 계약 일괄 import — 운영 데이터 마이그레이션 전용 (/dev 탭).
 *
 * 입력: TSV (Tab-Separated Values), 첫 줄 = 헤더 (한글 라벨)
 *
 * 헤더 (현재 21컬럼):
 *   회사코드 | 계약번호 | 차량번호 | 고객명 | 신분 | 등록번호 | 연락처 |
 *   시작일 | 만기일 | 월대여료 | 보증금 | 현재미수 | 출고여부 |
 *   운전자범위 | 연령제한 | 주행거리한도(km) | 인도장소 | 반납장소 |
 *   결제방법 | 결제일 | 특약사항
 *
 * 마이그레이션 상태 컬럼:
 *  · "현재미수" (원) — 누적 미수금액. 0 또는 빈값 = 완납. 천단위 콤마/₩/원 자동 정리.
 *    → ledger 시드 1건 push: deposit = 청구합계 - 미수금액. /pending/overdue 자동 정확.
 *    → 부분납부 자연 표현 (50만원 청구 중 20만원 미수 OK).
 *  · "출고여부" — "예" 면 출고 events 완료 처리 + 매칭 자산 상태 → 운행중.
 *
 * 등록 정책:
 *  · 계약번호 일치 → 기존 update (events 자동 재생성, 마이그 시드 idempotent 재적용)
 *  · 계약번호 미일치 → 신규 push (자동 부여)
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
  ['currentOverdue',  '현재미수'],
  ['delivered',       '출고여부'],
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
  data: Partial<Contract> & {
    currentOverdueAmount?: number;   // 사용자 입력 누적 미수액(원)
    deliveredFlag?: boolean;         // 출고여부 — 예/아니오/빈값
  };
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
    const data: ImportRow['data'] = {};
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
        case 'currentOverdue': {
          const cleaned = val.replace(/[,\s₩원]/g, '');
          if (cleaned === '' || cleaned === '0') {
            data.currentOverdueAmount = 0;
            break;
          }
          const n = Number(cleaned);
          if (!Number.isFinite(n) || n < 0) errors.push(`현재미수 형식 오류: ${val}`);
          else data.currentOverdueAmount = n;
          break;
        }
        case 'delivered': {
          const t = val.trim();
          if (t === '예' || t === 'Y' || t === 'y' || t === 'true') data.deliveredFlag = true;
          else if (t === '아니오' || t === 'N' || t === 'n' || t === 'false') data.deliveredFlag = false;
          else errors.push(`출고여부 값 오류: ${val} (예/아니오)`);
          break;
        }
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
  '2025-01-01', '2026-12-31', '500000', '1000000',
  '0', '예',  // 현재미수 / 출고여부
  '가족한정', '만 26세 이상', '30000', '강남구 사무소', '강남구 사무소',
  '자동이체', '5', '특약 없음',
].join('\t');

export function ContractsImportPanel() {
  const [contracts, setContracts] = useContractStore();
  const [, setAssets] = useAssetStore();
  const [, setLedger] = useLedgerStore();
  const audit = useAuditStamp();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const rows = useMemo(() => parseTSV(text, contracts), [text, contracts]);
  const okRows = rows.filter((r) => r.errors.length === 0);
  const errRows = rows.filter((r) => r.errors.length > 0);

  function commitImport() {
    if (okRows.length === 0) return;
    const newCount    = okRows.filter((r) => !r.isUpdate).length;
    const updateCount = okRows.filter((r) => r.isUpdate).length;
    const seedCount   = okRows.filter((r) => (r.data.currentOverdueAmount ?? 0) > 0).length;
    const deliverCount = okRows.filter((r) => r.data.deliveredFlag === true).length;
    if (!confirm(
      `총 ${okRows.length}건 import — 신규 ${newCount} / 갱신 ${updateCount}\n`
      + `· 미수금액 입력 (시드 push 대상): ${seedCount}건\n`
      + `· 출고완료 처리: ${deliverCount}건\n\n계속?`,
    )) return;
    setBusy(true);
    try {
      const today = todayStr();
      const stamp = `${today} 00:00`;
      // contracts 갱신 결과를 closure 외부에 모아 ledger/assets 후속 처리에 사용
      const finalRows: Array<{ row: ImportRow; contract: Contract }> = [];

      setContracts((prev) => {
        const map = new Map(prev.map((c) => [c.id, c] as const));
        const usedContractNos = new Set(prev.map((c) => c.contractNo));

        for (const r of okRows) {
          const d = r.data;
          const startDate = d.startDate ?? '';
          const endDate = d.endDate ?? '';
          const monthlyAmount = d.monthlyAmount ?? 0;
          // events 자동생성 — 도래분 완료, 미도래 예정. 출고여부는 buildEventsWithOverdue auto 가 도래분 완료 처리.
          const events = buildEventsWithOverdue(startDate, endDate, monthlyAmount, '', {
            autopayDay: d.paymentDay,
            engineOilService: d.engineOilService,
          });
          const computedStatus: Contract['status'] = endDate && endDate < today ? '만기' : '운행중';

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
            finalRows.push({ row: r, contract: updated });
          } else {
            // 신규 — id/contractNo 자동 부여
            const id = `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            const contractNo = d.contractNo?.trim()
              ? d.contractNo.trim()
              : nextDateScopedCode('C', Array.from(usedContractNos), { date: d.startDate || undefined });
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
            finalRows.push({ row: r, contract: created });
          }
        }

        return Array.from(map.values());
      });

      // ─ 출고여부=예 → 매칭 자산 status='운행중' (대기/등록예정만 전환, 이미 운행중·정비·매각은 그대로) ─
      const platesToActivate = new Set(
        finalRows
          .filter(({ row }) => row.data.deliveredFlag === true)
          .map(({ contract }) => contract.plate),
      );
      if (platesToActivate.size > 0) {
        setAssets((prev) => prev.map((a) =>
          platesToActivate.has(a.plate) && (a.status === '대기' || a.status === '등록예정')
            ? { ...a, status: '운행중' as const, ...audit.update() }
            : a,
        ));
      }

      // ─ 미수금액 ledger 시드 (idempotent — 같은 계약의 마이그시드 제거 후 재생성) ─
      const seedTargets = finalRows.filter(({ row }) => (row.data.currentOverdueAmount ?? 0) > 0 || row.data.currentOverdueAmount === 0);
      const targetContractNos = new Set(seedTargets.map(({ contract }) => contract.contractNo));
      const newSeeds: LedgerEntry[] = [];
      const auditCreate = audit.create();
      for (const { row, contract } of seedTargets) {
        const overdue = row.data.currentOverdueAmount ?? 0;
        const pastDueAmount = contract.events
          .filter((e) => e.type === '수납' && e.dueDate <= today)
          .reduce((s, e) => s + (e.amount ?? 0), 0);
        const seed = pastDueAmount - overdue;
        if (seed <= 0) continue; // 청구 없음 또는 미수=청구 → 시드 push 의미 없음
        newSeeds.push({
          id: `migseed-${contract.contractNo}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          companyCode: contract.companyCode,
          txDate: stamp,
          deposit: seed,
          balance: seed,
          memo: `마이그레이션 시드 - ${contract.customerName}`,
          counterparty: contract.customerName,
          method: '기타',
          subject: '대여료',
          matchedContract: contract.contractNo,
          note: '일괄 수납 마이그레이션',
          ...auditCreate,
        });
      }
      if (targetContractNos.size > 0) {
        setLedger((prev) => {
          const filtered = prev.filter((e) => {
            if (e.note !== '일괄 수납 마이그레이션') return true;
            if (!e.matchedContract) return true;
            return !targetContractNos.has(e.matchedContract);
          });
          return [...filtered, ...newSeeds];
        });
      }

      setText('');
      setFileName(null);
    } finally {
      setBusy(false);
    }
  }

  async function handleDownloadTemplate() {
    setDownloading(true);
    try {
      const XLSX = await import('xlsx');
      const today = todayStr();
      const active = contracts.filter((c) => !c.deletedAt);
      const header = SHEET_HEADERS.map(([, l]) => l);
      const aoa: (string | number)[][] = [header];

      if (active.length === 0) {
        // 빈 환경 — 샘플 1행만
        aoa.push([
          'CP01', '', '12가3456', '예시-홍길동', '개인', '900101-1234567', '010-1234-5678',
          '2025-01-01', '2026-12-31', 500000, 1000000,
          0, '예',
          '가족한정', '만 26세 이상', 30000, '강남구 사무소', '강남구 사무소',
          '자동이체', 5, '특약 없음',
        ]);
      } else {
        for (const c of active) {
          aoa.push([
            c.companyCode ?? '',
            c.contractNo ?? '',
            c.plate ?? '',
            c.customerName ?? '',
            c.customerKind ?? '개인',
            c.customerIdent ?? '',
            c.customerPhone ?? '',
            c.startDate ?? '',
            c.endDate ?? '',
            c.monthlyAmount ?? 0,
            c.deposit ?? 0,
            0,        // 현재미수 — 사용자 편집 대상
            '예',     // 출고여부 — 기본 출고완료, 필요시 '아니오' 변경
            c.driverScope ?? '',
            c.driverAgeLimit ?? '',
            c.mileageLimitKm ?? '',
            c.deliveryAddress ?? '',
            c.returnAddress ?? '',
            c.paymentMethod ?? '',
            c.paymentDay ?? '',
            c.specialTerms ?? '',
          ]);
        }
      }

      const sheet = XLSX.utils.aoa_to_sheet(aoa);
      sheet['!cols'] = header.map((h) => ({ wch: h === '특약사항' ? 24 : 14 }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, sheet, '계약마이그');
      XLSX.writeFile(wb, `계약마이그_양식_${today}.xlsx`);
    } catch (err) {
      alert(`양식 다운로드 실패: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDownloading(false);
    }
  }

  async function handleFileUpload(file: File) {
    const ext = (file.name.toLowerCase().split('.').pop() ?? '').trim();
    setLoadingFile(true);
    try {
      let tsv: string;
      if (ext === 'tsv' || ext === 'txt') {
        tsv = await file.text();
      } else if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
        const XLSX = await import('xlsx');
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const firstName = wb.SheetNames[0];
        if (!firstName) throw new Error('빈 시트');
        tsv = XLSX.utils.sheet_to_csv(wb.Sheets[firstName], { FS: '\t' });
      } else {
        throw new Error(`지원하지 않는 확장자: .${ext}`);
      }
      setText(tsv);
      setFileName(file.name);
    } catch (err) {
      alert(`파일 읽기 실패: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoadingFile(false);
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
          <strong>현재미수</strong> (원): 누적 미수금액. 0 = 완납, 천단위 콤마/₩/원 허용.
          → 청구합계 - 미수금액 만큼 ledger 시드 push (idempotent). /pending/overdue 가 자동 정확. 부분납부 자연 표현 (50만원 청구 중 20만원 미수 OK).
          <br />
          <strong>출고여부</strong>: <code>예</code> 면 매칭 자산 운행중 전환. <code>아니오</code> 또는 빈값이면 자산 상태 변경 없음.
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn btn-sm" onClick={handleDownloadTemplate} disabled={downloading} title="활성 계약 자동채움 XLSX 양식 — 현재미수만 편집하면 됨">
            <DownloadSimple size={11} weight="bold" /> {downloading ? '생성 중…' : '① 양식 다운로드'}
          </button>
          <label className="btn btn-sm" style={{ cursor: loadingFile ? 'wait' : 'pointer' }}>
            <Upload size={11} weight="bold" /> {loadingFile ? '읽는 중…' : '② 파일 업로드'}
            <input
              type="file"
              accept=".xlsx,.xls,.csv,.tsv,.txt"
              style={{ display: 'none' }}
              disabled={loadingFile}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void handleFileUpload(f);
              }}
            />
          </label>
          <span className="text-weak text-xs">XLSX · XLS · CSV · TSV · TXT</span>
          <span style={{ borderLeft: '1px solid var(--border)', height: 16, margin: '0 4px' }} />
          <button className="btn btn-sm" onClick={copyHeader} title="헤더만 복사 (구글시트 첫 줄에 붙여넣기)">
            <FileXls size={11} weight="bold" /> 헤더 복사
          </button>
          <button className="btn btn-sm" onClick={copySample} title="샘플 1행 포함 헤더 복사">
            <FileXls size={11} weight="bold" /> 샘플 복사
          </button>
          {fileName && (
            <span className="text-xs" style={{ marginLeft: 'auto' }}>
              <span className="dim">불러옴: </span>
              <span className="mono">{fileName}</span>
              <button
                type="button"
                className="btn btn-sm"
                style={{ marginLeft: 6 }}
                onClick={() => { setText(''); setFileName(null); }}
              >
                지우기
              </button>
            </span>
          )}
        </div>
      </div>

      <textarea
        className="input"
        rows={8}
        style={{ width: '100%', fontFamily: 'monospace', fontSize: 12 }}
        value={text}
        placeholder={'양식 다운로드 → 엑셀에서 편집 → 파일 업로드. 또는 구글시트에서 직접 복사붙여넣기 (탭 구분).'}
        onChange={(e) => { setText(e.target.value); if (fileName) setFileName(null); }}
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
                  <th className="num">현재미수</th>
                  <th className="center">출고</th>
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
                    <td className="num">
                      {r.data.currentOverdueAmount === undefined
                        ? <span className="dim">(0)</span>
                        : `₩${r.data.currentOverdueAmount.toLocaleString('ko-KR')}`}
                    </td>
                    <td className="center">
                      {r.data.deliveredFlag === true ? '예'
                        : r.data.deliveredFlag === false ? '아니오'
                        : <span className="dim">—</span>}
                    </td>
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
