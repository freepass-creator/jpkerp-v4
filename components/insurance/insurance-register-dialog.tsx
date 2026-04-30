'use client';

import { useState } from 'react';
import { Upload, X, CircleNotch, CheckCircle, Warning, Plus } from '@phosphor-icons/react';
import { Dialog, DialogTrigger, DialogContent, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { useAssetStore, findAssetByPlate } from '@/lib/use-asset-store';
import type { InsurancePolicy, Installment } from '@/lib/sample-insurance';
import { splitPdfPages } from '@/lib/pdf-split';
import { runWithConcurrency } from '@/lib/parallel';

// Gemini Tier 1 (1,000 RPM, 약 16.7 RPS). 호출당 ~3초 → 동시 30 = ~10 RPS = 600 RPM, 안전 마진.
// 100건 PDF가 ~10초에 처리됨. 무료 티어면 2~3으로, Tier 2/3면 50+로 조정.
// 운영 HTTPS는 HTTP/2라 동시성 제약 거의 없음. 개발(HTTP/1.1)은 origin당 6 제약.
const OCR_CONCURRENCY = 30;

type Status = 'pending' | 'done' | 'failed';
type WorkItem = InsurancePolicy & {
  _status: Status;
  _error?: string;
  _matched?: boolean;
};

type Props = {
  onCreate: (items: InsurancePolicy[]) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  showTrigger?: boolean;
};

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error ?? new Error('파일 읽기 실패'));
    r.readAsDataURL(file);
  });
}

export function InsuranceRegisterDialog({ onCreate, open: openProp, onOpenChange, showTrigger = true }: Props) {
  const [assets] = useAssetStore();
  const matchAsset = (carNumber?: string) => findAssetByPlate(assets, carNumber ?? '');

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

  async function handleFiles(files: FileList | File[]) {
    const arr = Array.from(files);
    setBusy(true);

    const expanded: File[] = [];
    for (const f of arr) {
      try {
        const pages = await splitPdfPages(f);
        expanded.push(...pages);
      } catch {
        expanded.push(f);
      }
    }

    // 1) 모든 파일 dataURL 미리 읽고 placeholder 한꺼번에 추가
    const dataUrls = await Promise.all(expanded.map(fileToDataUrl));
    const placeholders: WorkItem[] = expanded.map((f, i) => ({
      id: `ip-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 5)}`,
      fileName: f.name,
      fileDataUrl: dataUrls[i],
      _status: 'pending',
    }));
    setItems((prev) => [...prev, ...placeholders]);
    setProgress({ done: 0, total: expanded.length });

    try {
      // 2) 동시성 제한 병렬 OCR
      await runWithConcurrency(expanded, OCR_CONCURRENCY, async (f, i) => {
        const id = placeholders[i].id;
        try {
          const fd = new FormData();
          fd.append('file', f);
          fd.append('type', 'insurance_policy');
          const res = await fetch('/api/ocr/extract', { method: 'POST', body: fd });
          const json = await res.json();
          if (!json.ok) throw new Error(json.error || 'OCR 실패');
          const ex = json.extracted as Record<string, unknown>;
          const carNumber = (ex.car_number as string) ?? '';
          const matched = matchAsset(carNumber);

          const rawIns = Array.isArray(ex.installments) ? ex.installments : [];
          const installments: Installment[] = rawIns.map((it, idx) => {
            const r = it as Record<string, unknown>;
            return {
              cycle: typeof r.cycle === 'number' ? r.cycle : idx + 1,
              dueDate: (r.due_date as string) ?? '',
              amount: typeof r.amount === 'number' ? r.amount : 0,
              paid: idx === 0,
            };
          });

          setItems((prev) => prev.map((p) => p.id === id ? {
            ...p,
            insurer: (ex.insurer as string) ?? '',
            productName: (ex.product_name as string) ?? '',
            policyNo: (ex.policy_no as string) ?? '',
            contractor: (ex.contractor as string) ?? '',
            insured: (ex.insured as string) ?? '',
            bizNo: (ex.biz_no as string) ?? '',
            startDate: (ex.start_date as string) ?? '',
            endDate: (ex.end_date as string) ?? '',
            carNumber,
            carName: (ex.car_name as string) ?? '',
            carYear: typeof ex.car_year === 'number' ? ex.car_year : undefined,
            carClass: (ex.car_class as string) ?? '',
            displacement: typeof ex.displacement === 'number' ? ex.displacement : undefined,
            seats: typeof ex.seats === 'number' ? ex.seats : undefined,
            vehicleValueMan: typeof ex.vehicle_value_man === 'number' ? ex.vehicle_value_man : undefined,
            accessoryValueMan: typeof ex.accessory_value_man === 'number' ? ex.accessory_value_man : undefined,
            accessories: (ex.accessories as string) ?? '',
            driverScope: (ex.driver_scope as string) ?? '',
            driverAge: (ex.driver_age as string) ?? '',
            deductibleMan: typeof ex.deductible_man === 'number' ? ex.deductible_man : undefined,
            covPersonal1: (ex.cov_personal_1 as string) ?? '',
            covPersonal2: (ex.cov_personal_2 as string) ?? '',
            covProperty: (ex.cov_property as string) ?? '',
            covSelfAccident: (ex.cov_self_accident as string) ?? '',
            covUninsured: (ex.cov_uninsured as string) ?? '',
            covSelfVehicle: (ex.cov_self_vehicle as string) ?? '',
            covEmergency: (ex.cov_emergency as string) ?? '',
            paidPremium: typeof ex.paid_premium === 'number' ? ex.paid_premium : undefined,
            totalPremium: typeof ex.total_premium === 'number' ? ex.total_premium : undefined,
            autoDebitBank: (ex.auto_debit_bank as string) ?? '',
            autoDebitAccount: (ex.auto_debit_account as string) ?? '',
            autoDebitHolder: (ex.auto_debit_holder as string) ?? '',
            installments,
            companyCode: matched?.companyCode,
            _matched: !!matched,
            _status: 'done',
          } : p));
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          setItems((prev) => prev.map((p) => p.id === id ? { ...p, _status: 'failed', _error: msg } : p));
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
    const ok = items.filter((i) => i._status === 'done');
    if (ok.length === 0) return;
    onCreate(ok.map(({ _status: _s, _error: _e, _matched: _m, ...rest }) => rest));
    setOpen(false);
    setTimeout(reset, 100);
  }

  function handleClose(o: boolean) {
    setOpen(o);
    if (!o) reset();
  }

  const okCount = items.filter((i) => i._status === 'done').length;
  const matchedCount = items.filter((i) => i._matched).length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      {showTrigger && (
        <DialogTrigger asChild>
          <button className="btn btn-primary">
            <Plus size={14} weight="bold" /> 보험 등록
          </button>
        </DialogTrigger>
      )}
      <DialogContent title="보험증권 등록 (자동 OCR)" size="xl">
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
                <div className="mt-1 text-weak">Gemini가 보험증권을 읽고 있습니다</div>
              </>
            ) : dragging ? (
              <>
                <Upload size={26} className="mx-auto" style={{ color: 'var(--brand)' }} />
                <div className="mt-2 text-medium">여기에 놓기</div>
              </>
            ) : (
              <>
                <Upload size={26} className="mx-auto text-weak" />
                <div className="mt-2 text-medium">보험증권 업로드 — 클릭 또는 드래그&드롭</div>
                <div className="mt-1 text-weak">JPG / PNG / PDF — 다중 페이지 PDF는 페이지별 분할. 차량번호로 자산 자동 매칭. 분납 회차도 함께 추출.</div>
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
                    <th>차명</th>
                    <th>보험사</th>
                    <th className="mono">증권번호</th>
                    <th className="date">시작</th>
                    <th className="date">만기</th>
                    <th className="num">총보험료</th>
                    <th className="center">분납</th>
                    <th className="center" style={{ width: 50 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((p) => (
                    <tr key={p.id}>
                      <td className="center">
                        {p._status === 'pending' ? (
                          <CircleNotch size={14} className="spin" style={{ color: 'var(--brand)' }} />
                        ) : p._status === 'failed' ? (
                          <Warning size={14} weight="fill" style={{ color: '#ef4444' }} />
                        ) : p._matched ? (
                          <CheckCircle size={14} weight="fill" style={{ color: '#10b981' }} />
                        ) : (
                          <Warning size={14} weight="fill" style={{ color: '#f59e0b' }} />
                        )}
                      </td>
                      <td className="plate">{p.companyCode || <span className="text-muted">-</span>}</td>
                      <td className="plate">{p.carNumber || <span className="text-muted">-</span>}</td>
                      <td className="dim truncate" style={{ maxWidth: 140 }}>{p.carName || '-'}</td>
                      <td className="truncate" style={{ maxWidth: 110 }}>{p.insurer || '-'}</td>
                      <td className="mono dim truncate" style={{ maxWidth: 140 }}>{p.policyNo || '-'}</td>
                      <td className="date mono">{p.startDate || '-'}</td>
                      <td className="date mono">{p.endDate || '-'}</td>
                      <td className="num">{p.totalPremium ? p.totalPremium.toLocaleString('ko-KR') : '-'}</td>
                      <td className="center dim">{p.installments?.length ? `${p.installments.length}회` : '-'}</td>
                      <td className="center">
                        <button className="btn-ghost btn btn-sm" onClick={() => removeItem(p.id)}>
                          <X size={11} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {items.length > 0 && (
            <div className="text-weak text-xs">
              총 {items.length}건 · 분석완료 <strong>{okCount}</strong> · 자산 매칭 <strong>{matchedCount}</strong>
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
      </DialogContent>
    </Dialog>
  );
}
