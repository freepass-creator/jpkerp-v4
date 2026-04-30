'use client';

import { useState, useRef, useMemo, useEffect } from 'react';
import { UploadSimple, Pencil, FileXls, Plus, X, CheckCircle, Warning } from '@phosphor-icons/react';
import { Dialog, DialogTrigger, DialogContent, DialogClose, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { parseBankExcel, parseBankSheet, type BankImportResult } from '@/lib/bank-import';
import type { LedgerEntry, LedgerMethod } from '@/lib/sample-finance';
import type { Company, CompanyAccount } from '@/lib/sample-companies';

/**
 * 계좌내역 등록 — 자산등록 다이얼로그와 동일 패턴 (Tabs):
 *  1) 엑셀 업로드 — 회사·계좌 dropdown → 드롭존 → 헤더 자동 검출 → 미리보기 → 일괄 등록
 *  2) 개별 입력 — 단건 폼 (회사·계좌 dropdown + 거래정보)
 *  3) 시트 (다건) — 회사·계좌 dropdown + 텍스트 붙여넣기 → 미리보기 → 일괄 등록
 *
 * 회사 미선택 시 모든 입력 차단 (드롭존 / 분석 / 등록 disabled).
 */

type Props = {
  onCreate: (entries: LedgerEntry[]) => void;
  /** 등록된 회사 목록 — 회사 dropdown 옵션. 비어있으면 다이얼로그에 안내 표시. */
  companies: Company[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  showTrigger?: boolean;
};

const METHODS: LedgerMethod[] = ['자동이체', '카드', '인터넷뱅킹', '현금', '무통장', '기타'];

/** 계좌 객체 → "은행 계좌번호" 표기 */
function formatAccount(a: CompanyAccount): string {
  return `${a.bank} ${a.accountNo}`.trim();
}

export function LedgerRegisterDialog({ onCreate, companies, open: openProp, onOpenChange, showTrigger = true }: Props) {
  const [openInner, setOpenInner] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : openInner;
  const setOpen = (v: boolean) => {
    if (!isControlled) setOpenInner(v);
    onOpenChange?.(v);
  };

  // 한 입력 = 한 통장. 모든 탭이 공유 (탭 전환해도 유지)
  const [companyCode, setCompanyCode] = useState('');
  const [account, setAccount] = useState('');

  // 회사 변경 시 계좌 자동 선택 reset
  useEffect(() => {
    setAccount('');
  }, [companyCode]);

  const selectedCompany = useMemo(
    () => companies.find((c) => c.code === companyCode) ?? null,
    [companies, companyCode],
  );

  const [result, setResult] = useState<BankImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>('');
  const [sheetText, setSheetText] = useState('');

  function reset() {
    setResult(null);
    setBusy(false);
    setError('');
    setSheetText('');
  }
  function handleClose(o: boolean) {
    setOpen(o);
    if (!o) reset();
  }

  function ctxValid(): boolean {
    if (!companyCode) {
      setError('회사를 먼저 선택하세요.');
      return false;
    }
    if (!account) {
      setError('계좌를 선택하세요. 등록된 계좌가 없으면 회사정보에서 먼저 추가하세요.');
      return false;
    }
    return true;
  }

  async function loadFile(file: File) {
    if (!ctxValid()) return;
    setError('');
    setBusy(true);
    try {
      const r = await parseBankExcel(file, { companyCode, account: account.trim() });
      setResult(r);
      if (!r.detected) setError('헤더(거래일·입금·출금·잔액)를 찾지 못했습니다. 파일을 확인하세요.');
      else if (!r.entries.length) setError(`인식된 거래가 없습니다. (전체 ${r.total} / 건너뜀 ${r.skipped})`);
    } catch (e) {
      setError(`파일 읽기 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  function loadSheet() {
    if (!ctxValid()) return;
    setError('');
    const r = parseBankSheet(sheetText, { companyCode, account: account.trim() });
    setResult(r);
    if (!r.detected) setError('헤더(거래일·입금·출금·잔액)를 찾지 못했습니다. 헤더 행이 포함되었는지 확인하세요.');
    else if (!r.entries.length) setError(`인식된 거래가 없습니다. (전체 ${r.total} / 건너뜀 ${r.skipped})`);
  }

  function commit(entries: LedgerEntry[]) {
    onCreate(entries);
    setOpen(false);
    setTimeout(reset, 100);
  }

  function removeFromResult(id: string) {
    setResult((prev) => prev ? { ...prev, entries: prev.entries.filter((e) => e.id !== id) } : prev);
  }

  const noCompanies = companies.length === 0;
  const ctxLocked = !companyCode || !account;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      {showTrigger && (
        <DialogTrigger asChild>
          <button className="btn btn-primary">
            <Plus size={14} weight="bold" /> 거래 등록
          </button>
        </DialogTrigger>
      )}
      <DialogContent title="계좌내역 등록 (통장 거래내역 기준)" size="xl">
        <Tabs defaultValue="excel">
          <TabsList>
            <TabsTrigger value="excel">
              <UploadSimple size={14} className="mr-1.5 inline" /> 엑셀 업로드
            </TabsTrigger>
            <TabsTrigger value="manual">
              <Pencil size={14} className="mr-1.5 inline" /> 개별 입력
            </TabsTrigger>
            <TabsTrigger value="sheet">
              <FileXls size={14} className="mr-1.5 inline" /> 시트 (다건)
            </TabsTrigger>
          </TabsList>

          {noCompanies && (
            <div className="alert alert-warn" style={{ marginTop: 8 }}>
              <Warning size={14} />
              <span>등록된 회사가 없습니다. <strong>일반관리 → 회사정보</strong>에서 사업자등록증 OCR로 회사 먼저 등록하세요.</span>
            </div>
          )}

          <TabsContent value="excel">
            {result && result.entries.length > 0 ? (
              <ResultPreview result={result} onRemove={removeFromResult} onConfirm={() => commit(result.entries)} onReset={reset} />
            ) : (
              <ExcelStage
                companies={companies} selectedCompany={selectedCompany}
                companyCode={companyCode} setCompanyCode={setCompanyCode}
                account={account} setAccount={setAccount}
                busy={busy} error={error} onPick={loadFile}
                ctxLocked={ctxLocked}
              />
            )}
          </TabsContent>

          <TabsContent value="manual">
            <ManualForm
              companies={companies} selectedCompany={selectedCompany}
              companyCode={companyCode} setCompanyCode={setCompanyCode}
              account={account} setAccount={setAccount}
              ctxLocked={ctxLocked}
              onSubmit={(e) => commit([e])}
            />
          </TabsContent>

          <TabsContent value="sheet">
            {result && result.entries.length > 0 ? (
              <ResultPreview result={result} onRemove={removeFromResult} onConfirm={() => commit(result.entries)} onReset={reset} />
            ) : (
              <SheetStage
                companies={companies} selectedCompany={selectedCompany}
                companyCode={companyCode} setCompanyCode={setCompanyCode}
                account={account} setAccount={setAccount}
                text={sheetText} setText={setSheetText}
                error={error} onParse={loadSheet}
                onClear={() => { setSheetText(''); setError(''); }}
                ctxLocked={ctxLocked}
              />
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

/* ─── 회사 + 계좌 dropdown row (각 탭 상단 공용) ─── */
function CtxRow({
  companies, selectedCompany,
  companyCode, setCompanyCode, account, setAccount,
}: {
  companies: Company[]; selectedCompany: Company | null;
  companyCode: string; setCompanyCode: (v: string) => void;
  account: string; setAccount: (v: string) => void;
}) {
  const accounts = selectedCompany?.accounts ?? [];
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <label style={{ flex: '0 0 200px' }}>
        <span className="label label-required">회사</span>
        <select className="input w-full" value={companyCode} onChange={(e) => setCompanyCode(e.target.value)}>
          <option value="">- 회사 선택 -</option>
          {companies.map((c) => (
            <option key={c.code} value={c.code}>{c.code} · {c.name}</option>
          ))}
        </select>
      </label>
      <label style={{ flex: 1 }}>
        <span className="label label-required">계좌</span>
        <select className="input w-full" value={account} onChange={(e) => setAccount(e.target.value)} disabled={!companyCode}>
          <option value="">{companyCode ? (accounts.length === 0 ? '- 등록된 계좌 없음 (회사정보에서 추가) -' : '- 계좌 선택 -') : '- 회사 선택 후 활성 -'}</option>
          {accounts.map((a, i) => {
            const label = formatAccount(a) + (a.alias ? ` · ${a.alias}` : '');
            return <option key={i} value={formatAccount(a)}>{label}</option>;
          })}
        </select>
      </label>
    </div>
  );
}

/* ─── 1. 엑셀 업로드 ─── */
function ExcelStage({
  companies, selectedCompany,
  companyCode, setCompanyCode, account, setAccount,
  busy, error, onPick, ctxLocked,
}: {
  companies: Company[]; selectedCompany: Company | null;
  companyCode: string; setCompanyCode: (v: string) => void;
  account: string; setAccount: (v: string) => void;
  busy: boolean; error: string;
  onPick: (file: File) => void;
  ctxLocked: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div className="space-y-3">
      <CtxRow
        companies={companies} selectedCompany={selectedCompany}
        companyCode={companyCode} setCompanyCode={setCompanyCode}
        account={account} setAccount={setAccount}
      />

      <label
        className={`dropzone block ${dragging ? 'dragging' : ''} ${busy ? 'busy' : ''}`}
        style={ctxLocked ? { opacity: 0.5, pointerEvents: 'none' } : undefined}
        onDragEnter={(e) => { e.preventDefault(); if (!busy && !ctxLocked) setDragging(true); }}
        onDragOver={(e) => { e.preventDefault(); if (!busy && !ctxLocked) setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault(); setDragging(false);
          if (busy || ctxLocked) return;
          const f = e.dataTransfer?.files?.[0];
          if (f) onPick(f);
        }}
      >
        <input ref={ref} type="file" accept=".xlsx,.xls,.csv" hidden disabled={busy || ctxLocked}
               onChange={(e) => {
                 const f = e.target.files?.[0];
                 if (f) onPick(f);
                 if (ref.current) ref.current.value = '';
               }} />
        <UploadSimple size={26} className="mx-auto" style={{ color: ctxLocked || busy ? 'var(--text-weak)' : 'var(--brand)' }} />
        <div className="mt-2 text-medium">
          {ctxLocked ? '회사·계좌 선택 후 업로드 가능' : busy ? '읽는 중...' : '통장 거래내역 업로드 *'}
        </div>
        <div className="mt-1 text-weak">XLSX / XLS / CSV — 클릭 또는 드래그&amp;드롭</div>
      </label>

      <div className="alert alert-info">
        인식 컬럼: <strong>거래일시 · 입금액 · 출금액 · 잔액 · 적요 · 내용 · 메모</strong>.
        한 파일 = 한 통장 기준. 거래방법은 일괄 &quot;인터넷뱅킹&quot;으로 등록되며 등록 후 개별 수정 가능.
      </div>

      {error && <div className="alert alert-warn"><Warning size={14} /> <span>{error}</span></div>}
    </div>
  );
}

/* ─── 2. 개별 입력 ─── */
function ManualForm({
  companies, selectedCompany,
  companyCode, setCompanyCode, account, setAccount,
  ctxLocked, onSubmit,
}: {
  companies: Company[]; selectedCompany: Company | null;
  companyCode: string; setCompanyCode: (v: string) => void;
  account: string; setAccount: (v: string) => void;
  ctxLocked: boolean;
  onSubmit: (entry: LedgerEntry) => void;
}) {
  const [txDate, setTxDate] = useState('');
  const [deposit, setDeposit] = useState('');
  const [withdraw, setWithdraw] = useState('');
  const [balance, setBalance] = useState('');
  const [memo, setMemo] = useState('');
  const [counterparty, setCounterparty] = useState('');
  const [method, setMethod] = useState<LedgerMethod>('인터넷뱅킹');
  const [note, setNote] = useState('');

  const canSubmit = !ctxLocked && !!(txDate.trim() && memo.trim() && (deposit || withdraw) && balance);

  function submit() {
    if (!canSubmit) return;
    onSubmit({
      id: `l-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      companyCode,
      account: account || undefined,
      txDate,
      deposit: deposit ? Number(deposit) : undefined,
      withdraw: withdraw ? Number(withdraw) : undefined,
      balance: Number(balance) || 0,
      memo,
      counterparty: counterparty || undefined,
      method,
      note: note || undefined,
      uploadedAt: new Date().toISOString(),
    });
  }

  return (
    <div className="space-y-3">
      <CtxRow
        companies={companies} selectedCompany={selectedCompany}
        companyCode={companyCode} setCompanyCode={setCompanyCode}
        account={account} setAccount={setAccount}
      />
      <fieldset disabled={ctxLocked} style={ctxLocked ? { opacity: 0.5 } : undefined}>
        <div className="form-grid">
          <label className="block col-span-2">
            <span className="label label-required">거래일시</span>
            <input className="input w-full" value={txDate} onChange={(e) => setTxDate(e.target.value)} placeholder="YYYY-MM-DD HH:mm" />
          </label>
          <label className="block">
            <span className="label">입금액</span>
            <input type="number" className="input w-full" value={deposit} onChange={(e) => setDeposit(e.target.value)} />
          </label>
          <label className="block">
            <span className="label">출금액</span>
            <input type="number" className="input w-full" value={withdraw} onChange={(e) => setWithdraw(e.target.value)} />
          </label>
          <label className="block col-span-2">
            <span className="label label-required">거래후 잔액</span>
            <input type="number" className="input w-full" value={balance} onChange={(e) => setBalance(e.target.value)} />
          </label>
          <label className="block col-span-2">
            <span className="label">거래방법</span>
            <select className="input w-full" value={method} onChange={(e) => setMethod(e.target.value as LedgerMethod)}>
              {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <label className="block col-span-2">
            <span className="label label-required">적요</span>
            <input className="input w-full" value={memo} onChange={(e) => setMemo(e.target.value)} />
          </label>
          <label className="block col-span-2">
            <span className="label">상대 계좌·예금주</span>
            <input className="input w-full" value={counterparty} onChange={(e) => setCounterparty(e.target.value)} />
          </label>
          <label className="block col-span-4">
            <span className="label">비고</span>
            <input className="input w-full" value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        </div>
      </fieldset>
      <DialogFooter>
        <DialogClose asChild><button className="btn">취소</button></DialogClose>
        <button className="btn btn-primary" disabled={!canSubmit} onClick={submit}>등록</button>
      </DialogFooter>
    </div>
  );
}

/* ─── 3. 시트 붙여넣기 ─── */
function SheetStage({
  companies, selectedCompany,
  companyCode, setCompanyCode, account, setAccount,
  text, setText, error, onParse, onClear, ctxLocked,
}: {
  companies: Company[]; selectedCompany: Company | null;
  companyCode: string; setCompanyCode: (v: string) => void;
  account: string; setAccount: (v: string) => void;
  text: string; setText: (v: string) => void;
  error: string; onParse: () => void; onClear: () => void;
  ctxLocked: boolean;
}) {
  return (
    <div className="space-y-3">
      <CtxRow
        companies={companies} selectedCompany={selectedCompany}
        companyCode={companyCode} setCompanyCode={setCompanyCode}
        account={account} setAccount={setAccount}
      />
      <textarea
        className="input w-full"
        rows={10}
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={ctxLocked}
        placeholder={ctxLocked ? '회사와 계좌를 먼저 선택하세요' : '헤더 행 포함 영역 복사·붙여넣기 — 탭/콤마/여러 칸 공백 모두 인식\n예: No 전체선택 거래일시 적요 입금액 출금액 내용 잔액 거래점명 ...'}
        style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11, opacity: ctxLocked ? 0.5 : 1 }}
      />
      <div className="alert alert-info">
        구글시트 또는 엑셀에서 헤더 행 포함하여 영역을 복사한 뒤 위에 붙여넣기 하세요. 인식 컬럼은 엑셀 업로드와 동일.
      </div>
      {error && <div className="alert alert-warn"><Warning size={14} /> <span>{error}</span></div>}
      <DialogFooter>
        <button className="btn" onClick={onClear}>비우기</button>
        <button className="btn btn-primary" disabled={ctxLocked || !text.trim()} onClick={onParse}>분석 시작</button>
      </DialogFooter>
    </div>
  );
}

/* ─── 결과 미리보기 ─── */
function ResultPreview({
  result, onRemove, onConfirm, onReset,
}: {
  result: BankImportResult;
  onRemove: (id: string) => void;
  onConfirm: () => void;
  onReset: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="alert alert-info">
        <CheckCircle size={14} />
        <span>
          <strong>{result.entries.length}건</strong> 인식 완료 (전체 {result.total} / 건너뜀 {result.skipped}). 등록 후 자금일보에서 계정과목·계약 매칭 진행.
        </span>
      </div>
      <div className="border" style={{ borderColor: 'var(--border)', overflowX: 'auto', maxHeight: 360 }}>
        <table className="table">
          <thead>
            <tr>
              <th className="date">거래일시</th>
              <th className="num">입금</th>
              <th className="num">출금</th>
              <th className="num">잔액</th>
              <th>적요</th>
              <th>상대</th>
              <th className="center" style={{ width: 50 }}></th>
            </tr>
          </thead>
          <tbody>
            {result.entries.map((e) => (
              <tr key={e.id}>
                <td className="date mono">{e.txDate}</td>
                <td className="num">{e.deposit ? e.deposit.toLocaleString('ko-KR') : ''}</td>
                <td className="num">{e.withdraw ? e.withdraw.toLocaleString('ko-KR') : ''}</td>
                <td className="num">{e.balance.toLocaleString('ko-KR')}</td>
                <td>{e.memo}</td>
                <td className="dim">{e.counterparty ?? ''}</td>
                <td className="center">
                  <button className="btn-ghost btn btn-sm" onClick={() => onRemove(e.id)}>
                    <X size={11} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <DialogFooter>
        <button className="btn" onClick={onReset}>다시 선택</button>
        <button className="btn btn-primary" disabled={result.entries.length === 0} onClick={onConfirm}>
          {result.entries.length}건 등록
        </button>
      </DialogFooter>
    </div>
  );
}
