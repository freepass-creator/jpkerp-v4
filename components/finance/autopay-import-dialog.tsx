'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { UploadSimple, X, CheckCircle, Warning } from '@phosphor-icons/react';
import { Dialog, DialogContent, DialogClose, DialogFooter } from '@/components/ui/dialog';
import { parseAutopayExcel, type AutopayImportResult } from '@/lib/autopay-import';
import type { LedgerEntry } from '@/lib/sample-finance';
import { activeCompanies, type Company, type CompanyAccount } from '@/lib/sample-companies';

/**
 * 자동이체·카드 결제 결과 엑셀 업로드.
 *
 * 회사·계좌 선택 → 파일 업로드 → 헤더 자동 검출 → 미리보기 → 일괄 등록.
 * CMS(자동이체) + 카드 결과 통합 엑셀. method 자동 분류 (CMS→자동이체 / 카드→카드).
 * 회원명 셀에서 차량번호 자동 추출 ("정유라 145가1796" → 145가1796).
 *
 * 결과는 LedgerEntry[] 로 변환 → ledger store 에 push (자금일보에 통합).
 */

type Props = {
  onCreate: (entries: LedgerEntry[]) => void;
  companies: Company[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function formatAccount(a: CompanyAccount): string {
  return `${a.bank} ${a.accountNo}`.trim();
}

export function AutopayImportDialog({ onCreate, companies, open, onOpenChange }: Props) {
  const [companyCode, setCompanyCode] = useState('');
  const [account, setAccount] = useState('');
  const [result, setResult] = useState<AutopayImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activeList = useMemo(() => activeCompanies(companies), [companies]);
  const selectedCompany = useMemo(
    () => activeList.find((c) => c.code === companyCode) ?? null,
    [activeList, companyCode],
  );
  const accountOptions = selectedCompany?.accounts ?? [];

  // 회사 변경 시 계좌·결과 reset
  useEffect(() => { setAccount(''); setResult(null); setError(''); }, [companyCode]);

  function reset() { setResult(null); setBusy(false); setError(''); }
  function handleClose(o: boolean) {
    onOpenChange(o);
    if (!o) reset();
  }

  function ctxValid(): boolean {
    if (!companyCode) { setError('회사를 먼저 선택하세요.'); return false; }
    if (!account)     { setError('계좌를 선택하세요.'); return false; }
    return true;
  }

  async function loadFile(file: File) {
    if (!ctxValid()) return;
    setError('');
    setBusy(true);
    try {
      const r = await parseAutopayExcel(file, { companyCode, account: account.trim() });
      setResult(r);
      if (!r.detected) {
        setError('헤더(결제일·회원명·수납금액 등)를 찾지 못했습니다. 파일을 확인하세요.');
      } else if (!r.rows.length) {
        setError(`인식된 결제가 없습니다. (전체 ${r.total} / 건너뜀 ${r.skipped})`);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function handleFileInput(ev: React.ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0];
    if (f) void loadFile(f);
    ev.target.value = '';
  }
  function handleDrop(ev: React.DragEvent<HTMLDivElement>) {
    ev.preventDefault();
    if (!ctxValid()) return;
    const f = ev.dataTransfer.files?.[0];
    if (f) void loadFile(f);
  }

  function handleRegister() {
    if (!result || result.rows.length === 0) return;
    const entries = result.rows.map((r) => r.entry);
    onCreate(entries);
    handleClose(false);
  }

  const cmsCount = result?.rows.filter((r) => r.method === '자동이체').length ?? 0;
  const cardCount = result?.rows.filter((r) => r.method === '카드').length ?? 0;
  const totalAmount = result?.rows.reduce((s, r) => s + r.amount, 0) ?? 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent title="자동이체·카드 결제 결과 업로드" size="lg">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* 회사·계좌 선택 */}
          <div className="form-grid">
            <label className="block col-span-2">
              <span className="label">회사 *</span>
              <select
                className="input w-full"
                value={companyCode}
                onChange={(e) => setCompanyCode(e.target.value)}
                disabled={activeList.length === 0}
              >
                <option value="">{activeList.length === 0 ? '등록된 회사 없음' : '선택'}</option>
                {activeList.map((c) => (
                  <option key={c.code} value={c.code}>{c.code} · {c.name}</option>
                ))}
              </select>
            </label>
            <label className="block col-span-2">
              <span className="label">계좌 *</span>
              <select
                className="input w-full"
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                disabled={!selectedCompany || accountOptions.length === 0}
              >
                <option value="">
                  {!selectedCompany ? '회사 선택 후' : accountOptions.length === 0 ? '계좌 없음 — 회사정보에 등록' : '선택'}
                </option>
                {accountOptions.map((a, i) => (
                  <option key={i} value={formatAccount(a)}>
                    {formatAccount(a)}{a.alias ? ` · ${a.alias}` : ''}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* 파일 드롭존 */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => { if (ctxValid()) fileInputRef.current?.click(); }}
            style={{
              border: '2px dashed var(--border)',
              borderRadius: 6,
              padding: 24,
              textAlign: 'center',
              cursor: companyCode && account ? 'pointer' : 'not-allowed',
              background: companyCode && account ? 'var(--bg-card)' : 'var(--bg-stripe)',
              opacity: companyCode && account ? 1 : 0.6,
            }}
          >
            <UploadSimple size={24} weight="bold" />
            <div style={{ marginTop: 6 }}>
              {!companyCode || !account
                ? '회사·계좌 선택 후 업로드 가능'
                : busy ? '읽는 중...' : '엑셀 파일을 드롭하거나 클릭하여 선택'}
            </div>
            <div className="text-weak text-xs" style={{ marginTop: 4 }}>
              CMS 자동이체 + 카드 결제 통합 결과 (.xlsx / .xls / .csv)
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              style={{ display: 'none' }}
              onChange={handleFileInput}
            />
          </div>

          {error && (
            <div style={{ color: 'var(--alert-red-text)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Warning size={14} weight="fill" /> {error}
            </div>
          )}

          {/* 미리보기 */}
          {result && result.rows.length > 0 && (
            <>
              <div className="text-xs" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 6, background: 'var(--success-green-bg, #e7f5ea)', borderRadius: 4 }}>
                <CheckCircle size={14} weight="fill" style={{ color: 'var(--success-green, #2a9d3a)' }} />
                <span>
                  <strong>{result.rows.length}건</strong> 인식
                  {cmsCount > 0 && <> · 자동이체 {cmsCount}</>}
                  {cardCount > 0 && <> · 카드 {cardCount}</>}
                  <> · 총 ₩{totalAmount.toLocaleString('ko-KR')}</>
                  {result.skipped > 0 && <span className="dim"> · 건너뜀 {result.skipped}</span>}
                </span>
              </div>
              <div style={{ maxHeight: 280, overflow: 'auto', border: '1px solid var(--border)' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ width: 100 }}>거래일</th>
                      <th>손님</th>
                      <th style={{ width: 110 }}>차량번호</th>
                      <th className="num" style={{ width: 110 }}>금액</th>
                      <th className="center" style={{ width: 80 }}>결제수단</th>
                      <th style={{ width: 130 }}>승인번호</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.slice(0, 30).map((r, i) => (
                      <tr key={i}>
                        <td className="text-xs">{r.txDate.slice(0, 10)}</td>
                        <td>{r.customerName}</td>
                        <td className="mono text-xs">{r.plate ?? <span className="dim">-</span>}</td>
                        <td className="num text-xs">₩{r.amount.toLocaleString('ko-KR')}</td>
                        <td className="center">
                          <span className={`badge ${r.method === '자동이체' ? 'badge-blue' : 'badge-orange'}`}>
                            {r.method === '자동이체' ? 'CMS' : r.method}
                          </span>
                        </td>
                        <td className="mono text-xs">{r.approvalNo ?? <span className="dim">-</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {result.rows.length > 30 && (
                  <div className="text-weak text-xs" style={{ padding: 6, textAlign: 'center' }}>
                    ... 외 {result.rows.length - 30}건
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <DialogClose asChild><button className="btn">취소</button></DialogClose>
          <button
            className="btn btn-primary"
            disabled={!result || result.rows.length === 0 || busy}
            onClick={handleRegister}
          >
            <UploadSimple size={13} weight="bold" /> {result ? `${result.rows.length}건 자금일보 등록` : '등록'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
