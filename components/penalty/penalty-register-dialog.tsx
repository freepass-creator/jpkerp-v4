'use client';

import { useState } from 'react';
import { X, CircleNotch, CheckCircle, Warning, Plus } from '@phosphor-icons/react';
import { Dialog, DialogTrigger, DialogContent, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { OcrUploadStage } from '@/components/ui/ocr-upload-stage';
import { StatusBadge } from '@/components/ui/status-badge';
import { findContractByPlate } from '@/lib/use-contract-store';
import { useCompanyStore } from '@/lib/use-company-store';
import { useContractStore } from '@/lib/use-contract-store';
import type { PenaltyWorkItem } from '@/lib/penalty-pdf';
import { splitPdfPages } from '@/lib/pdf-split';
import { fileToImageDataUrl } from '@/lib/pdf-to-image';
import { useOcrBatch, type OcrBatchItem } from '@/lib/use-ocr-batch';

type WorkItem = PenaltyWorkItem & OcrBatchItem;

type Props = {
  onCreate: (items: PenaltyWorkItem[]) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  showTrigger?: boolean;
};

/** PDF/이미지 placeholder — fileDataUrl 은 PDF→이미지 변환해서 채움. */
async function createPenaltyPlaceholder(file: File, id: string): Promise<WorkItem> {
  const fileDataUrl = await fileToImageDataUrl(file).catch(() => '');
  return {
    id,
    fileName: file.name,
    fileDataUrl,
    fileSize: file.size,
    doc_type: '', notice_no: '', issuer: '', issue_date: '',
    payer_name: '', car_number: '', date: '', location: '',
    description: '', law_article: '',
    penalty_amount: 0, fine_amount: 0, demerit_points: 0,
    toll_amount: 0, surcharge_amount: 0, amount: 0,
    due_date: '', opinion_period: '', pay_account: '',
    _asset: null, _contract: null, _company: null,
    _status: 'pending',
  };
}

export function PenaltyRegisterDialog({ onCreate, open: openProp, onOpenChange, showTrigger = true }: Props) {
  const [contracts] = useContractStore();
  const [companies] = useCompanyStore();
  const findCompanyByCode = (code?: string) => code ? companies.find((c) => c.code === code) ?? null : null;

  const [openInner, setOpenInner] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : openInner;
  const setOpen = (v: boolean) => {
    if (!isControlled) setOpenInner(v);
    onOpenChange?.(v);
  };

  const ocr = useOcrBatch<WorkItem>({
    docType: 'penalty',
    expandFile: splitPdfPages,
    createPlaceholder: createPenaltyPlaceholder,
    applyResult: (prev, raw) => {
      const carNumber = (raw.car_number as string) ?? '';
      const matched = findContractByPlate(contracts, carNumber);
      return {
        ...prev,
        doc_type: (raw.doc_type as string) ?? '',
        notice_no: (raw.notice_no as string) ?? '',
        issuer: (raw.issuer as string) ?? '',
        issue_date: (raw.issue_date as string) ?? '',
        car_number: carNumber,
        date: (raw.date as string) ?? '',
        location: (raw.location as string) ?? '',
        description: (raw.description as string) ?? '',
        law_article: (raw.law_article as string) ?? '',
        amount: typeof raw.amount === 'number' ? raw.amount : 0,
        due_date: (raw.due_date as string) ?? '',
        pay_account: (raw.pay_account as string) ?? '',
        _contract: matched ? {
          contractor_name: matched.customerName,
          contractor_phone: matched.customerPhone,
          contractor_kind: matched.customerKind,
          start_date: matched.startDate,
          end_date: matched.endDate,
          product_type: '장기렌트',
          partner_code: matched.companyCode,
        } : null,
        _company: matched ? findCompanyByCode(matched.companyCode) : null,
      };
    },
  });

  function commitAll() {
    const ok = ocr.items.filter((i) => i._status === 'done');
    if (ok.length === 0) return;
    onCreate(ok.map(({ _status: _s, _error: _e, ...rest }) => rest as PenaltyWorkItem));
    setOpen(false);
    setTimeout(ocr.reset, 100);
  }

  function handleClose(o: boolean) {
    setOpen(o);
    if (!o) ocr.reset();
  }

  const okCount = ocr.items.filter((i) => i._status === 'done').length;
  const matchedCount = ocr.items.filter((i) => i._contract).length;

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
          <OcrUploadStage
            progress={ocr.progress}
            busy={ocr.busy}
            onFiles={ocr.handleFiles}
            idleTitle="고지서 업로드 — 클릭 또는 드래그&드롭"
            idleSubtitle="JPG / PNG / PDF — PDF는 페이지별 분할. 차량번호로 계약 자동 매칭."
            progressSubtitle="Gemini가 고지서를 읽고 있습니다"
          />

          {ocr.items.length > 0 && (
            <div className="border" style={{ borderColor: 'var(--border)', overflowX: 'auto', maxHeight: 360 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th className="center" style={{ width: 70 }}>상태</th>
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
                  {ocr.items.map((p) => (
                    <tr key={p.id}>
                      <td className="center"><PenaltyItemStatus item={p} /></td>
                      <td className="plate">{p._company?.code || <span className="text-muted">-</span>}</td>
                      <td className="plate">{p.car_number || <span className="text-muted">-</span>}</td>
                      <td className="dim">{p.doc_type || '-'}</td>
                      <td className="dim truncate" style={{ maxWidth: 200 }}>{p.location || '-'}</td>
                      <td className="num">{p.amount ? p.amount.toLocaleString('ko-KR') : '-'}</td>
                      <td className="dim">{p._contract?.contractor_name || <span className="text-muted">미매칭</span>}</td>
                      <td className="center">
                        <button className="btn-ghost btn btn-sm" onClick={() => ocr.removeItem(p.id)}>
                          <X size={11} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {ocr.items.length > 0 && (
            <div className="text-weak text-xs">
              총 {ocr.items.length}건 · 분석완료 <strong>{okCount}</strong> · 계약 매칭 <strong>{matchedCount}</strong>
            </div>
          )}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <button className="btn">취소</button>
          </DialogClose>
          <button className="btn btn-primary" disabled={okCount === 0 || ocr.busy} onClick={commitAll}>
            {okCount > 0 ? `${okCount}건 등록` : '등록'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** 과태료 OCR 행 상태 — 분석중 / 오류 / 매칭완료 / 미매칭. */
function PenaltyItemStatus({ item }: { item: WorkItem }) {
  if (item._status === 'pending') {
    return <StatusBadge tone="neutral" icon={<CircleNotch size={11} className="spin" />}>분석중</StatusBadge>;
  }
  if (item._status === 'failed') {
    return <StatusBadge tone="red" icon={<Warning size={11} weight="fill" />} title={item._error}>오류</StatusBadge>;
  }
  if (item._contract) {
    return <StatusBadge tone="green" icon={<CheckCircle size={11} weight="fill" />}>매칭</StatusBadge>;
  }
  return <StatusBadge tone="orange" icon={<Warning size={11} weight="fill" />} title="차량번호로 매칭되는 계약 없음">미매칭</StatusBadge>;
}
