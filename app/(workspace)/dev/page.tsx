'use client';

import { useState } from 'react';
import { Trash, TrashSimple } from '@phosphor-icons/react';
import { PageShell } from '@/components/layout/page-shell';
import { useCompanyStore } from '@/lib/use-company-store';
import { useAssetStore } from '@/lib/use-asset-store';
import { useContractStore } from '@/lib/use-contract-store';
import { useLedgerStore } from '@/lib/use-ledger-store';
import { cn } from '@/lib/cn';

/**
 * 개발도구 — RTDB 데이터 점검·정리.
 * 잘못 등록된 데이터 삭제용 단일 진입점. 운영 안정 후 권한 제한 추가.
 */

type Tab = 'companies' | 'assets' | 'contracts' | 'ledger';

const TABS: { v: Tab; label: string }[] = [
  { v: 'companies', label: '회사' },
  { v: 'assets', label: '자산' },
  { v: 'contracts', label: '계약' },
  { v: 'ledger', label: '계좌내역' },
];

export default function DevPage() {
  const [tab, setTab] = useState<Tab>('companies');

  return (
    <PageShell>
      <div style={{ display: 'flex', gap: 4, padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
        {TABS.map((t) => (
          <button
            key={t.v}
            type="button"
            className={cn('chip', tab === t.v && 'active')}
            onClick={() => setTab(t.v)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 12 }}>
        {tab === 'companies' && <CompaniesPanel />}
        {tab === 'assets' && <AssetsPanel />}
        {tab === 'contracts' && <ContractsPanel />}
        {tab === 'ledger' && <LedgerPanel />}
      </div>
    </PageShell>
  );
}

/* ─── 회사 ─── */
function CompaniesPanel() {
  const [companies, setCompanies] = useCompanyStore();
  const removeOne = (code: string, name: string) => {
    if (!confirm(`회사 "${name}" (${code}) 삭제할까요?`)) return;
    setCompanies((p) => p.filter((c) => c.code !== code));
  };
  const clearAll = () => {
    if (companies.length === 0) return;
    if (!confirm(`회사 전체 ${companies.length}건 삭제할까요? 되돌릴 수 없습니다.`)) return;
    setCompanies([]);
  };
  return (
    <PanelLayout
      title="회사정보"
      count={companies.length}
      onClearAll={clearAll}
      headers={['회사코드', '회사명', '대표자', '사업자등록번호', '계좌수', '카드수']}
    >
      {companies.map((c) => (
        <Row
          key={c.code}
          cells={[c.code, c.name, c.ceo || '-', c.bizNo, String(c.accounts?.length ?? 0), String(c.cards?.length ?? 0)]}
          onDelete={() => removeOne(c.code, c.name)}
        />
      ))}
    </PanelLayout>
  );
}

/* ─── 자산 ─── */
function AssetsPanel() {
  const [assets, setAssets] = useAssetStore();
  const removeOne = (id: string, plate: string) => {
    if (!confirm(`자산 "${plate || id}" 삭제할까요?`)) return;
    setAssets((p) => p.filter((a) => a.id !== id));
  };
  const clearAll = () => {
    if (assets.length === 0) return;
    if (!confirm(`자산 전체 ${assets.length}건 삭제할까요? 되돌릴 수 없습니다.`)) return;
    setAssets([]);
  };
  return (
    <PanelLayout
      title="자산"
      count={assets.length}
      onClearAll={clearAll}
      headers={['ID', '회사', '차량번호', '차명', '차대번호', '상태']}
    >
      {assets.map((a) => (
        <Row
          key={a.id}
          cells={[a.id, a.companyCode, a.plate || '-', a.vehicleName || '-', a.vin || '-', a.status]}
          onDelete={() => removeOne(a.id, a.plate)}
        />
      ))}
    </PanelLayout>
  );
}

/* ─── 계약 ─── */
function ContractsPanel() {
  const [contracts, setContracts] = useContractStore();
  const removeOne = (id: string, contractNo: string) => {
    if (!confirm(`계약 "${contractNo || id}" 삭제할까요?`)) return;
    setContracts((p) => p.filter((c) => c.id !== id));
  };
  const clearAll = () => {
    if (contracts.length === 0) return;
    if (!confirm(`계약 전체 ${contracts.length}건 삭제할까요? 되돌릴 수 없습니다.`)) return;
    setContracts([]);
  };
  return (
    <PanelLayout
      title="계약"
      count={contracts.length}
      onClearAll={clearAll}
      headers={['ID', '회사', '계약번호', '차량번호', '고객', '상태']}
    >
      {contracts.map((c) => (
        <Row
          key={c.id}
          cells={[c.id, c.companyCode, c.contractNo, c.plate, c.customerName, c.status]}
          onDelete={() => removeOne(c.id, c.contractNo)}
        />
      ))}
    </PanelLayout>
  );
}

/* ─── 계좌내역 ─── */
function LedgerPanel() {
  const [entries, setEntries] = useLedgerStore();
  const removeOne = (id: string, memo: string) => {
    if (!confirm(`거래 "${memo}" 삭제할까요?`)) return;
    setEntries((p) => p.filter((e) => e.id !== id));
  };
  const clearAll = () => {
    if (entries.length === 0) return;
    if (!confirm(`계좌내역 전체 ${entries.length}건 삭제할까요? 되돌릴 수 없습니다.`)) return;
    setEntries([]);
  };
  return (
    <PanelLayout
      title="계좌내역"
      count={entries.length}
      onClearAll={clearAll}
      headers={['ID', '회사', '거래일시', '입금', '출금', '적요', '상대']}
    >
      {entries.map((e) => (
        <Row
          key={e.id}
          cells={[
            e.id,
            e.companyCode,
            e.txDate,
            e.deposit ? e.deposit.toLocaleString('ko-KR') : '',
            e.withdraw ? e.withdraw.toLocaleString('ko-KR') : '',
            e.memo,
            e.counterparty ?? '',
          ]}
          onDelete={() => removeOne(e.id, e.memo)}
        />
      ))}
    </PanelLayout>
  );
}

/* ─── 공용 레이아웃 ─── */
function PanelLayout({
  title, count, onClearAll, headers, children,
}: {
  title: string;
  count: number;
  onClearAll: () => void;
  headers: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className="text-medium">{title} <span className="text-weak">({count})</span></span>
        <button className="btn" disabled={count === 0} onClick={onClearAll}>
          <TrashSimple size={14} weight="bold" /> 전체 삭제
        </button>
      </div>
      {count === 0 ? (
        <div className="text-weak" style={{ padding: '32px 0', textAlign: 'center' }}>등록된 데이터 없음</div>
      ) : (
        <div className="border" style={{ borderColor: 'var(--border)', overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                {headers.map((h) => <th key={h}>{h}</th>)}
                <th className="center" style={{ width: 50 }}></th>
              </tr>
            </thead>
            <tbody>{children}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Row({ cells, onDelete }: { cells: string[]; onDelete: () => void }) {
  return (
    <tr>
      {cells.map((c, i) => (
        <td key={i} className={i === 0 ? 'mono dim' : undefined}>{c}</td>
      ))}
      <td className="center">
        <button className="btn-ghost btn btn-sm" onClick={onDelete} title="삭제">
          <Trash size={11} />
        </button>
      </td>
    </tr>
  );
}
