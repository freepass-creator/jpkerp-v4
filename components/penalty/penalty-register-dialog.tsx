'use client';

import { useState } from 'react';
import { Upload, X, CircleNotch, CheckCircle, Warning, Plus } from '@phosphor-icons/react';
import { Dialog, DialogTrigger, DialogContent, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { SAMPLE_CONTRACTS } from '@/lib/sample-contracts';
import { findCompany } from '@/lib/sample-companies';
import type { PenaltyWorkItem } from '@/lib/penalty-pdf';
import { splitPdfPages } from '@/lib/pdf-split';
import { runWithConcurrency } from '@/lib/parallel';
import { fileToImageDataUrl } from '@/lib/pdf-to-image';

// Gemini Tier 1 (1,000 RPM). 호출당 ~3초 → 동시 30 = 600 RPM 안전 마진.
// 100건 ~10초. 무료 티어면 2~3, Tier 2/3면 50+로 조정.
const OCR_CONCURRENCY = 30;

type Status = 'pending' | 'done' | 'failed';
type WorkItem = PenaltyWorkItem & {
  _status: Status;
  _error?: string;
};

type Props = {
  onCreate: (items: PenaltyWorkItem[]) => void;
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

function matchContract(carNumber: string) {
  if (!carNumber) return null;
  const norm = carNumber.replace(/\s/g, '');
  return SAMPLE_CONTRACTS.find((c) => c.plate.replace(/\s/g, '') === norm) ?? null;
}

export function PenaltyRegisterDialog({ onCreate, open: openProp, onOpenChange, showTrigger = true }: Props) {
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

    // 1) 모든 파일 dataURL 미리 읽고, placeholder 행을 한꺼번에 추가 (사용자에게 즉시 큐 표시)
    // PDF면 이미지로 렌더링해서 저장 (jsPDF.addImage가 PDF는 못 읽음)
    const dataUrls = await Promise.all(expanded.map(fileToImageDataUrl));
    const placeholders: WorkItem[] = expanded.map((f, i) => ({
      id: `p-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 5)}`,
      fileName: f.name,
      fileDataUrl: dataUrls[i],
      fileSize: f.size,
      doc_type: '', notice_no: '', issuer: '', issue_date: '',
      payer_name: '', car_number: '', date: '', location: '',
      description: '', law_article: '',
      penalty_amount: 0, fine_amount: 0, demerit_points: 0,
      toll_amount: 0, surcharge_amount: 0, amount: 0,
      due_date: '', opinion_period: '', pay_account: '',
      _asset: null, _contract: null, _company: null,
      _ocrStatus: 'pending',
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
          fd.append('type', 'penalty');
          const res = await fetch('/api/ocr/extract', { method: 'POST', body: fd });
          const json = await res.json();
          if (!json.ok) throw new Error(json.error || 'OCR 실패');
          const ex = json.extracted as Record<string, unknown>;
          const carNumber = (ex.car_number as string) ?? '';
          const matched = matchContract(carNumber);

          setItems((prev) => prev.map((it) => it.id === id ? {
            ...it,
            doc_type: (ex.doc_type as string) ?? '',
            notice_no: (ex.notice_no as string) ?? '',
            issuer: (ex.issuer as string) ?? '',
            issue_date: (ex.issue_date as string) ?? '',
            car_number: carNumber,
            date: (ex.date as string) ?? '',
            location: (ex.location as string) ?? '',
            description: (ex.description as string) ?? '',
            law_article: (ex.law_article as string) ?? '',
            amount: typeof ex.amount === 'number' ? ex.amount : 0,
            due_date: (ex.due_date as string) ?? '',
            pay_account: (ex.pay_account as string) ?? '',
            _contract: matched ? {
              contractor_name: matched.customerName,
              contractor_phone: matched.customerPhone,
              contractor_kind: matched.customerKind,
              start_date: matched.startDate,
              end_date: matched.endDate,
              product_type: '장기렌트',
              partner_code: matched.companyCode,
            } : null,
            _company: matched ? findCompany(matched.companyCode) ?? null : null,
            _ocrStatus: 'done',
            _status: 'done',
          } : it));
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          setItems((prev) => prev.map((it) => it.id === id ? { ...it, _status: 'failed', _ocrStatus: 'failed', _ocrError: msg, _error: msg } : it));
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
    onCreate(ok.map(({ _status: _s, _error: _e, ...rest }) => rest as PenaltyWorkItem));
    setOpen(false);
    setTimeout(reset, 100);
  }

  function handleClose(o: boolean) {
    setOpen(o);
    if (!o) reset();
  }

  const okCount = items.filter((i) => i._status === 'done').length;
  const matchedCount = items.filter((i) => i._contract).length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      {showTrigger && (
        <DialogTrigger asChild>
          <button className="btn btn-primary">
            <Plus size={14} weight="bold" /> 고지서 등록
          </button>
        </DialogTrigger>
      )}
      <DialogContent title="고지서 등록 (자동 OCR)" size="xl">
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
                <div className="mt-1 text-weak">Gemini가 고지서를 읽고 있습니다</div>
              </>
            ) : dragging ? (
              <>
                <Upload size={26} className="mx-auto" style={{ color: 'var(--brand)' }} />
                <div className="mt-2 text-medium">여기에 놓기</div>
              </>
            ) : (
              <>
                <Upload size={26} className="mx-auto text-weak" />
                <div className="mt-2 text-medium">고지서 업로드 — 클릭 또는 드래그&드롭</div>
                <div className="mt-1 text-weak">JPG / PNG / PDF — PDF는 페이지별 분할. 차량번호로 계약 자동 매칭.</div>
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
                    <th>구분</th>
                    <th>위반장소</th>
                    <th className="num">금액</th>
                    <th>임차인</th>
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
                        ) : p._contract ? (
                          <CheckCircle size={14} weight="fill" style={{ color: '#10b981' }} />
                        ) : (
                          <Warning size={14} weight="fill" style={{ color: '#f59e0b' }} />
                        )}
                      </td>
                      <td className="plate">{p._company?.code || <span className="text-muted">-</span>}</td>
                      <td className="plate">{p.car_number || <span className="text-muted">-</span>}</td>
                      <td className="dim">{p.doc_type || '-'}</td>
                      <td className="dim truncate" style={{ maxWidth: 200 }}>{p.location || '-'}</td>
                      <td className="num">{p.amount ? p.amount.toLocaleString('ko-KR') : '-'}</td>
                      <td className="dim">{p._contract?.contractor_name || <span className="text-muted">미매칭</span>}</td>
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
              총 {items.length}건 · 분석완료 <strong>{okCount}</strong> · 계약 매칭 <strong>{matchedCount}</strong>
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
