'use client';

import { useState, useMemo } from 'react';
import { Upload, Pencil, FileXls, Plus, X, CheckCircle, CircleNotch, Warning, ArrowCounterClockwise, FilePdf, DownloadSimple, UploadSimple, FileArrowDown } from '@phosphor-icons/react';
import { useRef } from 'react';
import { parseContractExcel, CONTRACT_EXCEL_HEADERS, CONTRACT_EXCEL_REQUIRED, CONTRACT_EXCEL_OPTIONAL, type ContractImportResult } from '@/lib/contract-import';
import { Dialog, DialogTrigger, DialogContent, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { OcrUploadStage } from '@/components/ui/ocr-upload-stage';
import { StatusBadge } from '@/components/ui/status-badge';
import { useOcrBatch, type OcrBatchItem } from '@/lib/use-ocr-batch';
import { useCompanyStore } from '@/lib/use-company-store';
import { useAssetStore } from '@/lib/use-asset-store';
import { useContractStore } from '@/lib/use-contract-store';
import type { Asset } from '@/lib/sample-assets';
import type { Contract, CustomerKind, AdditionalDriver } from '@/lib/sample-contracts';
import { activeCompanies, type Company } from '@/lib/sample-companies';
import { fileToDataUrl } from '@/lib/image-compress';
import { normalizeKoreanDate } from '@/lib/parsers/date';

/**
 * 계약 등록 통합 다이얼로그 — 3 모드:
 *   1) 계약서 OCR (다건)  — PDF 여러 장 → 자동 추출 → 검토 후 등록
 *   2) 시트 (다건)        — 구글시트 복사붙여넣기 (TSV) → 검증 → 등록
 *   3) 개별 입력          — 단건 폼
 *
 * 필수 필드 (스키마 v1):
 *   회사코드 · 차량번호 · 고객명 · 신분 · 고객등록번호 · 연락처 · 시작일 · 만기일 · 월대여료 · 보증금
 */

/**
 * 등록 전 단계 draft.
 *   - id/contractNo: 등록 시 발급
 *   - status: 항상 '운행중' default
 *   - events: 등록 시 자동 생성 (buildEventsWithOutstanding · buildEventsWithOverdue)
 *   - outstandingAmount (선택): 현재 미수금 — 엑셀 일괄 마이그레이션 시 최근 회차부터 거꾸로 분배
 *   - overdueCycles  (선택, legacy): 미수회차 자유표기 — 호환용 (outstandingAmount 우선)
 */
type ContractDraft = Omit<Contract, 'id' | 'contractNo' | 'status' | 'events'> & {
  outstandingAmount?: number;
  overdueCycles?: string;
};

type ContractWorkItem = OcrBatchItem & {
  data: Partial<ContractDraft>;
};

const EMPTY_DRAFT: Partial<ContractDraft> = {
  companyCode: '',
  plate: '',
  customerName: '',
  customerKind: '개인',
  customerIdent: '',
  customerPhone: '',
  startDate: '',
  endDate: '',
  monthlyAmount: 0,
  deposit: 0,
};

const SHEET_HEADERS: Array<[keyof ContractDraft, string]> = [
  ['companyCode',    '회사코드'],
  ['plate',          '차량번호'],
  ['customerName',   '고객명'],
  ['customerKind',   '신분'],
  ['customerIdent',  '고객등록번호'],
  ['customerPhone',  '연락처'],
  ['startDate',      '시작일'],
  ['endDate',        '만기일'],
  ['monthlyAmount',  '월대여료'],
  ['deposit',        '보증금'],
];

/* ─── OCR (rental_contract) → ContractDraft 매핑 ───
   companyCode 결정 우선순위:
     1. plate 매칭 자산이 있으면 그 자산의 companyCode (운영 데이터 일관성)
     2. OCR 추출 company_biz_no 가 등록된 회사와 매칭 (정규화: 하이픈/공백 제거)
     3. company_name 정확 일치 매칭
     4. 위 모두 실패 — 빈 값, 사용자가 수동 선택 */
function mapContractOcr(
  raw: Record<string, unknown>,
  assets: readonly Asset[],
  companies: readonly Company[],
): Partial<ContractDraft> {
  const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  const numOrUndef = (v: unknown): number | undefined =>
    typeof v === 'number' && Number.isFinite(v) ? v : undefined;
  const strOrUndef = (v: unknown): string | undefined => {
    const s = str(v);
    return s ? s : undefined;
  };
  const boolOrUndef = (v: unknown): boolean | undefined =>
    typeof v === 'boolean' ? v : undefined;
  const kindRaw = str(raw.contractor_kind);
  const customerKind: CustomerKind =
    kindRaw === '법인' ? '법인'
    : kindRaw === '사업자' ? '사업자'
    : '개인';
  const plate = str(raw.car_number);
  const matchedAsset = plate ? assets.find((a) => a.plate === plate) : undefined;

  // 회사 매칭 — 1) 자산 fallback 2) biz_no 정규화 비교 3) name 정확일치
  const companyBizNoNorm = str(raw.company_biz_no).replace(/[\s\-]/g, '');
  const companyName = str(raw.company_name);
  const matchedByBizNo = companyBizNoNorm
    ? companies.find((c) => !c.deletedAt && c.bizNo.replace(/[\s\-]/g, '') === companyBizNoNorm)
    : undefined;
  const matchedByName = !matchedByBizNo && companyName
    ? companies.find((c) => !c.deletedAt && c.name === companyName)
    : undefined;
  const resolvedCompanyCode =
    matchedAsset?.companyCode
    ?? matchedByBizNo?.code
    ?? matchedByName?.code
    ?? '';

  return {
    companyCode: resolvedCompanyCode,
    plate,
    customerName: str(raw.contractor_name),
    customerKind,
    customerIdent: str(raw.contractor_ident),
    customerPhone: str(raw.contractor_phone),
    customerLicenseNo: strOrUndef(raw.contractor_license_no),
    customerAddress: strOrUndef(raw.contractor_address),
    emergencyPhone: strOrUndef(raw.contractor_emergency_phone),
    emergencyRelation: strOrUndef(raw.contractor_emergency_relation),
    startDate: normalizeKoreanDate(str(raw.start_date)),
    endDate: normalizeKoreanDate(str(raw.end_date)),
    monthlyAmount: num(raw.monthly_amount),
    deposit: num(raw.deposit_total),
    // 운전 조건 / 주행거리
    driverAgeLimit: typeof raw.driver_age_min === 'number'
      ? `만 ${raw.driver_age_min}세 이상`
      : undefined,
    mileageLimitKm: numOrUndef(raw.annual_mileage_limit_km),
    excessMileageFeeKr: numOrUndef(raw.excess_mileage_fee_kr),
    excessMileageFeeForeign: numOrUndef(raw.excess_mileage_fee_foreign),
    initialMileageKm: numOrUndef(raw.initial_mileage_km),
    // 결제 / 자동이체
    paymentDay: numOrUndef(raw.autopay_day),
    paymentBank: strOrUndef(raw.payment_account_bank),
    paymentAccount: strOrUndef(raw.payment_account_no),
    paymentHolder: strOrUndef(raw.payment_account_holder),
    autoDebitBank: strOrUndef(raw.auto_debit_bank),
    autoDebitAccount: strOrUndef(raw.auto_debit_account),
    autoDebitHolder: strOrUndef(raw.auto_debit_holder),
    // 정비/서비스
    maintenanceProduct: strOrUndef(raw.maintenance_product),
    engineOilService: boolOrUndef(raw.engine_oil_service),
    inspectionService: boolOrUndef(raw.inspection_service),
    // 보험
    insurer: strOrUndef(raw.insurer),
    deductibleMin: numOrUndef(raw.deductible_min),
    deductibleMax: numOrUndef(raw.deductible_max),
    deductibleRate: typeof raw.deductible_rate === 'number' && Number.isFinite(raw.deductible_rate)
      ? raw.deductible_rate
      : undefined,
    // 승계
    predecessorName: strOrUndef(raw.predecessor_name),
    predecessorPhone: strOrUndef(raw.predecessor_phone),
    succeededAt: normalizeKoreanDate(str(raw.succeeded_at)) || undefined,
    // 인수옵션
    purchaseOptionAmount: strOrUndef(raw.purchase_option_amount),
  };
}

/* ─── 시트 (TSV) 파싱 ─── */
type SheetRow = { data: Partial<ContractDraft>; errors: string[] };

function parseSheet(text: string, assets: readonly Asset[]): SheetRow[] {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return [];

  // 첫 줄이 한글 헤더면 매핑, 아니면 SHEET_HEADERS 순서로 가정
  const firstCols = lines[0].split('\t').map((s) => s.trim());
  const looksLikeHeader = firstCols.some((c) => SHEET_HEADERS.some(([, label]) => label === c));
  const headerKeys: Array<keyof ContractDraft | null> = looksLikeHeader
    ? firstCols.map((label) => SHEET_HEADERS.find(([, l]) => l === label)?.[0] ?? null)
    : SHEET_HEADERS.map(([k]) => k);
  const dataLines = looksLikeHeader ? lines.slice(1) : lines;

  return dataLines.map((line) => {
    const cols = line.split('\t').map((s) => s.trim());
    const data: Partial<ContractDraft> = {};
    const errors: string[] = [];
    headerKeys.forEach((key, i) => {
      if (!key || !cols[i]) return;
      const val = cols[i];
      if (key === 'monthlyAmount' || key === 'deposit') {
        const n = Number(val.replace(/,/g, ''));
        if (!Number.isFinite(n)) { errors.push(`${key} 숫자 아님: ${val}`); return; }
        (data as Record<string, unknown>)[key] = n;
      } else if (key === 'customerKind') {
        if (val === '개인' || val === '사업자' || val === '법인') data.customerKind = val;
        else errors.push(`신분 값 오류: ${val} (개인/사업자/법인)`);
      } else {
        (data as Record<string, unknown>)[key] = val;
      }
    });
    // 회사코드 비었지만 plate 가 등록 자산과 일치하면 자동 채움
    if (!data.companyCode && data.plate) {
      const matched = assets.find((a) => a.plate === data.plate);
      if (matched) data.companyCode = matched.companyCode;
    }
    // 필수 검증
    if (!data.companyCode) errors.push('회사코드 누락');
    if (!data.plate) errors.push('차량번호 누락');
    if (!data.customerName) errors.push('고객명 누락');
    if (!data.customerIdent) errors.push('고객등록번호 누락');
    if (!data.startDate) errors.push('시작일 누락');
    if (!data.endDate) errors.push('만기일 누락');
    return { data, errors };
  });
}

/* ─── 단건 검증 ─── */
function validateDraft(d: Partial<ContractDraft>): string[] {
  const errors: string[] = [];
  if (!d.companyCode) errors.push('회사코드');
  if (!d.plate) errors.push('차량번호');
  if (!d.customerName) errors.push('고객명');
  if (!d.customerIdent) errors.push('고객등록번호');
  if (!d.customerPhone) errors.push('연락처');
  if (!d.startDate) errors.push('시작일');
  if (!d.endDate) errors.push('만기일');
  return errors;
}

type Props = {
  onCreate: (draft: ContractDraft) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  showTrigger?: boolean;
};

export function ContractRegisterDialog({ onCreate, open: openProp, onOpenChange, showTrigger = true }: Props) {
  const [companies] = useCompanyStore();
  const [assets] = useAssetStore();
  const [contracts] = useContractStore();
  const [openInner, setOpenInner] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : openInner;
  const setOpen = (v: boolean) => {
    if (!isControlled) setOpenInner(v);
    onOpenChange?.(v);
  };

  const [tab, setTab] = useState<'excel' | 'sheet' | 'manual' | 'ocr'>('excel');

  // 기본 회사 — 모든 탭 공통. 새 OCR row / manual / sheet 의 default 채움.
  const activeCompanyList = companies.filter((c) => !c.deletedAt);
  const [defaultCompanyCode, setDefaultCompanyCode] = useState(
    activeCompanyList.length === 1 ? activeCompanyList[0].code : '',
  );

  /* OCR 다건 */
  const ocr = useOcrBatch<ContractWorkItem>({
    docType: 'rental_contract',
    createPlaceholder: (file, id) => ({
      id, fileName: file.name, _status: 'pending',
      data: { ...EMPTY_DRAFT, companyCode: defaultCompanyCode },
    }),
    applyResult: (prev, raw) => ({ ...prev, data: { ...prev.data, ...mapContractOcr(raw, assets, companies) } }),
  });
  const ocrOk = ocr.items.filter((i) => i._status === 'done' && validateDraft(i.data).length === 0);

  /* 시트 다건 */
  const [sheetText, setSheetText] = useState('');
  const sheetRows = useMemo(() => parseSheet(sheetText, assets), [sheetText, assets]);
  const sheetOk = sheetRows.filter((r) => r.errors.length === 0);

  /* 개별 단건 */
  const [draft, setDraft] = useState<Partial<ContractDraft>>(EMPTY_DRAFT);
  const draftErrors = validateDraft(draft);

  function reset() {
    ocr.reset();
    setSheetText('');
    setDraft(EMPTY_DRAFT);
    setTab('excel');
  }

  function handleClose(o: boolean) {
    setOpen(o);
    if (!o) setTimeout(reset, 100);
  }

  function commitOcr() {
    ocrOk.forEach((i) => onCreate(i.data as ContractDraft));
    handleClose(false);
  }
  function commitSheet() {
    sheetOk.forEach((r) => onCreate(r.data as ContractDraft));
    handleClose(false);
  }
  function commitManual() {
    if (draftErrors.length > 0) {
      alert(`필수 누락: ${draftErrors.join(', ')}`);
      return;
    }
    onCreate(draft as ContractDraft);
    handleClose(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      {showTrigger && (
        <DialogTrigger asChild>
          <button className="btn btn-primary">
            <Plus size={14} weight="bold" /> 계약등록
          </button>
        </DialogTrigger>
      )}

      <DialogContent title="계약 등록" size="xl">
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList>
            <TabsTrigger value="excel">
              <FileXls size={14} className="mr-1.5 inline" /> 엑셀
            </TabsTrigger>
            <TabsTrigger value="sheet">
              <FileXls size={14} className="mr-1.5 inline" /> 시트
            </TabsTrigger>
            <TabsTrigger value="manual">
              <Pencil size={14} className="mr-1.5 inline" /> 단건
            </TabsTrigger>
            <TabsTrigger value="ocr">
              <Upload size={14} className="mr-1.5 inline" /> OCR (계약서 PDF)
            </TabsTrigger>
          </TabsList>

          {/* 기본 회사 — 모든 탭 공통. 새 OCR row / manual / sheet 의 회사코드 default. 행별 override 가능. */}
          <div className="form-grid" style={{ marginTop: 8 }}>
            <label className="block col-span-2">
              <span className="label">기본 회사</span>
              <select
                className="input w-full"
                value={defaultCompanyCode}
                onChange={(e) => setDefaultCompanyCode(e.target.value)}
              >
                <option value="">선택 (행마다 별도 지정 가능)</option>
                {activeCompanyList.map((c) => (
                  <option key={c.code} value={c.code}>{c.code} · {c.name}</option>
                ))}
              </select>
            </label>
          </div>

          {/* ── 엑셀 일괄 등록 ── */}
          <TabsContent value="excel">
            <ContractExcelTab
              defaultCompanyCode={defaultCompanyCode}
              onSubmit={(rows) => {
                rows.forEach((r) => onCreate(r.data as ContractDraft));
                handleClose(false);
              }}
            />
          </TabsContent>

          {/* ── OCR 다건 ── */}
          <TabsContent value="ocr">
            <div className="space-y-3">
              <OcrUploadStage
                progress={ocr.progress}
                busy={ocr.busy}
                onFiles={ocr.handleFiles}
                idleTitle="계약서 업로드 — 클릭 또는 드래그&드롭"
                idleSubtitle="PDF / JPG / PNG — 업로드 즉시 OCR. 회사코드는 검토 후 직접 지정 (등록증과 달리 계약서엔 회사코드 표기 없음)."
                progressSubtitle="Gemini가 계약서를 읽고 있습니다"
              />

              {ocr.items.length > 0 && (
                <div className="border" style={{ borderColor: 'var(--border)', overflowX: 'auto', maxHeight: 360 }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th className="center" style={{ width: 70 }}>상태</th>
                        <th>회사</th>
                        <th>차량번호</th>
                        <th>고객명</th>
                        <th>신분</th>
                        <th>등록번호</th>
                        <th>연락처</th>
                        <th className="date">시작</th>
                        <th className="date">만기</th>
                        <th className="num">월대여료</th>
                        <th className="center" style={{ width: 50 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {ocr.items.map((p) => {
                        const errs = p._status === 'done' ? validateDraft(p.data) : [];
                        return (
                          <tr key={p.id}>
                            <td className="center"><ContractItemStatus item={p} errors={errs} /></td>
                            <td className="plate">
                              {p._status === 'done' ? (
                                <select className="input" style={{ width: 80, padding: '2px 4px' }}
                                        value={p.data.companyCode ?? ''}
                                        onChange={(e) => ocr.setItems((prev) => prev.map((it) =>
                                          it.id === p.id ? { ...it, data: { ...it.data, companyCode: e.target.value } } : it,
                                        ))}>
                                  <option value="">선택</option>
                                  {activeCompanies(companies).map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
                                </select>
                              ) : <span className="text-weak">…</span>}
                            </td>
                            <td className="plate text-medium">{p.data.plate || '-'}</td>
                            <td>{p.data.customerName || '-'}</td>
                            <td className="dim">{p.data.customerKind || '-'}</td>
                            <td className="mono dim">{p.data.customerIdent || '-'}</td>
                            <td className="mono dim">{p.data.customerPhone || '-'}</td>
                            <td className="date">{p.data.startDate || '-'}</td>
                            <td className="date">{p.data.endDate || '-'}</td>
                            <td className="num">{p.data.monthlyAmount?.toLocaleString('ko-KR') || '-'}</td>
                            <td className="center">
                              <button className="btn-ghost btn btn-sm" onClick={() => ocr.removeItem(p.id)}>
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

              {ocr.items.length > 0 && (
                <div className="text-weak text-xs">
                  총 {ocr.items.length}건 · 등록 가능 <strong>{ocrOk.length}</strong>
                </div>
              )}
            </div>

            <DialogFooter>
              <button
                className="btn"
                style={{ marginRight: 'auto' }}
                disabled={ocr.items.length === 0 || ocr.busy}
                onClick={ocr.reset}
              >
                <ArrowCounterClockwise size={14} weight="bold" /> 초기화
              </button>
              <DialogClose asChild><button className="btn">취소</button></DialogClose>
              <button className="btn btn-primary" disabled={ocrOk.length === 0 || ocr.busy} onClick={commitOcr}>
                {ocrOk.length > 0 ? `${ocrOk.length}건 등록` : '등록'}
              </button>
            </DialogFooter>
          </TabsContent>

          {/* ── 시트 다건 ── */}
          <TabsContent value="sheet">
            <div className="space-y-2">
              <div className="alert alert-info">
                <div>
                  구글시트에서 복사 → 아래 영역 붙여넣기. 첫 줄이 헤더면 자동 인식.
                  <br />
                  <strong>컬럼 순서</strong>: {SHEET_HEADERS.map(([, l]) => l).join(' / ')} · <strong>신분</strong>: 개인 / 사업자 / 법인
                </div>
                <SheetTemplateActions />
              </div>
              <textarea
                className="input"
                rows={8}
                style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: 12 }}
                placeholder={'CP01\t01도1234\t홍길동\t개인\t900101-1234567\t010-1234-5678\t2025-01-01\t2026-12-31\t500000\t1000000'}
                value={sheetText}
                onChange={(e) => setSheetText(e.target.value)}
              />

              {sheetRows.length > 0 && (
                <div className="border" style={{ borderColor: 'var(--border)', overflowX: 'auto', maxHeight: 280 }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th className="center" style={{ width: 70 }}>상태</th>
                        <th>회사</th>
                        <th>차량</th>
                        <th>고객</th>
                        <th>등록번호</th>
                        <th className="date">시작</th>
                        <th className="date">만기</th>
                        <th className="num">월</th>
                        <th>오류</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sheetRows.map((r, i) => (
                        <tr key={i}>
                          <td className="center">
                            {r.errors.length === 0
                              ? <StatusBadge tone="green" icon={<CheckCircle size={11} weight="fill" />}>신규</StatusBadge>
                              : <StatusBadge tone="red" icon={<Warning size={11} weight="fill" />}>오류</StatusBadge>}
                          </td>
                          <td className="plate">{r.data.companyCode || '-'}</td>
                          <td className="plate">{r.data.plate || '-'}</td>
                          <td>{r.data.customerName || '-'}</td>
                          <td className="mono dim">{r.data.customerIdent || '-'}</td>
                          <td className="date">{r.data.startDate || '-'}</td>
                          <td className="date">{r.data.endDate || '-'}</td>
                          <td className="num">{r.data.monthlyAmount?.toLocaleString('ko-KR') || '-'}</td>
                          <td className="text-red text-xs">{r.errors.join(', ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {sheetRows.length > 0 && (
                <div className="text-weak text-xs">
                  총 {sheetRows.length}건 · 등록 가능 <strong>{sheetOk.length}</strong> · 오류 <span className="text-red">{sheetRows.length - sheetOk.length}건 제외</span>
                </div>
              )}
            </div>

            <DialogFooter>
              <DialogClose asChild><button className="btn">취소</button></DialogClose>
              <button className="btn btn-primary" disabled={sheetOk.length === 0} onClick={commitSheet}>
                {sheetOk.length > 0 ? `${sheetOk.length}건 등록` : '등록'}
              </button>
            </DialogFooter>
          </TabsContent>

          {/* ── 개별 입력 ── */}
          <TabsContent value="manual">
            <ManualForm draft={draft} setDraft={setDraft} companies={companies} assets={assets} contracts={contracts} />
            <DialogFooter>
              <DialogClose asChild><button className="btn">취소</button></DialogClose>
              <button className="btn btn-primary" onClick={commitManual}>등록</button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

/* 시트 템플릿 복사 — 헤더만 / 헤더+예시 한 줄 */
const SHEET_HEADER_LINE = SHEET_HEADERS.map(([, l]) => l).join('\t');
const SHEET_EXAMPLE_LINE = ['CP01', '01도1234', '홍길동', '개인', '900101-1234567', '010-1234-5678', '2025-01-01', '2026-12-31', '500000', '1000000'].join('\t');

function SheetTemplateActions() {
  const [copied, setCopied] = useState<'' | 'header' | 'example'>('');
  async function copy(text: string, kind: 'header' | 'example') {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(''), 1200);
    } catch {
      alert('클립보드 복사 실패 — 수동 복사하세요');
    }
  }
  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
      <button className="btn btn-sm" onClick={() => copy(SHEET_HEADER_LINE, 'header')}>
        {copied === 'header' ? '복사됨 ✓' : '헤더 복사'}
      </button>
      <button className="btn btn-sm" onClick={() => copy(`${SHEET_HEADER_LINE}\n${SHEET_EXAMPLE_LINE}`, 'example')}>
        {copied === 'example' ? '복사됨 ✓' : '헤더 + 예시 복사'}
      </button>
      <span className="text-weak text-xs" style={{ alignSelf: 'center' }}>
        구글시트 첫 셀(A1)에 붙여넣으면 컬럼 자동 분리
      </span>
    </div>
  );
}

/* 행별 상태 — 분석중 / 오류 / 누락 / 신규 */
function ContractItemStatus({ item, errors }: { item: ContractWorkItem; errors: string[] }) {
  if (item._status === 'pending') return <StatusBadge tone="neutral" icon={<CircleNotch size={11} className="spin" />}>분석중</StatusBadge>;
  if (item._status === 'failed') return <StatusBadge tone="red" icon={<Warning size={11} weight="fill" />} title={item._error}>오류</StatusBadge>;
  if (errors.length > 0) {
    return <StatusBadge tone="orange" icon={<Warning size={11} weight="fill" />} title={`누락: ${errors.join(', ')}`}>누락</StatusBadge>;
  }
  return <StatusBadge tone="green" icon={<CheckCircle size={11} weight="fill" />}>신규</StatusBadge>;
}

/**
 * 단건 입력 폼 — 필수 10개.
 *
 * 자동 채움:
 *  · 차량번호 입력 → 등록 자산과 일치 시 회사코드 자동 매칭
 *  · 고객명 입력 → 이전 계약자와 일치 시 신분/등록번호/연락처 자동 채움
 */
function ManualForm({
  draft, setDraft, companies, assets, contracts,
}: {
  draft: Partial<ContractDraft>;
  setDraft: (d: Partial<ContractDraft>) => void;
  companies: ReturnType<typeof useCompanyStore>[0];
  assets: readonly Asset[];
  contracts: readonly Contract[];
}) {
  const set = <K extends keyof ContractDraft>(k: K, v: ContractDraft[K]) => setDraft({ ...draft, [k]: v });

  // 고객명 unique 목록 — 가장 최근 계약 우선 (autocomplete 후보)
  const uniqueCustomers = useMemo(() => {
    const map = new Map<string, Contract>();
    for (let i = contracts.length - 1; i >= 0; i--) {
      const c = contracts[i];
      if (c.customerName && !map.has(c.customerName)) map.set(c.customerName, c);
    }
    return Array.from(map.values());
  }, [contracts]);

  function onPlateChange(plate: string) {
    const matched = assets.find((a) => a.plate === plate);
    if (matched) {
      setDraft({ ...draft, plate, companyCode: matched.companyCode });
    } else {
      setDraft({ ...draft, plate });
    }
  }

  function onCustomerNameChange(name: string) {
    const matched = uniqueCustomers.find((c) => c.customerName === name);
    if (matched) {
      setDraft({
        ...draft,
        customerName: name,
        customerKind: matched.customerKind,
        customerIdent: matched.customerIdent,
        customerPhone: matched.customerPhone,
      });
    } else {
      setDraft({ ...draft, customerName: name });
    }
  }

  return (
    <div className="form-grid" style={{ marginTop: 4 }}>
      <label className="block col-span-1">
        <span className="label label-required">회사코드</span>
        <select className="input w-full" value={draft.companyCode ?? ''} onChange={(e) => set('companyCode', e.target.value)}>
          <option value="">- 선택 -</option>
          {activeCompanies(companies).map((c) => <option key={c.code} value={c.code}>{c.code} {c.name}</option>)}
        </select>
      </label>
      <label className="block col-span-1">
        <span className="label label-required">차량번호</span>
        <input className="input w-full" list="contract-plate-list" value={draft.plate ?? ''}
               onChange={(e) => onPlateChange(e.target.value)} placeholder="01도1234 (자산에서 검색)" />
        <datalist id="contract-plate-list">
          {assets.map((a) => (
            <option key={a.id} value={a.plate}>{a.companyCode} · {a.vehicleName || a.vehicleClass || ''}</option>
          ))}
        </datalist>
      </label>
      <label className="block col-span-2">
        <span className="label label-required">고객명</span>
        <input className="input w-full" list="contract-customer-list" value={draft.customerName ?? ''}
               onChange={(e) => onCustomerNameChange(e.target.value)} placeholder="이전 계약자 검색 가능" />
        <datalist id="contract-customer-list">
          {uniqueCustomers.map((c) => (
            <option key={c.id} value={c.customerName}>{c.customerKind} · {c.customerPhone || c.customerIdent}</option>
          ))}
        </datalist>
      </label>
      <label className="block col-span-1">
        <span className="label label-required">신분</span>
        <select className="input w-full" value={draft.customerKind ?? '개인'} onChange={(e) => set('customerKind', e.target.value as CustomerKind)}>
          <option value="개인">개인</option>
          <option value="사업자">사업자</option>
          <option value="법인">법인</option>
        </select>
      </label>
      <label className="block col-span-2">
        <span className="label label-required">고객등록번호</span>
        <input className="input w-full" value={draft.customerIdent ?? ''} onChange={(e) => set('customerIdent', e.target.value)}
               placeholder={draft.customerKind === '사업자' ? '000-00-00000' : '000000-0000000'} />
      </label>
      <label className="block col-span-1">
        <span className="label label-required">연락처</span>
        <input className="input w-full" value={draft.customerPhone ?? ''} onChange={(e) => set('customerPhone', e.target.value)} placeholder="010-1234-5678" />
      </label>
      <label className="block col-span-1">
        <span className="label label-required">시작일</span>
        <input type="date" className="input w-full" value={draft.startDate ?? ''} onChange={(e) => set('startDate', e.target.value)} />
      </label>
      <label className="block col-span-1">
        <span className="label label-required">만기일</span>
        <input type="date" className="input w-full" value={draft.endDate ?? ''} onChange={(e) => set('endDate', e.target.value)} />
      </label>
      <label className="block col-span-1">
        <span className="label">월 대여료</span>
        <input type="number" className="input w-full" value={draft.monthlyAmount ?? 0} onChange={(e) => set('monthlyAmount', Number(e.target.value))} />
      </label>
      <label className="block col-span-1">
        <span className="label">보증금</span>
        <input type="number" className="input w-full" value={draft.deposit ?? 0} onChange={(e) => set('deposit', Number(e.target.value))} />
      </label>

      <details className="col-span-4" style={{ marginTop: 8 }}>
        <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--text-sub)', padding: '4px 0' }}>
          + 추가 정보 (운전 조건 / 인도반납 / 결제 / 특약)
        </summary>
        <div className="form-grid" style={{ marginTop: 10 }}>
          <label className="block col-span-2">
            <span className="label">운전면허번호</span>
            <input className="input w-full" value={draft.customerLicenseNo ?? ''}
                   onChange={(e) => set('customerLicenseNo', e.target.value)} placeholder="00-00-000000-00" />
          </label>
          <label className="block col-span-2">
            <span className="label">이메일</span>
            <input className="input w-full" value={draft.customerEmail ?? ''}
                   onChange={(e) => set('customerEmail', e.target.value)} placeholder="name@example.com" />
          </label>
          <label className="block col-span-1">
            <span className="label">운전자 범위</span>
            <select className="input w-full" value={draft.driverScope ?? ''}
                    onChange={(e) => set('driverScope', e.target.value)}>
              <option value="">- 선택 -</option>
              <option value="누구나운전">누구나운전</option>
              <option value="가족한정">가족한정</option>
              <option value="임직원한정">임직원한정</option>
              <option value="1인지정">1인지정</option>
            </select>
          </label>
          <label className="block col-span-1">
            <span className="label">연령 제한</span>
            <input className="input w-full" value={draft.driverAgeLimit ?? ''}
                   onChange={(e) => set('driverAgeLimit', e.target.value)} placeholder="만 26세 이상" />
          </label>
          <label className="block col-span-2">
            <span className="label">연간 주행거리 한도 (km)</span>
            <input type="number" className="input w-full" value={draft.mileageLimitKm ?? ''}
                   onChange={(e) => set('mileageLimitKm', e.target.value === '' ? undefined : Number(e.target.value))}
                   placeholder="0=무제한" />
          </label>
          <label className="block col-span-2">
            <span className="label">인도 장소</span>
            <input className="input w-full" value={draft.deliveryAddress ?? ''}
                   onChange={(e) => set('deliveryAddress', e.target.value)} />
          </label>
          <label className="block col-span-2">
            <span className="label">반납 장소</span>
            <input className="input w-full" value={draft.returnAddress ?? ''}
                   onChange={(e) => set('returnAddress', e.target.value)} />
          </label>
          <label className="block col-span-2">
            <span className="label">결제 방법</span>
            <input className="input w-full" value={draft.paymentMethod ?? ''}
                   onChange={(e) => set('paymentMethod', e.target.value)}
                   placeholder="자동이체 / 계좌이체 / 카드" />
          </label>
          <label className="block col-span-1">
            <span className="label">결제일 (1-31)</span>
            <input type="number" min="1" max="31" className="input w-full"
                   value={draft.paymentDay ?? ''}
                   onChange={(e) => set('paymentDay', e.target.value === '' ? undefined : Number(e.target.value))} />
          </label>
          <label className="block col-span-2">
            <span className="label">실거주지</span>
            <input className="input w-full" value={draft.customerAddress ?? ''}
                   onChange={(e) => set('customerAddress', e.target.value)} />
          </label>
          <label className="block col-span-1">
            <span className="label">비상연락처</span>
            <input className="input w-full" value={draft.emergencyPhone ?? ''}
                   onChange={(e) => set('emergencyPhone', e.target.value)} placeholder="010-0000-0000" />
          </label>
          <label className="block col-span-1">
            <span className="label">비상연락처 관계</span>
            <input className="input w-full" value={draft.emergencyRelation ?? ''}
                   onChange={(e) => set('emergencyRelation', e.target.value)} placeholder="부/모/배우자/자녀" />
          </label>
          <label className="block col-span-1">
            <span className="label">정비상품</span>
            <input className="input w-full" value={draft.maintenanceProduct ?? ''}
                   onChange={(e) => set('maintenanceProduct', e.target.value)} placeholder="정비제외 / 엔진오일 연1회" />
          </label>
          <label className="block col-span-1">
            <span className="label">엔진오일 서비스</span>
            <select className="input w-full"
                    value={draft.engineOilService === true ? 'true' : draft.engineOilService === false ? 'false' : ''}
                    onChange={(e) => set('engineOilService', e.target.value === 'true' ? true : e.target.value === 'false' ? false : undefined)}>
              <option value="">- 미선택 -</option>
              <option value="true">가입</option>
              <option value="false">미가입</option>
            </select>
          </label>
          <label className="block col-span-1">
            <span className="label">검사대행</span>
            <select className="input w-full"
                    value={draft.inspectionService === true ? 'true' : draft.inspectionService === false ? 'false' : ''}
                    onChange={(e) => set('inspectionService', e.target.value === 'true' ? true : e.target.value === 'false' ? false : undefined)}>
              <option value="">- 미선택 -</option>
              <option value="true">가입</option>
              <option value="false">미가입</option>
            </select>
          </label>
          <label className="block col-span-1">
            <span className="label">보험사</span>
            <input className="input w-full" value={draft.insurer ?? ''}
                   onChange={(e) => set('insurer', e.target.value)} placeholder="DB손해보험" />
          </label>
          <label className="block col-span-4">
            <span className="label">특약사항</span>
            <textarea className="input w-full" rows={3}
                      value={draft.specialTerms ?? ''}
                      onChange={(e) => set('specialTerms', e.target.value)}
                      placeholder="여러 줄 입력 가능 — 손님 페이지에 그대로 표시됨" />
          </label>

          <div className="block col-span-4">
            <DriversEditor drivers={draft.additionalDrivers ?? []} onChange={(d) => set('additionalDrivers', d)} />
          </div>

          <div className="block col-span-4">
            <ContractFileInput
              fileName={draft.fileName}
              hasFile={!!draft.fileDataUrl}
              onFile={async (file) => {
                if (!file) {
                  setDraft({ ...draft, fileDataUrl: undefined, fileName: undefined });
                  return;
                }
                if (file.size > 8 * 1024 * 1024) {
                  alert('계약서 파일은 8MB 이하만 가능 — 압축 후 다시 업로드해주세요');
                  return;
                }
                const dataUrl = await fileToDataUrl(file);
                setDraft({ ...draft, fileDataUrl: dataUrl, fileName: file.name });
              }}
            />
          </div>
        </div>
      </details>
    </div>
  );
}

function ContractFileInput({
  fileName, hasFile, onFile,
}: {
  fileName?: string;
  hasFile: boolean;
  onFile: (file: File | null) => void;
}) {
  return (
    <div>
      <div className="label">계약서 파일 (PDF/이미지)</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <label className="btn btn-sm" style={{ cursor: 'pointer' }}>
          <FilePdf size={13} weight="bold" /> {hasFile ? '파일 교체' : '파일 선택'}
          <input
            type="file"
            accept=".pdf,image/*"
            style={{ display: 'none' }}
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          />
        </label>
        {hasFile && (
          <>
            <span className="text-sub text-xs">{fileName ?? '(이름 없음)'}</span>
            <button type="button" className="btn-ghost btn btn-sm" onClick={() => onFile(null)}>
              <X size={11} /> 제거
            </button>
          </>
        )}
        {!hasFile && <span className="text-weak text-xs">최대 8MB. 손님 페이지에서 다운로드 가능.</span>}
      </div>
    </div>
  );
}

/* ─── 추가 운전자 편집기 ─── */
function DriversEditor({
  drivers, onChange,
}: {
  drivers: AdditionalDriver[];
  onChange: (drivers: AdditionalDriver[]) => void;
}) {
  function update(i: number, patch: Partial<AdditionalDriver>) {
    onChange(drivers.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  }
  function add() {
    onChange([...drivers, { name: '' }]);
  }
  function remove(i: number) {
    onChange(drivers.filter((_, idx) => idx !== i));
  }

  return (
    <div>
      <div className="label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>추가 운전자 ({drivers.length}명)</span>
        <button type="button" className="btn btn-sm" onClick={add}>
          <Plus size={11} weight="bold" /> 추가
        </button>
      </div>
      {drivers.length === 0 ? (
        <div className="text-weak text-xs" style={{ padding: '6px 0' }}>
          추가 운전자가 없으면 본 임차인만 운전 가능. 가족·직원 등록 시 [+추가].
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {drivers.map((d, i) => (
            <div key={i} style={{
              display: 'grid',
              gridTemplateColumns: '1.2fr 0.8fr 1.2fr 1.2fr 1fr auto',
              gap: 6, alignItems: 'center',
            }}>
              <input className="input" placeholder="이름" value={d.name}
                     onChange={(e) => update(i, { name: e.target.value })} />
              <input className="input" placeholder="관계 (배우자/자녀)" value={d.relation ?? ''}
                     onChange={(e) => update(i, { relation: e.target.value || undefined })} />
              <input className="input" placeholder="연락처" value={d.phone ?? ''}
                     onChange={(e) => update(i, { phone: e.target.value || undefined })} />
              <input className="input" placeholder="면허번호" value={d.licenseNo ?? ''}
                     onChange={(e) => update(i, { licenseNo: e.target.value || undefined })} />
              <input className="input" type="date" value={d.birthDate ?? ''}
                     onChange={(e) => update(i, { birthDate: e.target.value || undefined })} />
              <button type="button" className="btn-ghost btn btn-sm" onClick={() => remove(i)} title="삭제">
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────── 엑셀 일괄 등록 탭 ───────────────────
   양식 다운로드 → 사용자 작성 후 업로드 → 자동 헤더 검출 → 미리보기 표.
   계좌내역과 동일 UX — 컬럼 & 체크박스 미리 준비된 표가 항상 보이고,
   업로드 시 행이 채워짐. 체크박스로 등록할 행 선별 후 한 번에 [등록].
*/
function ContractExcelTab({
  defaultCompanyCode, onSubmit,
}: {
  defaultCompanyCode: string;
  onSubmit: (rows: { data: Partial<Contract>; errors: string[] }[]) => void;
}) {
  const [result, setResult] = useState<ContractImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setErr] = useState('');
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const fileRef = useRef<HTMLInputElement | null>(null);

  async function loadFile(file: File) {
    setErr(''); setBusy(true);
    try {
      const r = await parseContractExcel(file, { defaultCompanyCode });
      setResult(r);
      // 오류 없는 행은 기본 체크
      const init = new Set<number>();
      r.rows.forEach((row, i) => { if (row.errors.length === 0) init.add(i); });
      setChecked(init);
      if (!r.detected) setErr('헤더(차량번호·임차인·시작일 등)를 찾지 못했습니다. 양식을 그대로 사용하세요.');
      else if (!r.rows.length) setErr(`인식된 계약이 없습니다. (전체 ${r.total} / 건너뜀 ${r.skipped})`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function downloadTemplate() {
    setDownloading(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const sample: Record<string, string | number> = {
        '회사코드 *': 'CP01',
        '차량번호 *': '12가1234',
        '임차인 *': '홍길동',
        '신분 *': '개인',
        '고객등록번호 *': '900101-1234567',
        '연락처 *': '010-1234-5678',
        '시작일 *': today,
        '만기일 *': '2027-12-31',
        '월대여료 *': 1100000,
        '보증금 *': 0,
        '계약번호': '(비우면 자동발급)',
        '결제방법': '자동이체',
        '결제일': 25,
        '미수금액': 300000,
        '운전자범위': '본인한정',
        '연령제한': '만 26세 이상',
        '주행한도': 30000,
        '비고': '예시 행 — 작성 후 삭제',
      };
      const { downloadTemplate: write } = await import('@/lib/excel-template');
      await write({
        sheetName: '계약',
        title: '계약 일괄 등록 양식',
        description:
          '* 표시 컬럼은 필수. 미수금액 입력 시 시스템이 최근 회차부터 거꾸로 차감해 자동 분배 ' +
          '(예: 월 50만, 미수 30만 → 마지막 도래 회차 부분납입 / 그 이전 완료).',
        headers: CONTRACT_EXCEL_HEADERS,
        requiredCount: CONTRACT_EXCEL_REQUIRED.length,
        sample,
        numberCols: ['월대여료', '보증금', '선수금', '미수금액', '주행한도'],
        fileName: `계약_양식_${today.replace(/-/g, '')}.xlsx`,
      });
    } catch (e) {
      alert(`양식 다운로드 실패: ${(e as Error).message}`);
    } finally {
      setDownloading(false);
    }
  }

  const allChecked = result && result.rows.length > 0 && checked.size === result.rows.length;
  const someChecked = checked.size > 0 && !allChecked;
  function toggleAll() {
    if (!result) return;
    if (allChecked) setChecked(new Set());
    else setChecked(new Set(result.rows.map((_, i) => i)));
  }
  function toggleRow(i: number) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  }
  function commit() {
    if (!result) return;
    const selectedRows = [...checked].map((i) => result.rows[i]).filter(Boolean);
    if (selectedRows.length === 0) {
      alert('등록할 행을 체크박스로 선택하세요.');
      return;
    }
    const bad = selectedRows.filter((r) => r.errors.length > 0);
    if (bad.length > 0) {
      if (!confirm(`오류 ${bad.length}건 포함됨 — 그래도 등록할까요?\n(오류 행은 등록 후 수정 필요)`)) return;
    }
    onSubmit(selectedRows);
  }

  const okCount = result?.rows.filter((r) => r.errors.length === 0).length ?? 0;
  const errCount = result?.rows.filter((r) => r.errors.length > 0).length ?? 0;

  return (
    <div className="space-y-3" style={{ paddingTop: 8 }}>
      <div className="text-xs" style={{ background: 'var(--bg-card)', padding: 8, borderRadius: 4 }}>
        <strong>엑셀 일괄 등록</strong>
        <br />· ① <strong>양식 다운로드</strong> → 엑셀에서 행마다 계약 작성. 헤더 <strong>「*」 표시는 필수입력</strong>, 나머지는 부가입력 (빈칸 허용)
        <br />· ② <strong>파일 드롭/선택</strong> → 헤더 자동검출 + 필수항목 검증
        <br />· ③ 미리보기에서 <strong>체크박스로 등록할 행 선별</strong> → [등록]
      </div>

      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-sm" onClick={downloadTemplate} disabled={downloading}>
          <DownloadSimple size={12} weight="bold" /> {downloading ? '생성 중…' : '① 양식 다운로드'}
        </button>
        <span className="text-weak text-xs">
          필수 <strong>{CONTRACT_EXCEL_REQUIRED.length}</strong> · 부가 <strong>{CONTRACT_EXCEL_OPTIONAL.length}</strong> (총 {CONTRACT_EXCEL_HEADERS.length} 컬럼)
        </span>
      </div>

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) void loadFile(f); }}
        onClick={() => fileRef.current?.click()}
        style={{
          border: '2px dashed var(--border)', borderRadius: 6, padding: 24, textAlign: 'center',
          cursor: 'pointer', background: 'var(--bg-card)',
        }}
      >
        <UploadSimple size={24} weight="bold" />
        <div style={{ marginTop: 6 }}>{busy ? '읽는 중...' : '② 엑셀 파일을 드롭하거나 클릭하여 선택'}</div>
        <div className="text-weak text-xs" style={{ marginTop: 4 }}>.xlsx / .xls / .csv</div>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void loadFile(f); }} />
      </div>

      {error && (
        <div style={{ color: 'var(--alert-red-text)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Warning size={14} weight="fill" /> {error}
        </div>
      )}

      {/* 미리보기 표 — 업로드 전엔 헤더 + 체크박스만 (계좌내역과 동일 패턴) */}
      <div style={{ maxHeight: 320, overflow: 'auto', border: '1px solid var(--border)' }}>
        <table className="table">
          <thead>
            <tr>
              <th className="center" style={{ width: 36 }}>
                <input
                  type="checkbox"
                  checked={!!allChecked}
                  ref={(el) => { if (el) el.indeterminate = !!someChecked; }}
                  onChange={toggleAll}
                  disabled={!result || result.rows.length === 0}
                />
              </th>
              <th style={{ width: 60 }}>상태</th>
              <th style={{ width: 70 }}>회사</th>
              <th style={{ width: 100 }}>차량</th>
              <th style={{ width: 100 }}>임차인</th>
              <th style={{ width: 60 }}>신분</th>
              <th style={{ width: 110 }}>등록번호</th>
              <th style={{ width: 110 }}>연락처</th>
              <th style={{ width: 95 }}>시작일</th>
              <th style={{ width: 95 }}>만기일</th>
              <th style={{ width: 90, textAlign: 'right' }}>월대여료</th>
              <th>오류</th>
            </tr>
          </thead>
          <tbody>
            {!result || result.rows.length === 0 ? (
              <tr><td colSpan={12} className="jpk-table-empty">엑셀 업로드 시 행이 채워집니다.</td></tr>
            ) : result.rows.slice(0, 100).map((r, i) => (
              <tr key={i} className={checked.has(i) ? 'is-checked' : undefined}>
                <td className="center" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={checked.has(i)} onChange={() => toggleRow(i)} />
                </td>
                <td>
                  {r.errors.length > 0
                    ? <StatusBadge tone="red" icon={<Warning size={11} weight="fill" />}>오류</StatusBadge>
                    : <StatusBadge tone="green" icon={<CheckCircle size={11} weight="fill" />}>신규</StatusBadge>}
                </td>
                <td className="mono">{r.data.companyCode || <span className="dim">-</span>}</td>
                <td className="mono">{r.data.plate || '-'}</td>
                <td>{r.data.customerName || '-'}</td>
                <td className="dim">{r.data.customerKind || '-'}</td>
                <td className="mono text-xs">{r.data.customerIdent || '-'}</td>
                <td className="mono text-xs">{r.data.customerPhone || '-'}</td>
                <td className="date">{r.data.startDate || '-'}</td>
                <td className="date">{r.data.endDate || '-'}</td>
                <td className="num">{r.data.monthlyAmount ? r.data.monthlyAmount.toLocaleString('ko-KR') : '-'}</td>
                <td style={{ color: 'var(--alert-red-text)', fontSize: 11 }}>{r.errors.join(', ') || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {result && result.rows.length > 0 && (
        <div className="text-xs" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 6, background: 'var(--success-green-bg, #e7f5ea)', borderRadius: 4 }}>
          <CheckCircle size={14} weight="fill" style={{ color: 'var(--success-green, #2a9d3a)' }} />
          <span>
            전체 <strong>{result.rows.length}</strong> · 선택 <strong>{checked.size}</strong>
            · 정상 <strong>{okCount}</strong>
            {errCount > 0 && <> · 오류 <span className="text-red">{errCount}</span></>}
            {result.skipped > 0 && <span className="dim"> · 건너뜀 {result.skipped}</span>}
          </span>
        </div>
      )}

      <DialogFooter>
        <DialogClose asChild><button className="btn">취소</button></DialogClose>
        <button
          type="button"
          className="btn btn-primary"
          onClick={commit}
          disabled={!result || checked.size === 0}
        >
          <FileArrowDown size={14} weight="bold" /> 선택 {checked.size}건 등록
        </button>
      </DialogFooter>
    </div>
  );
}
