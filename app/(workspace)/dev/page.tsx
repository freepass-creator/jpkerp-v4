'use client';

import { Fragment, useState, useEffect } from 'react';
import { Trash, TrashSimple, CaretRight, CaretDown, CurrencyKrw, Truck } from '@phosphor-icons/react';
import { ref, onValue, set, get } from 'firebase/database';
import { PageShell } from '@/components/layout/page-shell';
import { Dialog, DialogContent, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { getRtdb } from '@/lib/firebase/client';
import { useCompanyStore } from '@/lib/use-company-store';
import { useAssetStore } from '@/lib/use-asset-store';
import { useContractStore } from '@/lib/use-contract-store';
import { useLedgerStore } from '@/lib/use-ledger-store';
import { cn } from '@/lib/cn';

/**
 * 개발도구 — RTDB 데이터 점검·정리.
 * 잘못 등록된 데이터 삭제용 단일 진입점. 운영 안정 후 권한 제한 추가.
 */

type Tab = 'companies' | 'assets' | 'contracts' | 'ledger' | 'other';

const TABS: { v: Tab; label: string }[] = [
  { v: 'companies', label: '회사' },
  { v: 'assets', label: '자산' },
  { v: 'contracts', label: '계약' },
  { v: 'ledger', label: '계좌내역' },
  { v: 'other', label: '기타 노드' },
];

const KNOWN_PATHS = new Set(['companies', 'assets', 'contracts', 'ledger']);

type OtherNode = { key: string; count: number };

export default function DevPage() {
  const [tab, setTab] = useState<Tab>('companies');
  const [companies, setCompanies] = useCompanyStore();
  const [assets, setAssets] = useAssetStore();
  const [contracts, setContracts] = useContractStore();
  const [entries, setEntries] = useLedgerStore();
  const [otherNodes, setOtherNodes] = useState<OtherNode[]>([]);

  // 기타 탭 — RTDB 루트 자식 키 중 KNOWN_PATHS 외 모든 노드 카운트
  useEffect(() => {
    if (tab !== 'other') return;
    const unsub = onValue(ref(getRtdb(), '/'), (snap) => {
      const root = (snap.val() ?? {}) as Record<string, unknown>;
      const list: OtherNode[] = [];
      for (const [k, v] of Object.entries(root)) {
        if (KNOWN_PATHS.has(k)) continue;
        const count = v && typeof v === 'object' ? Object.keys(v as object).length : 0;
        list.push({ key: k, count });
      }
      list.sort((a, b) => a.key.localeCompare(b.key));
      setOtherNodes(list);
    });
    return unsub;
  }, [tab]);

  const counts: Record<Tab, number> = {
    companies: companies.length,
    assets: assets.length,
    contracts: contracts.length,
    ledger: entries.length,
    other: otherNodes.length,
  };

  const [purgeOpen, setPurgeOpen] = useState(false);

  /** 다이얼로그에서 선택된 노드들 삭제 — selected 가 비어있으면 noop. */
  function purge(selected: { companies: boolean; assets: boolean; contracts: boolean; ledger: boolean }) {
    const lines: string[] = [];
    if (selected.companies && counts.companies > 0) lines.push(`회사 ${counts.companies}`);
    if (selected.assets && counts.assets > 0) lines.push(`자산 ${counts.assets}`);
    if (selected.contracts && counts.contracts > 0) lines.push(`계약 ${counts.contracts}`);
    if (selected.ledger && counts.ledger > 0) lines.push(`계좌내역 ${counts.ledger}`);
    if (lines.length === 0) return;
    if (!confirm(`다음을 삭제합니다.\n${lines.join(' · ')}\n\n되돌릴 수 없습니다. 계속할까요?`)) return;
    if (selected.companies) setCompanies([]);
    if (selected.assets) setAssets([]);
    if (selected.contracts) setContracts([]);
    if (selected.ledger) setEntries([]);
    setPurgeOpen(false);
  }

  /** 시드 — 수납생성: 모든 계약의 미경과 회차를 일괄 완료 처리 (보증금 포함 가정). */
  function seedReceipts() {
    if (contracts.length === 0) { alert('계약 없음 — 먼저 계약을 등록하세요.'); return; }
    if (!confirm(`전체 계약 ${contracts.length}건의 만기 도래한 수납 회차 + 보증금을 일괄 납부 처리합니다.\n계속할까요?`)) return;
    const today = new Date().toISOString().slice(0, 10);
    setContracts((prev) => prev.map((c) => ({
      ...c,
      events: c.events.map((e) =>
        e.type === '수납' && e.dueDate <= today && e.status === '예정'
          ? { ...e, status: '완료' as const, doneDate: e.dueDate }
          : e,
      ),
    })));
  }

  /** 시드 — 출고생성: 모든 계약의 출고 이벤트 완료 + 자산 상태 운행중 전환. */
  function seedDeliveries() {
    if (contracts.length === 0) { alert('계약 없음 — 먼저 계약을 등록하세요.'); return; }
    if (!confirm(`전체 계약 ${contracts.length}건의 출고를 완료 처리하고 매칭 자산을 운행중으로 전환합니다.\n계속할까요?`)) return;
    const today = new Date().toISOString().slice(0, 10);
    const platesInContracts = new Set(contracts.map((c) => c.plate));
    setContracts((prev) => prev.map((c) => ({
      ...c,
      status: '운행중' as const,
      events: c.events.map((e) =>
        e.type === '출고' && e.status === '예정'
          ? { ...e, status: '완료' as const, doneDate: today }
          : e,
      ),
    })));
    setAssets((prev) => prev.map((a) =>
      platesInContracts.has(a.plate) && (a.status === '대기' || a.status === '등록예정')
        ? { ...a, status: '운행중' as const }
        : a,
    ));
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
        <>
          <button className="btn" onClick={seedReceipts} title="모든 계약의 만기 도래 회차 + 보증금 일괄 납부 처리">
            <CurrencyKrw size={14} weight="bold" /> 수납생성
          </button>
          <button className="btn" onClick={seedDeliveries} title="모든 계약의 출고 완료 + 자산 운행중 전환">
            <Truck size={14} weight="bold" /> 출고생성
          </button>
          <button className="btn" onClick={() => setPurgeOpen(true)}>
            <TrashSimple size={14} weight="bold" /> 데이터 삭제
          </button>
        </>
      }
    >
      <div className="table-wrap">
        {tab === 'companies' && <CompaniesTable companies={companies} setCompanies={setCompanies} />}
        {tab === 'assets' && <AssetsTable assets={assets} setAssets={setAssets} />}
        {tab === 'contracts' && <ContractsTable contracts={contracts} setContracts={setContracts} />}
        {tab === 'ledger' && <LedgerTable entries={entries} setEntries={setEntries} />}
        {tab === 'other' && <OtherNodesTable nodes={otherNodes} />}
      </div>

      <PurgeDialog open={purgeOpen} onOpenChange={setPurgeOpen} counts={counts} onPurge={purge} />
    </PageShell>
  );
}

/* ─── 데이터 삭제 다이얼로그 ─── */
function PurgeDialog({
  open, onOpenChange, counts, onPurge,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  counts: Record<Tab, number>;
  onPurge: (sel: { companies: boolean; assets: boolean; contracts: boolean; ledger: boolean }) => void;
}) {
  const [sel, setSel] = useState({ companies: false, assets: false, contracts: false, ledger: false });

  // 다이얼로그 열릴 때마다 선택 초기화
  useEffect(() => {
    if (open) setSel({ companies: false, assets: false, contracts: false, ledger: false });
  }, [open]);

  const total = counts.companies + counts.assets + counts.contracts + counts.ledger;
  const selectedCount = (sel.companies ? counts.companies : 0)
                      + (sel.assets ? counts.assets : 0)
                      + (sel.contracts ? counts.contracts : 0)
                      + (sel.ledger ? counts.ledger : 0);
  const someSelected = selectedCount > 0;

  const ROWS: Array<[keyof typeof sel, string, number]> = [
    ['companies', '회사', counts.companies],
    ['assets', '자산', counts.assets],
    ['contracts', '계약', counts.contracts],
    ['ledger', '계좌내역', counts.ledger],
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="데이터 삭제" size="md">
        <div className="space-y-3">
          <div className="alert alert-warn">
            삭제는 되돌릴 수 없습니다. 운영 데이터가 있는지 다시 한 번 확인하세요.
          </div>
          <div className="space-y-1">
            {ROWS.map(([key, label, count]) => (
              <label key={key} className="flex items-center justify-between p-2"
                     style={{ border: '1px solid var(--border)', cursor: count === 0 ? 'not-allowed' : 'pointer', opacity: count === 0 ? 0.5 : 1 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" disabled={count === 0}
                         checked={sel[key]}
                         onChange={(e) => setSel((p) => ({ ...p, [key]: e.target.checked }))} />
                  <span className="text-medium">{label}</span>
                </span>
                <span className="text-sub">{count.toLocaleString('ko-KR')}건</span>
              </label>
            ))}
          </div>
          <div className="text-weak text-xs">
            기타 노드 삭제는 [기타 노드] 탭에서 노드별로 진행 — 운영 외 데이터 보호용.
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild><button className="btn">취소</button></DialogClose>
          <button className="btn" disabled={!someSelected} onClick={() => onPurge(sel)}>
            선택 삭제 {someSelected && `(${selectedCount.toLocaleString('ko-KR')}건)`}
          </button>
          <button className="btn btn-primary" disabled={total === 0}
                  onClick={() => onPurge({ companies: true, assets: true, contracts: true, ledger: true })}>
            모두 삭제 {total > 0 && `(${total.toLocaleString('ko-KR')}건)`}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── 기타 노드 ─── */
function OtherNodesTable({ nodes }: { nodes: OtherNode[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [items, setItems] = useState<Record<string, [string, unknown][]>>({});

  async function loadItems(key: string) {
    try {
      const snap = await get(ref(getRtdb(), key));
      const val = snap.val();
      const entries = val && typeof val === 'object' ? Object.entries(val) : [];
      setItems((prev) => ({ ...prev, [key]: entries }));
    } catch (e) {
      console.error('[dev] loadItems failed', e);
    }
  }
  function toggle(key: string) {
    if (expanded === key) {
      setExpanded(null);
    } else {
      setExpanded(key);
      void loadItems(key);
    }
  }

  const removeNode = async (key: string, count: number) => {
    if (!confirm(`/${key} 노드 전체 ${count}건 삭제할까요? 되돌릴 수 없습니다.`)) return;
    try {
      await set(ref(getRtdb(), key), null);
    } catch (e) {
      alert(`삭제 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const removeItem = async (nodeKey: string, itemKey: string) => {
    if (!confirm(`/${nodeKey}/${itemKey} 1건 삭제할까요?`)) return;
    try {
      await set(ref(getRtdb(), `${nodeKey}/${itemKey}`), null);
      await loadItems(nodeKey);
    } catch (e) {
      alert(`삭제 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <table className="table">
      <thead>
        <tr>
          <th style={{ width: 30 }}></th>
          <th>노드 경로</th>
          <th className="num">건수</th>
          <th className="center" style={{ width: 110 }}></th>
        </tr>
      </thead>
      <tbody>
        {nodes.length === 0 ? (
          <tr><td colSpan={4} className="empty-row">jpkerp 4개 노드 외에 RTDB 다른 노드 없음</td></tr>
        ) : nodes.map((n) => (
          <Fragment key={n.key}>
            <tr onClick={() => toggle(n.key)} style={{ cursor: 'pointer' }}>
              <td className="center">
                {expanded === n.key ? <CaretDown size={11} /> : <CaretRight size={11} />}
              </td>
              <td className="mono text-medium">/{n.key}</td>
              <td className="num">{n.count}</td>
              <td className="center" onClick={(e) => e.stopPropagation()}>
                <button className="btn btn-sm" onClick={() => removeNode(n.key, n.count)}>
                  <TrashSimple size={12} weight="bold" /> 노드 전체
                </button>
              </td>
            </tr>
            {expanded === n.key && (items[n.key] ?? []).map(([itemKey, itemVal]) => (
              <tr key={`${n.key}/${itemKey}`} style={{ background: 'var(--bg-stripe)' }}>
                <td></td>
                <td colSpan={2} className="mono dim" style={{ paddingLeft: 20 }}>
                  <span style={{ color: 'var(--text-main)', fontWeight: 500 }}>{itemKey}</span>
                  <span style={{ marginLeft: 12, color: 'var(--text-weak)' }}>
                    {previewValue(itemVal)}
                  </span>
                </td>
                <td className="center">
                  <button className="btn btn-sm" onClick={() => removeItem(n.key, itemKey)}>
                    <Trash size={12} weight="bold" /> 삭제
                  </button>
                </td>
              </tr>
            ))}
            {expanded === n.key && (items[n.key]?.length ?? 0) === 0 && (
              <tr style={{ background: 'var(--bg-stripe)' }}>
                <td></td>
                <td colSpan={3} className="dim" style={{ paddingLeft: 20 }}>(빈 노드)</td>
              </tr>
            )}
          </Fragment>
        ))}
      </tbody>
    </table>
  );
}

/** 값 미리보기 — 객체면 키 갯수, 배열이면 길이, 원시값이면 그대로 */
function previewValue(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return `[${v.length}]`;
  if (typeof v === 'object') {
    const keys = Object.keys(v as object);
    return `{${keys.length}} ${keys.slice(0, 3).join(', ')}${keys.length > 3 ? ' ...' : ''}`;
  }
  const s = String(v);
  return s.length > 80 ? s.slice(0, 80) + '...' : s;
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
          <th className="center" style={{ width: 80 }}></th>
        </tr>
      </thead>
      <tbody>
        {companies.length === 0 ? (
          <tr><td colSpan={7} className="empty-row">등록된 회사 없음</td></tr>
        ) : companies.map((c, i) => (
          <tr key={c.code || `__${i}__`}>
            <td className="plate text-medium">{c.code}</td>
            <td>{c.name}</td>
            <td>{c.ceo || '-'}</td>
            <td className="mono">{c.bizNo}</td>
            <td className="num">{c.accounts?.length ?? 0}</td>
            <td className="num">{c.cards?.length ?? 0}</td>
            <td className="center">
              <button className="btn btn-sm" onClick={() => removeOne(c.code, c.name)} title="삭제">
                <Trash size={12} weight="bold" /> 삭제
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
          <th className="center" style={{ width: 80 }}></th>
        </tr>
      </thead>
      <tbody>
        {assets.length === 0 ? (
          <tr><td colSpan={9} className="empty-row">등록된 자산 없음</td></tr>
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
              <button className="btn btn-sm" onClick={() => removeOne(a.id, a.plate)} title="삭제">
                <Trash size={12} weight="bold" /> 삭제
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
          <th className="center" style={{ width: 80 }}></th>
        </tr>
      </thead>
      <tbody>
        {contracts.length === 0 ? (
          <tr><td colSpan={9} className="empty-row">등록된 계약 없음</td></tr>
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
              <button className="btn btn-sm" onClick={() => removeOne(c.id, c.contractNo)} title="삭제">
                <Trash size={12} weight="bold" /> 삭제
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
          <th className="center" style={{ width: 80 }}></th>
        </tr>
      </thead>
      <tbody>
        {entries.length === 0 ? (
          <tr><td colSpan={9} className="empty-row">등록된 거래 없음</td></tr>
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
              <button className="btn btn-sm" onClick={() => removeOne(e.id, e.memo)} title="삭제">
                <Trash size={12} weight="bold" /> 삭제
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
