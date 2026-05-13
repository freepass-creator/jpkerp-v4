'use client';

import { useState, useRef, useMemo } from 'react';
import {
  Dialog, DialogTrigger, DialogContent, DialogFooter, DialogClose,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  DownloadSimple, UploadSimple, FileXls, Warning, CheckCircle, ArrowsClockwise,
} from '@phosphor-icons/react';
import {
  parseReceiptExcel, RECEIPT_EXCEL_HEADERS, RECEIPT_EXCEL_REQUIRED, RECEIPT_EXCEL_OPTIONAL,
  type ReceiptImportResult, type ReceiptImportRow,
} from '@/lib/receipt-import';
import { activeContracts, type Contract, type ScheduleEvent } from '@/lib/sample-contracts';
import { todayStr } from '@/lib/date-utils';

/**
 * 수납 일괄 업로드 다이얼로그.
 *
 *   ① 양식 다운로드 — 현재 활성 계약의 미완료(지연/예정) 수납 회차를 미리 채워서 제공
 *   ② 사용자가 실제 입금/상태 마킹
 *   ③ 업로드 → 미리보기 + 체크박스로 선택 → 일괄 적용 (계약 events 갱신)
 */
export function ReceiptBatchDialog({
  contracts, onApply,
}: {
  contracts: Contract[];
  /** 적용할 patch 목록 (계약별 events 교체용). 사용자 confirm 후 호출. */
  onApply: (patches: { contractId: string; eventPatches: { eventId: string; status: ScheduleEvent['status']; doneDate?: string; note?: string }[] }[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<ReceiptImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setErr] = useState('');
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const fileRef = useRef<HTMLInputElement | null>(null);

  /** 계약+회차 → ScheduleEvent 찾기. */
  const contractByNo = useMemo(() => {
    const m = new Map<string, Contract>();
    for (const c of activeContracts(contracts)) m.set(c.contractNo, c);
    return m;
  }, [contracts]);

  function findEvent(row: ReceiptImportRow): { contract: Contract; event: ScheduleEvent } | null {
    const c = contractByNo.get(row.contractNo);
    if (!c) return null;
    const e = c.events.find((ev) => ev.type === '수납' && ev.cycle === row.cycle);
    if (!e) return null;
    return { contract: c, event: e };
  }

  function rowMatchStatus(row: ReceiptImportRow): { ok: boolean; reason: string } {
    if (row.errors.length > 0) return { ok: false, reason: row.errors.join(', ') };
    const found = findEvent(row);
    if (!found) return { ok: false, reason: '계약 또는 회차 찾을 수 없음' };
    return { ok: true, reason: '' };
  }

  async function loadFile(file: File) {
    setErr(''); setBusy(true);
    try {
      const r = await parseReceiptExcel(file);
      setResult(r);
      // 정상행 자동 체크
      const init = new Set<number>();
      r.rows.forEach((row, i) => {
        if (row.errors.length === 0 && findEvent(row) !== null) init.add(i);
      });
      setChecked(init);
      if (!r.detected) setErr('헤더(계약번호·회차·상태) 를 찾지 못했습니다.');
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
      // 활성 계약의 미완료(예정/지연) 수납 회차를 자동으로 prefill — 사용자는 「상태/입금일」만 채움
      type Row = Record<string, string | number>;
      const dataRows: Row[] = [];
      for (const c of activeContracts(contracts)) {
        for (const ev of c.events) {
          if (ev.type !== '수납') continue;
          if (ev.status === '완료' || ev.status === '취소') continue;
          dataRows.push({
            '계약번호 *': c.contractNo,
            '회차 *': ev.cycle ?? '',
            '상태 *': ev.status,
            '차량번호': c.plate,
            '임차인': c.customerName,
            '회차금액': ev.amount ?? '',
            '회차예정일': ev.dueDate,
            '입금일': '',
            '비고': '',
          });
        }
      }
      const isEmpty = dataRows.length === 0;
      // 활성 미완료 0 → 예시 1행
      const sample: Row = isEmpty ? {
        '계약번호 *': 'C2025-0001', '회차 *': 1, '상태 *': '완료',
        '차량번호': '12가1234', '임차인': '홍길동',
        '회차금액': 1100000, '회차예정일': todayStr(),
        '입금일': todayStr(), '비고': '예시 행 — 작성 후 삭제',
      } : dataRows[0];
      const ExcelJS = (await import('exceljs')).default;
      const { populateSheet } = await import('@/lib/excel-template');
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('수납일괄');
      const layout = populateSheet(ws, {
        sheetName: '수납일괄',
        title: '수납 일괄 처리 양식',
        description: [
          isEmpty
            ? '⚠ 활성 계약의 미완료 수납 회차가 없습니다. 아래 예시 행 참고해서 작성하세요.'
            : '활성 계약의 미완료(예정/지연) 수납 회차가 자동 채워져 있습니다.',
          '· 계약번호·회차·차량번호·임차인·회차금액·회차예정일 = 시스템 prefill — 수정 금지 (수정 시 매칭 실패)',
          '· 상태 (필수) = 드롭다운에서 [완료 / 지연 / 취소 / 예정] 중 선택',
          '· 입금일 = 완료 처리 시 YYYY-MM-DD 형식 (예: 2026-05-13). 비우면 회차 예정일로 자동 fallback',
          '· 비고 = 미수 사유·메모 등 자유 입력',
          '· 회차금액은 천단위 콤마 자동',
        ],
        headers: RECEIPT_EXCEL_HEADERS,
        requiredCount: RECEIPT_EXCEL_REQUIRED.length,
        sample,
        numberCols: ['회차', '회차금액'],
        dropdowns: {
          '상태': ['완료', '지연', '취소', '예정'],
        },
      });
      // 첫 페이지에 예시 1행만 들어가있으니 나머지 dataRows 를 push (있을 때만)
      if (!isEmpty && dataRows.length > 1) {
        // 상태 컬럼 인덱스 — 드롭다운 영역 확장
        const statusColIdx = RECEIPT_EXCEL_HEADERS.findIndex((h) => h === '상태' || h === '상태 *');
        const statusCol = statusColIdx >= 0 ? String.fromCharCode(65 + statusColIdx) : '';
        // dataRows[0] 는 이미 sample 로 들어가 있음. 1~끝 추가.
        for (let i = 1; i < dataRows.length; i++) {
          const r = dataRows[i];
          const rowIdx = layout.sampleRow + i;     // 1-based — sampleRow 는 A1 표기 (예: 9)
          RECEIPT_EXCEL_HEADERS.forEach((h, c) => {
            const v = r[h] ?? '';
            const isAmount = h.includes('금액');
            const cell = ws.getCell(`${String.fromCharCode(65 + c)}${rowIdx}`);
            if (typeof v === 'number') {
              cell.value = v;
              if (isAmount) cell.numFmt = '#,##0';
              cell.alignment = { horizontal: 'right', vertical: 'middle' };
            } else {
              cell.value = String(v);
              cell.alignment = { horizontal: isAmount ? 'right' : 'left', vertical: 'middle' };
            }
            cell.font = { name: '맑은 고딕', size: 9 };
            cell.border = {
              top: { style: 'thin', color: { argb: 'FFBBBBBB' } },
              bottom: { style: 'thin', color: { argb: 'FFBBBBBB' } },
              left: { style: 'thin', color: { argb: 'FFBBBBBB' } },
              right: { style: 'thin', color: { argb: 'FFBBBBBB' } },
            };
            // 상태 컬럼이면 드롭다운 추가
            if (c === statusColIdx) {
              cell.dataValidation = {
                type: 'list',
                allowBlank: true,
                formulae: ['"완료,지연,취소,예정"'],
              };
            }
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

    // 계약별 patch 묶기
    const patches = new Map<string, { eventId: string; status: ScheduleEvent['status']; doneDate?: string; note?: string }[]>();
    let skipped = 0;
    for (const row of selectedRows) {
      const found = findEvent(row);
      if (!found) { skipped++; continue; }
      const doneDate = row.status === '완료'
        ? (row.doneDate || row.refDueDate || found.event.dueDate)
        : undefined;
      const patch = {
        eventId: found.event.id,
        status: row.status,
        doneDate,
        note: row.note,
      };
      const list = patches.get(found.contract.id) ?? [];
      list.push(patch);
      patches.set(found.contract.id, list);
    }
    if (patches.size === 0) {
      alert('매칭되는 계약 회차가 없습니다.');
      return;
    }
    const totalUpdates = [...patches.values()].reduce((s, l) => s + l.length, 0);
    if (!confirm(`${patches.size}개 계약 / ${totalUpdates}건 회차 일괄 적용할까요?${skipped > 0 ? `\n(${skipped}건은 매칭 실패로 건너뜀)` : ''}`)) return;
    onApply([...patches.entries()].map(([contractId, eventPatches]) => ({ contractId, eventPatches })));
    setOpen(false);
    setResult(null);
    setChecked(new Set());
  }

  const okCount = result?.rows.filter((r) => rowMatchStatus(r).ok).length ?? 0;
  const errCount = (result?.rows.length ?? 0) - okCount;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="btn">
          <ArrowsClockwise size={14} weight="bold" /> 수납 일괄
        </button>
      </DialogTrigger>
      <DialogContent title="수납 일괄 업로드" size="xl">
        <Tabs value="excel" onValueChange={() => {}}>
          <TabsList>
            <TabsTrigger value="excel">
              <FileXls size={14} className="mr-1.5 inline" /> 엑셀
            </TabsTrigger>
          </TabsList>

          <TabsContent value="excel">
            <div className="space-y-3" style={{ paddingTop: 8 }}>
              <div className="text-xs" style={{ background: 'var(--bg-card)', padding: 8, borderRadius: 4 }}>
                <strong>수납 일괄 처리</strong>
                <br />· ① <strong>양식 다운로드</strong> — 활성 계약의 미완료(예정/지연) 수납 회차가 자동 채워짐
                <br />· ② 엑셀에서 「상태」 = 완료/지연/취소 마킹 + 완료 시 「입금일」 기입
                <br />· ③ 업로드 → 미리보기에서 적용할 행 체크 → [선택 N건 적용]
                <br />· 필수 <strong>{RECEIPT_EXCEL_REQUIRED.length}</strong> · 부가 <strong>{RECEIPT_EXCEL_OPTIONAL.length}</strong> (총 {RECEIPT_EXCEL_HEADERS.length} 컬럼)
              </div>

              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-sm" onClick={downloadTemplate} disabled={downloading}>
                  <DownloadSimple size={12} weight="bold" /> {downloading ? '생성 중…' : '① 양식 다운로드 (미완료 회차 prefill)'}
                </button>
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
                <div style={{ marginTop: 6 }}>{busy ? '읽는 중...' : '② 엑셀 파일을 드롭하거나 클릭하여 선택'}</div>
                <div className="text-weak text-xs" style={{ marginTop: 4 }}>.xlsx / .xls / .csv</div>
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }}
                  onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void loadFile(f); }} />
              </div>

              {error && (
                <div style={{ color: 'var(--alert-red-text)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Warning size={14} weight="fill" /> {error}
                </div>
              )}

              {/* 미리보기 — 업로드 전에도 헤더+체크박스 미리 표시 */}
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
                      <th style={{ width: 50 }} className="num">회차</th>
                      <th style={{ width: 100 }}>차량/임차인</th>
                      <th style={{ width: 90, textAlign: 'right' }}>회차금액</th>
                      <th style={{ width: 95 }}>예정일</th>
                      <th style={{ width: 70 }}>처리</th>
                      <th style={{ width: 95 }}>입금일</th>
                      <th>비고 / 오류</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!result || result.rows.length === 0 ? (
                      <tr><td colSpan={10} className="jpk-table-empty">엑셀 업로드 시 행이 채워집니다.</td></tr>
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
                          <td className="num">{r.cycle || '-'}</td>
                          <td className="text-xs">
                            <span className="mono">{r.refPlate ?? '-'}</span>
                            <br />
                            <span className="dim">{r.refCustomer ?? ''}</span>
                          </td>
                          <td className="num">{r.refAmount?.toLocaleString('ko-KR') ?? '-'}</td>
                          <td className="date">{r.refDueDate ?? '-'}</td>
                          <td>
                            <span className={`badge ${r.status === '완료' ? 'badge-green' : r.status === '지연' ? 'badge-red' : r.status === '취소' ? 'badge' : 'badge-blue'}`}>
                              {r.status}
                            </span>
                          </td>
                          <td className="date">{r.doneDate ?? '-'}</td>
                          <td className="text-xs" style={{ color: m.ok ? undefined : 'var(--alert-red-text)' }}>
                            {m.ok ? (r.note ?? '') : m.reason}
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
          </TabsContent>
        </Tabs>

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
      </DialogContent>
    </Dialog>
  );
}
