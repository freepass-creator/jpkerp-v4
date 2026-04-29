'use client';

import { useState, useEffect } from 'react';
import { Upload, Pencil, FileXls, Plus, X, CircleNotch, Warning, CheckCircle } from '@phosphor-icons/react';
import { Dialog, DialogTrigger, DialogContent, DialogClose, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { fileToImageDataUrl } from '@/lib/pdf-to-image';
import type { Company, CompanyAccount, CompanyCard } from '@/lib/sample-companies';

/**
 * 회사 등록 — 자산등록 다이얼로그와 동일 패턴 (Tabs):
 *  1) 사업자등록증 OCR — Gemini /api/ocr/extract type=business_reg → 폼 자동 채움 → 계좌·카드 추가 → 등록
 *  2) 개별 입력 — 빈 폼
 *  3) 시트 (다건) — 추후 (현재 미구현, 계좌/카드는 시트엔 부적합)
 */

type FormState = {
  code: string;
  name: string;
  ceo: string;
  bizNo: string;
  corpNo: string;
  openDate: string;
  hqAddress: string;
  bizAddress: string;
  bizType: string;
  bizCategory: string;
  phone: string;
  email: string;
  entityType: 'corporate' | 'individual' | '';
  accounts: CompanyAccount[];
  cards: CompanyCard[];
};

const EMPTY_FORM: FormState = {
  code: '', name: '', ceo: '', bizNo: '', corpNo: '', openDate: '',
  hqAddress: '', bizAddress: '', bizType: '', bizCategory: '',
  phone: '', email: '', entityType: '',
  accounts: [], cards: [],
};

type Props = {
  /** 신규 등록 콜백. edit 모드에선 사용 안 함 */
  onCreate?: (company: Company) => void;
  /** 수정 콜백. initial 제공 시 사용 */
  onUpdate?: (company: Company) => void;
  /** 수정 모드 초기값. 제공 시 OCR 탭 숨기고 폼만 노출 */
  initial?: Company;
  /** 기존 회사코드 — 회사코드 자동 추천 + 중복 검사용 (수정 모드에선 자기 자신 코드 제외) */
  existingCodes?: string[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  showTrigger?: boolean;
};

/** CP01, CP02 ... 시퀀스에서 비어있는 다음 번호 추천 */
function suggestNextCode(existing: string[]): string {
  const used = new Set(existing);
  for (let i = 1; i < 100; i++) {
    const code = `CP${String(i).padStart(2, '0')}`;
    if (!used.has(code)) return code;
  }
  return 'CP01';
}

export function CompanyRegisterDialog({ onCreate, onUpdate, initial, existingCodes = [], open: openProp, onOpenChange, showTrigger = true }: Props) {
  const isEdit = Boolean(initial);
  const [openInner, setOpenInner] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : openInner;
  const setOpen = (v: boolean) => {
    if (!isControlled) setOpenInner(v);
    onOpenChange?.(v);
  };

  const [tab, setTab] = useState<'ocr' | 'manual'>('ocr');
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ocrPreview, setOcrPreview] = useState<string>('');

  // 다이얼로그 열릴 때 폼 초기화: edit 모드는 initial 채움, 신규는 회사코드 자동 추천
  useEffect(() => {
    if (!open) return;
    if (initial) {
      setForm({
        code: initial.code,
        name: initial.name,
        ceo: initial.ceo ?? '',
        bizNo: initial.bizNo ?? '',
        corpNo: initial.corpNo ?? '',
        openDate: initial.openDate ?? '',
        hqAddress: initial.hqAddress ?? '',
        bizAddress: initial.bizAddress ?? '',
        bizType: initial.bizType ?? '',
        bizCategory: initial.bizCategory ?? '',
        phone: initial.phone ?? '',
        email: initial.email ?? '',
        entityType: initial.entityType ?? '',
        accounts: initial.accounts ? [...initial.accounts] : [],
        cards: initial.cards ? [...initial.cards] : [],
      });
    } else {
      setForm((prev) => prev.code ? prev : { ...prev, code: suggestNextCode(existingCodes) });
    }
  }, [open, initial, existingCodes]);

  function reset() {
    setForm(EMPTY_FORM);
    setBusy(false);
    setError('');
    setOcrPreview('');
  }
  function handleClose(o: boolean) {
    setOpen(o);
    if (!o) setTimeout(reset, 100);
  }

  async function runOcr(file: File) {
    setError('');
    setBusy(true);
    try {
      const previewUrl = await fileToImageDataUrl(file).catch(() => '');
      setOcrPreview(previewUrl);

      const fd = new FormData();
      fd.append('file', file);
      fd.append('type', 'business_reg');
      const res = await fetch('/api/ocr/extract', { method: 'POST', body: fd });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'OCR 실패');
      const ex = json.extracted as Record<string, string | null>;

      setForm((prev) => ({
        ...prev,
        name: ex.partner_name ?? '',
        ceo: ex.ceo ?? '',
        bizNo: ex.biz_no ?? '',
        corpNo: ex.corp_no ?? '',
        openDate: ex.open_date ?? '',
        hqAddress: ex.hq_address ?? ex.address ?? '',
        bizAddress: ex.address ?? '',
        bizType: ex.industry ?? '',
        bizCategory: ex.category ?? '',
        email: ex.email ?? '',
        entityType: (ex.entity_type === 'individual' ? 'individual' : 'corporate'),
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function submit() {
    const missing: string[] = [];
    if (!form.code.trim()) missing.push('회사코드');
    if (!form.name.trim()) missing.push('법인명/상호');
    if (!form.bizNo.trim()) missing.push('사업자등록번호');
    if (missing.length) {
      const msg = `필수 항목 누락: ${missing.join(', ')}`;
      setError(msg);
      alert(msg);
      return;
    }
    const code = form.code.trim();
    // 수정 모드는 자기 자신 코드 제외하고 중복 검사
    const otherCodes = isEdit ? existingCodes.filter((c) => c !== initial?.code) : existingCodes;
    if (otherCodes.includes(code)) {
      const msg = `회사코드 ${code} 이미 존재합니다. 다른 코드를 입력하세요.`;
      setError(msg);
      alert(msg);
      return;
    }
    const company: Company = {
      code,
      name: form.name.trim(),
      ceo: form.ceo.trim(),
      bizNo: form.bizNo.trim(),
      corpNo: form.corpNo.trim() || undefined,
      hqAddress: form.hqAddress.trim(),
      bizAddress: form.bizAddress.trim() || undefined,
      bizType: form.bizType.trim(),
      bizCategory: form.bizCategory.trim(),
      phone: form.phone.trim(),
      openDate: form.openDate.trim() || undefined,
      email: form.email.trim() || undefined,
      entityType: form.entityType || undefined,
      accounts: form.accounts.filter((a) => a.bank.trim() && a.accountNo.trim()),
      cards: form.cards.filter((c) => c.cardName.trim() && c.cardNo.trim()),
    };
    if (isEdit) {
      onUpdate?.(company);
    } else {
      onCreate?.(company);
    }
    handleClose(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      {showTrigger && !isEdit && (
        <DialogTrigger asChild>
          <button className="btn btn-primary">
            <Plus size={14} weight="bold" /> 회사 등록
          </button>
        </DialogTrigger>
      )}
      <DialogContent title={isEdit ? '회사 수정' : '회사 등록 (사업자등록증 기준)'} size="xl">
        {!isEdit && (
          <Tabs value={tab} onValueChange={(v) => setTab(v as 'ocr' | 'manual')}>
            <TabsList>
              <TabsTrigger value="ocr">
                <Upload size={14} className="mr-1.5 inline" /> 사업자등록증 OCR
              </TabsTrigger>
              <TabsTrigger value="manual">
                <Pencil size={14} className="mr-1.5 inline" /> 개별 입력
              </TabsTrigger>
              <TabsTrigger value="sheet" disabled>
                <FileXls size={14} className="mr-1.5 inline" /> 시트 (다건)
              </TabsTrigger>
            </TabsList>

            <TabsContent value="ocr">
              <OcrStage busy={busy} onPick={runOcr} preview={ocrPreview} />
            </TabsContent>

            <TabsContent value="manual">
              {/* 개별 입력 탭: OcrStage 없이 폼만 */}
            </TabsContent>
          </Tabs>
        )}

        {/* 폼 — 신규/수정 공용 */}
        <CompanyForm form={form} setForm={setForm} />

        {error && <div className="alert alert-warn" style={{ marginTop: 8 }}><Warning size={14} /> <span>{error}</span></div>}

        <DialogFooter>
          <DialogClose asChild><button className="btn">취소</button></DialogClose>
          <button className="btn btn-primary" disabled={busy} onClick={submit}>
            {isEdit ? '수정' : '등록'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── OCR 업로드 영역 ─────────────────────────────── */
function OcrStage({ busy, onPick, preview }: { busy: boolean; onPick: (f: File) => void; preview: string }) {
  const [dragging, setDragging] = useState(false);
  return (
    <div className="space-y-3">
      <div className="alert alert-info">
        사업자등록증 PDF 또는 사진 업로드 → Gemini OCR이 사업자번호·법인명·대표자·주소·업태·업종을 자동 추출합니다.
        <strong> 회사코드 · 대표전화 · 계좌 · 카드</strong>는 등록증에 없으므로 아래 폼에서 직접 입력하세요.
      </div>
      <label
        className={`dropzone block ${dragging ? 'dragging' : ''} ${busy ? 'busy' : ''}`}
        onDragEnter={(e) => { e.preventDefault(); if (!busy) setDragging(true); }}
        onDragOver={(e) => { e.preventDefault(); if (!busy) setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault(); setDragging(false);
          if (busy) return;
          const f = e.dataTransfer?.files?.[0];
          if (f) onPick(f);
        }}
      >
        <input type="file" accept="image/*,.pdf" hidden disabled={busy}
               onChange={(e) => {
                 const f = e.target.files?.[0];
                 if (f) onPick(f);
                 e.target.value = '';
               }} />
        {busy ? (
          <>
            <CircleNotch size={26} className="mx-auto spin" style={{ color: 'var(--brand)' }} />
            <div className="mt-2 text-medium">OCR 진행 중...</div>
          </>
        ) : preview ? (
          <>
            <CheckCircle size={26} className="mx-auto" style={{ color: '#10b981' }} />
            <div className="mt-2 text-medium">분석 완료 — 아래 폼 확인</div>
            <div className="mt-1 text-weak">다른 파일 선택하면 재분석</div>
          </>
        ) : (
          <>
            <Upload size={26} className="mx-auto text-weak" />
            <div className="mt-2 text-medium">사업자등록증 업로드 — 클릭 또는 드래그&드롭</div>
            <div className="mt-1 text-weak">JPG / PNG / PDF</div>
          </>
        )}
      </label>
    </div>
  );
}

/* ─── 회사 폼 (OCR + 수동 공용) ─────────────────────── */
function CompanyForm({ form, setForm }: { form: FormState; setForm: (f: (prev: FormState) => FormState) => void }) {
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <div className="space-y-3" style={{ marginTop: 12 }}>
      <div className="form-grid">
        <Input label="회사코드 *" value={form.code} onChange={(v) => set('code', v)} placeholder="CP03" colSpan={1} />
        <Input label="법인명 / 상호 *" value={form.name} onChange={(v) => set('name', v)} colSpan={3} />
        <Input label="대표자" value={form.ceo} onChange={(v) => set('ceo', v)} colSpan={1} />
        <Input label="사업자등록번호 *" value={form.bizNo} onChange={(v) => set('bizNo', v)} placeholder="000-00-00000" colSpan={1} />
        <Input label="법인등록번호" value={form.corpNo} onChange={(v) => set('corpNo', v)} placeholder="000000-0000000" colSpan={1} />
        <Select label="구분" value={form.entityType}
                options={[['', '- 선택 -'], ['corporate', '법인'], ['individual', '개인']]}
                onChange={(v) => set('entityType', v as FormState['entityType'])} colSpan={1} />
        <Input label="개업일" value={form.openDate} onChange={(v) => set('openDate', v)} placeholder="YYYY-MM-DD" type="date" colSpan={1} />
        <Input label="대표전화" value={form.phone} onChange={(v) => set('phone', v)} placeholder="02-0000-0000" colSpan={1} />
        <Input label="이메일" value={form.email} onChange={(v) => set('email', v)} colSpan={2} />
        <Input label="본점주소" value={form.hqAddress} onChange={(v) => set('hqAddress', v)} colSpan={4} />
        <Input label="사업장주소 (본점과 다를 때만)" value={form.bizAddress} onChange={(v) => set('bizAddress', v)} colSpan={4} />
        <Input label="업태" value={form.bizType} onChange={(v) => set('bizType', v)} colSpan={2} />
        <Input label="업종" value={form.bizCategory} onChange={(v) => set('bizCategory', v)} colSpan={2} />
      </div>

      {/* 계좌 */}
      <RepeaterSection
        title="사용 계좌"
        items={form.accounts}
        onAdd={() => set('accounts', [...form.accounts, { bank: '', accountNo: '', holder: '', alias: '' }])}
        onRemove={(i) => set('accounts', form.accounts.filter((_, idx) => idx !== i))}
        renderItem={(item, i) => (
          <>
            <Input label="은행" value={item.bank} onChange={(v) => set('accounts', updateAt(form.accounts, i, { ...item, bank: v }))} placeholder="신한" colSpan={1} />
            <Input label="계좌번호" value={item.accountNo} onChange={(v) => set('accounts', updateAt(form.accounts, i, { ...item, accountNo: v }))} placeholder="110-123-456789" colSpan={2} />
            <Input label="예금주 (다를 때)" value={item.holder ?? ''} onChange={(v) => set('accounts', updateAt(form.accounts, i, { ...item, holder: v }))} colSpan={1} />
            <Input label="용도/별칭" value={item.alias ?? ''} onChange={(v) => set('accounts', updateAt(form.accounts, i, { ...item, alias: v }))} placeholder="운영비, 자동이체" colSpan={3} />
          </>
        )}
      />

      {/* 카드 */}
      <RepeaterSection
        title="법인 카드"
        items={form.cards}
        onAdd={() => set('cards', [...form.cards, { cardName: '', cardNo: '', brand: '', alias: '' }])}
        onRemove={(i) => set('cards', form.cards.filter((_, idx) => idx !== i))}
        renderItem={(item, i) => (
          <>
            <Input label="카드명" value={item.cardName} onChange={(v) => set('cards', updateAt(form.cards, i, { ...item, cardName: v }))} placeholder="법인 신한 BC" colSpan={2} />
            <Input label="카드번호" value={item.cardNo} onChange={(v) => set('cards', updateAt(form.cards, i, { ...item, cardNo: v }))} placeholder="****-****-****-1234" colSpan={2} />
            <Input label="카드사" value={item.brand ?? ''} onChange={(v) => set('cards', updateAt(form.cards, i, { ...item, brand: v }))} placeholder="신한" colSpan={1} />
            <Input label="용도/별칭" value={item.alias ?? ''} onChange={(v) => set('cards', updateAt(form.cards, i, { ...item, alias: v }))} placeholder="주유, 식대" colSpan={2} />
          </>
        )}
      />
    </div>
  );
}

function updateAt<T>(arr: T[], i: number, v: T): T[] {
  const next = arr.slice();
  next[i] = v;
  return next;
}

/* ─── 작은 폼 컴포넌트 ─────────────────────────────── */
function Input({
  label, value, onChange, placeholder, type = 'text', colSpan = 1,
}: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; colSpan?: 1|2|3|4 }) {
  const span = colSpan === 4 ? 'col-span-4' : colSpan === 3 ? 'col-span-3' : colSpan === 2 ? 'col-span-2' : '';
  return (
    <label className={`block ${span}`}>
      <span className="label">{label}</span>
      <input className="input w-full" type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </label>
  );
}
function Select({
  label, value, options, onChange, colSpan = 1,
}: { label: string; value: string; options: [string, string][]; onChange: (v: string) => void; colSpan?: 1|2|3|4 }) {
  const span = colSpan === 4 ? 'col-span-4' : colSpan === 3 ? 'col-span-3' : colSpan === 2 ? 'col-span-2' : '';
  return (
    <label className={`block ${span}`}>
      <span className="label">{label}</span>
      <select className="input w-full" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

/* ─── 반복 섹션 (계좌/카드 공용) ───────────────────── */
function RepeaterSection<T>({
  title, items, onAdd, onRemove, renderItem,
}: {
  title: string;
  items: T[];
  onAdd: () => void;
  onRemove: (i: number) => void;
  renderItem: (item: T, i: number) => React.ReactNode;
}) {
  return (
    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span className="text-medium">{title} <span className="text-weak">({items.length})</span></span>
        <button type="button" className="btn btn-sm" onClick={onAdd}><Plus size={12} weight="bold" /> 추가</button>
      </div>
      {items.length === 0 ? (
        <div className="text-weak text-xs" style={{ padding: '6px 0' }}>등록된 항목이 없습니다.</div>
      ) : (
        <div className="space-y-2">
          {items.map((item, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', background: 'var(--bg-sub, transparent)' }}>
              <div className="form-grid" style={{ flex: 1 }}>
                {renderItem(item, i)}
              </div>
              <button type="button" className="btn-ghost btn btn-sm" onClick={() => onRemove(i)} style={{ marginTop: 18 }}>
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
