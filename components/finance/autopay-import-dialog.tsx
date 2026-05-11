'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { UploadSimple, DownloadSimple, FileXls, Plus, CheckCircle, Warning } from '@phosphor-icons/react';
import { Dialog, DialogContent, DialogClose, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { parseAutopayExcel, type AutopayImportResult, type AutopayImportRow } from '@/lib/autopay-import';
import type { LedgerEntry, LedgerMethod } from '@/lib/sample-finance';
import { makeTxKey } from '@/lib/ledger-dedup';
import { activeCompanies, type Company, type CompanyAccount } from '@/lib/sample-companies';
import { todayStr } from '@/lib/date-utils';

/**
 * 자동이체·카드 결제 결과 등록 — 표준 3탭 패턴.
 *
 *  1) 엑셀  — 양식 다운로드 + 파일 드롭 + 헤더 자동검출 + 미리보기 + 일괄 등록
 *  2) 시트  — 헤더 복사 + 구글시트/엑셀 영역 붙여넣기 (TSV)
 *  3) 단건  — 폼 입력 (1건)
 *
 * 모든 탭의 결과 = LedgerEntry[] → ledger store push (자금일보 통합).
 */

type Props = {
  onCreate: (entries: LedgerEntry[]) => void;
  companies: Company[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type TabKey = 'excel' | 'sheet' | 'manual';

const HEADERS = [
  '결제일', '회원명', '수납금액', '결제수단', '승인번호', '휴대전화', '회원번호', '비고',
];

function formatAccount(a: CompanyAccount): string {
  return `${a.bank} ${a.accountNo}`.trim();
}

export function AutopayImportDialog({ onCreate, companies, open, onOpenChange }: Props) {
  const [tab, setTab] = useState<TabKey>('excel');

  // 공통 컨텍스트 — 회사·계좌 (모든 탭 공유)
  const [companyCode, setCompanyCode] = useState('');
  const [account, setAccount] = useState('');

  const activeList = useMemo(() => activeCompanies(companies), [companies]);
  const selectedCompany = useMemo(
    () => activeList.find((c) => c.code === companyCode) ?? null,
    [activeList, companyCode],
  );
  const accountOptions = selectedCompany?.accounts ?? [];
  useEffect(() => { setAccount(''); }, [companyCode]);

  function ctxValid(): boolean {
    return !!companyCode && !!account;
  }

  function handleClose(o: boolean) {
    onOpenChange(o);
    if (!o) {
      setTab('excel');
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent title="자동이체·카드 결제 등록" size="lg">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* 회사·계좌 — 모든 탭 공통 */}
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

          <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
            <TabsList>
              <TabsTrigger value="excel"><FileXls size={12} weight="bold" /> 엑셀</TabsTrigger>
              <TabsTrigger value="sheet">시트</TabsTrigger>
              <TabsTrigger value="manual"><Plus size={12} weight="bold" /> 단건</TabsTrigger>
            </TabsList>

            <TabsContent value="excel">
              <ExcelTab
                ctxValid={ctxValid()}
                companyCode={companyCode}
                account={account}
                onSubmit={(entries) => { onCreate(entries); handleClose(false); }}
              />
            </TabsContent>

            <TabsContent value="sheet">
              <SheetTab
                ctxValid={ctxValid()}
                companyCode={companyCode}
                account={account}
                onSubmit={(entries) => { onCreate(entries); handleClose(false); }}
              />
            </TabsContent>

            <TabsContent value="manual">
              <ManualTab
                ctxValid={ctxValid()}
                companyCode={companyCode}
                account={account}
                onSubmit={(entries) => { onCreate(entries); handleClose(false); }}
              />
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter>
          <DialogClose asChild><button className="btn">취소</button></DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ───────── 엑셀 탭 ───────── */
function ExcelTab({
  ctxValid, companyCode, account, onSubmit,
}: {
  ctxValid: boolean;
  companyCode: string;
  account: string;
  onSubmit: (entries: LedgerEntry[]) => void;
}) {
  const [result, setResult] = useState<AutopayImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function loadFile(file: File) {
    if (!ctxValid) { setError('회사·계좌를 먼저 선택하세요.'); return; }
    setError(''); setBusy(true);
    try {
      const r = await parseAutopayExcel(file, { companyCode, account });
      setResult(r);
      if (!r.detected) setError('헤더(결제일·회원명·수납금액 등)를 찾지 못했습니다.');
      else if (!r.rows.length) setError(`인식된 결제가 없습니다. (전체 ${r.total} / 건너뜀 ${r.skipped})`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function downloadTemplate() {
    setDownloading(true);
    try {
      const XLSX = await import('xlsx');
      const aoa: (string | number)[][] = [
        HEADERS,
        ['2026-03-25', '정유라 145가1796', 1070000, 'CMS', '4207202', '010-7305-0903', '00000243', '정상'],
        ['2026-03-25', '유정란', 1100000, '카드', '4207202', '010-8650-8723', '00000084', '승인성공'],
      ];
      const sheet = XLSX.utils.aoa_to_sheet(aoa);
      sheet['!cols'] = [{ wch: 12 }, { wch: 20 }, { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 14 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, sheet, '자동이체결과');
      XLSX.writeFile(wb, `자동이체결과_양식_${todayStr()}.xlsx`);
    } catch (e) {
      alert(`양식 다운로드 실패: ${(e as Error).message}`);
    } finally {
      setDownloading(false);
    }
  }

  function handleSubmit() {
    if (!result || result.rows.length === 0) return;
    onSubmit(result.rows.map((r) => r.entry));
  }

  const cmsCount = result?.rows.filter((r) => r.method === '자동이체').length ?? 0;
  const cardCount = result?.rows.filter((r) => r.method === '카드').length ?? 0;
  const totalAmount = result?.rows.reduce((s, r) => s + r.amount, 0) ?? 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="text-xs" style={{ background: 'var(--bg-card)', padding: 8, borderRadius: 4 }}>
        <strong>엑셀 등록 방법</strong>
        <br />· ① <strong>양식 다운로드</strong> → 엑셀에서 행마다 결제 결과 작성
        <br />· ② <strong>파일 드롭/선택</strong> → 헤더 자동검출 (결제일·회원명·수납금액·결제수단 등)
        <br />· ③ 미리보기 확인 후 [등록] — 자금일보(method=자동이체/카드)에 일괄 push
      </div>

      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn btn-sm" onClick={downloadTemplate} disabled={downloading}>
          <DownloadSimple size={12} weight="bold" /> {downloading ? '생성 중…' : '① 양식 다운로드'}
        </button>
        <span className="text-weak text-xs">컬럼: {HEADERS.join(' · ')}</span>
      </div>

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) void loadFile(f); }}
        onClick={() => { if (ctxValid) fileInputRef.current?.click(); }}
        style={{
          border: '2px dashed var(--border)', borderRadius: 6, padding: 24, textAlign: 'center',
          cursor: ctxValid ? 'pointer' : 'not-allowed',
          background: ctxValid ? 'var(--bg-card)' : 'var(--bg-stripe)',
          opacity: ctxValid ? 1 : 0.6,
        }}
      >
        <UploadSimple size={24} weight="bold" />
        <div style={{ marginTop: 6 }}>
          {!ctxValid ? '회사·계좌 선택 후 업로드 가능' : busy ? '읽는 중...' : '엑셀 파일을 드롭하거나 클릭하여 선택'}
        </div>
        <div className="text-weak text-xs" style={{ marginTop: 4 }}>.xlsx / .xls / .csv</div>
        <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void loadFile(f); }} />
      </div>

      {error && (
        <div style={{ color: 'var(--alert-red-text)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Warning size={14} weight="fill" /> {error}
        </div>
      )}

      {result && result.rows.length > 0 && (
        <>
          <SummaryBox cmsCount={cmsCount} cardCount={cardCount} totalAmount={totalAmount} totalRows={result.rows.length} skipped={result.skipped} />
          <PreviewTable rows={result.rows} />
        </>
      )}

      <button
        className="btn btn-primary"
        disabled={!result || result.rows.length === 0 || busy}
        onClick={handleSubmit}
      >
        {result?.rows.length ? `${result.rows.length}건 자금일보 등록` : '등록'}
      </button>
    </div>
  );
}

/* ───────── 시트 탭 ───────── */
function SheetTab({
  ctxValid, companyCode, account, onSubmit,
}: {
  ctxValid: boolean;
  companyCode: string;
  account: string;
  onSubmit: (entries: LedgerEntry[]) => void;
}) {
  const [text, setText] = useState('');
  const [copied, setCopied] = useState<'' | 'header' | 'sample'>('');
  const [error, setError] = useState('');

  const rows = useMemo(() => parseSheetText(text, { companyCode, account }), [text, companyCode, account]);

  async function copy(t: string, kind: 'header' | 'sample') {
    try {
      await navigator.clipboard.writeText(t);
      setCopied(kind);
      setTimeout(() => setCopied(''), 1200);
    } catch {
      alert('클립보드 복사 실패');
    }
  }

  function handleSubmit() {
    if (!ctxValid) { setError('회사·계좌를 먼저 선택하세요.'); return; }
    if (rows.length === 0) { setError('붙여넣은 데이터에서 인식된 행이 없습니다.'); return; }
    onSubmit(rows.map((r) => r.entry));
  }

  const HEADER_LINE = HEADERS.join('\t');
  const SAMPLE_LINE = HEADER_LINE + '\n' + ['2026-03-25', '정유라 145가1796', '1070000', 'CMS', '4207202', '010-7305-0903', '00000243', '정상'].join('\t');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="text-xs" style={{ background: 'var(--bg-card)', padding: 8, borderRadius: 4 }}>
        <strong>시트 등록 방법</strong>
        <br />· ① <strong>헤더(스키마) 복사</strong> → 구글시트/엑셀 A1 에 붙여넣고 행마다 데이터 입력
        <br />· ② 헤더+데이터 영역 선택 → 복사 → 아래 textarea 에 붙여넣기 (탭 구분 자동)
        <br />· ③ 미리보기 확인 후 [등록]
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <button className="btn btn-sm" onClick={() => copy(HEADER_LINE, 'header')}>
          {copied === 'header' ? '복사됨 ✓' : '헤더 복사 (스키마)'}
        </button>
        <button className="btn btn-sm" onClick={() => copy(SAMPLE_LINE, 'sample')}>
          {copied === 'sample' ? '복사됨 ✓' : '헤더 + 예시 복사'}
        </button>
      </div>

      <textarea
        className="input"
        rows={8}
        style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: 12 }}
        value={text}
        onChange={(e) => { setText(e.target.value); setError(''); }}
        placeholder={`${HEADER_LINE}\n2026-03-25\t정유라 145가1796\t1070000\tCMS\t4207202\t...`}
      />

      {error && (
        <div style={{ color: 'var(--alert-red-text)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Warning size={14} weight="fill" /> {error}
        </div>
      )}

      {rows.length > 0 && (
        <>
          <SummaryBox
            cmsCount={rows.filter((r) => r.method === '자동이체').length}
            cardCount={rows.filter((r) => r.method === '카드').length}
            totalAmount={rows.reduce((s, r) => s + r.amount, 0)}
            totalRows={rows.length}
            skipped={0}
          />
          <PreviewTable rows={rows} />
        </>
      )}

      <button
        className="btn btn-primary"
        disabled={rows.length === 0}
        onClick={handleSubmit}
      >
        {rows.length ? `${rows.length}건 자금일보 등록` : '등록'}
      </button>
    </div>
  );
}

/* ───────── 단건 탭 ───────── */
function ManualTab({
  ctxValid, companyCode, account, onSubmit,
}: {
  ctxValid: boolean;
  companyCode: string;
  account: string;
  onSubmit: (entries: LedgerEntry[]) => void;
}) {
  const [txDate, setTxDate] = useState(todayStr());
  const [customer, setCustomer] = useState('');
  const [plate, setPlate] = useState('');
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState<LedgerMethod>('자동이체');
  const [approvalNo, setApprovalNo] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  function handleSubmit() {
    if (!ctxValid) { setError('회사·계좌를 먼저 선택하세요.'); return; }
    if (!txDate || !customer.trim() || !amount) {
      setError('결제일·손님명·금액은 필수입니다.');
      return;
    }
    const stamp = Date.now();
    const memoParts = [method === '자동이체' ? 'CMS 자동이체' : method, customer.trim()];
    if (plate.trim()) memoParts.push(`(${plate.trim()})`);
    const noteParts: string[] = [];
    if (approvalNo.trim()) noteParts.push(`승인 ${approvalNo.trim()}`);
    if (note.trim()) noteParts.push(note.trim());

    const entry: LedgerEntry = {
      id: `ap-${stamp}`,
      companyCode,
      account,
      txDate: `${txDate} 00:00`,
      deposit: amount,
      withdraw: 0,
      balance: 0,
      memo: memoParts.join(' '),
      counterparty: customer.trim(),
      method,
      note: noteParts.length > 0 ? noteParts.join(' / ') : undefined,
      uploadedAt: new Date().toISOString(),
    };
    entry.txKey = makeTxKey(entry);
    onSubmit([entry]);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="text-xs" style={{ background: 'var(--bg-card)', padding: 8, borderRadius: 4 }}>
        <strong>단건 등록</strong> — 1건만 입력. 회사·계좌는 상단에서 선택.
      </div>

      <div className="form-grid">
        <label className="block">
          <span className="label">결제일 *</span>
          <input type="date" className="input w-full" value={txDate} onChange={(e) => setTxDate(e.target.value)} />
        </label>
        <label className="block">
          <span className="label">결제수단 *</span>
          <select className="input w-full" value={method} onChange={(e) => setMethod(e.target.value as LedgerMethod)}>
            <option value="자동이체">자동이체 (CMS)</option>
            <option value="카드">카드</option>
            <option value="인터넷뱅킹">인터넷뱅킹</option>
            <option value="현금">현금</option>
            <option value="무통장">무통장</option>
            <option value="기타">기타</option>
          </select>
        </label>
        <label className="block col-span-2">
          <span className="label">손님 *</span>
          <input className="input w-full" value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="정유라" />
        </label>
        <label className="block">
          <span className="label">차량번호</span>
          <input className="input w-full" value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="145가1796" />
        </label>
        <label className="block">
          <span className="label">금액 (원) *</span>
          <input type="number" className="input w-full" value={amount} onChange={(e) => setAmount(Number(e.target.value) || 0)} />
        </label>
        <label className="block">
          <span className="label">승인번호</span>
          <input className="input w-full" value={approvalNo} onChange={(e) => setApprovalNo(e.target.value)} />
        </label>
        <label className="block">
          <span className="label">휴대전화</span>
          <input className="input w-full" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="010-..." />
        </label>
        <label className="block col-span-4">
          <span className="label">비고</span>
          <input className="input w-full" value={note} onChange={(e) => setNote(e.target.value)} placeholder="정상/승인성공 등" />
        </label>
      </div>

      {error && (
        <div style={{ color: 'var(--alert-red-text)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Warning size={14} weight="fill" /> {error}
        </div>
      )}

      <button className="btn btn-primary" onClick={handleSubmit}>1건 자금일보 등록</button>
    </div>
  );
}

/* ───────── 공용 — 요약 + 미리보기 ───────── */
function SummaryBox({ cmsCount, cardCount, totalAmount, totalRows, skipped }: {
  cmsCount: number; cardCount: number; totalAmount: number; totalRows: number; skipped: number;
}) {
  return (
    <div className="text-xs" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 6, background: 'var(--success-green-bg, #e7f5ea)', borderRadius: 4 }}>
      <CheckCircle size={14} weight="fill" style={{ color: 'var(--success-green, #2a9d3a)' }} />
      <span>
        <strong>{totalRows}건</strong> 인식
        {cmsCount > 0 && <> · 자동이체 {cmsCount}</>}
        {cardCount > 0 && <> · 카드 {cardCount}</>}
        <> · 총 ₩{totalAmount.toLocaleString('ko-KR')}</>
        {skipped > 0 && <span className="dim"> · 건너뜀 {skipped}</span>}
      </span>
    </div>
  );
}

function PreviewTable({ rows }: { rows: AutopayImportRow[] }) {
  return (
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
          {rows.slice(0, 30).map((r, i) => (
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
      {rows.length > 30 && (
        <div className="text-weak text-xs" style={{ padding: 6, textAlign: 'center' }}>
          ... 외 {rows.length - 30}건
        </div>
      )}
    </div>
  );
}

/* ───────── 시트 TSV 파싱 ───────── */
function parseSheetText(
  raw: string,
  ctx: { companyCode: string; account: string },
): AutopayImportRow[] {
  if (!raw.trim() || !ctx.companyCode || !ctx.account) return [];
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  // 첫 줄 헤더 자동 감지 — 첫 줄에 한글 헤더 키워드 포함시 헤더로 간주, 아니면 데이터로
  const first = lines[0].split('\t');
  const hasHeader = first.some((c) => /^(결제일|회원명|수납금액|결제수단|승인번호|휴대전화|회원번호|비고)$/.test(c.trim()));
  const headerCells = hasHeader ? first.map((c) => c.trim()) : HEADERS;
  const dataLines = hasHeader ? lines.slice(1) : lines;

  const cols = {
    txDate:    headerCells.indexOf('결제일'),
    customer:  headerCells.indexOf('회원명'),
    amount:    headerCells.indexOf('수납금액'),
    payMethod: headerCells.indexOf('결제수단'),
    approval:  headerCells.indexOf('승인번호'),
    phone:     headerCells.indexOf('휴대전화'),
    memberNo:  headerCells.indexOf('회원번호'),
    note:      headerCells.indexOf('비고'),
  };

  const PLATE_RE = /\b\d{2,3}[가-힣]\d{4}\b/;
  const out: AutopayImportRow[] = [];
  const stamp = Date.now();
  const uploadedAt = new Date().toISOString();

  dataLines.forEach((line, idx) => {
    const c = line.split('\t').map((x) => x.trim());
    const txDate = c[cols.txDate] ? `${c[cols.txDate]} 00:00` : '';
    const customerRaw = c[cols.customer] ?? '';
    const amount = Number((c[cols.amount] ?? '').replace(/[,\s₩원]/g, '')) || 0;
    if (!txDate || !customerRaw || !amount) return;

    const m = customerRaw.match(PLATE_RE);
    const plate = m?.[0];
    const customerName = (plate ? customerRaw.replace(plate, '').trim() : customerRaw) || customerRaw;

    const methodRaw = (c[cols.payMethod] ?? '').toUpperCase();
    const method: LedgerMethod = methodRaw.includes('CMS') || methodRaw.includes('자동') ? '자동이체'
      : methodRaw.includes('카드') ? '카드' : '자동이체';

    const approvalNo = c[cols.approval] || undefined;
    const phone = c[cols.phone] || undefined;
    const memberNo = c[cols.memberNo] || undefined;
    const noteCell = c[cols.note] || '';

    const memoParts = [method === '자동이체' ? 'CMS 자동이체' : method, customerName];
    if (plate) memoParts.push(`(${plate})`);
    const noteParts: string[] = [];
    if (approvalNo) noteParts.push(`승인 ${approvalNo}`);
    if (noteCell) noteParts.push(noteCell);
    if (memberNo) noteParts.push(`회원 ${memberNo}`);

    const entry: LedgerEntry = {
      id: `ap-${stamp}-${idx}`,
      companyCode: ctx.companyCode,
      account: ctx.account,
      txDate,
      deposit: amount,
      withdraw: 0,
      balance: 0,
      memo: memoParts.join(' '),
      counterparty: customerName,
      method,
      note: noteParts.length > 0 ? noteParts.join(' / ') : undefined,
      uploadedAt,
    };
    entry.txKey = makeTxKey(entry);

    out.push({ txDate, customerName, plate, amount, method, approvalNo, phone, memberNo, entry });
  });
  return out;
}
