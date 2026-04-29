'use client';

/**
 * 계약서 PDF 업로드 → Gemini OCR → 추출 데이터로 계약등록 폼 자동 채움.
 *
 * 흐름:
 *   1) 사용자가 PDF/이미지 드래그 또는 선택
 *   2) /api/ocr/extract POST (type=rental_contract)
 *   3) 추출된 필드를 CONTRACT_FIELDS 키로 매핑해서 onExtracted 콜백
 *   4) 부모(contract page) 가 받아서 EntityFormDialog 미리채움
 */
import { useState, useRef } from 'react';
import { Upload, X, FileText, Spinner } from '@phosphor-icons/react';

export interface RentalContractExtracted {
  contract_no?: string;
  contract_date?: string;
  contractor_name?: string;
  contractor_kind?: '개인' | '사업자' | '법인';
  contractor_ident?: string;
  contractor_license_no?: string;
  contractor_phone?: string;
  contractor_address?: string;
  contractor_emergency_phone?: string;
  contractor_biz_name?: string;
  contractor_biz_address?: string;
  car_number?: string;
  car_name?: string;
  fuel?: string;
  color?: string;
  options?: string;
  maintenance_product?: string;
  rental_period_months?: number;
  start_date?: string;
  end_date?: string;
  driver_age_min?: number;
  initial_mileage_km?: number;
  annual_mileage_limit_km?: number;
  monthly_amount?: number;
  deposit_total?: number;
  deposit_installments?: Array<{ cycle: number; amount: number | null }>;
  purchase_option_amount?: string;
  payment_account_bank?: string;
  payment_account_no?: string;
  payment_account_holder?: string;
  autopay_day?: number;
  company_name?: string;
  company_ceo?: string;
  company_biz_no?: string;
  company_phone?: string;
  company_address?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** OCR 추출 완료 시 호출. 부모는 받아서 EntityFormDialog initial 로 사용. */
  onExtracted: (data: RentalContractExtracted, fileName: string) => void;
}

export function ContractUploadDialog({ open, onOpenChange, onExtracted }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  if (!open) return null;

  async function handleFile(file: File) {
    setError(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('type', 'rental_contract');
      fd.append('file', file);

      const res = await fetch('/api/ocr/extract', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || `OCR 실패 (HTTP ${res.status})`);
      }
      onExtracted(json.extracted as RentalContractExtracted, file.name);
      onOpenChange(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={() => !busy && onOpenChange(false)}
    >
      <div
        style={{
          background: 'var(--bg-card)', borderRadius: 8, padding: 24,
          width: 480, maxWidth: '90vw', boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
            계약서 업로드 → 자동 채움
          </h3>
          <button
            className="btn-ghost btn btn-sm"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            <X size={12} />
          </button>
        </div>

        <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--text-sub)' }}>
          PDF · JPG · PNG (20MB 이하). Gemini OCR 로 차량번호·고객정보·계약기간·금액 등을 추출해
          계약등록 폼에 미리 채워줍니다.
        </p>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => !busy && inputRef.current?.click()}
          style={{
            border: '2px dashed',
            borderColor: dragOver ? 'var(--brand)' : 'var(--border)',
            borderRadius: 6,
            padding: '36px 20px',
            textAlign: 'center',
            cursor: busy ? 'wait' : 'pointer',
            background: dragOver ? 'var(--bg-hover)' : 'var(--bg)',
            transition: 'all 0.15s',
          }}
        >
          {busy ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <Spinner size={24} className="animate-spin" />
              <div style={{ fontSize: 12, color: 'var(--text-sub)' }}>OCR 처리 중...</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <Upload size={24} style={{ color: 'var(--text-sub)' }} />
              <div style={{ fontSize: 13, color: 'var(--text)' }}>
                계약서 PDF 를 드래그하거나 클릭해서 선택
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                <FileText size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                PDF · JPG · PNG · 20MB 이하
              </div>
            </div>
          )}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".pdf,image/*"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
            e.target.value = '';
          }}
        />

        {error && (
          <div style={{
            marginTop: 12, padding: '8px 12px',
            background: '#fee2e2', color: '#991b1b',
            fontSize: 12, borderRadius: 4, border: '1px solid #fecaca',
          }}>
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
