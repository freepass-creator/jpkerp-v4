'use client';

import { useMemo, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { CheckCircle, ShieldWarning } from '@phosphor-icons/react';
import { PageShell } from '@/components/layout/page-shell';
import { PENDING_SUBTABS, usePendingSubtabPending } from '@/lib/pending-subtabs';
import { useAssetStore } from '@/lib/use-asset-store';
import { useContractStore } from '@/lib/use-contract-store';
import { useCompanyStore } from '@/lib/use-company-store';
import { useLedgerStore } from '@/lib/use-ledger-store';
import { collectIntegrity, type IntegrityRow, type IntegrityKind } from '@/lib/integrity-checks';
import { JpkTable, type JpkColumn, type JpkTableApi } from '@/components/shared/jpk-table';
import { cn } from '@/lib/cn';

/** 정합성 — 자산/계약/계좌내역 간 모순·누락 점검. */
export default function IntegrityPage() {
  const [assets] = useAssetStore();
  const [contracts] = useContractStore();
  const [companies] = useCompanyStore();
  const [entries] = useLedgerStore();
  const subTabPending = usePendingSubtabPending();
  const [filtered, setFiltered] = useState<readonly IntegrityRow[]>([]);
  const tableRef = useRef<JpkTableApi<IntegrityRow> | null>(null);

  const rows = useMemo(
    () => collectIntegrity(assets, contracts, companies, entries),
    [assets, contracts, companies, entries],
  );

  const counts = useMemo(() => {
    const c: Record<IntegrityKind, number> = {
      회사미매칭자산: 0, 회사미매칭계약: 0, plate불일치: 0, 계좌내역누락: 0,
      자산필드누락: 0, 계약필드누락: 0, 회사필드누락: 0,
      매각자산계약중: 0, 회사불일치: 0, 날짜역전계약: 0, 날짜역전검사: 0, 보증금분납불일치: 0,
    };
    for (const r of rows) c[r.kind]++;
    return c;
  }, [rows]);

  const columns = useMemo<JpkColumn<IntegrityRow>[]>(() => [
    { headerName: '종류', field: 'kind', width: 130, filterable: true,
      cellRenderer: ({ value }) => <KindBadge kind={value as IntegrityKind} /> },
    { headerName: '회사', field: 'companyCode', width: 80, filterable: true,
      cellRenderer: ({ value }) => value
        ? <span className="plate">{value as string}</span>
        : <span className="text-red">미정</span> },
    { headerName: '차량번호', field: 'plate', width: 110, filterable: true,
      cellRenderer: ({ value }) => (value as string)
        ? <span className="plate">{value as string}</span>
        : <span className="text-weak">-</span> },
    { headerName: '대상', field: 'target', width: 200, filterable: true,
      cellRenderer: ({ value }) => <span>{(value as string) || '-'}</span> },
    { headerName: '설명', field: 'description', minWidth: 240, flex: 1,
      cellRenderer: ({ value }) => <span className="dim">{value as string}</span> },
    { headerName: '비고', field: 'extra', width: 160,
      cellRenderer: ({ value }) => <span className="dim">{(value as string) || '-'}</span> },
    { headerName: '바로가기', width: 80, align: 'center',
      valueGetter: ({ data }) => data.href ?? '',
      cellRenderer: ({ data }) => data.href
        ? <Link href={data.href} className="link">이동 →</Link>
        : <span className="text-weak">-</span> },
  ], []);

  const getRowId = useCallback((r: IntegrityRow) => r.id, []);

  return (
    <PageShell
      subTabs={PENDING_SUBTABS}
      subTabPending={subTabPending}
      footerLeft={
        <>
          <span className="stat-item">전체 <strong>{filtered.length}</strong>{filtered.length !== rows.length && <span className="text-weak"> / {rows.length}</span>}</span>
          {counts.매각자산계약중 > 0 && <span className="stat-item alert">매각자산 계약중 <strong>{counts.매각자산계약중}</strong></span>}
          {counts.회사불일치 > 0 && <span className="stat-item alert">회사 불일치 <strong>{counts.회사불일치}</strong></span>}
          {counts.plate불일치 > 0 && <span className="stat-item alert">plate 불일치 <strong>{counts.plate불일치}</strong></span>}
          {counts.날짜역전계약 > 0 && <span className="stat-item alert">계약 날짜역전 <strong>{counts.날짜역전계약}</strong></span>}
          {counts.날짜역전검사 > 0 && <span className="stat-item alert">검사 날짜역전 <strong>{counts.날짜역전검사}</strong></span>}
          {counts.계좌내역누락 > 0 && <span className="stat-item alert">계좌내역 누락 <strong>{counts.계좌내역누락}</strong></span>}
          <span className="stat-divider" />
          {counts.회사미매칭자산 > 0 && <span className="stat-item">회사미매칭 자산 <strong>{counts.회사미매칭자산}</strong></span>}
          {counts.회사미매칭계약 > 0 && <span className="stat-item">회사미매칭 계약 <strong>{counts.회사미매칭계약}</strong></span>}
          {counts.자산필드누락 > 0 && <span className="stat-item">자산 필드누락 <strong>{counts.자산필드누락}</strong></span>}
          {counts.계약필드누락 > 0 && <span className="stat-item">계약 필드누락 <strong>{counts.계약필드누락}</strong></span>}
          {counts.회사필드누락 > 0 && <span className="stat-item">회사 필드누락 <strong>{counts.회사필드누락}</strong></span>}
        </>
      }
    >
      {rows.length === 0 ? (
        <div className="page-section-center">
          <CheckCircle size={32} className="mx-auto" style={{ color: 'var(--alert-green-text)' }} />
          <div className="mt-2 text-medium">데이터 정합성 OK</div>
          <div className="mt-1 text-weak">자산/계약/계좌내역 간 모순·누락 없음.</div>
        </div>
      ) : (
        <JpkTable<IntegrityRow>
          ref={tableRef}
          columns={columns}
          rows={rows}
          getRowId={getRowId}
          storageKey="pending.integrity"
          onFilteredChange={setFiltered}
        />
      )}
    </PageShell>
  );
}

function KindBadge({ kind }: { kind: IntegrityKind }) {
  const map: Record<IntegrityKind, { tone: string; label: string }> = {
    회사미매칭자산:   { tone: 'badge-orange', label: '회사 미매칭 자산' },
    회사미매칭계약:   { tone: 'badge-orange', label: '회사 미매칭 계약' },
    plate불일치:      { tone: 'badge-red',    label: 'plate 불일치' },
    계좌내역누락:     { tone: 'badge-red',    label: '계좌내역 누락' },
    자산필드누락:     { tone: 'badge-orange', label: '자산 필드 누락' },
    계약필드누락:     { tone: 'badge-orange', label: '계약 필드 누락' },
    회사필드누락:     { tone: 'badge-orange', label: '회사 필드 누락' },
    매각자산계약중:    { tone: 'badge-red',    label: '매각자산 계약중' },
    회사불일치:       { tone: 'badge-red',    label: '회사 불일치' },
    날짜역전계약:     { tone: 'badge-red',    label: '계약 날짜 역전' },
    날짜역전검사:     { tone: 'badge-red',    label: '검사 날짜 역전' },
    보증금분납불일치:  { tone: 'badge-orange', label: '보증금 분납 불일치' },
  };
  const { tone, label } = map[kind];
  return <span className={cn('badge', tone)}>{label}</span>;
}
