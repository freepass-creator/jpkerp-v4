'use client';

import { useState } from 'react';
import { Upload, FileArrowDown, Trash, X, PencilSimple, CheckCircle, Warning, CircleNotch } from '@phosphor-icons/react';
import { PageShell } from '@/components/layout/page-shell';
import { downloadPenaltyMergedPdf, type PenaltyWorkItem } from '@/lib/penalty-pdf';
import { EntityFormDialog, type FieldDef } from '@/components/ui/entity-form-dialog';
import { SAMPLE_CONTRACTS } from '@/lib/sample-contracts';
import { findCompany, defaultCompany } from '@/lib/sample-companies';
import { splitPdfPages } from '@/lib/pdf-split';

/**
 * 과태료 변경부과 — 고지서 OCR 후 임대차계약 사실확인서와 함께 PDF 다운로드.
 *
 * 흐름:
 *  1. 고지서 (PDF / 이미지) 업로드
 *  2. /api/ocr/extract 로 자동 OCR (Gemini)
 *  3. 차량번호로 SAMPLE_CONTRACTS 매칭 → 계약자/회사 자동 채움
 *  4. 변경공문 + 고지서 사본 + 사실확인서 → 단일 PDF 다운로드
 */

const PENALTY_FIELDS: FieldDef[] = [
  { key: 'car_number',  label: '차량번호',  required: true },
  { key: 'doc_type',    label: '구분',      type: 'select', options: ['과태료', '범칙금', '통행료', '주정차위반', '속도위반', '신호위반', '기타'] },
  { key: 'notice_no',   label: '고지서번호', colSpan: 2 },
  { key: 'issuer',      label: '발급기관', colSpan: 2 },
  { key: 'date',        label: '위반일시', placeholder: 'YYYY-MM-DD HH:mm' },
  { key: 'issue_date',  label: '발송일',   type: 'date' },
  { key: 'location',    label: '위반장소', colSpan: 2 },
  { key: 'description', label: '위반내용', colSpan: 4 },
  { key: 'amount',      label: '금액',     type: 'number' },
  { key: 'due_date',    label: '납부기한', type: 'date' },
  { key: 'pay_account', label: '납부 계좌', colSpan: 2 },
  { key: 'contractor_name',    label: '임차인명' },
  { key: 'contractor_kind',    label: '신분', type: 'select', options: ['개인', '사업자'] },
  { key: 'contractor_phone',   label: '연락처' },
  { key: 'contractor_ident',   label: '식별번호' },
  { key: 'contractor_address', label: '주소', colSpan: 4 },
  { key: 'start_date',  label: '계약 시작일', type: 'date' },
  { key: 'end_date',    label: '계약 종료일', type: 'date' },
  { key: 'partner_code', label: '회사코드' },
];

function emptyItem(file: File, dataUrl: string): PenaltyWorkItem {
  return {
    id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    fileName: file.name,
    fileDataUrl: dataUrl,
    fileSize: file.size,
    doc_type: '', notice_no: '', issuer: '', issue_date: '',
    payer_name: '', car_number: '', date: '', location: '',
    description: '', law_article: '',
    penalty_amount: 0, fine_amount: 0, demerit_points: 0,
    toll_amount: 0, surcharge_amount: 0, amount: 0,
    due_date: '', opinion_period: '', pay_account: '',
    _asset: null,
    _contract: null,
    _company: null,
    _ocrStatus: 'pending',
  };
}

/** 차량번호로 SAMPLE_CONTRACTS 매칭 → contract/company 자동 매핑 */
function matchContract(carNumber: string): {
  _contract: PenaltyWorkItem['_contract'];
  _company: PenaltyWorkItem['_company'];
} {
  if (!carNumber) return { _contract: null, _company: null };
  const found = SAMPLE_CONTRACTS.find((c) => c.plate.replace(/\s/g, '') === carNumber.replace(/\s/g, ''));
  if (!found) return { _contract: null, _company: null };
  return {
    _contract: {
      contractor_name: found.customerName,
      contractor_phone: found.customerPhone,
      contractor_kind: found.customerKind,
      start_date: found.startDate,
      end_date: found.endDate,
      product_type: '장기렌트',
      partner_code: found.companyCode,
    },
    _company: findCompany(found.companyCode) ?? null,
  };
}

export default function PenaltyPage() {
  const [items, setItems] = useState<PenaltyWorkItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [ocrProgress, setOcrProgress] = useState<{ done: number; total: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  async function handleFiles(files: FileList | File[]) {
    const arr = Array.from(files);
    setBusy(true);

    // 1단계: PDF면 페이지 분할 → 단일 페이지 File 목록 평탄화
    const expanded: File[] = [];
    for (const f of arr) {
      try {
        const pages = await splitPdfPages(f);
        expanded.push(...pages);
      } catch (err) {
        console.error('PDF 분할 실패', err);
        expanded.push(f);
      }
    }

    setOcrProgress({ done: 0, total: expanded.length });
    try {
      for (let i = 0; i < expanded.length; i++) {
        const f = expanded[i];
        const dataUrl = await fileToDataUrl(f);
        const placeholder = emptyItem(f, dataUrl);
        setItems((prev) => [...prev, placeholder]);

        // OCR 호출
        try {
          const fd = new FormData();
          fd.append('file', f);
          fd.append('type', 'penalty');
          const res = await fetch('/api/ocr/extract', { method: 'POST', body: fd });
          const json = await res.json();
          if (!json.ok) throw new Error(json.error || 'OCR 실패');
          const ex = json.extracted as Record<string, unknown>;
          const carNumber = (ex.car_number as string) ?? '';
          const match = matchContract(carNumber);

          setItems((prev) => prev.map((it) => it.id === placeholder.id ? {
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
            _contract: match._contract,
            _company: match._company,
            _ocrStatus: 'done',
          } : it));
        } catch (err) {
          console.error('OCR error', err);
          const msg = err instanceof Error ? err.message : String(err);
          setItems((prev) => prev.map((it) => it.id === placeholder.id ? {
            ...it,
            _ocrStatus: 'failed',
            _ocrError: msg,
          } : it));
        } finally {
          setOcrProgress((p) => p ? { done: p.done + 1, total: p.total } : null);
        }
      }
    } finally {
      setBusy(false);
      setOcrProgress(null);
    }
  }

  function removeItem(id: string) {
    setItems((p) => p.filter((i) => i.id !== id));
  }

  async function handleDownload() {
    if (items.length === 0) return;
    setBusy(true);
    try {
      // 매칭 안 된 항목은 기본 회사로 도장
      const stamped = items.map((i) => ({
        ...i,
        _company: i._company ?? defaultCompany(),
      }));
      await downloadPenaltyMergedPdf(stamped);
    } finally {
      setBusy(false);
    }
  }

  function handleSaveEdit(d: Record<string, string>) {
    if (!editingId) return;
    setItems((prev) => prev.map((it) => {
      if (it.id !== editingId) return it;
      const partnerCode = d.partner_code ?? it._contract?.partner_code ?? '';
      const merged: PenaltyWorkItem = {
        ...it,
        car_number: d.car_number ?? it.car_number,
        doc_type: d.doc_type ?? it.doc_type,
        notice_no: d.notice_no ?? it.notice_no,
        issuer: d.issuer ?? it.issuer,
        date: d.date ?? it.date,
        issue_date: d.issue_date ?? it.issue_date,
        location: d.location ?? it.location,
        description: d.description ?? it.description,
        amount: d.amount ? Number(d.amount) : it.amount,
        due_date: d.due_date ?? it.due_date,
        pay_account: d.pay_account ?? it.pay_account,
        _contract: (d.contractor_name || d.start_date) ? {
          contractor_name: d.contractor_name,
          contractor_kind: d.contractor_kind,
          contractor_phone: d.contractor_phone,
          contractor_ident: d.contractor_ident,
          contractor_address: d.contractor_address,
          start_date: d.start_date,
          end_date: d.end_date,
          product_type: '장기렌트',
          partner_code: partnerCode,
        } : it._contract,
        _company: findCompany(partnerCode) ?? it._company,
      };
      return merged;
    }));
    setEditingId(null);
  }

  const editing = editingId ? items.find((i) => i.id === editingId) : null;
  const editInitial: Record<string, string> = editing ? {
    car_number: editing.car_number,
    doc_type: editing.doc_type,
    notice_no: editing.notice_no,
    issuer: editing.issuer,
    date: editing.date,
    issue_date: editing.issue_date,
    location: editing.location,
    description: editing.description,
    amount: editing.amount ? String(editing.amount) : '',
    due_date: editing.due_date,
    pay_account: editing.pay_account,
    contractor_name: editing._contract?.contractor_name ?? '',
    contractor_kind: editing._contract?.contractor_kind ?? '',
    contractor_phone: editing._contract?.contractor_phone ?? '',
    contractor_ident: editing._contract?.contractor_ident ?? '',
    contractor_address: editing._contract?.contractor_address ?? '',
    start_date: editing._contract?.start_date ?? '',
    end_date: editing._contract?.end_date ?? '',
    partner_code: editing._contract?.partner_code ?? '',
  } : {};

  const filledCount = items.filter((i) => i.car_number).length;
  const matchedCount = items.filter((i) => i._contract).length;

  return (
    <>
      <PageShell
        footerLeft={
          <>
            <span className="stat-item">전체 <strong>{items.length}</strong></span>
            <span className="stat-item">차량번호 인식 <strong>{filledCount}</strong></span>
            <span className="stat-item">계약 매칭 <strong>{matchedCount}</strong></span>
          </>
        }
        footerRight={
          <>
            <button className="btn" onClick={() => setItems([])} disabled={items.length === 0}>
              <Trash size={14} weight="bold" /> 전체 비우기
            </button>
            <button className="btn btn-primary" onClick={handleDownload} disabled={items.length === 0 || busy}>
              <FileArrowDown size={14} weight="bold" /> {busy ? '처리 중...' : `PDF 다운로드 (${items.length}건)`}
            </button>
          </>
        }
      >
        <div style={{ padding: 12, borderBottom: '1px solid var(--border)' }}>
          <label
            className={`dropzone block ${dragging ? 'dragging' : ''} ${busy ? 'busy' : ''}`}
            onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); if (!busy) setDragging(true); }}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); if (!busy) setDragging(true); }}
            onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragging(false); }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
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
            {ocrProgress ? (
              <>
                <CircleNotch size={26} className="mx-auto spin" style={{ color: 'var(--brand)' }} />
                <div className="mt-2 text-medium">
                  OCR 진행 중...{' '}
                  <strong>{ocrProgress.done}</strong> / {ocrProgress.total}
                </div>
                <div className="mt-1 text-weak">
                  {ocrProgress.done < ocrProgress.total
                    ? `${ocrProgress.total - ocrProgress.done}건 남음 — Gemini가 고지서를 읽고 있습니다`
                    : '마무리 중...'}
                </div>
              </>
            ) : dragging ? (
              <>
                <Upload size={26} className="mx-auto" style={{ color: 'var(--brand)' }} />
                <div className="mt-2 text-medium">여기에 놓기</div>
                <div className="mt-1 text-weak">파일을 드롭하면 자동으로 OCR이 시작됩니다</div>
              </>
            ) : (
              <>
                <Upload size={26} className="mx-auto text-weak" />
                <div className="mt-2 text-medium">고지서 업로드 — 클릭 또는 드래그&드롭 (자동 OCR)</div>
                <div className="mt-1 text-weak">JPG / PNG / PDF — PDF는 페이지별로 분할하여 각각 OCR. 차량번호로 계약 자동 매칭.</div>
              </>
            )}
          </label>
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>파일명</th>
                <th>매칭</th>
                <th>차량번호</th>
                <th>구분</th>
                <th>고지서번호</th>
                <th>발급기관</th>
                <th className="date">위반일시</th>
                <th>위반장소</th>
                <th>위반내용</th>
                <th className="num">금액</th>
                <th>임차인 (회사)</th>
                <th className="date">계약기간</th>
                <th className="center" style={{ width: 90 }}>동작</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={13} className="center dim" style={{ padding: '32px 0' }}>
                    고지서를 업로드하세요. 자동 OCR로 정보를 채우고 차량번호로 계약을 매칭합니다.
                  </td>
                </tr>
              ) : (
                items.map((it) => (
                  <tr key={it.id}>
                    <td className="mono dim truncate" style={{ maxWidth: 180 }} title={it.fileName}>{it.fileName}</td>
                    <td className="center">
                      {it._ocrStatus === 'pending' ? (
                        <span title="OCR 진행 중" style={{ color: 'var(--brand)', display: 'inline-flex', alignItems: 'center' }}>
                          <CircleNotch size={14} className="spin" />
                        </span>
                      ) : it._ocrStatus === 'failed' ? (
                        <span title={`OCR 실패: ${it._ocrError ?? ''}`} style={{ color: '#ef4444', display: 'inline-flex', alignItems: 'center' }}>
                          <Warning size={14} weight="fill" />
                        </span>
                      ) : it._contract ? (
                        <span title="계약 매칭 성공" style={{ color: '#10b981', display: 'inline-flex', alignItems: 'center' }}>
                          <CheckCircle size={14} weight="fill" />
                        </span>
                      ) : it.car_number ? (
                        <span title="차량번호 인식 - 계약 매칭 실패" style={{ color: '#f59e0b', display: 'inline-flex', alignItems: 'center' }}>
                          <Warning size={14} weight="fill" />
                        </span>
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </td>
                    <td className="plate">{it.car_number || <span className="text-muted">-</span>}</td>
                    <td className="dim">{it.doc_type || '-'}</td>
                    <td className="mono dim">{it.notice_no || '-'}</td>
                    <td>{it.issuer || '-'}</td>
                    <td className="date mono">{it.date || '-'}</td>
                    <td>{it.location || '-'}</td>
                    <td>{it.description || '-'}</td>
                    <td className="num">{it.amount ? it.amount.toLocaleString('ko-KR') : '-'}</td>
                    <td>
                      {it._contract?.contractor_name ? (
                        <>
                          {it._contract.contractor_name}
                          {it._company && <span className="text-weak"> · {it._company.name}</span>}
                        </>
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </td>
                    <td className="date dim">
                      {it._contract?.start_date ? `${it._contract.start_date} ~ ${it._contract.end_date}` : ''}
                    </td>
                    <td className="center">
                      <div className="flex items-center gap-1 justify-center">
                        <button className="btn btn-sm" onClick={() => setEditingId(it.id)}>
                          <PencilSimple size={11} /> 수정
                        </button>
                        <button className="btn-ghost btn btn-sm" onClick={() => removeItem(it.id)}>
                          <X size={11} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </PageShell>

      <EntityFormDialog
        open={editingId !== null}
        onOpenChange={(o) => { if (!o) setEditingId(null); }}
        title={`고지서 정보 수정${editing ? ` — ${editing.fileName}` : ''}`}
        sections={[
          { title: '고지서', fields: PENALTY_FIELDS.slice(0, 11) },
          { title: '임차인 / 계약', fields: PENALTY_FIELDS.slice(11) },
        ]}
        initial={editInitial}
        submitLabel="저장"
        size="xl"
        onSubmit={handleSaveEdit}
      />
    </>
  );
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error ?? new Error('파일 읽기 실패'));
    r.readAsDataURL(file);
  });
}
