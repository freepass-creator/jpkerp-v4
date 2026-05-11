'use client';

import { useState, useEffect, useMemo } from 'react';
import { Upload, Pencil, FileXls, Plus, X, CircleNotch, Warning, CheckCircle, ArrowCounterClockwise } from '@phosphor-icons/react';
import { Dialog, DialogTrigger, DialogContent, DialogClose, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { fileToImageDataUrl } from '@/lib/pdf-to-image';
import { getFirebaseAuth } from '@/lib/firebase/client';
import type { Company, CompanyAccount, CompanyCard } from '@/lib/sample-companies';
import { nextCompanyCode } from '@/lib/code-gen';
import { normalizeKoreanDate } from '@/lib/parsers/date';
import { cn } from '@/lib/cn';
import { useDialogShortcuts, countChanges } from '@/lib/use-dialog-shortcuts';

/**
 * 회사 등록·조회·수정·복사 — 자산 다이얼로그 패턴(4-mode + 색상) 적용.
 *
 *  - view      : readonly + 회색 dot. 행 더블클릭 / 코드 클릭 진입.
 *  - edit      : view 의 [수정] → editable + 황색 dot
 *  - create    : 신규(OCR 탭 또는 manual 탭) — 흰색
 *  - duplicate : 우클릭 → 복사 — editable + 녹색 dot, unique 비움
 */

export type CompanyDialogMode = 'view' | 'edit' | 'create' | 'duplicate';

/**
 * 은행 옵션 — 한국 운영자 인기순.
 * 1군(시중) → 2군(인터넷전문) → 3군(특수은행·외은) → 4군(지방은행) → 기타.
 */
const BANK_OPTIONS: [string, string][] = [
  ['', '- 은행 선택 -'],
  ['신한', '신한'],
  ['KB국민', 'KB국민'],
  ['하나', '하나'],
  ['우리', '우리'],
  ['NH농협', 'NH농협'],
  ['IBK기업', 'IBK기업'],
  ['카카오뱅크', '카카오뱅크'],
  ['토스뱅크', '토스뱅크'],
  ['케이뱅크', '케이뱅크'],
  ['새마을금고', '새마을금고'],
  ['신협', '신협'],
  ['SC제일', 'SC제일'],
  ['한국씨티', '한국씨티'],
  ['우체국', '우체국'],
  ['KDB산업', 'KDB산업'],
  ['수출입', '수출입'],
  ['부산', '부산'],
  ['대구', '대구'],
  ['경남', '경남'],
  ['광주', '광주'],
  ['전북', '전북'],
  ['제주', '제주'],
  ['HSBC', 'HSBC'],
  ['기타', '기타'],
];

const MODE_DOT: Record<CompanyDialogMode, string> = {
  view: '#9ca3af',       // 회색
  edit: '#f59e0b',       // 황색
  create: '#3b82f6',     // 파랑 (기본)
  duplicate: '#22c55e',  // 녹색
};

type FormState = {
  code: string;
  name: string;
  ceo: string;
  ceoType: string;
  bizNo: string;
  corpNo: string;
  openDate: string;
  hqAddress: string;
  bizAddress: string;
  bizType: string;
  bizCategory: string;
  phone: string;
  fax: string;
  email: string;
  entityType: 'corporate' | 'individual' | '';
  taxIssueDate: string;
  taxOffice: string;
  issueReason: string;
  singleTaxFlag: 'yes' | 'no' | '';
  accounts: CompanyAccount[];
  cards: CompanyCard[];
};

const EMPTY_FORM: FormState = {
  code: '', name: '', ceo: '', ceoType: '', bizNo: '', corpNo: '', openDate: '',
  hqAddress: '', bizAddress: '', bizType: '', bizCategory: '',
  phone: '', fax: '', email: '', entityType: '',
  taxIssueDate: '', taxOffice: '', issueReason: '', singleTaxFlag: '',
  accounts: [], cards: [],
};

type Props = {
  /** 신규 등록 콜백. edit 모드에선 사용 안 함 */
  onCreate?: (company: Company) => void;
  /** 수정 콜백. view/edit 모드에서 사용 */
  onUpdate?: (company: Company) => void;
  /** 초기값 — 제공되면 view 모드 기본 (mode 미지정 시) */
  initial?: Company;
  /** 명시적 모드 지정. 미지정 시 initial 유무로 결정 (view / create) */
  mode?: CompanyDialogMode;
  /** 기존 회사코드 — 회사코드 자동 추천 + 중복 검사용 (수정 모드에선 자기 자신 코드 제외) */
  existingCodes?: string[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  showTrigger?: boolean;
};

export function CompanyRegisterDialog({ onCreate, onUpdate, initial, mode, existingCodes = [], open: openProp, onOpenChange, showTrigger = true }: Props) {
  // 모드 결정: 명시 mode 우선, 없으면 initial 유무 (view / create)
  const initialMode: CompanyDialogMode = mode ?? (initial ? 'view' : 'create');
  const [currentMode, setCurrentMode] = useState<CompanyDialogMode>(initialMode);

  const [openInner, setOpenInner] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : openInner;
  const setOpen = (v: boolean) => {
    if (!isControlled) setOpenInner(v);
    onOpenChange?.(v);
  };

  const [tab, setTab] = useState<'ocr' | 'manual'>('ocr');
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [initialSnapshot, setInitialSnapshot] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ocrPreview, setOcrPreview] = useState<string>('');

  const isReadonly = currentMode === 'view';
  const showTabs = currentMode === 'create';  // view/edit/duplicate 는 폼만

  // 다이얼로그 열릴 때 폼 초기화 + 모드 동기화
  useEffect(() => {
    if (!open) return;
    setCurrentMode(initialMode);
    if (initial) {
      const isDup = initialMode === 'duplicate';
      const next: FormState = {
        // duplicate 시 회사코드/사업자번호/법인번호는 unique — 비움
        code: isDup ? nextCompanyCode(existingCodes) : initial.code,
        name: isDup ? '' : initial.name,
        ceo: initial.ceo ?? '',
        ceoType: initial.ceoType ?? '',
        bizNo: isDup ? '' : (initial.bizNo ?? ''),
        corpNo: isDup ? '' : (initial.corpNo ?? ''),
        openDate: initial.openDate ?? '',
        hqAddress: initial.hqAddress ?? '',
        bizAddress: initial.bizAddress ?? '',
        bizType: initial.bizType ?? '',
        bizCategory: initial.bizCategory ?? '',
        phone: isDup ? '' : (initial.phone ?? ''),
        fax: isDup ? '' : (initial.fax ?? ''),
        email: initial.email ?? '',
        entityType: initial.entityType ?? '',
        taxIssueDate: initial.taxIssueDate ?? '',
        taxOffice: initial.taxOffice ?? '',
        issueReason: initial.issueReason ?? '',
        singleTaxFlag: initial.singleTaxFlag === true ? 'yes' : initial.singleTaxFlag === false ? 'no' : '',
        // duplicate 시 계좌/카드도 비움 (다른 회사 명의이므로)
        accounts: isDup ? [] : (initial.accounts ? [...initial.accounts] : []),
        cards: isDup ? [] : (initial.cards ? [...initial.cards] : []),
      };
      setForm(next);
      setInitialSnapshot(next);
    } else {
      setForm((prev) => {
        const seeded = prev.code ? prev : { ...prev, code: nextCompanyCode(existingCodes) };
        setInitialSnapshot(seeded);
        return seeded;
      });
    }
  }, [open, initial, existingCodes, initialMode]);

  // 변경 카운트 — JSON 직렬화 비교라 useMemo 로 비싼 호출 줄임
  const dirtyCount = useMemo(
    () => countChanges(initialSnapshot as unknown as Record<string, unknown>, form as unknown as Record<string, unknown>),
    [initialSnapshot, form],
  );

  function reset() {
    setForm(EMPTY_FORM);
    setInitialSnapshot(EMPTY_FORM);
    setBusy(false);
    setError('');
    setOcrPreview('');
  }
  function handleClose(o: boolean) {
    if (!o && currentMode === 'edit' && dirtyCount > 0) {
      if (!window.confirm('미저장 변경이 있습니다. 닫을까요?')) return;
    }
    setOpen(o);
    if (!o) setTimeout(reset, 100);
  }

  // 키보드 단축키 — Esc 닫기 / Ctrl+S 저장 (저장 가능 모드에서만)
  const canSave =
    (currentMode === 'edit' && dirtyCount > 0) ||
    currentMode === 'create' ||
    currentMode === 'duplicate';
  useDialogShortcuts({
    open,
    onClose: () => handleClose(false),
    onSave: canSave ? submit : undefined,
  });

  async function runOcr(file: File) {
    setError('');
    setBusy(true);
    try {
      const previewUrl = await fileToImageDataUrl(file).catch(() => '');
      setOcrPreview(previewUrl);

      const fd = new FormData();
      fd.append('file', file);
      fd.append('type', 'business_reg');
      const user = getFirebaseAuth().currentUser;
      const idToken = user ? await user.getIdToken() : '';
      const res = await fetch('/api/ocr/extract', {
        method: 'POST',
        headers: idToken ? { Authorization: `Bearer ${idToken}` } : undefined,
        body: fd,
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'OCR 실패');
      const ex = json.extracted as Record<string, string | null>;

      const single = (ex as Record<string, unknown>).single_tax_flag;
      setForm((prev) => ({
        ...prev,
        name: ex.partner_name ?? '',
        ceo: ex.ceo ?? '',
        ceoType: ex.ceo_type ?? '',
        bizNo: ex.biz_no ?? '',
        corpNo: ex.corp_no ?? '',
        openDate: normalizeKoreanDate(ex.open_date) ?? '',
        hqAddress: ex.hq_address ?? ex.address ?? '',
        bizAddress: ex.address ?? '',
        bizType: ex.industry ?? '',
        bizCategory: ex.category ?? '',
        email: ex.email ?? '',
        entityType: (ex.entity_type === 'individual' ? 'individual' : 'corporate'),
        taxIssueDate: normalizeKoreanDate(ex.issue_date) ?? '',
        taxOffice: ex.tax_office ?? '',
        issueReason: ex.issue_reason ?? '',
        singleTaxFlag: single === true ? 'yes' : single === false ? 'no' : '',
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
    // 수정 모드는 자기 자신 코드 제외하고 중복 검사 (duplicate/create 는 모두 검사)
    const otherCodes = currentMode === 'edit'
      ? existingCodes.filter((c) => c !== initial?.code)
      : existingCodes;
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
      ceoType: form.ceoType.trim() || undefined,
      bizNo: form.bizNo.trim(),
      corpNo: form.corpNo.trim() || undefined,
      hqAddress: form.hqAddress.trim(),
      bizAddress: form.bizAddress.trim() || undefined,
      bizType: form.bizType.trim(),
      bizCategory: form.bizCategory.trim(),
      phone: form.phone.trim(),
      fax: form.fax.trim() || undefined,
      openDate: form.openDate.trim() || undefined,
      email: form.email.trim() || undefined,
      entityType: form.entityType || undefined,
      taxIssueDate: form.taxIssueDate.trim() || undefined,
      taxOffice: form.taxOffice.trim() || undefined,
      issueReason: form.issueReason.trim() || undefined,
      singleTaxFlag: form.singleTaxFlag === 'yes' ? true : form.singleTaxFlag === 'no' ? false : undefined,
      accounts: form.accounts.filter((a) => a.bank.trim() && a.accountNo.trim()),
      cards: form.cards.filter((c) => c.cardName.trim() && c.cardNo.trim()),
    };
    if (currentMode === 'edit') {
      onUpdate?.(company);
    } else {
      // create / duplicate 모두 신규 회사 발급
      onCreate?.(company);
    }
    handleClose(false);
  }

  // 모드별 타이틀 + 색깔 dot
  const titleText =
    currentMode === 'view'      ? `회사 상세 — ${initial?.code ?? ''} ${initial?.name ?? ''}` :
    currentMode === 'edit'      ? `회사 수정 — ${initial?.code ?? ''} ${initial?.name ?? ''}` :
    currentMode === 'duplicate' ? '회사 복사 (정보 복제)' :
    '회사 등록 (사업자등록증 기준)';

  const titleNode = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span aria-hidden style={{
        display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
        background: MODE_DOT[currentMode], flexShrink: 0,
      }} />
      <span>{titleText}</span>
    </span>
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      {showTrigger && currentMode === 'create' && (
        <DialogTrigger asChild>
          <button className="btn btn-primary">
            <Plus size={14} weight="bold" /> 회사 등록
          </button>
        </DialogTrigger>
      )}
      <DialogContent title={titleNode} size="xl">
        {currentMode === 'duplicate' && (
          <div className="alert alert-info mb-3">
            정보를 복제했습니다. <strong>회사코드 · 사업자번호 · 법인번호 · 대표전화 · 계좌 · 카드</strong>는 비워졌습니다. 새 회사 정보로 채워주세요.
          </div>
        )}

        {showTabs && (
          <Tabs value={tab} onValueChange={(v) => setTab(v as 'ocr' | 'manual')}>
            <TabsList>
              <TabsTrigger value="ocr">
                <Upload size={14} className="mr-1.5 inline" /> OCR
              </TabsTrigger>
              <TabsTrigger value="sheet" disabled>
                <FileXls size={14} className="mr-1.5 inline" /> 시트
              </TabsTrigger>
              <TabsTrigger value="manual">
                <Pencil size={14} className="mr-1.5 inline" /> 단건
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

        {/* 폼 — fieldset 으로 readonly + 모드별 색상. 회사코드는 view/edit 에선 항상 readOnly. */}
        <fieldset
          disabled={isReadonly}
          className={cn('form-stack', `form-mode-${currentMode}`)}
          style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
        >
          <CompanyForm form={form} setForm={setForm} codeReadOnly={currentMode === 'view' || currentMode === 'edit'} />
        </fieldset>

        {error && <div className="alert alert-warn" style={{ marginTop: 8 }}><Warning size={14} /> <span>{error}</span></div>}

        <DialogFooter>
          {currentMode === 'view' ? (
            <>
              <DialogClose asChild><button className="btn">닫기</button></DialogClose>
              <button className="btn btn-primary" onClick={() => setCurrentMode('edit')}>
                <Pencil size={14} weight="bold" /> 수정
              </button>
            </>
          ) : currentMode === 'edit' ? (
            <>
              <button
                className="btn"
                style={{ marginRight: 'auto' }}
                onClick={() => { setError(''); setCurrentMode('view'); }}
              >
                취소 (조회로 복귀)
              </button>
              <DialogClose asChild><button className="btn">닫기</button></DialogClose>
              {dirtyCount > 0 && (
                <span className="text-weak" style={{ fontSize: 12, marginRight: 4 }}>
                  변경 {dirtyCount}건 미저장
                </span>
              )}
              <button
                className="btn btn-primary"
                disabled={busy || dirtyCount === 0}
                onClick={submit}
              >
                저장
              </button>
            </>
          ) : currentMode === 'duplicate' ? (
            <>
              <DialogClose asChild><button className="btn">취소</button></DialogClose>
              <button className="btn btn-primary" disabled={busy} onClick={submit}>등록</button>
            </>
          ) : (
            // create
            <>
              <button
                className="btn"
                style={{ marginRight: 'auto' }}
                disabled={busy}
                onClick={reset}
              >
                <ArrowCounterClockwise size={14} weight="bold" /> 초기화
              </button>
              <DialogClose asChild><button className="btn">취소</button></DialogClose>
              <button className="btn btn-primary" disabled={busy} onClick={submit}>등록</button>
            </>
          )}
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
function CompanyForm({
  form, setForm, codeReadOnly = true,
}: {
  form: FormState;
  setForm: (f: (prev: FormState) => FormState) => void;
  /** 회사코드 입력 잠금 — view/edit 은 잠금, create/duplicate 은 자동 추천값 편집 가능 */
  codeReadOnly?: boolean;
}) {
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <div className="space-y-3" style={{ marginTop: 12 }}>
      <div className="form-grid">
        <Input label={codeReadOnly ? '회사코드 (변경 불가)' : '회사코드 (자동 부여 · 편집 가능)'} value={form.code} onChange={(v) => set('code', v)} placeholder="CP01" colSpan={1} readOnly={codeReadOnly} />
        <Input label="법인명 / 상호 *" value={form.name} onChange={(v) => set('name', v)} colSpan={3} />
        <Input label="대표자" value={form.ceo} onChange={(v) => set('ceo', v)} colSpan={1} />
        <Input label="사업자등록번호 *" value={form.bizNo} onChange={(v) => set('bizNo', v)} placeholder="000-00-00000" colSpan={1} />
        <Input label="법인등록번호" value={form.corpNo} onChange={(v) => set('corpNo', v)} placeholder="000000-0000000" colSpan={1} />
        <Select label="구분" value={form.entityType}
                options={[['', '- 선택 -'], ['corporate', '법인'], ['individual', '개인']]}
                onChange={(v) => set('entityType', v as FormState['entityType'])} colSpan={1} />
        <Input label="개업일" value={form.openDate} onChange={(v) => set('openDate', v)} placeholder="YYYY-MM-DD" type="date" colSpan={1} />
        <Input label="대표전화" value={form.phone} onChange={(v) => set('phone', v)} placeholder="02-0000-0000" colSpan={1} />
        <Input label="팩스" value={form.fax} onChange={(v) => set('fax', v)} placeholder="02-0000-0000" colSpan={1} />
        <Input label="이메일" value={form.email} onChange={(v) => set('email', v)} colSpan={1} />
        <Input label="본점주소" value={form.hqAddress} onChange={(v) => set('hqAddress', v)} colSpan={4} />
        <Input label="사업장주소 (본점과 다를 때만)" value={form.bizAddress} onChange={(v) => set('bizAddress', v)} colSpan={4} />
        <Input label="업태 (멀티값은 콤마 구분)" value={form.bizType} onChange={(v) => set('bizType', v)} placeholder="서비스, 부동산업" colSpan={2} />
        <Input label="종목 (멀티값은 콤마 구분)" value={form.bizCategory} onChange={(v) => set('bizCategory', v)} placeholder="렌터카, 매매업" colSpan={2} />
        <Input label="대표유형" value={form.ceoType} onChange={(v) => set('ceoType', v)} placeholder="(보통 비어있음)" colSpan={1} />
        <Input label="발급일자" value={form.taxIssueDate} onChange={(v) => set('taxIssueDate', v)} placeholder="YYYY-MM-DD" type="date" colSpan={1} />
        <Input label="발급 세무서" value={form.taxOffice} onChange={(v) => set('taxOffice', v)} placeholder="강서세무서" colSpan={1} />
        <Select label="사업자단위 과세" value={form.singleTaxFlag}
                options={[['', '- 미선택 -'], ['yes', '여'], ['no', '부']]}
                onChange={(v) => set('singleTaxFlag', v as FormState['singleTaxFlag'])} colSpan={1} />
        <Input label="발급사유" value={form.issueReason} onChange={(v) => set('issueReason', v)} placeholder="(보통 비어있음)" colSpan={4} />
      </div>

      {/* 계좌 */}
      <RepeaterSection
        title="사용 계좌"
        items={form.accounts}
        onAdd={() => set('accounts', [...form.accounts, { bank: '', accountNo: '', holder: '', alias: '' }])}
        onRemove={(i) => set('accounts', form.accounts.filter((_, idx) => idx !== i))}
        renderItem={(item, i) => (
          <>
            <Select label="은행" value={item.bank} options={BANK_OPTIONS} onChange={(v) => set('accounts', updateAt(form.accounts, i, { ...item, bank: v }))} colSpan={1} />
            <Input label="계좌번호" value={item.accountNo} onChange={(v) => set('accounts', updateAt(form.accounts, i, { ...item, accountNo: v }))} placeholder="110-123-456789" colSpan={2} />
            <Input label="예금주 (다를 때)" value={item.holder ?? ''} onChange={(v) => set('accounts', updateAt(form.accounts, i, { ...item, holder: v }))} colSpan={1} />
            <Input label="용도/별칭" value={item.alias ?? ''} onChange={(v) => set('accounts', updateAt(form.accounts, i, { ...item, alias: v }))} placeholder="운영비, 자동이체" colSpan={4} />
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
  label, value, onChange, placeholder, type = 'text', colSpan = 1, readOnly = false,
}: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; colSpan?: 1|2|3|4; readOnly?: boolean }) {
  const span = colSpan === 4 ? 'col-span-4' : colSpan === 3 ? 'col-span-3' : colSpan === 2 ? 'col-span-2' : '';
  return (
    <label className={`block ${span}`}>
      <span className="label">{label}</span>
      <input
        className="input w-full"
        type={type}
        value={value}
        onChange={(e) => !readOnly && onChange(e.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
        style={readOnly ? { background: 'var(--bg-disabled)', color: 'var(--text-main)', cursor: 'default' } : undefined}
        title={readOnly ? '코드는 등록 후 변경 불가' : undefined}
      />
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
