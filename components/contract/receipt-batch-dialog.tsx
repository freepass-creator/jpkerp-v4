'use client';

import { useState, useRef, useMemo } from 'react';
import {
  Dialog, DialogTrigger, DialogContent, DialogFooter, DialogClose,
} from '@/components/ui/dialog';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  DownloadSimple, UploadSimple, FileXls, Warning, CheckCircle, CircleNotch, ArrowsClockwise,
} from '@phosphor-icons/react';
import {
  parseReceiptExcel,
  RECEIPT_EXCEL_HEADERS, RECEIPT_EXCEL_REQUIRED, RECEIPT_EXCEL_OPTIONAL,
  type ReceiptImportResult, type ReceiptImportRow,
} from '@/lib/receipt-import';
import { activeContracts, type Contract, type ScheduleEvent } from '@/lib/sample-contracts';
import { buildEventsWithOutstanding } from '@/lib/contract-events';
import { todayStr } from '@/lib/date-utils';

/**
 * 수납 일괄 마이그레이션 다이얼로그.
 *
 * 흐름:
 *   ① 양식 다운로드 — 현재 활성 계약 1행씩 + 계약번호·차량·임차인·월대여료·만기일 prefill
 *   ② 사용자가 「미수금액」 한 컬럼만 입력 (신규=0, 부분미수=실제값)
 *   ③ 업로드 → 미리보기 → 적용
 *   ④ 적용: 계약별 events 를 buildEventsWithOutstanding 으로 재생성
 *      · 가장 최근 도래 회차부터 거꾸로 미수 차감 → 부분납입 자동 표현
 *      · 그 이전 회차는 모두 '완료' (일괄 수납 처리)
 */
export function ReceiptBatchDialog({
  contracts, onApply,
}: {
  contracts: Contract[];
  /** 적용 patch — contractId → 새 events 배열 (기존 교체). 사용자 confirm 후 호출. */
  onApply: (patches: { contractId: string; events: ScheduleEvent[] }[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<ReceiptImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setErr] = useState('');
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const fileRef = useRef<HTMLInputElement | null>(null);

  const contractByNo = useMemo(() => {
    const m = new Map<string, Contract>();
    for (const c of activeContracts(contracts)) m.set(c.contractNo, c);
    return m;
  }, [contracts]);

  function rowMatchStatus(row: ReceiptImportRow): { ok: boolean; reason: string } {
    if (row.errors.length > 0) return { ok: false, reason: row.errors.join(', ') };
    if (!contractByNo.has(row.contractNo)) return { ok: false, reason: '계약번호 매칭 실패' };
    return { ok: true, reason: '' };
  }

  async function loadFile(file: File) {
    setErr(''); setBusy(true);
    try {
      const r = await parseReceiptExcel(file);
      setResult(r);
      const init = new Set<number>();
      r.rows.forEach((row, i) => {
        if (rowMatchStatus(row).ok) init.add(i);
      });
      setChecked(init);
      if (!r.detected) setErr('헤더(계약번호·미수금액) 를 찾지 못했습니다.');
      else if (!r.rows.length) setErr(`인식된 행이 없습니다. (전체 ${r.total} / 건너뜀 ${r.skipped})`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function downloadTemplate() {
    setDownloading(true);
    try {
      const ExcelJS = (await import('exceljs')).default;
      const { populateSheet } = await import('@/lib/excel-template');
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('수납일괄');

      // 활성 계약 1행씩 prefill
      const active = activeContracts(contracts);
      const sample: Record<string, string | number> = active.length > 0 ? {
        '계약번호 *': active[0].contractNo,
        '미수금액 *': 0,
        '차량번호': active[0].plate,
        '임차인': active[0].customerName,
        '월대여료': active[0].monthlyAmount,
        '만기일': active[0].endDate,
      } : {
        '계약번호 *': 'C2025-0001',
        '미수금액 *': 0,
        '차량번호': '12가1234',
        '임차인': '홍길동',
        '월대여료': 1100000,
        '만기일': '2027-12-31',
      };

      const layout = populateSheet(ws, {
        sheetName: '수납일괄',
        title: '수납 일괄 마이그레이션',
        description: [
          '현재 운영 미수 현황을 한 번에 입력 — 계약별 1행 + 미수금액만 채우면 됩니다.',
          '· 계약번호·차량·임차인·월대여료·만기일 = 현재 시스템에서 자동 채움 (수정 금지)',
          '· 미수금액 (필수) = 현재 누적 미수(원). 수납 완료면 0',
          '· 시스템 처리: 최근 도래 회차부터 거꾸로 차감 → 부분납입까지 자동 표현',
          '   예: 월 50만 / 미수 30만 → 마지막 회차 부분납입(입금 20만/미수 30만), 그 이전 완료',
          '   예: 미수 130만 → 마지막 2회차 전체미수 + 그 전 회차 부분납입, 더 이전 완료',
          '· 미수금액 = 0 → 모든 도래 회차 완료',
        ],
        headers: RECEIPT_EXCEL_HEADERS,
        requiredCount: RECEIPT_EXCEL_REQUIRED.length,
        sample,
        numberCols: ['미수금액', '월대여료'],
      });

      // 활성 계약 2번째 행부터 push
      if (active.length > 1) {
        for (let i = 1; i < active.length; i++) {
          const c = active[i];
          const rowIdx = layout.sampleRow + i;
          const data: Record<string, string | number> = {
            '계약번호 *': c.contractNo,
            '미수금액 *': 0,
            '차량번호': c.plate,
            '임차인': c.customerName,
            '월대여료': c.monthlyAmount,
            '만기일': c.endDate,
          };
          RECEIPT_EXCEL_HEADERS.forEach((h, ci) => {
            const v = data[h] ?? '';
            const colLetter = String.fromCharCode(65 + ci);
            const cell = ws.getCell(`${colLetter}${rowIdx}`);
            const isNumber = h.includes('금액') || h.includes('대여료');
            if (typeof v === 'number') {
              cell.value = v;
              if (isNumber) cell.numFmt = '#,##0';
              cell.alignment = { horizontal: 'right', vertical: 'middle' };
            } else {
              cell.value = String(v);
              cell.alignment = { horizontal: 'left', vertical: 'middle' };
            }
            cell.font = { name: '맑은 고딕', size: 9 };
            cell.border = {
              top: { style: 'thin', color: { argb: 'FFBBBBBB' } },
              bottom: { style: 'thin', color: { argb: 'FFBBBBBB' } },
              left: { style: 'thin', color: { argb: 'FFBBBBBB' } },
              right: { style: 'thin', color: { argb: 'FFBBBBBB' } },
            };
          });
          ws.getRow(rowIdx).height = 18;
        }
      }

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `수납일괄_양식_${todayStr().replace(/-/g, '')}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(`양식 다운로드 실패: ${(e as Error).message}`);
    } finally {
      setDownloading(false);
    }
  }

  const allChecked = result && result.rows.length > 0 && checked.size === result.rows.length;
  const someChecked = checked.size > 0 && !allChecked;

  function toggleAll() {
    if (!result) return;
    if (allChecked) setChecked(new Set());
    else setChecked(new Set(result.rows.map((_, i) => i)));
  }
  function toggleRow(i: number) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  }

  function commit() {
    if (!result) return;
    const selectedRows = [...checked].map((i) => result.rows[i]).filter(Boolean);
    if (selectedRows.length === 0) {
      alert('적용할 행을 체크박스로 선택하세요.');
      return;
    }

    // 계약별 events 재생성 — buildEventsWithOutstanding
    const patches: { contractId: string; events: ScheduleEvent[] }[] = [];
    let skipped = 0;
    for (const row of selectedRows) {
      const c = contractByNo.get(row.contractNo);
      if (!c) { skipped++; continue; }
      const events = buildEventsWithOutstanding(
        c.startDate, c.endDate, c.monthlyAmount, row.outstandingAmount,
        { autopayDay: c.paymentDay, engineOilService: c.engineOilService },
      );
      patches.push({ contractId: c.id, events });
    }
    if (patches.length === 0) {
      alert('매칭되는 계약이 없습니다.');
      return;
    }
    if (!confirm(`${patches.length}개 계약 수납 events 일괄 재생성할까요?${skipped > 0 ? `\n(${skipped}건은 매칭 실패로 건너뜀)` : ''}`)) return;
    onApply(patches);
    setOpen(false);
    setResult(null);
    setChecked(new Set());
  }

  const okCount = result?.rows.filter((r) => rowMatchStatus(r).ok).length ?? 0;
  const errCount = (result?.rows.length ?? 0) - okCount;
  const activeCount = useMemo(() => activeContracts(contracts).length, [contracts]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="btn">
          <ArrowsClockwise size={14} weight="bold" /> 수납 일괄
        </button>
      </DialogTrigger>
      <DialogContent title="수납 일괄 마이그레이션" size="xl">
        <div className="space-y-3" style={{ paddingTop: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 4, borderBottom: '1px solid var(--border)' }}>
            <FileXls size={18} weight="bold" />
            <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>수납 일괄 마이그레이션</h3>
            <span className="text-weak text-xs">— 활성 계약 {activeCount}건 + 미수금액 한 줄 입력</span>
          </div>
          <div className="text-xs" style={{ background: 'var(--bg-card)', padding: 8, borderRadius: 4 }}>
            현재 활성 계약을 양식에 자동 채워줍니다. 사용자는 <strong>미수금액</strong> 컬럼만 입력하면 됩니다.
            <br />· 미수 0 → 모든 도래 회차 완료 (정상 수납 계약)
            <br />· 미수 30만 (월 50만) → 마지막 도래 회차 부분납입 (입금 20만 / 미수 30만), 그 이전 모두 완료
            <br />· 미수 130만 (월 50만) → 마지막 2회차 전체미수 + 그 전 회차 부분납입, 더 이전 완료
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" className="btn" onClick={downloadTemplate} disabled={downloading || activeCount === 0}>
              {downloading
                ? <CircleNotch size={14} weight="bold" className="spin" />
                : <DownloadSimple size={14} weight="bold" />}
              엑셀 양식 다운로드
            </button>
            <span className="text-weak text-xs">활성 계약 {activeCount}건 자동 prefill</span>
            {activeCount === 0 && <span className="text-red text-xs">활성 계약이 없습니다 — 먼저 계약 등록</span>}
          </div>

          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) void loadFile(f); }}
            onClick={() => fileRef.current?.click()}
            style={{
              border: '2px dashed var(--border)', borderRadius: 6, padding: 24, textAlign: 'center',
              cursor: 'pointer', background: 'var(--bg-card)',
            }}
          >
            <UploadSimple size={24} weight="bold" />
            <div style={{ marginTop: 6 }}>{busy ? '읽는 중...' : '엑셀 파일을 드롭하거나 클릭하여 선택'}</div>
            <div className="text-weak text-xs" style={{ marginTop: 4 }}>.xlsx / .xls / .csv</div>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void loadFile(f); }} />
          </div>

          {error && (
            <div style={{ color: 'var(--alert-red-text)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Warning size={14} weight="fill" /> {error}
            </div>
          )}

          <div style={{ maxHeight: 320, overflow: 'auto', border: '1px solid var(--border)' }}>
            <table className="table">
              <thead>
                <tr>
                  <th className="center" style={{ width: 36 }}>
                    <input
                      type="checkbox"
                      checked={!!allChecked}
                      ref={(el) => { if (el) el.indeterminate = !!someChecked; }}
                      onChange={toggleAll}
                      disabled={!result || result.rows.length === 0}
                    />
                  </th>
                  <th style={{ width: 60 }}>상태</th>
                  <th style={{ width: 110 }}>계약번호</th>
                  <th style={{ width: 100 }}>차량/임차인</th>
                  <th style={{ width: 100, textAlign: 'right' }}>월대여료</th>
                  <th style={{ width: 95 }}>만기일</th>
                  <th style={{ width: 110, textAlign: 'right' }}>미수금액</th>
                  <th>오류</th>
                </tr>
              </thead>
              <tbody>
                {!result || result.rows.length === 0 ? (
                  <tr><td colSpan={8} className="jpk-table-empty">엑셀 업로드 시 행이 채워집니다.</td></tr>
                ) : result.rows.slice(0, 200).map((r, i) => {
                  const m = rowMatchStatus(r);
                  return (
                    <tr key={i} className={checked.has(i) ? 'is-checked' : undefined}>
                      <td className="center" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={checked.has(i)} onChange={() => toggleRow(i)} />
                      </td>
                      <td>
                        {m.ok
                          ? <StatusBadge tone="green" icon={<CheckCircle size={11} weight="fill" />}>OK</StatusBadge>
                          : <StatusBadge tone="red" icon={<Warning size={11} weight="fill" />}>오류</StatusBadge>}
                      </td>
                      <td className="mono">{r.contractNo || '-'}</td>
                      <td className="text-xs">
                        <span className="mono">{r.refPlate ?? '-'}</span>
                        <br />
                        <span className="dim">{r.refCustomer ?? ''}</span>
                      </td>
                      <td className="num">{r.refMonthly?.toLocaleString('ko-KR') ?? '-'}</td>
                      <td className="date">{r.refEndDate ?? '-'}</td>
                      <td className="num text-medium" style={{ color: r.outstandingAmount > 0 ? 'var(--alert-red, #dc2626)' : undefined }}>
                        {r.outstandingAmount.toLocaleString('ko-KR')}
                      </td>
                      <td className="text-xs" style={{ color: m.ok ? undefined : 'var(--alert-red-text)' }}>
                        {m.ok ? '' : m.reason}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {result && result.rows.length > 200 && (
              <div className="text-weak text-xs" style={{ padding: 6, textAlign: 'center' }}>... 외 {result.rows.length - 200}건</div>
            )}
          </div>

          {result && result.rows.length > 0 && (
            <div className="text-xs" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 6, background: 'var(--success-green-bg, #e7f5ea)', borderRadius: 4 }}>
              <CheckCircle size={14} weight="fill" style={{ color: 'var(--success-green, #2a9d3a)' }} />
              <span>
                전체 <strong>{result.rows.length}</strong> · 선택 <strong>{checked.size}</strong>
                · 매칭 가능 <strong>{okCount}</strong>
                {errCount > 0 && <> · 매칭 실패 <span className="text-red">{errCount}</span></>}
              </span>
            </div>
          )}
        </div>

        <DialogFooter>
          <DialogClose asChild><button className="btn">취소</button></DialogClose>
          <button
            type="button"
            className="btn btn-primary"
            onClick={commit}
            disabled={!result || checked.size === 0}
          >
            선택 {checked.size}건 적용
          </button>
        </DialogFooter>
        {/* 미사용 import 경고 회피 */}
        {void RECEIPT_EXCEL_OPTIONAL}
      </DialogContent>
    </Dialog>
  );
}
