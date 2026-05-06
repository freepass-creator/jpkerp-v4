'use client';

/**
 * CustomerEditDialog — 고객 조회 / 수정 / 복사 다이얼로그.
 * 자산 다이얼로그(asset-edit-dialog) 와 동일한 4-mode 패턴.
 *
 * mode='view'      — readonly. 회색 dot. [닫기][수정→edit] (선택적 [삭제])
 * mode='edit'      — editable. 황색 dot. [취소→view][닫기][저장]
 * mode='duplicate' — editable. 녹색 dot. unique 필드 비움. [취소][등록]
 *
 * 신규 고객 직접 등록(create) 은 본 다이얼로그에서 지원하지 않음 — 계약 등록 시 자동 누적.
 * 다만 동일한 import 표면을 위해 mode='create' 도 인자로 허용 (내부에서 'duplicate' 와 동일 처리).
 */

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogClose, DialogFooter } from '@/components/ui/dialog';
import { cn } from '@/lib/cn';
import type { Customer, CustomerKind } from '@/lib/sample-customers';
import type { Company } from '@/lib/sample-companies';

export type CustomerDialogMode = 'view' | 'edit' | 'create' | 'duplicate';

const MODE_DOT: Record<CustomerDialogMode, string> = {
  view: '#9ca3af',
  edit: '#f59e0b',
  create: '#3b82f6',
  duplicate: '#22c55e',
};

const KIND_OPTIONS: CustomerKind[] = ['개인', '사업자', '법인'];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: CustomerDialogMode;
  initial: Customer;
  companies: readonly Company[];
  onSave: (next: Customer) => void;
  onDelete?: () => void;
};

type FormState = {
  code: string;
  companyCode: string;
  name: string;
  kind: CustomerKind;
  ident: string;
  phone: string;
  email: string;
  address: string;
  licenseNo: string;
  emergencyPhone: string;
  emergencyRelation: string;
  bizName: string;
  bizAddress: string;
};

function customerToForm(c: Customer): FormState {
  return {
    code: c.code,
    companyCode: c.companyCode,
    name: c.name,
    kind: c.kind,
    ident: c.ident ?? '',
    phone: c.phone ?? '',
    email: c.email ?? '',
    address: c.address ?? '',
    licenseNo: c.licenseNo ?? '',
    emergencyPhone: c.emergencyPhone ?? '',
    emergencyRelation: '',  // Customer 에 emergencyRelation 필드 없음 — 계약에만 존재
    bizName: c.bizName ?? '',
    bizAddress: c.bizAddress ?? '',
  };
}

function formToCustomer(f: FormState, base: Customer): Customer {
  return {
    ...base,
    code: f.code.trim() || base.code,
    companyCode: f.companyCode.trim(),
    name: f.name.trim(),
    kind: f.kind,
    ident: f.ident.trim() || undefined,
    phone: f.phone.trim(),
    email: f.email.trim() || undefined,
    address: f.address.trim() || undefined,
    licenseNo: f.licenseNo.trim() || undefined,
    emergencyPhone: f.emergencyPhone.trim() || undefined,
    bizName: f.bizName.trim() || undefined,
    bizAddress: f.bizAddress.trim() || undefined,
  };
}

export function CustomerEditDialog({ open, onOpenChange, mode, initial, companies, onSave, onDelete }: Props) {
  const [currentMode, setCurrentMode] = useState<CustomerDialogMode>(mode);
  const [form, setForm] = useState<FormState>(() => customerToForm(initial));

  useEffect(() => {
    if (!open) return;
    setCurrentMode(mode);
    if (mode === 'duplicate') {
      // unique 필드 비움 — 동일인 재등록 방지 + 코드는 새로 발급되어야 함
      const f = customerToForm(initial);
      setForm({ ...f, code: '', name: '', ident: '', phone: '', licenseNo: '', email: '' });
    } else {
      setForm(customerToForm(initial));
    }
  }, [open, mode, initial]);

  const isReadonly = currentMode === 'view';

  const titleText =
    currentMode === 'view'      ? `고객 상세 — ${initial.code} ${initial.name}` :
    currentMode === 'edit'      ? `고객 수정 — ${initial.code} ${initial.name}` :
    currentMode === 'duplicate' ? '고객 복사 (정보 복제)' :
    '고객 등록';

  const titleNode = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span aria-hidden style={{
        display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
        background: MODE_DOT[currentMode], flexShrink: 0,
      }} />
      <span>{titleText}</span>
    </span>
  );

  function handleSave() {
    if (!form.name.trim()) { alert('고객명 입력'); return; }
    if (!form.phone.trim()) { alert('연락처 입력'); return; }
    if (!form.companyCode.trim()) { alert('회사코드 선택'); return; }
    onSave(formToCustomer(form, initial));
    onOpenChange(false);
  }

  function handleDeleteClick() {
    onDelete?.();
    onOpenChange(false);
  }

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const codeReadOnly = currentMode === 'view' || currentMode === 'edit';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={titleNode} size="lg">
        {currentMode === 'duplicate' && (
          <div className="alert alert-info mb-3">
            정보를 복제했습니다. <strong>고객코드 · 이름 · 등록번호 · 연락처 · 면허번호 · 이메일</strong>은 비워졌습니다.
          </div>
        )}

        <fieldset
          disabled={isReadonly}
          className={cn('form-stack', `form-mode-${currentMode}`)}
          style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
        >
          <div className="form-section">
            <div className="form-section-title">기본 정보</div>
            <div className="form-grid">
              <Input label={codeReadOnly ? '고객코드 (변경 불가)' : '고객코드 (자동 부여)'}
                     value={form.code} onChange={(v) => set('code', v)}
                     placeholder="CP01CU0001" colSpan={1} readOnly={codeReadOnly} />
              <label className="block col-span-1">
                <span className="label label-required">회사</span>
                <select className="input w-full" value={form.companyCode}
                        onChange={(e) => set('companyCode', e.target.value)}>
                  <option value="">- 선택 -</option>
                  {companies.filter((c) => !c.deletedAt).map((c) => (
                    <option key={c.code} value={c.code}>{c.code} {c.name}</option>
                  ))}
                </select>
              </label>
              <Input label="이름" value={form.name} onChange={(v) => set('name', v)} colSpan={1} required />
              <label className="block col-span-1">
                <span className="label label-required">신분</span>
                <select className="input w-full" value={form.kind}
                        onChange={(e) => set('kind', e.target.value as CustomerKind)}>
                  {KIND_OPTIONS.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
              </label>
              <Input label="등록번호" value={form.ident} onChange={(v) => set('ident', v)}
                     placeholder={form.kind === '사업자' ? '000-00-00000' : '000000-0000000'} colSpan={2} />
              <Input label="연락처" value={form.phone} onChange={(v) => set('phone', v)}
                     placeholder="010-1234-5678" colSpan={1} required />
              <Input label="이메일" value={form.email} onChange={(v) => set('email', v)} colSpan={1} />
              <Input label="실거주지" value={form.address} onChange={(v) => set('address', v)} colSpan={4} />
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-title">운전 정보</div>
            <div className="form-grid">
              <Input label="운전면허번호" value={form.licenseNo} onChange={(v) => set('licenseNo', v)}
                     placeholder="00-00-000000-00" colSpan={2} />
              <Input label="비상연락처" value={form.emergencyPhone} onChange={(v) => set('emergencyPhone', v)}
                     placeholder="010-0000-0000" colSpan={2} />
            </div>
          </div>

          {(form.kind === '사업자' || form.kind === '법인') && (
            <div className="form-section">
              <div className="form-section-title">사업자 정보</div>
              <div className="form-grid">
                <Input label="상호" value={form.bizName} onChange={(v) => set('bizName', v)} colSpan={2} />
                <Input label="사업장 소재지" value={form.bizAddress} onChange={(v) => set('bizAddress', v)} colSpan={4} />
              </div>
            </div>
          )}
        </fieldset>

        <DialogFooter>
          {currentMode === 'view' ? (
            <>
              {onDelete && (
                <button className="btn" style={{ marginRight: 'auto', color: 'var(--danger, #dc2626)' }}
                        onClick={handleDeleteClick}>
                  삭제
                </button>
              )}
              <DialogClose asChild><button className="btn">닫기</button></DialogClose>
              <button className="btn btn-primary" onClick={() => setCurrentMode('edit')}>수정</button>
            </>
          ) : currentMode === 'edit' ? (
            <>
              <button className="btn" style={{ marginRight: 'auto' }}
                      onClick={() => { setForm(customerToForm(initial)); setCurrentMode('view'); }}>
                취소 (조회로 복귀)
              </button>
              <DialogClose asChild><button className="btn">닫기</button></DialogClose>
              <button className="btn btn-primary" onClick={handleSave}>저장</button>
            </>
          ) : (
            // duplicate / create
            <>
              <DialogClose asChild><button className="btn">취소</button></DialogClose>
              <button className="btn btn-primary" onClick={handleSave}>등록</button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Input({
  label, value, onChange, placeholder, colSpan = 1, readOnly = false, required = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  colSpan?: 1 | 2 | 3 | 4;
  readOnly?: boolean;
  required?: boolean;
}) {
  const span = colSpan === 4 ? 'col-span-4' : colSpan === 3 ? 'col-span-3' : colSpan === 2 ? 'col-span-2' : '';
  return (
    <label className={`block ${span}`}>
      <span className={`label${required ? ' label-required' : ''}`}>
        {label}
      </span>
      <input
        className="input w-full"
        value={value}
        onChange={(e) => !readOnly && onChange(e.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
        style={readOnly ? { background: 'var(--bg-disabled)', color: 'var(--text-sub)', cursor: 'not-allowed' } : undefined}
      />
    </label>
  );
}
