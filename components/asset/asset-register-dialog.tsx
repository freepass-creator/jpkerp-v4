'use client';

import { useRef, useState } from 'react';
import { Upload, UploadSimple, DownloadSimple, FileXls, Pencil, Plus, X, CheckCircle, CircleNotch, Warning, ArrowCounterClockwise } from '@phosphor-icons/react';
import { Dialog, DialogTrigger, DialogContent, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { OcrUploadStage } from '@/components/ui/ocr-upload-stage';
import { nextCompanyScopedCode } from '@/lib/code-gen';
import { StatusBadge } from '@/components/ui/status-badge';
import { RegistrationForm } from './registration-form';
import type { Asset } from '@/lib/sample-assets';
import { findCompanyByOwner, activeCompanies, type Company } from '@/lib/sample-companies';
import { useCompanyStore } from '@/lib/use-company-store';
import { useAssetStore } from '@/lib/use-asset-store';
import { useOcrBatch, type OcrBatchItem } from '@/lib/use-ocr-batch';
import { assetKeyFn, describeAssetDuplicate } from '@/lib/asset-dedup';
import { matchAgainstIndex, buildKeyIndex } from '@/lib/dedup';
import { fileToImageDataUrl, pdfFirstPageToJpegFile } from '@/lib/pdf-to-image';
import { normalizeKoreanDate } from '@/lib/parsers/date';
import { parseAssetExcel, ASSET_EXCEL_HEADERS, type AssetImportResult } from '@/lib/asset-import';
import { todayStr } from '@/lib/date-utils';

type DuplicateReason = 'plate' | 'vin' | null;
type AssetWorkItem = OcrBatchItem & {
  data: Partial<Asset>;
  _duplicate: DuplicateReason;
};

/** 자동차등록증(VEHICLE_REG_SCHEMA) → Asset 매핑. 등록증에 실제로 적힌 항목만. */
function mapVehicleRegToAsset(
  ex: Record<string, unknown>,
  companies: readonly Company[],
): Partial<Asset> {
  const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  const ownerName = str(ex.owner_name);
  const ownerRegNumber = str(ex.owner_biz_no);
  const matched = findCompanyByOwner(ownerName, ownerRegNumber, companies);
  return {
    companyCode: matched?.code ?? '',
    documentNo: str(ex.document_no),
    firstRegistDate: normalizeKoreanDate(str(ex.first_registration_date)),
    certIssueDate: normalizeKoreanDate(str(ex.cert_issue_date)) || undefined,
    plate: str(ex.car_number) ?? '',
    vehicleClass: str(ex.category_hint) ?? '',
    usage: str(ex.usage_type) ?? '',
    vehicleName: str(ex.car_name) ?? '',
    modelType: str(ex.type_number),
    manufactureDate: str(ex.car_year_month),
    vin: str(ex.vin) ?? '',
    engineType: str(ex.engine_type),
    ownerLocation: str(ex.address),
    ownerName: ownerName ?? '',
    ownerRegNumber,
    approvalNumber: str(ex.approval_number),
    length: num(ex.length_mm),
    width: num(ex.width_mm),
    height: num(ex.height_mm),
    totalWeight: num(ex.gross_weight_kg),
    capacity: num(ex.seats),
    maxLoad: num(ex.max_load_kg),
    displacement: num(ex.displacement),
    ratedOutput: str(ex.rated_output),
    cylinders: str(ex.cylinders),
    fuelType: str(ex.fuel_type),
    fuelEfficiency: num(ex.fuel_efficiency),
    inspectionFrom: normalizeKoreanDate(str(ex.inspection_from)) || undefined,
    inspectionTo: normalizeKoreanDate(str(ex.inspection_to)) || undefined,
    mileage: num(ex.mileage),
    inspectionType: str(ex.inspection_type),
    acquisitionPrice: num(ex.acquisition_price),
    status: '대기',
  };
}

type Props = {
  onCreate: (asset: Partial<Asset>) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  showTrigger?: boolean;
};

export function AssetRegisterDialog({ onCreate, open: openProp, onOpenChange, showTrigger = true }: Props) {
  const [companies] = useCompanyStore();
  const [assets] = useAssetStore();
  const [openInner, setOpenInner] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : openInner;
  const setOpen = (v: boolean) => {
    if (!isControlled) setOpenInner(v);
    onOpenChange?.(v);
  };

  // 기본 회사 — 모든 탭 공통. 새 OCR row / manual form / sheet 의 default 채움.
  // 회사 1개만 등록돼있으면 자동 선택.
  const activeCompanyList = companies.filter((c) => !c.deletedAt);
  const [defaultCompanyCode, setDefaultCompanyCode] = useState(
    activeCompanyList.length === 1 ? activeCompanyList[0].code : '',
  );

  const ocr = useOcrBatch<AssetWorkItem>({
    docType: 'vehicle_reg',
    // PDF 는 client-side 에서 첫 페이지 JPEG (2.5x 스케일) 로 변환 후 전송.
    // Gemini Vision 이 multi-page PDF 에서 page 1 을 놓치는 non-deterministic
    // 실패 (Tesla Model 3 등록증 등) 를 회피.
    preconvertPdfToImage: pdfFirstPageToJpegFile,
    createPlaceholder: async (file, id) => {
      // 등록증 원본을 이미지 dataUrl 로 변환해서 자산에 보관 (PDF 첫 페이지 또는 그대로)
      const fileDataUrl = await fileToImageDataUrl(file).catch(() => '');
      return {
        id, fileName: file.name, _status: 'pending',
        data: {
          companyCode: defaultCompanyCode, status: '대기' as const,
          fileDataUrl, fileName: file.name,
        },
        _duplicate: null,
      };
    },
    applyResult: (prev, raw, allItems) => {
      const mapped = mapVehicleRegToAsset(raw, companies);
      // OCR 매핑 결과 + placeholder 의 fileDataUrl 보존
      const data = { ...prev.data, ...mapped };
      // 기존 자산 + 동일 배치의 다른 done 항목 모두 인덱스에 넣고 매칭
      const index = buildKeyIndex<Partial<Asset>>([
        ...assets,
        ...allItems.filter((i) => i.id !== prev.id && i._status === 'done').map((i) => i.data),
      ], assetKeyFn);
      const dup = matchAgainstIndex(data, index, assetKeyFn);
      const _duplicate: DuplicateReason = dup ? describeAssetDuplicate(dup.matchedKey) : null;
      return { ...prev, data, _duplicate };
    },
  });

  // 분석완료 + 중복 아닌 행 (UI 표시용)
  const doneItems = ocr.items.filter((i) => i._status === 'done' && !i._duplicate);
  // 등록 가능 = 정상 차량번호(\d{2,3}[가-힣]\d{4}) + 회사코드 둘 다 있어야 함
  const PLATE_RE = /^\d{2,3}[가-힣]\d{4}$/;
  const registerableItems = doneItems.filter((i) =>
    i.data.plate && PLATE_RE.test(i.data.plate) && i.data.companyCode,
  );
  const matchedCount = registerableItems.length;
  const duplicateCount = ocr.items.filter((i) => i._duplicate).length;
  const noPlateCount = doneItems.filter((i) => !i.data.plate).length;
  const noCompanyCount = doneItems.filter((i) => i.data.plate && !i.data.companyCode).length;

  function commitAll() {
    if (registerableItems.length === 0) {
      alert('등록 가능한 항목이 없습니다. 차량번호·회사 누락 항목은 행에서 직접 입력 후 등록하세요.');
      return;
    }
    // 배치 등록 — 각 항목에 assetCode 미리 발급해서 forEach 중 중복 방지.
    // (forEach 안에서 onCreate→setAssets 가 React state 갱신 전이라
    //  store 의 allAssets 가 아직 안 바뀐 상태로 다음 iteration 이 같은 코드 발급 받음)
    const baseExisting = assets.map((a) => a.assetCode).filter((c): c is string => !!c);
    const issuedThisBatch: string[] = [];
    registerableItems.forEach((i) => {
      const companyCode = i.data.companyCode;
      if (!companyCode) return;
      const allCodes = [...baseExisting, ...issuedThisBatch];
      const assetCode = nextCompanyScopedCode('VH', companyCode, allCodes, { pad: 4 });
      issuedThisBatch.push(assetCode);
      onCreate({ ...i.data, assetCode });
    });
    setOpen(false);
    setTimeout(ocr.reset, 100);
  }

  /** 행별 plate / companyCode 인라인 수정 */
  function updateRowField(id: string, patch: Partial<AssetWorkItem['data']>) {
    ocr.setItems((prev) => prev.map((it) => it.id === id ? { ...it, data: { ...it.data, ...patch } } : it));
  }

  function handleClose(o: boolean) {
    setOpen(o);
    if (!o) ocr.reset();
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      {showTrigger && (
        <DialogTrigger asChild>
          <button className="btn btn-primary">
            <Plus size={14} weight="bold" /> 자산등록
          </button>
        </DialogTrigger>
      )}

      <DialogContent title="자산 등록 (자동차등록증 기준)" size="xl">
        <Tabs defaultValue="excel">
          <TabsList>
            <TabsTrigger value="excel">
              <FileXls size={14} className="mr-1.5 inline" /> 엑셀
            </TabsTrigger>
            <TabsTrigger value="sheet">
              <UploadSimple size={14} className="mr-1.5 inline" /> 시트
            </TabsTrigger>
            <TabsTrigger value="manual">
              <Pencil size={14} className="mr-1.5 inline" /> 단건
            </TabsTrigger>
            <TabsTrigger value="ocr">
              <Upload size={14} className="mr-1.5 inline" /> OCR
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

          <TabsContent value="excel">
            <AssetExcelTab
              defaultCompanyCode={defaultCompanyCode}
              onSubmit={(rows) => {
                // 일괄 등록 — 회사별 자산코드 생성
                const newCodes = new Set<string>();
                for (const r of rows) {
                  if (r.errors.length > 0 || !r.data.companyCode || !r.data.plate) continue;
                  const allCodes = [...assets.map((a) => a.assetCode ?? ''), ...newCodes];
                  const code = nextCompanyScopedCode('VH', r.data.companyCode, allCodes, { pad: 4 });
                  newCodes.add(code);
                  onCreate({
                    ...r.data,
                    assetCode: code,
                    id: code,
                  } as Asset);
                }
                setOpen(false);
              }}
            />
          </TabsContent>

          <TabsContent value="ocr">
            <div className="space-y-3">
              <OcrUploadStage
                progress={ocr.progress}
                busy={ocr.busy}
                onFiles={ocr.handleFiles}
                idleTitle="자동차등록증 업로드 — 클릭 또는 드래그&드롭"
                idleSubtitle="JPG / PNG / PDF — 업로드 즉시 OCR 시작. 법인번호로 회사 자동 매칭, 차량번호·차대번호 중복 검사."
                progressSubtitle="Gemini가 자동차등록증을 읽고 있습니다"
              />

              {ocr.items.length > 0 && (
                <div className="border" style={{ borderColor: 'var(--border)', overflowX: 'auto', maxHeight: 360 }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th className="center" style={{ width: 70 }}>상태</th>
                        <th>회사</th>
                        <th>차량번호</th>
                        <th>차종</th>
                        <th>차명</th>
                        <th>차대번호</th>
                        <th>성명(명칭)</th>
                        <th className="date">최초등록일</th>
                        <th className="num">출고가격</th>
                        <th className="center" style={{ width: 50 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {ocr.items.map((p) => {
                        const d = p.data;
                        return (
                          <tr key={p.id}>
                            <td className="center"><AssetItemStatus item={p} /></td>
                            {/* 회사 — OCR 매칭 실패 시 인라인 select. 매칭됐으면 텍스트 */}
                            <td className="plate">
                              {p._status === 'pending' ? <span className="text-weak">…</span>
                                : d.companyCode ? d.companyCode
                                : (
                                  <select
                                    className="input"
                                    style={{ width: 90, padding: '0 4px', height: 22, fontSize: 11 }}
                                    value=""
                                    onChange={(e) => updateRowField(p.id, { companyCode: e.target.value })}
                                  >
                                    <option value="">회사 선택</option>
                                    {activeCompanies(companies).map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
                                  </select>
                                )}
                            </td>
                            {/* 차량번호 — OCR 추출 실패하거나 형식 안 맞으면 인라인 input */}
                            <td className="plate text-medium">
                              {p._status === 'pending' ? <span className="text-weak">…</span>
                                : d.plate && PLATE_RE.test(d.plate) ? d.plate
                                : (
                                  <input
                                    type="text"
                                    className="input"
                                    style={{ width: 100, padding: '0 4px', height: 22, fontSize: 11 }}
                                    placeholder="01도1234"
                                    value={d.plate ?? ''}
                                    onChange={(e) => updateRowField(p.id, { plate: e.target.value.trim() })}
                                  />
                                )}
                            </td>
                            <td className="dim">{d.vehicleClass || '-'}</td>
                            <td>{d.vehicleName || '-'}</td>
                            <td className="mono dim truncate" style={{ maxWidth: 160 }} title={d.vin}>{d.vin || '-'}</td>
                            <td className="dim">{d.ownerName || '-'}</td>
                            <td className="date">{d.firstRegistDate || '-'}</td>
                            <td className="num">{d.acquisitionPrice ? d.acquisitionPrice.toLocaleString('ko-KR') : '-'}</td>
                            <td className="center">
                              <button className="btn-ghost btn btn-sm" onClick={() => ocr.removeItem(p.id)} title="제거">
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
                  총 {ocr.items.length}건 · 등록 가능 <strong>{registerableItems.length}</strong> · 회사 매칭 <strong>{matchedCount}</strong>
                  {duplicateCount > 0 && <> · <span className="text-red">중복 {duplicateCount}건 제외</span></>}
                  {noPlateCount > 0 && <> · <span className="text-red">차량번호 누락 {noPlateCount}건 (행에서 직접 입력)</span></>}
                  {noCompanyCount > 0 && <> · <span className="text-amber">회사 미매칭 {noCompanyCount}건 (행에서 선택)</span></>}
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
              <DialogClose asChild>
                <button className="btn">취소</button>
              </DialogClose>
              <button className="btn btn-primary" disabled={registerableItems.length === 0 || ocr.busy} onClick={commitAll}>
                {registerableItems.length > 0 ? `${registerableItems.length}건 등록` : '등록 (차량번호·회사 입력 필요)'}
              </button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="manual">
            <RegistrationForm
              data={{}}
              mode="create"
              onSubmit={(d) => { onCreate(d); setOpen(false); ocr.reset(); }}
            />
          </TabsContent>

          <TabsContent value="sheet">
            <div className="text-sub text-center py-8">
              구글시트 / 엑셀 붙여넣기 영역 (나중 구현)
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

/** 자산 OCR 행 상태 — 분석중 / 오류 / 중복 / 차량번호없음 / 미매칭 / 신규. */
function AssetItemStatus({ item }: { item: AssetWorkItem }) {
  if (item._status === 'pending') {
    return <StatusBadge tone="neutral" icon={<CircleNotch size={11} className="spin" />}>분석중</StatusBadge>;
  }
  if (item._status === 'failed') {
    return <StatusBadge tone="red" icon={<Warning size={11} weight="fill" />} title={item._error}>오류</StatusBadge>;
  }
  if (item._duplicate) {
    return (
      <StatusBadge tone="red" icon={<Warning size={11} weight="fill" />}
                   title={item._duplicate === 'vin' ? '차대번호 중복 — 이미 등록된 차량' : '차량번호 중복 — 이미 등록된 차량'}>
        중복
      </StatusBadge>
    );
  }
  if (!item.data.plate) {
    return <StatusBadge tone="red" icon={<Warning size={11} weight="fill" />} title="OCR이 차량번호를 못 읽음 — 등록 후 [수정]에서 직접 입력">차량번호 없음</StatusBadge>;
  }
  if (!item.data.companyCode) {
    return <StatusBadge tone="orange" icon={<Warning size={11} weight="fill" />} title="등록된 회사와 매칭 실패">미매칭</StatusBadge>;
  }
  return <StatusBadge tone="green" icon={<CheckCircle size={11} weight="fill" />}>신규</StatusBadge>;
}

/* ─── 엑셀 일괄 등록 탭 ─── */
function AssetExcelTab({
  defaultCompanyCode, onSubmit,
}: {
  defaultCompanyCode: string;
  onSubmit: (rows: { data: Partial<Asset>; errors: string[] }[]) => void;
}) {
  const [result, setResult] = useState<AssetImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);

  async function loadFile(file: File) {
    setError(''); setBusy(true);
    try {
      const r = await parseAssetExcel(file, { defaultCompanyCode });
      setResult(r);
      if (!r.detected) setError('헤더(차량번호·차대번호·차명 등)를 찾지 못했습니다.');
      else if (!r.rows.length) setError(`인식된 자산이 없습니다. (전체 ${r.total} / 건너뜀 ${r.skipped})`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function downloadTemplate() {
    setDownloading(true);
    try {
      const XLSX = await import('xlsx');
      const aoa: (string | number)[][] = [
        [...ASSET_EXCEL_HEADERS],
        ['CP01', '12가1234', 'KMHE0000000000000', '쏘렌토 MQ4', '승용자동차', '자가용', '회사명 또는 소유자', '2024-01-15', '기아', '쏘렌토', '검정', '하이브리드'],
      ];
      const sheet = XLSX.utils.aoa_to_sheet(aoa);
      sheet['!cols'] = ASSET_EXCEL_HEADERS.map((h) => ({ wch: h.length > 6 ? 16 : 12 }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, sheet, '자산');
      XLSX.writeFile(wb, `자산_양식_${todayStr()}.xlsx`);
    } catch (e) {
      alert(`양식 다운로드 실패: ${(e as Error).message}`);
    } finally {
      setDownloading(false);
    }
  }

  const okCount = result?.rows.filter((r) => r.errors.length === 0).length ?? 0;
  const errCount = result?.rows.filter((r) => r.errors.length > 0).length ?? 0;

  return (
    <div className="space-y-3" style={{ paddingTop: 8 }}>
      <div className="text-xs" style={{ background: 'var(--bg-card)', padding: 8, borderRadius: 4 }}>
        <strong>엑셀 일괄 등록</strong>
        <br />· ① <strong>양식 다운로드</strong> → 엑셀에서 행마다 자산 작성 (자동차등록증 항목)
        <br />· ② <strong>파일 드롭/선택</strong> → 헤더 자동검출 + 차량번호 형식 검증
        <br />· ③ 미리보기 후 [등록] — 회사별 자산코드 자동 부여
      </div>

      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn btn-sm" onClick={downloadTemplate} disabled={downloading}>
          <DownloadSimple size={12} weight="bold" /> {downloading ? '생성 중…' : '① 양식 다운로드'}
        </button>
        <span className="text-weak text-xs">컬럼: {ASSET_EXCEL_HEADERS.join(' · ')}</span>
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
        <div style={{ marginTop: 6 }}>{busy ? '읽는 중...' : '엑셀 파일을 드롭하거나 클릭하여 선택'}</div>
        <div className="text-weak text-xs" style={{ marginTop: 4 }}>.xlsx / .xls / .csv</div>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void loadFile(f); }} />
      </div>

      {error && (
        <div style={{ color: 'var(--alert-red-text)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Warning size={14} weight="fill" /> {error}
        </div>
      )}

      {result && result.rows.length > 0 && (
        <>
          <div className="text-xs" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 6, background: 'var(--success-green-bg, #e7f5ea)', borderRadius: 4 }}>
            <CheckCircle size={14} weight="fill" style={{ color: 'var(--success-green, #2a9d3a)' }} />
            <span>
              <strong>{result.rows.length}건</strong> · 등록 가능 <strong>{okCount}</strong>
              {errCount > 0 && <> · 오류 <span className="text-red">{errCount}건 제외</span></>}
              {result.skipped > 0 && <span className="dim"> · 건너뜀 {result.skipped}</span>}
            </span>
          </div>
          <div style={{ maxHeight: 280, overflow: 'auto', border: '1px solid var(--border)' }}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 60 }}>상태</th>
                  <th style={{ width: 80 }}>회사</th>
                  <th style={{ width: 100 }}>차량</th>
                  <th style={{ width: 160 }}>차대번호</th>
                  <th>차명</th>
                  <th>오류</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.slice(0, 30).map((r, i) => (
                  <tr key={i}>
                    <td>
                      {r.errors.length > 0
                        ? <StatusBadge tone="red" icon={<Warning size={11} weight="fill" />}>오류</StatusBadge>
                        : <StatusBadge tone="green" icon={<CheckCircle size={11} weight="fill" />}>신규</StatusBadge>}
                    </td>
                    <td className="mono">{r.data.companyCode || <span className="dim">-</span>}</td>
                    <td className="mono">{r.data.plate || '-'}</td>
                    <td className="mono text-xs">{r.data.vin || '-'}</td>
                    <td>{r.data.vehicleName || '-'}</td>
                    <td className="text-red text-xs">{r.errors.join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {result.rows.length > 30 && (
              <div className="text-weak text-xs" style={{ padding: 6, textAlign: 'center' }}>... 외 {result.rows.length - 30}건</div>
            )}
          </div>
        </>
      )}

      <button
        className="btn btn-primary"
        disabled={!result || okCount === 0 || busy}
        onClick={() => result && onSubmit(result.rows)}
      >
        {okCount > 0 ? `${okCount}건 등록` : '등록'}
      </button>
    </div>
  );
}
