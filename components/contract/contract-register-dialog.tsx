'use client';

import { useState, useMemo } from 'react';
import { Upload, Pencil, FileXls, Plus, X, CheckCircle, CircleNotch, Warning } from '@phosphor-icons/react';
import { Dialog, DialogTrigger, DialogContent, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { OcrUploadStage } from '@/components/ui/ocr-upload-stage';
import { StatusBadge } from '@/components/ui/status-badge';
import { useOcrBatch, type OcrBatchItem } from '@/lib/use-ocr-batch';
import { useCompanyStore } from '@/lib/use-company-store';
import { useAssetStore } from '@/lib/use-asset-store';
import { useContractStore } from '@/lib/use-contract-store';
import type { Asset } from '@/lib/sample-assets';
import type { Contract, CustomerKind } from '@/lib/sample-contracts';

/**
 * 계약 등록 통합 다이얼로그 — 3 모드:
 *   1) 계약서 OCR (다건)  — PDF 여러 장 → 자동 추출 → 검토 후 등록
 *   2) 시트 (다건)        — 구글시트 복사붙여넣기 (TSV) → 검증 → 등록
 *   3) 개별 입력          — 단건 폼
 *
 * 필수 필드 (스키마 v1):
 *   회사코드 · 차량번호 · 고객명 · 신분 · 고객등록번호 · 연락처 · 시작일 · 만기일 · 월대여료 · 보증금
 */

type ContractDraft = Omit<Contract, 'id' | 'contractNo' | 'status' | 'events'>;

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
   plate 가 등록 자산과 매칭되면 그 자산의 companyCode 자동 채움. */
function mapContractOcr(
  raw: Record<string, unknown>,
  assets: readonly Asset[],
): Partial<ContractDraft> {
  const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  const kindRaw = str(raw.contractor_kind);
  const customerKind: CustomerKind =
    kindRaw === '법인' ? '법인'
    : kindRaw === '사업자' ? '사업자'
    : '개인';
  const plate = str(raw.car_number);
  const matchedAsset = plate ? assets.find((a) => a.plate === plate) : undefined;
  return {
    companyCode: matchedAsset?.companyCode ?? '',       // 자산 매칭 시 자동 / 아니면 사용자 선택
    plate,
    customerName: str(raw.contractor_name),
    customerKind,
    customerIdent: str(raw.contractor_ident),
    customerPhone: str(raw.contractor_phone),
    startDate: str(raw.start_date),
    endDate: str(raw.end_date),
    monthlyAmount: num(raw.monthly_amount),
    deposit: num(raw.deposit_total),
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

  const [tab, setTab] = useState<'ocr' | 'sheet' | 'manual'>('ocr');

  /* OCR 다건 */
  const ocr = useOcrBatch<ContractWorkItem>({
    docType: 'rental_contract',
    createPlaceholder: (file, id) => ({
      id, fileName: file.name, _status: 'pending',
      data: { ...EMPTY_DRAFT },
    }),
    applyResult: (prev, raw) => ({ ...prev, data: { ...prev.data, ...mapContractOcr(raw, assets) } }),
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
    setTab('ocr');
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
            <TabsTrigger value="ocr">
              <Upload size={14} className="mr-1.5 inline" /> 계약서 OCR (다건)
            </TabsTrigger>
            <TabsTrigger value="sheet">
              <FileXls size={14} className="mr-1.5 inline" /> 시트 (다건)
            </TabsTrigger>
            <TabsTrigger value="manual">
              <Pencil size={14} className="mr-1.5 inline" /> 개별 입력
            </TabsTrigger>
          </TabsList>

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
                                  {companies.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
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
                style={{ width: '100%', fontFamily: 'monospace', fontSize: 12 }}
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
          {companies.map((c) => <option key={c.code} value={c.code}>{c.code} {c.name}</option>)}
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
    </div>
  );
}
