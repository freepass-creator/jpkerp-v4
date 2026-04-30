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
  const [companies, setCompanies] = useCompanyStore();
  const [assets, setAssets] = useAssetStore();
  const [contracts, setContracts] = useContractStore();
  const [entries, setEntries] = useLedgerStore();

  const counts = {
    companies: companies.length,
    assets: assets.length,
    contracts: contracts.length,
    ledger: entries.length,
  };

  function clearCurrent() {
    if (tab === 'companies') {
      if (counts.companies === 0) return;
      if (!confirm(`회사 전체 ${counts.companies}건 삭제할까요? 되돌릴 수 없습니다.`)) return;
      setCompanies([]);
    } else if (tab === 'assets') {
      if (counts.assets === 0) return;
      if (!confirm(`자산 전체 ${counts.assets}건 삭제할까요? 되돌릴 수 없습니다.`)) return;
      setAssets([]);
    } else if (tab === 'contracts') {
      if (counts.contracts === 0) return;
      if (!confirm(`계약 전체 ${counts.contracts}건 삭제할까요? 되돌릴 수 없습니다.`)) return;
      setContracts([]);
    } else {
      if (counts.ledger === 0) return;
      if (!confirm(`계좌내역 전체 ${counts.ledger}건 삭제할까요? 되돌릴 수 없습니다.`)) return;
      setEntries([]);
    }
  }

  return (
    <PageShell
      filterbar={
        <div className="chip-group">
          {TABS.map((t) => (
            <button
              key={t.v}
              type="button"
              className={cn('chip', tab === t.v && 'active')}
              onClick={() => setTab(t.v)}
            >
              {t.label} ({counts[t.v]})
            </button>
          ))}
        </div>
      }
      footerLeft={<span className="stat-item">전체 <strong>{counts[tab]}</strong></span>}
      footerRight={
        <button className="btn" disabled={counts[tab] === 0} onClick={clearCurrent}>
          <TrashSimple size={14} weight="bold" /> 전체 삭제
        </button>
      }
    >
      <div className="table-wrap">
        {tab === 'companies' && <CompaniesTable companies={companies} setCompanies={setCompanies} />}
        {tab === 'assets' && <AssetsTable assets={assets} setAssets={setAssets} />}
        {tab === 'contracts' && <ContractsTable contracts={contracts} setContracts={setContracts} />}
        {tab === 'ledger' && <LedgerTable entries={entries} setEntries={setEntries} />}
      </div>
    </PageShell>
  );
}

/* ─── 회사 ─── */
function CompaniesTable({ companies, setCompanies }: {
  companies: ReturnType<typeof useCompanyStore>[0];
  setCompanies: ReturnType<typeof useCompanyStore>[1];
}) {
  const removeOne = (code: string, name: string) => {
    if (!confirm(`회사 "${name}" (${code}) 삭제할까요?`)) return;
    setCompanies((p) => p.filter((c) => c.code !== code));
  };
  return (
    <table className="table">
      <thead>
        <tr>
          <th>회사코드</th>
          <th>회사명</th>
          <th>대표자</th>
          <th>사업자등록번호</th>
          <th className="num">계좌</th>
          <th className="num">카드</th>
          <th className="center" style={{ width: 50 }}></th>
        </tr>
      </thead>
      <tbody>
        {companies.length === 0 ? (
          <tr><td colSpan={7} className="center dim" style={{ padding: '32px 0' }}>등록된 회사 없음</td></tr>
        ) : companies.map((c) => (
          <tr key={c.code}>
            <td className="plate text-medium">{c.code}</td>
            <td>{c.name}</td>
            <td>{c.ceo || '-'}</td>
            <td className="mono">{c.bizNo}</td>
            <td className="num">{c.accounts?.length ?? 0}</td>
            <td className="num">{c.cards?.length ?? 0}</td>
            <td className="center">
              <button className="btn-ghost btn btn-sm" onClick={() => removeOne(c.code, c.name)} title="삭제">
                <Trash size={11} />
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ─── 자산 ─── */
function AssetsTable({ assets, setAssets }: {
  assets: ReturnType<typeof useAssetStore>[0];
  setAssets: ReturnType<typeof useAssetStore>[1];
}) {
  const removeOne = (id: string, plate: string) => {
    if (!confirm(`자산 "${plate || id}" 삭제할까요?`)) return;
    setAssets((p) => p.filter((a) => a.id !== id));
  };
  return (
    <table className="table">
      <thead>
        <tr>
          <th>회사</th>
          <th>차량번호</th>
          <th>차명</th>
          <th>차대번호</th>
          <th>형식</th>
          <th>제작연월</th>
          <th>상태</th>
          <th className="mono dim">ID</th>
          <th className="center" style={{ width: 50 }}></th>
        </tr>
      </thead>
      <tbody>
        {assets.length === 0 ? (
          <tr><td colSpan={9} className="center dim" style={{ padding: '32px 0' }}>등록된 자산 없음</td></tr>
        ) : assets.map((a) => (
          <tr key={a.id}>
            <td className="plate">{a.companyCode}</td>
            <td className="plate text-medium">{a.plate || '-'}</td>
            <td>{a.vehicleName || '-'}</td>
            <td className="mono dim">{a.vin || '-'}</td>
            <td className="dim">{a.modelType || '-'}</td>
            <td className="dim">{a.manufactureDate || '-'}</td>
            <td>{a.status}</td>
            <td className="mono dim">{a.id}</td>
            <td className="center">
              <button className="btn-ghost btn btn-sm" onClick={() => removeOne(a.id, a.plate)} title="삭제">
                <Trash size={11} />
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ─── 계약 ─── */
function ContractsTable({ contracts, setContracts }: {
  contracts: ReturnType<typeof useContractStore>[0];
  setContracts: ReturnType<typeof useContractStore>[1];
}) {
  const removeOne = (id: string, contractNo: string) => {
    if (!confirm(`계약 "${contractNo || id}" 삭제할까요?`)) return;
    setContracts((p) => p.filter((c) => c.id !== id));
  };
  return (
    <table className="table">
      <thead>
        <tr>
          <th>회사</th>
          <th>계약번호</th>
          <th>차량번호</th>
          <th>고객</th>
          <th className="date">시작</th>
          <th className="date">만기</th>
          <th>상태</th>
          <th className="mono dim">ID</th>
          <th className="center" style={{ width: 50 }}></th>
        </tr>
      </thead>
      <tbody>
        {contracts.length === 0 ? (
          <tr><td colSpan={9} className="center dim" style={{ padding: '32px 0' }}>등록된 계약 없음</td></tr>
        ) : contracts.map((c) => (
          <tr key={c.id}>
            <td className="plate">{c.companyCode}</td>
            <td className="mono text-medium">{c.contractNo}</td>
            <td className="plate">{c.plate}</td>
            <td>{c.customerName}</td>
            <td className="date">{c.startDate}</td>
            <td className="date">{c.endDate}</td>
            <td>{c.status}</td>
            <td className="mono dim">{c.id}</td>
            <td className="center">
              <button className="btn-ghost btn btn-sm" onClick={() => removeOne(c.id, c.contractNo)} title="삭제">
                <Trash size={11} />
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ─── 계좌내역 ─── */
function LedgerTable({ entries, setEntries }: {
  entries: ReturnType<typeof useLedgerStore>[0];
  setEntries: ReturnType<typeof useLedgerStore>[1];
}) {
  const removeOne = (id: string, memo: string) => {
    if (!confirm(`거래 "${memo}" 삭제할까요?`)) return;
    setEntries((p) => p.filter((e) => e.id !== id));
  };
  return (
    <table className="table">
      <thead>
        <tr>
          <th>회사</th>
          <th className="date">거래일시</th>
          <th className="num">입금</th>
          <th className="num">출금</th>
          <th>적요</th>
          <th>상대</th>
          <th>계좌</th>
          <th className="mono dim">ID</th>
          <th className="center" style={{ width: 50 }}></th>
        </tr>
      </thead>
      <tbody>
        {entries.length === 0 ? (
          <tr><td colSpan={9} className="center dim" style={{ padding: '32px 0' }}>등록된 거래 없음</td></tr>
        ) : entries.map((e) => (
          <tr key={e.id}>
            <td className="plate">{e.companyCode}</td>
            <td className="date mono">{e.txDate}</td>
            <td className="num">{e.deposit ? e.deposit.toLocaleString('ko-KR') : ''}</td>
            <td className="num">{e.withdraw ? e.withdraw.toLocaleString('ko-KR') : ''}</td>
            <td>{e.memo}</td>
            <td className="dim">{e.counterparty ?? ''}</td>
            <td className="mono dim">{e.account ?? '-'}</td>
            <td className="mono dim">{e.id}</td>
            <td className="center">
              <button className="btn-ghost btn btn-sm" onClick={() => removeOne(e.id, e.memo)} title="삭제">
                <Trash size={11} />
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
