'use client';

import { useState } from 'react';
import { Upload, FileXls, Pencil, Plus, X, CheckCircle, CircleNotch, Warning } from '@phosphor-icons/react';
import { Dialog, DialogTrigger, DialogContent, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { RegistrationForm } from './registration-form';
import { runWithConcurrency } from '@/lib/parallel';
import type { Asset } from '@/lib/sample-assets';
import { findCompanyByOwner, type Company } from '@/lib/sample-companies';
import { useCompanyStore } from '@/lib/use-company-store';
import { useAssetStore } from '@/lib/use-asset-store';

const OCR_CONCURRENCY = 30;

type Status = 'pending' | 'done' | 'failed';
type DuplicateReason = 'plate' | 'vin' | null;
type WorkItem = {
  id: string;
  fileName: string;
  data: Partial<Asset>;
  _status: Status;
  _error?: string;
  /** 기존 자산과 중복 — plate(차량번호) 또는 vin(차대번호) 일치. null = 중복 아님. */
  _duplicate?: DuplicateReason;
};

/**
 * /api/ocr/extract 응답(VEHICLE_REG_SCHEMA) → Asset 필드 매핑.
 *
 * 자동차등록증에 실제로 적힌 필드만 채움. 등록증에 없는 추측 항목
 * (제조사·모델명·세부모델·트림·색상·구동방식 등)은 OCR 스키마에서도 제외.
 */
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

  const [items, setItems] = useState<WorkItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  function reset() {
    setItems([]);
    setBusy(false);
    setProgress(null);
  }

  /** 업로드 즉시 OCR 시작 — 과태료와 동일 패턴. */
  async function handleFiles(files: FileList | File[]) {
    const arr = Array.from(files);
    if (arr.length === 0) return;
    setBusy(true);

    const stamp = Date.now();
    const placeholders: WorkItem[] = arr.map((f, i) => ({
      id: `p-${stamp}-${i}-${Math.random().toString(36).slice(2, 5)}`,
      fileName: f.name,
      data: { companyCode: '', status: '대기' as const },
      _status: 'pending',
    }));
    setItems((prev) => [...prev, ...placeholders]);
    setProgress((prev) => ({
      done: prev?.done ?? 0,
      total: (prev?.total ?? 0) + arr.length,
    }));

    try {
      await runWithConcurrency(arr, OCR_CONCURRENCY, async (file, i) => {
        const id = placeholders[i].id;
        try {
          const fd = new FormData();
          fd.append('file', file);
          fd.append('type', 'vehicle_reg');
          const res = await fetch('/api/ocr/extract', { method: 'POST', body: fd });
          const json = await res.json();
          if (!json.ok) throw new Error(json.error || 'OCR 실패');
          const ex = json.extracted as Record<string, unknown>;
          const data = mapVehicleRegToAsset(ex, companies);
          // 기존 자산과 중복 검사 — 차대번호(vin) 우선, 차량번호(plate) 차순.
          const dup: DuplicateReason =
            data.vin && assets.some((a) => a.vin === data.vin) ? 'vin'
            : data.plate && assets.some((a) => a.plate === data.plate) ? 'plate'
            : null;
          setItems((prev) => prev.map((it) => it.id === id ? { ...it, data, _status: 'done' as const, _duplicate: dup } : it));
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error('[asset OCR]', err);
          setItems((prev) => prev.map((it) => it.id === id ? { ...it, _status: 'failed' as const, _error: msg } : it));
        } finally {
          setProgress((p) => p ? { done: p.done + 1, total: p.total } : null);
        }
      });
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  function removeItem(id: string) {
    setItems((p) => p.filter((i) => i.id !== id));
  }

  function commitAll() {
    // 1) 분석 완료 + 기존 자산 중복 아닌 행만
    const ok = items.filter((i) => i._status === 'done' && !i._duplicate);
    if (ok.length === 0) return;
    // 2) 배치 내부 중복 제거 (같은 vin 또는 plate 중복 입력)
    const seen = new Set<string>();
    const unique: WorkItem[] = [];
    let droppedInBatch = 0;
    for (const i of ok) {
      const key = i.data.vin || i.data.plate || '';
      if (key && seen.has(key)) { droppedInBatch++; continue; }
      if (key) seen.add(key);
      unique.push(i);
    }
    if (droppedInBatch > 0) {
      alert(`배치 내 중복 ${droppedInBatch}건 제외하고 ${unique.length}건 등록합니다.`);
    }
    unique.forEach((i) => onCreate(i.data));
    setOpen(false);
    setTimeout(reset, 100);
  }

  function handleClose(o: boolean) {
    setOpen(o);
    if (!o) reset();
  }

  const okCount = items.filter((i) => i._status === 'done' && !i._duplicate).length;
  const matchedCount = items.filter((i) => i._status === 'done' && i.data.companyCode && !i._duplicate).length;
  const duplicateCount = items.filter((i) => i._duplicate).length;

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
              <label
                className={`dropzone block ${dragging ? 'dragging' : ''} ${busy ? 'busy' : ''}`}
                onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); if (!busy) setDragging(true); }}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); if (!busy) setDragging(true); }}
                onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragging(false); }}
                onDrop={(e) => {
                  e.preventDefault(); e.stopPropagation();
                  setDragging(false);
                  if (busy) return;
                  const files = e.dataTransfer?.files;
                  if (files && files.length > 0) handleFiles(files);
                }}
              >
                <input
                  type="file"
                  accept="image/*,.pdf"
                  multiple
                  className="hidden"
                  disabled={busy}
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      handleFiles(e.target.files);
                      e.target.value = '';
                    }
                  }}
                />
                {progress ? (
                  <>
                    <CircleNotch size={26} className="mx-auto spin" style={{ color: 'var(--brand)' }} />
                    <div className="mt-2 text-medium">OCR 진행 중... <strong>{progress.done}</strong> / {progress.total}</div>
                    <div className="mt-1 text-weak">Gemini가 자동차등록증을 읽고 있습니다</div>
                  </>
                ) : dragging ? (
                  <>
                    <Upload size={26} className="mx-auto" style={{ color: 'var(--brand)' }} />
                    <div className="mt-2 text-medium">여기에 놓기</div>
                  </>
                ) : (
                  <>
                    <Upload size={26} className="mx-auto text-weak" />
                    <div className="mt-2 text-medium">자동차등록증 업로드 — 클릭 또는 드래그&드롭</div>
                    <div className="mt-1 text-weak">JPG / PNG / PDF — 업로드 즉시 OCR 시작. 법인번호로 회사 자동 매칭.</div>
                  </>
                )}
              </label>

              {items.length > 0 && (
                <div className="border" style={{ borderColor: 'var(--border)', overflowX: 'auto', maxHeight: 360 }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th style={{ width: 28 }}></th>
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
                      {items.map((p) => {
                        const d = p.data;
                        return (
                          <tr key={p.id}>
                            <td className="center">
                              {p._status === 'pending' ? (
                                <CircleNotch size={14} className="spin" style={{ color: 'var(--brand)' }} />
                              ) : p._status === 'failed' ? (
                                <Warning size={14} weight="fill" style={{ color: '#ef4444' }} />
                              ) : p._duplicate ? (
                                <span title={p._duplicate === 'vin' ? '차대번호 중복' : '차량번호 중복'} style={{ display: 'inline-flex' }}>
                                  <Warning size={14} weight="fill" style={{ color: '#ef4444' }} />
                                </span>
                              ) : d.companyCode ? (
                                <CheckCircle size={14} weight="fill" style={{ color: '#10b981' }} />
                              ) : (
                                <Warning size={14} weight="fill" style={{ color: '#f59e0b' }} />
                              )}
                            </td>
                            <td className="plate">
                              {p._status === 'pending' ? <span className="text-weak">…</span>
                                : d.companyCode ? d.companyCode
                                : <span className="text-red" title="등록된 회사 없음 — 등록 후 회사코드 수동 지정 필요">미매칭</span>}
                            </td>
                            <td className="plate text-medium">
                              {d.plate || '-'}
                              {p._duplicate && (
                                <span className="text-red" style={{ marginLeft: 6, fontSize: 11 }}
                                      title={p._duplicate === 'vin' ? '차대번호 중복 — 이미 등록된 차량' : '차량번호 중복 — 이미 등록된 차량'}>
                                  · 중복
                                </span>
                              )}
                            </td>
                            <td className="dim">{d.vehicleClass || '-'}</td>
                            <td>{d.vehicleName || '-'}</td>
                            <td className="mono dim truncate" style={{ maxWidth: 160 }} title={d.vin}>{d.vin || '-'}</td>
                            <td className="dim">{d.ownerName || '-'}</td>
                            <td className="date">{d.firstRegistDate || '-'}</td>
                            <td className="num">{d.acquisitionPrice ? d.acquisitionPrice.toLocaleString('ko-KR') : '-'}</td>
                            <td className="center">
                              <button className="btn-ghost btn btn-sm" onClick={() => removeItem(p.id)} title="제거">
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

              {items.length > 0 && (
                <div className="text-weak text-xs">
                  총 {items.length}건 · 등록 가능 <strong>{okCount}</strong> · 회사 매칭 <strong>{matchedCount}</strong>
                  {duplicateCount > 0 && <> · <span className="text-red">중복 {duplicateCount}건 제외</span></>}
                </div>
              )}
            </div>

            <DialogFooter>
              <DialogClose asChild>
                <button className="btn">취소</button>
              </DialogClose>
              <button className="btn btn-primary" disabled={okCount === 0 || busy} onClick={commitAll}>
                {okCount > 0 ? `${okCount}건 등록` : '등록'}
              </button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="manual">
            <RegistrationForm data={{}} onSubmit={(d) => { onCreate(d); setOpen(false); reset(); }} />
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
