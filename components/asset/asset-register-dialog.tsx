'use client';

import { useState } from 'react';
import { Upload, FileXls, Pencil, Plus, X, CheckCircle, CircleNotch, Warning, ArrowCounterClockwise } from '@phosphor-icons/react';
import { Dialog, DialogTrigger, DialogContent, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { OcrUploadStage } from '@/components/ui/ocr-upload-stage';
import { StatusBadge } from '@/components/ui/status-badge';
import { RegistrationForm } from './registration-form';
import type { Asset } from '@/lib/sample-assets';
import { findCompanyByOwner, type Company } from '@/lib/sample-companies';
import { useCompanyStore } from '@/lib/use-company-store';
import { useAssetStore } from '@/lib/use-asset-store';
import { useOcrBatch, type OcrBatchItem } from '@/lib/use-ocr-batch';
import { assetKeyFn, describeAssetDuplicate } from '@/lib/asset-dedup';
import { matchAgainstIndex, buildKeyIndex } from '@/lib/dedup';
import { fileToImageDataUrl, pdfFirstPageToJpegFile } from '@/lib/pdf-to-image';

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
    firstRegistDate: str(ex.first_registration_date) ?? '',
    certIssueDate: str(ex.cert_issue_date),
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
    inspectionFrom: str(ex.inspection_from),
    inspectionTo: str(ex.inspection_to),
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

  const ocr = useOcrBatch<AssetWorkItem>({
    docType: 'vehicle_reg',
    // PDF 는 client-side 에서 첫 페이지 JPEG (2.5x 스케일) 로 변환 후 전송.
    // Gemini Vision 이 multi-page PDF 에서 page 1 을 놓치는 non-deterministic
    // 실패 (Tesla Model 3 등록증 등) 를 회피.
    preconvertPdfToImage: pdfFirstPageToJpegFile,
    createPlaceholder: async (file, id) => {
      // 등록증 원본을 이미지 dataUrl 로 변환해서 자산에 보관 (PDF 첫 페이지 또는 그대로)
      const documentImageUrl = await fileToImageDataUrl(file).catch(() => '');
      return {
        id, fileName: file.name, _status: 'pending',
        data: {
          companyCode: '', status: '대기' as const,
          documentImageUrl, documentFileName: file.name,
        },
        _duplicate: null,
      };
    },
    applyResult: (prev, raw, allItems) => {
      const mapped = mapVehicleRegToAsset(raw, companies);
      // OCR 매핑 결과 + placeholder 의 documentImageUrl 보존
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
    registerableItems.forEach((i) => onCreate(i.data));
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
        <Tabs defaultValue="ocr">
          <TabsList>
            <TabsTrigger value="ocr">
              <Upload size={14} className="mr-1.5 inline" /> 등록증 OCR
            </TabsTrigger>
            <TabsTrigger value="manual">
              <Pencil size={14} className="mr-1.5 inline" /> 개별 입력
            </TabsTrigger>
            <TabsTrigger value="sheet">
              <FileXls size={14} className="mr-1.5 inline" /> 시트 (다건)
            </TabsTrigger>
          </TabsList>

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
                                    {companies.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
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
            <RegistrationForm data={{}} onSubmit={(d) => { onCreate(d); setOpen(false); ocr.reset(); }} />
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
