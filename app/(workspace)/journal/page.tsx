'use client';

import { Fragment, useState, useMemo, useRef, useEffect } from 'react';
import { Plus, ArrowCounterClockwise, Car, ClockCounterClockwise } from '@phosphor-icons/react';
import { PageShell } from '@/components/layout/page-shell';
import {
  JOURNAL_KINDS, KIND_LABEL, KIND_HINT,
  SAMPLE_JOURNAL, type JournalEntry, type JournalKind,
} from '@/lib/sample-journal';
import { useAssetStore, findAssetByPlate } from '@/lib/use-asset-store';
import { SAMPLE_CONTRACTS, type Contract } from '@/lib/sample-contracts';
import type { Asset } from '@/lib/sample-assets';
import { PcForm } from '@/components/journal/pc-form';
import { IocForm } from '@/components/journal/ioc-form';
import { AccidentForm } from '@/components/journal/accident-form';
import { IgnitionForm } from '@/components/journal/ignition-form';
import type { EvidenceUploaderHandle } from '@/components/journal/evidence-uploader';
import { cn } from '@/lib/cn';

/**
 * 업무일지 — 직원 일상 입력 작업장.
 *  ┌ filterbar : 카테고리 chip
 *  └ body
 *    ├ 좌측 (작업영역) — 차량번호 공통(시동제어 제외) + 매칭정보 + 카테고리별 폼
 *    └ 우측 (이력) — 입력된 차량의 전체 업무 이력
 */

type ContractorChip = {
  name: string;
  phone?: string;
  kind: 'current' | 'past';
  period?: string;
};

type FieldDef = {
  key: string;
  label: string;
  type?: 'text' | 'date' | 'datetime-local' | 'number' | 'select' | 'textarea' | 'buttons';
  options?: string[];
  placeholder?: string;
  required?: boolean;
  /** 4 컬럼 그리드에서 차지하는 칸수 (기본 1, 최대 4) */
  colSpan?: 1 | 2 | 4;
  /** type='text' 일 때 자동완성 datalist key (localStorage 최근값) */
  recentKey?: string;
};

/**
 * 카테고리별 입력 필드 — 차량번호는 공통(상단)이므로 여기 안 넣음 (시동제어는 별개).
 */
const FORMS: Record<JournalKind, FieldDef[]> = {
  contact: [
    { key: 'contactType', label: '유형', type: 'buttons', colSpan: 4,
      options: ['일반문의', '컴플레인', '계약문의', '정비요청', '사고접수', '반납협의', '연장문의', '기타'], required: true },
    { key: 'memo', label: '메모', type: 'textarea', colSpan: 4 },
  ],
  // ioc 는 IocForm 컴포넌트가 subkind+from/to+주행거리 처리. memo 만 generic 에서.
  ioc: [
    { key: 'note', label: '메모', type: 'textarea', colSpan: 4 },
  ],
  // pc 는 PcForm 이 subkind+expanded 처리. 주행거리(필수) + memo 만 generic.
  pc: [
    { key: 'mileage', label: '주행거리(km)', type: 'number', colSpan: 2, required: true },
    { key: 'detail', label: '메모', type: 'textarea', colSpan: 4 },
  ],
  accident: [
    { key: 'happenedAt', label: '발생일시', type: 'datetime-local', colSpan: 2, required: true },
    { key: 'mileage', label: '주행거리(km)', type: 'number', colSpan: 2, required: true },
    { key: 'detail',     label: '메모',     type: 'textarea', colSpan: 4 },
  ],
  // ignition 은 IgnitionForm (운행중 계약 리스트 + 토글) 이 자체 처리. fields 비움.
  ignition: [],
  insurance: [
    { key: 'subkind',   label: '종류', type: 'buttons', colSpan: 4,
      options: ['신규', '갱신', '해지', '연령변경'], required: true },
    { key: 'startDate', label: '시작일', type: 'date' },
    { key: 'endDate',   label: '종료일', type: 'date' },
    { key: 'note',      label: '메모',  type: 'textarea', colSpan: 4 },
  ],
  product_register: [
    { key: 'monthlyAmount', label: '월 대여료(원)', type: 'number', colSpan: 2 },
    { key: 'rentMonths',    label: '대여기간(개월)', type: 'number', colSpan: 2 },
    { key: 'detail',        label: '메모', type: 'textarea', colSpan: 4 },
  ],
  penalty_notice: [
    { key: 'amount',  label: '금액(원)', type: 'number', colSpan: 2 },
    { key: 'dueDate', label: '납부기한', type: 'date',   colSpan: 2 },
    { key: 'note',    label: '메모',     type: 'textarea', colSpan: 4 },
  ],
  disposal: [
    { key: 'subkind', label: '처분종류', type: 'buttons', colSpan: 4,
      options: ['매각', '폐차', '반환', '전손'], required: true },
    { key: 'amount',  label: '금액(원)', type: 'number', colSpan: 2 },
    { key: 'detail',  label: '메모',     type: 'textarea', colSpan: 4 },
  ],
  etc: [
    { key: 'title',  label: '제목', required: true, colSpan: 2 },
    { key: 'detail', label: '메모', type: 'textarea', colSpan: 4, required: true },
  ],
};

/** 시동제어는 차량번호 공통 안 씀 (자체 폼에 plate 필드 있음) */
const KINDS_WITHOUT_COMMON_PLATE: JournalKind[] = ['ignition'];

function nowLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function emptyData(fields: FieldDef[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) out[f.key] = '';
  return out;
}

function recentFor(key: string, max = 12): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(`recent.${key}`);
    return raw ? (JSON.parse(raw) as string[]).slice(0, max) : [];
  } catch { return []; }
}
function pushRecent(key: string, value: string) {
  if (typeof window === 'undefined' || !value.trim()) return;
  try {
    const raw = window.localStorage.getItem(`recent.${key}`);
    const arr = raw ? (JSON.parse(raw) as string[]) : [];
    const next = [value, ...arr.filter((v) => v !== value)].slice(0, 24);
    window.localStorage.setItem(`recent.${key}`, JSON.stringify(next));
  } catch { /* ignore */ }
}

const COL_SPAN: Record<1 | 2 | 4, string> = { 1: 'span 1', 2: 'span 2', 4: 'span 4' };

/**
 * 차량번호 입력 + 자산 매칭 드롭다운 — v3 CarNumberPicker 의 핵심만 포팅.
 *  - 입력 시 차량번호·제조사·모델 includes 검색
 *  - 드롭다운 행: [차량번호] [모델] [계약자 or 휴차/처분 상태]
 *  - 클릭 / Enter 로 선택, ↑↓ 키보드 이동, Esc 닫기
 *  - 정확 일치(이미 선택된 상태)면 드롭다운 자동 숨김
 */
function PlatePicker({
  value,
  onChange,
  assets,
  contracts,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  assets: readonly Asset[];
  contracts: readonly Contract[];
  autoFocus?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const contractByPlate = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of contracts) {
      if (c.status === '운행중' && c.plate && c.customerName && !m.has(c.plate)) {
        m.set(c.plate, c.customerName);
      }
    }
    return m;
  }, [contracts]);

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return [];
    // 정확 일치면 드롭다운 숨김
    if (assets.some((a) => a.plate.toLowerCase() === q)) return [];
    return assets.filter((a) => {
      const cn = a.plate.toLowerCase();
      const mk = (a.maker ?? '').toLowerCase();
      const md = (a.modelName ?? a.vehicleName ?? '').toLowerCase();
      return cn.includes(q) || mk.includes(q) || md.includes(q);
    }).slice(0, 10);
  }, [assets, value]);

  useEffect(() => { setHover(0); }, [value]);

  function select(a: Asset) {
    onChange(a.plate);
    setOpen(false);
    inputRef.current?.blur();
  }

  function statusLabel(a: Asset): { text: string; color: string } {
    const customer = contractByPlate.get(a.plate);
    if (customer) return { text: customer, color: 'var(--brand)' };
    if (a.status === '매각') return { text: '처분', color: 'var(--alert-red-text)' };
    return { text: '휴차', color: 'var(--text-weak)' };
  }

  function renderMarked(s: string) {
    const q = value.trim();
    if (!q) return s;
    const i = s.toLowerCase().indexOf(q.toLowerCase());
    if (i < 0) return s;
    return (
      <>
        {s.slice(0, i)}
        <mark style={{ background: 'var(--brand-bg)', color: 'var(--brand)', padding: 0 }}>
          {s.slice(i, i + q.length)}
        </mark>
        {s.slice(i + q.length)}
      </>
    );
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || filtered.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHover((i) => Math.min(filtered.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHover((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); select(filtered[hover]); }
    else if (e.key === 'Escape') { setOpen(false); }
  }

  const showEmpty = open && value.trim().length > 0 && filtered.length === 0
    && !assets.some((a) => a.plate.toLowerCase() === value.trim().toLowerCase());

  return (
    <div style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        className="input w-full mono"
        type="text"
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        onKeyDown={onKey}
        placeholder="차량번호 (일부 입력 시 자산 매칭)"
        autoFocus={autoFocus}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 2px)',
          left: 0, right: 0,
          zIndex: 20,
          background: 'var(--bg-card)',
          border: '1px solid var(--border-strong)',
          borderRadius: 2,
          maxHeight: 280,
          overflow: 'auto',
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
        }}>
          {filtered.map((a, i) => {
            const st = statusLabel(a);
            const model = [a.maker, a.modelName ?? a.vehicleName, a.detailModel].filter(Boolean).join(' ');
            return (
              <div
                key={a.id}
                onPointerDown={(e) => e.preventDefault()}
                onMouseEnter={() => setHover(i)}
                onClick={() => select(a)}
                style={{
                  padding: '8px 10px',
                  display: 'grid',
                  gridTemplateColumns: 'auto 1fr auto',
                  gap: 8,
                  cursor: 'pointer',
                  background: i === hover ? 'var(--bg-hover)' : 'transparent',
                  borderBottom: '1px solid var(--border-soft)',
                  alignItems: 'center',
                  fontSize: 12,
                }}
              >
                <span className="mono" style={{ fontWeight: 600 }}>{renderMarked(a.plate)}</span>
                <span style={{ color: 'var(--text-sub)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{model}</span>
                <span style={{ color: st.color, fontWeight: 500, whiteSpace: 'nowrap' }}>{st.text}</span>
              </div>
            );
          })}
        </div>
      )}
      {showEmpty && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 2px)',
          left: 0, right: 0,
          zIndex: 20,
          background: 'var(--bg-card)',
          border: '1px solid var(--border-strong)',
          borderRadius: 2,
          padding: '8px 10px',
          fontSize: 12,
          color: 'var(--text-weak)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
        }}
          onPointerDown={(e) => e.preventDefault()}
        >
          매칭 자산 없음 — 자산관리에서 등록 후 다시 시도
        </div>
      )}
    </div>
  );
}

export default function JournalPage() {
  const [entries, setEntries] = useState<JournalEntry[]>(SAMPLE_JOURNAL);
  const [kind, setKind] = useState<JournalKind>('contact');
  const [atDate, setAtDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [atTime, setAtTime] = useState<string>(() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  });
  const [plate, setPlate] = useState<string>('');
  const [status, setStatus] = useState<string>('진행중');
  const [data, setData] = useState<Record<string, string>>(() => emptyData(FORMS['contact']));
  const uploaderRef = useRef<EvidenceUploaderHandle | null>(null);

  // 시간이 비어있으면 날짜만 (예: "2026-04-29"), 있으면 합침 ("2026-04-29 13:45")
  const at = atTime ? `${atDate} ${atTime}` : atDate;

  const [assets] = useAssetStore();
  const contracts = SAMPLE_CONTRACTS; // TODO: useContractStore() 만들면 교체

  const usesCommonPlate = !KINDS_WITHOUT_COMMON_PLATE.includes(kind);

  // 차량번호 자동완성 후보 (auto suggest 위해 자산 plate 목록만 추려둠)
  const platesList = useMemo(() => assets.map((a) => a.plate).sort(), [assets]);

  // 매칭된 자산·계약
  const matchedAsset = useMemo(
    () => (usesCommonPlate ? findAssetByPlate(assets, plate) : null),
    [assets, plate, usesCommonPlate],
  );
  // 매칭된 계약 — 운행중 우선, 없으면 가장 최근 종료된 계약 (휴차 상태에서도 과거 응대 가능)
  const matchedContract = useMemo(() => {
    if (!matchedAsset) return null;
    const all = contracts.filter((c) => c.plate === matchedAsset.plate);
    if (all.length === 0) return null;
    const active = all.find((c) => c.status === '운행중');
    if (active) return active;
    return [...all].sort((a, b) => (b.endDate ?? '').localeCompare(a.endDate ?? ''))[0] ?? null;
  }, [matchedAsset, contracts]);

  // 차량 현재 위치 — 그 차량의 가장 최근 journal entry 의 vendor(작업한곳) 또는 to(도착지)
  const currentLocation = useMemo(() => {
    const target = (usesCommonPlate ? plate : data.plate ?? '').trim();
    if (!target) return null;
    const sorted = entries
      .filter((e) => (e.data?.plate ?? '').trim() === target)
      .sort((a, b) => b.at.localeCompare(a.at));
    for (const e of sorted) {
      const loc = e.data?.vendor || e.data?.to;
      if (loc) return { place: loc, at: e.at, kind: e.kind };
    }
    return null;
  }, [entries, plate, data.plate, usesCommonPlate]);

  // 입출고 출발지 자동 prefill — 비어있고 현재 위치 있으면 채움
  useEffect(() => {
    if (kind !== 'ioc') return;
    if (data.from) return;
    if (!currentLocation) return;
    setData((d) => (d.from ? d : { ...d, from: currentLocation.place }));
  }, [kind, currentLocation, data.from]);

  // 입력된 차량의 계약자 후보 — 현재 계약자 + 과거 계약자 (계약 + 업무일지 entries 에서 누적)
  const plateContractors = useMemo(() => {
    const target = (usesCommonPlate ? plate : data.plate ?? '').trim();
    if (!target) return { current: null as ContractorChip | null, past: [] as ContractorChip[] };

    const seen = new Set<string>();
    const acc: ContractorChip[] = [];

    // 1. 계약(Contract) 에서
    for (const c of contracts) {
      if (c.plate !== target || !c.customerName) continue;
      const key = `${c.customerName}|${c.customerPhone ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      acc.push({
        name: c.customerName,
        phone: c.customerPhone,
        kind: c.status === '운행중' ? 'current' : 'past',
        period: `${c.startDate}~${c.endDate}`,
      });
    }
    // 2. 업무일지 contact entries 에서 (계약에 없는 과거 응대 누적)
    for (const e of entries) {
      if (e.kind !== 'contact') continue;
      const p = (e.data?.plate ?? '').trim();
      if (p !== target) continue;
      const name = e.data?.customer;
      if (!name) continue;
      const phone = e.data?.phone;
      const key = `${name}|${phone ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      acc.push({ name, phone, kind: 'past' });
    }
    return {
      current: acc.find((x) => x.kind === 'current') ?? null,
      past: acc.filter((x) => x.kind === 'past'),
    };
  }, [contracts, entries, plate, data.plate, usesCommonPlate]);

  // 우측 이력 — 매칭된 차량의 전체 업무 이력 (전 카테고리)
  const history = useMemo(() => {
    const target = usesCommonPlate ? plate : data.plate ?? '';
    if (!target.trim()) return [];
    return entries.filter((e) => {
      const p = (e.data?.plate ?? '').trim();
      return p === target.trim();
    }).slice(0, 20);
  }, [entries, plate, data.plate, usesCommonPlate]);

  const counts = useMemo(() => {
    const c: Record<JournalKind, number> = {
      ioc: 0, pc: 0, contact: 0, accident: 0, ignition: 0,
      insurance: 0, product_register: 0, penalty_notice: 0, disposal: 0, etc: 0,
    };
    for (const e of entries) c[e.kind]++;
    return c;
  }, [entries]);

  function refreshNow() {
    const d = new Date();
    setAtDate(d.toISOString().slice(0, 10));
    setAtTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
  }

  function selectKind(k: JournalKind) {
    setKind(k);
    refreshNow();
    setData(emptyData(FORMS[k]));
    setStatus('진행중');
    // 차량번호는 카테고리 전환해도 유지 (같은 차로 연속 작업 흔함)
  }

  function reset() {
    refreshNow();
    setData(emptyData(FORMS[kind]));
    setStatus('진행중');
  }

  const fields = FORMS[kind];
  const requiredKeys = fields.filter((f) => f.required).map((f) => f.key);
  // 카테고리 전용 폼 (PcForm/IocForm) 은 외부에서 자체 필수 필드 명시
  const customRequired: Record<string, string[]> = {
    pc: ['subkind', 'vendor'],
    ioc: ['subkind', 'to', 'mileage'],
  };
  const customKeys = customRequired[kind] ?? [];
  const canSubmit = requiredKeys.every((k) => (data[k] ?? '').trim().length > 0)
    && customKeys.every((k) => (data[k] ?? '').trim().length > 0)
    && (usesCommonPlate ? plate.trim().length > 0 : true);

  async function submit() {
    if (!canSubmit) return;

    // 중복검증 — 같은 plate + 같은 kind + 같은 날짜에 이미 동일 subkind/유형 있으면 확인
    const targetPlate = (usesCommonPlate ? plate : data.plate ?? '').trim();
    const day = atDate;
    if (targetPlate) {
      const dup = entries.find((e) => {
        if (e.kind !== kind) return false;
        if ((e.data?.plate ?? '') !== targetPlate) return false;
        if (!e.at.startsWith(day)) return false;
        // subkind 일치까지 (없으면 통과)
        const subA = e.data?.subkind ?? e.data?.contactType ?? '';
        const subB = data.subkind ?? data.contactType ?? '';
        if (subA && subB) return subA === subB;
        return true;
      });
      if (dup) {
        const ok = confirm(
          `같은 차량(${targetPlate}) · 같은 카테고리(${KIND_LABEL[kind]}) · 같은 날짜(${day}) 항목이 이미 있습니다.\n\n그래도 등록하시겠습니까?`,
        );
        if (!ok) return;
      }
    }

    for (const f of fields) {
      if (f.recentKey && data[f.key]) pushRecent(f.recentKey, data[f.key]);
    }
    const merged: Record<string, string> = { ...data, status };
    if (usesCommonPlate) merged.plate = plate;

    // 증빙 파일 업로드 (있을 때) — 차량번호/일자/타임스탬프 폴더에 저장
    try {
      const files = uploaderRef.current?.getFiles() ?? [];
      if (files.length > 0) {
        const targetPlate = merged.plate || 'no-plate';
        const basePath = `journal/${targetPlate}/${atDate}/${Date.now()}`;
        const urls = await uploaderRef.current!.commitUpload(basePath);
        if (urls.length > 0) merged.evidence = JSON.stringify(urls);
      }
    } catch (err) {
      alert(`증빙 업로드 실패: ${(err as Error).message}`);
      return;
    }

    const next: JournalEntry = {
      id: `j-${Date.now()}`,
      no: `J-${new Date().getFullYear()}-${String(entries.length + 1).padStart(4, '0')}`,
      companyCode: matchedAsset?.companyCode ?? 'CP01',
      kind,
      at: at || atDate,
      staff: '담당자',
      data: merged,
    };
    setEntries([next, ...entries]);
    reset();
    uploaderRef.current?.clear();
  }

  return (
    <PageShell
      filterbar={
        <div className="chip-group">
          {JOURNAL_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              className={cn('chip', kind === k && 'active')}
              onClick={() => selectKind(k)}
              title={KIND_HINT[k]}
            >
              {KIND_LABEL[k]}
              {counts[k] > 0 && <span style={{ marginLeft: 4, opacity: 0.7 }}>{counts[k]}</span>}
            </button>
          ))}
        </div>
      }
      footerLeft={
        <>
          <span className="stat-item">전체 <strong>{entries.length}</strong></span>
          <span className="stat-item alert">미결 <strong>{entries.filter((e) => e.data?.status !== '처리완료').length}</strong></span>
        </>
      }
      footerRight={
        kind === 'ignition' ? null : (
          <>
            <button className="btn" onClick={reset}>
              <ArrowCounterClockwise size={14} weight="bold" /> 초기화
            </button>
            <button className="btn btn-primary" onClick={submit} disabled={!canSubmit}>
              <Plus size={14} weight="bold" /> 등록
            </button>
          </>
        )
      }
    >
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {/* ─── 좌: 작업영역 (75%) — 카드 X, 컬럼 통째로 head + body ─── */}
        <div style={{ flex: 3, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
          {/* 패널헤드 — 우측 이력 헤드와 한 줄로 맞닿음 */}
          <div className="panel-head">
            {usesCommonPlate ? <><Car size={14} /><span>차량 정보 · {KIND_LABEL[kind]}</span></> : <span>시동제어 대상</span>}
          </div>

          {/* 패널바디 — 스크롤 영역 */}
          <div style={{ flex: 1, padding: 16, overflow: 'auto' }}>
            {usesCommonPlate ? (
              <>
                {/* 차량번호 + 일시 + 매칭정보 */}
                <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px 12px' }}>
                  <label className="block" style={{ gridColumn: 'span 2' }}>
                    <span className="label label-required">차량번호</span>
                    <PlatePicker
                      value={plate}
                      onChange={setPlate}
                      assets={assets}
                      contracts={contracts}
                      autoFocus
                    />
                  </label>
                  <div className="block" style={{ gridColumn: 'span 1' }}>
                    <span className="label label-required">날짜</span>
                    <input
                      className="input w-full mono"
                      type="date"
                      value={atDate}
                      onChange={(e) => setAtDate(e.target.value)}
                    />
                  </div>
                  <div className="block" style={{ gridColumn: 'span 1' }}>
                    <span className="label">시각 <span style={{ color: 'var(--text-weak)', fontWeight: 400 }}>(선택)</span></span>
                    <input
                      className="input w-full mono"
                      type="time"
                      value={atTime}
                      onChange={(e) => setAtTime(e.target.value)}
                      placeholder="HH:mm"
                    />
                  </div>
                </div>
                {plate.trim() && (
                  <div style={{
                    marginTop: 10,
                    padding: '8px 10px',
                    border: '1px solid var(--border)',
                    borderRadius: 4,
                    background: 'var(--bg-card)',
                    fontSize: 12,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    flexWrap: 'wrap',
                  }}>
                    {matchedAsset ? (
                      <>
                        <span className="mono" style={{ fontWeight: 600, color: 'var(--text)' }}>{matchedAsset.plate}</span>
                        <span style={{ color: 'var(--text-weak)' }}>·</span>
                        <span>{matchedAsset.companyCode}</span>
                        {(matchedAsset.maker || matchedAsset.modelName) && (
                          <>
                            <span style={{ color: 'var(--text-weak)' }}>·</span>
                            <span>{[matchedAsset.maker, matchedAsset.modelName, matchedAsset.detailModel].filter(Boolean).join(' ')}</span>
                          </>
                        )}
                        {matchedContract ? (
                          <>
                            <span style={{ color: 'var(--text-weak)' }}>·</span>
                            <span className={`badge ${matchedContract.status === '운행중' ? 'badge-blue' : 'badge-orange'}`} style={{ fontSize: 11 }}>
                              {matchedContract.status === '운행중' ? '운행중' : '휴차 (이전 계약)'}
                            </span>
                            <span style={{ fontWeight: 500 }}>{matchedContract.customerName}</span>
                            <span style={{ color: 'var(--text-weak)', fontSize: 11 }}>{matchedContract.startDate}~{matchedContract.endDate}</span>
                          </>
                        ) : (
                          <span style={{ color: 'var(--text-weak)' }}>· 계약 이력 없음</span>
                        )}
                        {currentLocation && (
                          <>
                            <span style={{ color: 'var(--text-weak)' }}>·</span>
                            <span className="badge badge-green" style={{ fontSize: 11 }}>현재 위치</span>
                            <span style={{ fontWeight: 500 }}>{currentLocation.place}</span>
                            <span style={{ color: 'var(--text-weak)', fontSize: 11 }}>({currentLocation.at})</span>
                          </>
                        )}
                      </>
                    ) : (
                      <span style={{ color: 'var(--text-weak)' }}>매칭되는 자산 없음 — 자산관리에서 등록 후 다시 시도</span>
                    )}
                  </div>
                )}

                {/* 카테고리별 폼 — 구분선 후 */}
                <div style={{ height: 1, background: 'var(--border)', margin: '14px 0' }} />
              </>
            ) : null}

            {/* 카테고리별 폼 */}
            <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px 12px' }}>
              {/* 시동제어는 날짜/시각 불필요 — 액션 시각으로 자동 기록 */}

              {/* 처리현황 — 시동제어 제외, 모든 카테고리 공통 */}
              {kind !== 'ignition' && (
                <div className="block" style={{ gridColumn: 'span 4' }}>
                  <span className="label label-required">처리 현황 <span style={{ color: 'var(--text-weak)', fontWeight: 400 }}>(처리완료 외엔 미결로 분류)</span></span>
                  <div className="chip-group" style={{ flexWrap: 'wrap' }}>
                    {(['진행중', '처리완료', '보류', '처리불가'] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        className={cn('chip', status === s && 'active')}
                        onClick={() => setStatus(s)}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 카테고리 전용 폼 — 나머지는 generic fields.map */}
              {kind === 'pc' && <PcForm data={data} setData={setData} uploaderRef={uploaderRef} />}
              {kind === 'ioc' && <IocForm data={data} setData={setData} />}
              {kind === 'accident' && <AccidentForm data={data} setData={setData} />}
              {kind === 'ignition' && (
                <IgnitionForm
                  contracts={contracts}
                  assets={assets}
                  entries={entries}
                  onAction={({ plate: p, action, reason }) => {
                    const now = new Date();
                    const at = `${now.toISOString().slice(0, 10)} ${String(now.getHours()).padStart(2, '0')}:${String(Math.floor(now.getMinutes() / 10) * 10).padStart(2, '0')}`;
                    const entry: JournalEntry = {
                      id: `j-${Date.now()}`,
                      no: `J-${now.getFullYear()}-${String(entries.length + 1).padStart(4, '0')}`,
                      companyCode: 'CP01',
                      kind: 'ignition',
                      at,
                      staff: '담당자',
                      data: { plate: p, action, reason, status: '처리완료' },
                    };
                    setEntries([entry, ...entries]);
                  }}
                />
              )}

              {fields.map((f) => {
                // buttons 타입은 label 로 감싸면 빈 공간 클릭 시 첫 버튼이 자동 활성화됨 → div 로 분기
                const Wrapper = f.type === 'buttons' ? 'div' : 'label';
                return (
                <Fragment key={f.key}>
                  <Wrapper className="block" style={{ gridColumn: COL_SPAN[f.colSpan ?? 1] }}>
                    <span className={cn('label', f.required && 'label-required')}>{f.label}</span>
                    {/* 고객응대 + customer 필드면 계약자 chip 노출 (현재 + 과거) */}
                    {kind === 'contact' && f.key === 'customer' && (plateContractors.current || plateContractors.past.length > 0) && (
                      <div className="chip-group" style={{ flexWrap: 'wrap', marginBottom: 4 }}>
                        {plateContractors.current && (
                          <button
                            type="button"
                            className="chip active"
                            onClick={() => setData({ ...data, customer: plateContractors.current!.name, phone: plateContractors.current!.phone ?? data.phone })}
                            title={`현재 계약자${plateContractors.current.period ? ` · ${plateContractors.current.period}` : ''}`}
                          >
                            현재 · {plateContractors.current.name}
                          </button>
                        )}
                        {plateContractors.past.map((p) => (
                          <button
                            key={`${p.name}|${p.phone ?? ''}`}
                            type="button"
                            className="chip"
                            onClick={() => setData({ ...data, customer: p.name, phone: p.phone ?? data.phone })}
                            title={`과거 계약자${p.period ? ` · ${p.period}` : ''}`}
                          >
                            과거 · {p.name}
                          </button>
                        ))}
                      </div>
                    )}
                    {f.type === 'buttons' ? (
                      <div className="chip-group" style={{ flexWrap: 'wrap' }}>
                        {f.options?.map((o) => (
                          <button
                            key={o}
                            type="button"
                            className={cn('chip', data[f.key] === o && 'active')}
                            onClick={() => setData({ ...data, [f.key]: o })}
                          >
                            {o}
                          </button>
                        ))}
                      </div>
                    ) : f.type === 'select' ? (
                      <select
                        className="input w-full"
                        value={data[f.key] ?? ''}
                        onChange={(e) => setData({ ...data, [f.key]: e.target.value })}
                      >
                        <option value="">- 선택 -</option>
                        {f.options?.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : f.type === 'textarea' ? (
                      <textarea
                        className="input w-full"
                        rows={3}
                        value={data[f.key] ?? ''}
                        onChange={(e) => setData({ ...data, [f.key]: e.target.value })}
                        placeholder={f.placeholder}
                      />
                    ) : f.type === 'number' ? (
                      // 숫자 — 천 단위 콤마 자동 포맷, 저장은 숫자 string
                      <input
                        className="input w-full mono"
                        type="text"
                        inputMode="numeric"
                        value={data[f.key] ? Number(data[f.key]).toLocaleString('ko-KR') : ''}
                        onChange={(e) => {
                          const n = e.target.value.replace(/[^\d-]/g, '');
                          setData({ ...data, [f.key]: n });
                        }}
                        placeholder={f.placeholder ?? '0'}
                        style={{ textAlign: 'right' }}
                      />
                    ) : (
                      <>
                        <input
                          className="input w-full"
                          type={f.type ?? 'text'}
                          value={data[f.key] ?? ''}
                          onChange={(e) => setData({ ...data, [f.key]: e.target.value })}
                          placeholder={f.placeholder}
                          list={f.recentKey ? `dl-${f.recentKey.replace(/\./g, '-')}` : undefined}
                        />
                        {f.recentKey && (
                          <datalist id={`dl-${f.recentKey.replace(/\./g, '-')}`}>
                            {recentFor(f.recentKey).map((v) => <option key={v} value={v} />)}
                          </datalist>
                        )}
                      </>
                    )}
                  </Wrapper>
                </Fragment>
                );
              })}
            </div>
          </div>
        </div>

        {/* ─── 우: 차량별 이력 (25%) ─── */}
        <aside style={{
          flex: 1,
          minWidth: 240,
          borderLeft: '1px solid var(--border)',
          background: 'var(--bg-card)',
          display: 'flex',
          flexDirection: 'column',
        }}>
          <div className="panel-head">
            <ClockCounterClockwise size={14} />
            <span>차량별 업무 이력</span>
            {(usesCommonPlate ? plate : data.plate)?.trim() && (
              <span className="mono panel-head-right" style={{ color: 'var(--text)', fontWeight: 600 }}>
                {usesCommonPlate ? plate : data.plate}
              </span>
            )}
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {!(usesCommonPlate ? plate : data.plate)?.trim() ? (
              <div style={{ padding: 16, color: 'var(--text-weak)', fontSize: 12, textAlign: 'center' }}>
                차량번호 입력 시<br />이력 표시
              </div>
            ) : history.length === 0 ? (
              <div style={{ padding: 16, color: 'var(--text-weak)', fontSize: 12, textAlign: 'center' }}>
                이 차량 업무 이력 없음
              </div>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {history.map((e) => {
                  const st = e.data?.status ?? '진행중';
                  const isPending = st !== '처리완료';
                  return (
                    <li key={e.id} style={{
                      padding: '8px 12px',
                      borderBottom: '1px solid var(--border-soft)',
                      fontSize: 12,
                      borderLeft: isPending ? '2px solid var(--alert-orange-text)' : '2px solid transparent',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2, flexWrap: 'wrap' }}>
                        <span className="badge" style={{ fontSize: 11, padding: '0 5px' }}>{KIND_LABEL[e.kind]}</span>
                        <span className={`badge ${isPending ? 'badge-orange' : 'badge-green'}`} style={{ fontSize: 11, padding: '0 5px' }}>{st}</span>
                        <span className="mono" style={{ color: 'var(--text-weak)', fontSize: 11, marginLeft: 'auto' }}>{e.at}</span>
                      </div>
                      <div style={{ color: 'var(--text)' }}>
                        {historySummary(e)}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </PageShell>
  );
}

/** 이력 한 줄 요약 — 카테고리에 따라 핵심 필드 1~2개 추출 */
function historySummary(e: JournalEntry): string {
  const d = e.data || {};
  const parts: string[] = [];
  if (d.subkind) parts.push(d.subkind);
  if (d.contactType) parts.push(d.contactType);
  if (d.action) parts.push(d.action);
  if (d.title) parts.push(d.title);
  if (d.memo) parts.push(d.memo);
  if (d.detail) parts.push(d.detail);
  if (d.note) parts.push(d.note);
  if (d.reason) parts.push(d.reason);
  return parts.slice(0, 2).join(' · ') || '(내용 없음)';
}
