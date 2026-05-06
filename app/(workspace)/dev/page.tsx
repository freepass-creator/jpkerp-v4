'use client';

import { Fragment, useState, useEffect } from 'react';
import { Trash, TrashSimple, CaretRight, CaretDown, CurrencyKrw, Truck, ArrowClockwise, ArrowSquareOut, ShieldCheck, ClockCounterClockwise } from '@phosphor-icons/react';
import Link from 'next/link';
import { ref, onValue, set, get } from 'firebase/database';
import { PageShell } from '@/components/layout/page-shell';
import { Dialog, DialogContent, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { getRtdb } from '@/lib/firebase/client';
import { useCompanyStore } from '@/lib/use-company-store';
import { useAssetStore } from '@/lib/use-asset-store';
import { useContractStore } from '@/lib/use-contract-store';
import { useLedgerStore } from '@/lib/use-ledger-store';
import { useCustomerStore } from '@/lib/use-customer-store';
import { useInsuranceStore } from '@/lib/use-insurance-store';
import { useJournalStore } from '@/lib/use-journal-store';
import { useAuditStamp } from '@/lib/audit-fields';
import { ContractsImportPanel } from '@/components/dev/contracts-import';
import type { Contract } from '@/lib/sample-contracts';
import { todayStr } from '@/lib/date-utils';
import { cn } from '@/lib/cn';

/**
 * 개발도구 — 사용자 본인 전용 admin tool.
 * 양식 무시. 3 섹션: 데이터 삭제 / 데이터 생성 / 기타 노드.
 */

type Section = 'inspect' | 'import' | 'seed' | 'other';

const SECTION_LABEL: Record<Section, string> = {
  inspect: '데이터 점검',
  import:  '데이터 일괄등록',
  seed:    '시드·시뮬레이션',
  other:   '기타 노드',
};

/** RTDB 알려진 노드 — store 가 있으면 setter([]), 없으면 set(ref, null). */
const KNOWN_NODES = [
  'companies',
  'assets',
  'contracts',
  'customers',
  'insurances',
  'journal_entries',
  'ledger',
  'audit_logs',
  'event_uploads',
  'sms_logs',
] as const;

type OtherNode = { key: string; count: number };

const FIREBASE_CONSOLE_URL =
  'https://console.firebase.google.com/project/jpkerp/database/jpkerp-default-rtdb/data';

export default function DevPage() {
  const [section, setSection] = useState<Section>('inspect');

  // 모든 store
  const [companies, setCompanies] = useCompanyStore();
  const [assets, setAssets] = useAssetStore();
  const [contracts, setContracts] = useContractStore();
  const [ledger, setLedger] = useLedgerStore();
  const [customers, setCustomers] = useCustomerStore();
  const [insurances, setInsurances] = useInsuranceStore();
  const [journals, setJournals] = useJournalStore();

  // store 없는 노드 — count 만 따로 구독
  const [rawCounts, setRawCounts] = useState<Record<string, number | null>>({
    audit_logs: null,
    event_uploads: null,
    sms_logs: null,
  });
  useEffect(() => {
    const db = getRtdb();
    const unsubs = (['audit_logs', 'event_uploads', 'sms_logs'] as const).map((path) =>
      onValue(ref(db, path), (snap) => {
        const v = snap.val();
        const c = v && typeof v === 'object' ? Object.keys(v as object).length : 0;
        setRawCounts((p) => ({ ...p, [path]: c }));
      }),
    );
    return () => unsubs.forEach((u) => u());
  }, []);

  // 기타 노드 — KNOWN_NODES 외 모든 RTDB 루트
  const [otherNodes, setOtherNodes] = useState<OtherNode[]>([]);
  useEffect(() => {
    if (section !== 'other') return;
    const known = new Set<string>(KNOWN_NODES);
    const unsub = onValue(ref(getRtdb(), '/'), (snap) => {
      const root = (snap.val() ?? {}) as Record<string, unknown>;
      const list: OtherNode[] = [];
      for (const [k, v] of Object.entries(root)) {
        if (known.has(k)) continue;
        const count = v && typeof v === 'object' ? Object.keys(v as object).length : 0;
        list.push({ key: k, count });
      }
      list.sort((a, b) => a.key.localeCompare(b.key));
      setOtherNodes(list);
    });
    return unsub;
  }, [section]);

  // 수납생성 다이얼로그
  const [receiptOpen, setReceiptOpen] = useState(false);

  /** 출고생성 — 모든 계약 출고완료 + 자산 운행중. */
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

  /** 전체 RTDB 초기화 — KNOWN_NODES 일괄 set null. */
  async function wipeRtdb() {
    const txt = prompt(
      '전체 RTDB 초기화 — 모든 노드 wipe. 권한 거부되는 건 표시만.\n\n계속하려면 "WIPE-ALL" 입력:',
    );
    if (txt !== 'WIPE-ALL') return;
    const db = getRtdb();
    const ok: string[] = [];
    const failed: string[] = [];
    for (const n of KNOWN_NODES) {
      try { await set(ref(db, n), null); ok.push(n); }
      catch (e) { failed.push(`${n} (${(e as Error).message?.slice(0, 50)})`); }
    }
    alert(
      `완료\n\n삭제 ${ok.length}개:\n${ok.join(', ')}\n\n`
      + `실패 ${failed.length}개 (Rules 거부 가능):\n${failed.join('\n')}`,
    );
  }

  const SECTIONS: Section[] = ['inspect', 'import', 'seed', 'other'];
  const deleteRows: DeleteRow[] = [
    { path: 'companies', label: '회사', count: companies.length, purge: () => setCompanies([]) },
    { path: 'assets', label: '자산', count: assets.length, purge: () => setAssets([]) },
    { path: 'contracts', label: '계약', count: contracts.length, purge: () => setContracts([]) },
    { path: 'customers', label: '고객', count: customers.length, purge: () => setCustomers([]) },
    { path: 'insurances', label: '보험', count: insurances.length, purge: () => setInsurances([]) },
    { path: 'journal_entries', label: '업무일지', count: journals.length, purge: () => setJournals([]) },
    { path: 'ledger', label: '자금일보', count: ledger.length, purge: () => setLedger([]) },
    { path: 'audit_logs', label: '감사로그', count: rawCounts.audit_logs, purge: () => purgeRawNode('audit_logs', '감사로그') },
    { path: 'event_uploads', label: '모바일업로드', count: rawCounts.event_uploads, purge: () => purgeRawNode('event_uploads', '모바일업로드') },
    { path: 'sms_logs', label: 'SMS로그', count: rawCounts.sms_logs, purge: () => purgeRawNode('sms_logs', 'SMS로그') },
  ];

  return (
    <>
    <PageShell
      filterbar={
        <div className="chip-group">
          {SECTIONS.map((s) => (
            <button
              key={s}
              type="button"
              className={cn('chip', section === s && 'active')}
              onClick={() => setSection(s)}
            >
              {SECTION_LABEL[s]}
            </button>
          ))}
        </div>
      }
      footerLeft={
        <span className="stat-item text-weak text-xs">사용자 본인 전용 — 운영 안정 후 권한 제한 추가</span>
      }
      footerRight={
        <>
          <span className="dev-group-box">
            <span className="dev-group-label">생성</span>
            <button className="btn btn-sm" onClick={() => setReceiptOpen(true)} title="고객 정보 + 미수 회차 입력 → events 재구성">
              <CurrencyKrw size={13} weight="bold" /> 수납생성
            </button>
            <button className="btn btn-sm" onClick={seedDeliveries} title="모든 계약 출고완료 + 자산 운행중">
              <Truck size={13} weight="bold" /> 출고생성
            </button>
          </span>
          <span className="dev-group-box">
            <span className="dev-group-label">보수</span>
            <Link href="/pending/integrity" className="btn btn-sm" title="14종 모순 점검">
              <ShieldCheck size={13} weight="bold" /> 정합성
            </Link>
            <Link href="/admin/audit" className="btn btn-sm" title="모든 변경 이력">
              <ClockCounterClockwise size={13} weight="bold" /> 감사로그
            </Link>
          </span>
          <span className="dev-group-box dev-group-box-danger">
            <span className="dev-group-label">위험</span>
            <button className="btn btn-sm" onClick={wipeRtdb} title="알려진 RTDB 노드 일괄 삭제" style={{ color: 'var(--alert-red-text)', borderColor: 'var(--alert-red-text)' }}>
              <TrashSimple size={13} weight="bold" /> 전체 초기화
            </button>
          </span>
          <a className="btn btn-sm" href={FIREBASE_CONSOLE_URL} target="_blank" rel="noreferrer" title="Firebase Console (RTDB)">
            <ArrowSquareOut size={13} weight="bold" /> Console
          </a>
          <button className="btn btn-sm" onClick={() => location.reload()} title="브라우저 새로고침">
            <ArrowClockwise size={13} weight="bold" />
          </button>
        </>
      }
    >
      {section === 'inspect' && <InspectSection rows={deleteRows} />}
      {section === 'import' && <ImportSection />}
      {section === 'seed' && <SeedSection onReceiptOpen={() => setReceiptOpen(true)} onSeedDeliveries={seedDeliveries} contractsCount={contracts.length} />}
      {section === 'other' && <OtherSection nodes={otherNodes} />}
    </PageShell>

    <ReceiptSeedDialog
      open={receiptOpen}
      onOpenChange={setReceiptOpen}
      contracts={contracts}
      setContracts={setContracts}
    />
    </>
  );
}

/** store 가 없는 RTDB 노드 직접 wipe. */
async function purgeRawNode(path: string, label: string) {
  if (!confirm(`${label} 노드 전체 삭제. 되돌릴 수 없습니다. 계속?`)) return;
  try {
    await set(ref(getRtdb(), path), null);
    alert(`${label} 삭제 완료`);
  } catch (e) {
    alert(`삭제 실패: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/* ─── 데이터 삭제 섹션 ─── */
type DeleteRow = {
  path: string;
  label: string;
  count: number | null;
  purge: () => void;
};

function InspectSection({ rows }: { rows: DeleteRow[] }) {
  function handlePurge(row: DeleteRow) {
    if (row.count === 0) { alert(`${row.label} 노드 비어있음.`); return; }
    const c = row.count == null ? '?' : row.count;
    if (!confirm(`${row.label} 노드 전체 ${c}건 삭제. 되돌릴 수 없습니다. 계속?`)) return;
    row.purge();
  }
  const totalKnown = rows.reduce((sum, r) => sum + (r.count ?? 0), 0);
  return (
    <div style={{ padding: 12 }}>
      <div className="text-weak text-xs" style={{ marginBottom: 10 }}>
        모든 알려진 RTDB 노드 카운트 + 노드 통째 삭제. 행 단위 삭제는 entity 페이지에서.
        총 <strong>{totalKnown}</strong>건.
      </div>
      <table className="table">
        <thead>
          <tr>
            <th style={{ width: 140 }}>노드</th>
            <th className="mono dim">RTDB 경로</th>
            <th className="num" style={{ width: 80 }}>건수</th>
            <th className="center" style={{ width: 150 }}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.path}>
              <td className="text-medium">{row.label}</td>
              <td className="mono dim">/{row.path}</td>
              <td className="num">{row.count == null ? '…' : row.count}</td>
              <td className="center">
                <button
                  className="btn btn-sm"
                  onClick={() => handlePurge(row)}
                  disabled={row.count === 0}
                  style={{
                    color: 'var(--alert-red-text)',
                    borderColor: 'var(--alert-red-text)',
                  }}
                >
                  <TrashSimple size={12} weight="bold" /> 노드 통째 삭제
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── 데이터 일괄등록 섹션 ─── */
function ImportSection() {
  return (
    <div style={{ padding: 12 }}>
      <div className="text-weak text-xs" style={{ marginBottom: 10 }}>
        TSV 양식 — 헤더 한 줄 + 데이터 행. 계약번호 일치 시 update, 없으면 신규 등록.
        <br />미수 회차 컬럼: <code>3,4,5</code> 같은 콤마 구분 / 비우면 자동 (오늘까지 도래분 완료) / <code>0</code> 또는 <code>없음</code> 이면 모두 완료
      </div>
      <ContractsImportPanel />
    </div>
  );
}

/* ─── 시드·시뮬레이션 섹션 ─── */
function SeedSection({
  onReceiptOpen, onSeedDeliveries, contractsCount,
}: {
  onReceiptOpen: () => void;
  onSeedDeliveries: () => void;
  contractsCount: number;
}) {
  return (
    <div style={{ padding: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      <div className="dev-card">
        <div className="dev-card-title">수납생성 — 마이그레이션</div>
        <p className="text-weak text-xs" style={{ marginBottom: 10 }}>
          기존 운영 데이터에서 옮겨올 때. 고객명·등록번호로 계약 찾고, 현재 미수 회차 수만 입력하면
          그 시점 기준 events 재구성.
          <br />· 미수 외 회차: 완료 처리
          <br />· 미수 N회차: 예정 (자동으로 /pending/overdue 표시)
        </p>
        <button className="btn" onClick={onReceiptOpen} disabled={contractsCount === 0}>
          <CurrencyKrw size={14} weight="bold" /> 수납생성 다이얼로그 열기
        </button>
        {contractsCount === 0 && (
          <div className="text-red text-xs" style={{ marginTop: 6 }}>계약 없음 — 먼저 계약 등록 필요</div>
        )}
      </div>

      <div className="dev-card">
        <div className="dev-card-title">출고생성 — 일괄 시뮬레이션</div>
        <p className="text-weak text-xs" style={{ marginBottom: 10 }}>
          모든 active 계약의 출고 events 를 완료 처리하고, 매칭 자산을 운행중 상태로 일괄 전환.
          신규 운영 셋업 시 시뮬레이션용. 운영 데이터엔 신중하게.
        </p>
        <button className="btn" onClick={onSeedDeliveries} disabled={contractsCount === 0}>
          <Truck size={14} weight="bold" /> 출고생성 일괄 실행
        </button>
        {contractsCount === 0 && (
          <div className="text-red text-xs" style={{ marginTop: 6 }}>계약 없음 — 먼저 계약 등록 필요</div>
        )}
      </div>
    </div>
  );
}

/* ─── 기타 노드 wrapper ─── */
function OtherSection({ nodes }: { nodes: OtherNode[] }) {
  return <OtherNodesTable nodes={nodes} />;
}

/* ─── 기타 노드 섹션 — KNOWN_NODES 외 RTDB 루트 ─── */
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
    <section className="dev-card">
      <div className="dev-card-title">기타 노드 (v3 잔여 · 미분류)</div>
      <div className="text-weak text-xs" style={{ marginBottom: 10 }}>
        알려진 10개 노드 외 RTDB 루트 직속 노드 + 개별 삭제.
      </div>
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
            <tr><td colSpan={4} className="empty-row">알려진 노드 외 RTDB 다른 노드 없음</td></tr>
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
    </section>
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

/* ─── 수납생성 다이얼로그 — 마이그레이션 도구 ─── */
function ReceiptSeedDialog({
  open, onOpenChange, contracts, setContracts,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  contracts: Contract[];
  setContracts: ReturnType<typeof useContractStore>[1];
}) {
  const audit = useAuditStamp();
  const [name, setName] = useState('');
  const [ident, setIdent] = useState('');
  const [overdueCount, setOverdueCount] = useState(0);

  useEffect(() => {
    if (open) { setName(''); setIdent(''); setOverdueCount(0); }
  }, [open]);

  const matched: Contract[] = (() => {
    const n = name.trim();
    const i = ident.replace(/[\s\-]/g, '').trim();
    if (!n && !i) return [];
    return contracts.filter((c) => {
      if (c.deletedAt) return false;
      const okN = n ? c.customerName.includes(n) : true;
      const okI = i ? c.customerIdent.replace(/[\s\-]/g, '').startsWith(i) : true;
      return okN && okI;
    });
  })();

  const target = matched.length === 1 ? matched[0] : null;
  const receiptEvents = target
    ? target.events.filter((e) => e.type === '수납').sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    : [];
  const totalReceipts = receiptEvents.length;
  const paidUntilCycle = totalReceipts - overdueCount;

  function apply() {
    if (!target) {
      alert(matched.length === 0 ? '매칭되는 계약 없음' : `매칭이 ${matched.length}건 — 등록번호 더 구체적으로 입력`);
      return;
    }
    const today = todayStr();
    if (!confirm(
      `${target.contractNo} (${target.customerName}, ${target.plate})\n`
      + `총 수납 ${totalReceipts}회차 → 미수 ${overdueCount}회차로 재구성\n`
      + `· cycle 1 ~ ${paidUntilCycle} 중 dueDate ≤ ${today}: 완료\n`
      + `· cycle ${paidUntilCycle + 1} ~ ${totalReceipts}: 예정 (미수)\n\n계속?`,
    )) return;

    setContracts((prev) => prev.map((c) => {
      if (c.id !== target.id) return c;
      const next: Contract = {
        ...c,
        events: c.events.map((e) => {
          if (e.type !== '수납') return e;
          const cyc = e.cycle ?? 0;
          if (cyc <= paidUntilCycle && e.dueDate <= today) {
            return { ...e, status: '완료' as const, doneDate: e.dueDate };
          }
          return { ...e, status: '예정' as const, doneDate: undefined };
        }),
        ...audit.update(),
      };
      return next;
    }));
    audit.log({
      action: 'update',
      entityType: 'contract',
      entityId: target.id,
      label: `${target.contractNo} 수납재구성 (미수 ${overdueCount})`,
      before: target,
    });
    alert(`재구성 완료. ${target.contractNo} 미수 ${overdueCount}회차.`);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="수납생성 — 마이그레이션" size="md">
        <div className="space-y-3">
          <p className="text-weak text-xs">
            기존 운영 데이터에서 옮겨올 때 사용. 고객 정보로 계약 찾고, 현재 미수 회차 수만 입력하면 events 재구성:
            <br />· 미수 외 회차 — 완료 처리
            <br />· 미수 N회차 — 예정 (자동으로 /pending/overdue 에 표시)
          </p>

          <div className="form-grid">
            <label className="block col-span-2">
              <span className="label">고객명</span>
              <input className="input w-full" value={name} onChange={(e) => setName(e.target.value)} placeholder="송대성" />
            </label>
            <label className="block col-span-2">
              <span className="label">등록번호 (앞 6자리 또는 전체)</span>
              <input className="input w-full" value={ident} onChange={(e) => setIdent(e.target.value)} placeholder="930213 또는 930213-1095624" />
            </label>
            <label className="block col-span-2">
              <span className="label">현재 미수 회차 수</span>
              <input
                type="number"
                className="input w-full"
                value={overdueCount}
                min={0}
                onChange={(e) => setOverdueCount(Math.max(0, Number(e.target.value) || 0))}
              />
              <span className="text-weak text-xs">0 = 완납 / N = 마지막 N회차 미납</span>
            </label>
          </div>

          {(name || ident) && (
            <div style={{ background: 'var(--bg-card)', padding: 8, border: '1px solid var(--border)', borderRadius: 4 }}>
              {matched.length === 0 && <span className="text-red text-xs">매칭되는 계약 없음</span>}
              {matched.length > 1 && (
                <span className="text-amber text-xs">
                  {matched.length}건 매칭 — 정확히 좁혀주세요:
                  <ul className="mt-1 ml-4">
                    {matched.slice(0, 5).map((c) => (
                      <li key={c.id} className="text-xs dim">{c.contractNo} · {c.customerName} · {c.plate}</li>
                    ))}
                  </ul>
                </span>
              )}
              {target && (
                <div className="text-xs">
                  <div><strong>{target.contractNo}</strong> · {target.customerName} · {target.plate}</div>
                  <div className="text-weak">총 수납 {totalReceipts}회차 / 입력 시 완료 {paidUntilCycle}회 + 미수 {overdueCount}회</div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <DialogClose asChild><button className="btn">취소</button></DialogClose>
          <button
            className="btn btn-primary"
            disabled={!target || overdueCount > totalReceipts}
            onClick={apply}
          >
            재구성 적용
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
