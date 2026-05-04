'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { MagnifyingGlass, Car, FileText, X } from '@phosphor-icons/react';
import { useUnifiedSearch, type SearchHit } from '@/lib/unified-search';
import { cn } from '@/lib/cn';

/**
 * 통합 검색 Combobox — 차량/계약/임차인 한 입력창에서.
 *
 * 두 가지 모드:
 *  · navigate (default): 결과 클릭 → onSelect 콜백 (기본은 페이지 이동)
 *  · pick: 폼 내 사용 — onPick(hit) 으로 값 채움
 *
 * 키보드:
 *  · ↑↓ 결과 이동, Enter 선택, Esc 닫기
 *  · 입력 비어있으면 dropdown 안 열림
 */

type Props = {
  placeholder?: string;
  /** 결과 클릭 시 호출. 미지정 시 contract → /contract 로 navigate. */
  onSelect?: (hit: SearchHit) => void;
  /** 입력 폭. number(px) 또는 CSS 값 ('100%' 등). 기본 320px. */
  width?: number | string;
  /** 외부에서 input 값 제어 (선택) */
  value?: string;
  onChange?: (v: string) => void;
  className?: string;
  /** 폼 내부에서 사용 시 — 선택해도 input 비우지 않고 텍스트 채움 */
  pickMode?: boolean;
  /** pickMode 일 때 hit → 입력칸에 보일 텍스트 */
  hitToText?: (hit: SearchHit) => string;
  /** 마운트 시 자동 focus (모달 등 호출 즉시 입력 가능하게) */
  autoFocus?: boolean;
};

export function UnifiedSearch({
  placeholder = '차량번호 / 고객명 / 계약번호 검색 (초성 가능)',
  onSelect,
  width = 320,
  value: controlled,
  onChange,
  className,
  pickMode = false,
  hitToText,
  autoFocus = false,
}: Props) {
  const [internal, setInternal] = useState('');
  const value = controlled ?? internal;
  const setValue = (v: string) => {
    if (onChange) onChange(v);
    if (controlled === undefined) setInternal(v);
  };

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const hits = useUnifiedSearch(value);

  // 외부 클릭 → 닫기
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  // value 바뀌면 active 리셋
  useEffect(() => { setActive(0); }, [value]);

  // autoFocus — 마운트 시 input 에 커서. 모달 호출 직후 즉시 입력 가능하게.
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const handleSelect = useCallback((hit: SearchHit) => {
    if (pickMode && hitToText) {
      setValue(hitToText(hit));
    }
    setOpen(false);
    if (onSelect) onSelect(hit);
    else defaultNavigate(hit);
  }, [onSelect, pickMode, hitToText]);

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur(); return; }
    if (!open || hits.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, hits.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); handleSelect(hits[active]); }
  }

  return (
    <div ref={containerRef} className={cn('relative', className)} style={{ width }}>
      <MagnifyingGlass
        size={13}
        className="text-weak"
        style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
      />
      <input
        ref={inputRef}
        className="input w-full"
        style={{ paddingLeft: 28 }}
        placeholder={placeholder}
        value={value}
        onChange={(e) => { setValue(e.target.value); setOpen(true); }}
        onFocus={() => value && setOpen(true)}
        onKeyDown={onKeyDown}
        autoComplete="off"
      />
      {open && hits.length > 0 && (
        <div className="unified-search-dropdown">
          {hits.map((hit, i) => (
            <ResultRow
              key={hitId(hit)}
              hit={hit}
              active={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={() => handleSelect(hit)}
              query={value}
            />
          ))}
        </div>
      )}
      {open && value && hits.length === 0 && (
        <div className="unified-search-dropdown" style={{ padding: '12px', textAlign: 'center' }}>
          <span className="text-weak">검색 결과 없음</span>
        </div>
      )}
    </div>
  );
}

function ResultRow({
  hit, active, onMouseEnter, onClick, query: _query,
}: {
  hit: SearchHit;
  active: boolean;
  onMouseEnter: () => void;
  onClick: () => void;
  query: string;
}) {
  if (hit.kind === 'contract') {
    const c = hit.contract;
    const a = hit.asset;
    return (
      <div className={cn('unified-search-row', active && 'active')} onMouseEnter={onMouseEnter} onClick={onClick}>
        <FileText size={14} className="text-sub flex-shrink-0" />
        <span className="plate text-medium" style={{ minWidth: 80 }}>{c.companyCode}</span>
        <span className="plate text-medium" style={{ minWidth: 100 }}>{c.plate}</span>
        <span className="text-medium">{c.customerName}</span>
        <span className="text-weak truncate">
          {a?.vehicleName ?? ''} · {c.contractNo} · {c.status}
        </span>
      </div>
    );
  }
  // asset
  const a = hit.asset;
  const c = hit.contract;
  return (
    <div className={cn('unified-search-row', active && 'active')} onMouseEnter={onMouseEnter} onClick={onClick}>
      <Car size={14} className="text-sub flex-shrink-0" />
      <span className="plate text-medium" style={{ minWidth: 80 }}>{a.companyCode || '-'}</span>
      <span className="plate text-medium" style={{ minWidth: 100 }}>{a.plate || '-'}</span>
      <span className="text-medium truncate">{a.vehicleName || a.vehicleClass}</span>
      <span className="text-weak truncate">
        {a.ownerName ?? ''} {c ? ` · 계약 ${c.contractNo}` : ' · 계약 없음'}
      </span>
    </div>
  );
}

function hitId(hit: SearchHit): string {
  return hit.kind === 'contract' ? `c-${hit.contract.id}` : `a-${hit.asset.id}`;
}

function defaultNavigate(hit: SearchHit) {
  if (typeof window === 'undefined') return;
  if (hit.kind === 'contract') {
    // schedule 마스터·상세는 contractNo 기준 라우팅
    window.location.href = `/contract/schedule/${hit.contract.contractNo}`;
  } else {
    window.location.href = `/asset?selected=${hit.asset.id}`;
  }
}

/**
 * 전역 통합 검색 모달 — Ctrl+K (또는 Cmd+K) 로 호출.
 * 화면 가운데 띄우고 자동 focus. 결과 클릭 / Enter → navigate.
 */
export function UnifiedSearchModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isMac = navigator.platform.toUpperCase().includes('MAC');
      if ((isMac ? e.metaKey : e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1100,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '12vh',
      }}
      onClick={() => setOpen(false)}
    >
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          width: 600, maxWidth: '90vw',
          padding: 12,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span className="text-medium">전역 통합 검색</span>
          <button className="btn-ghost btn btn-sm" onClick={() => setOpen(false)}><X size={12} /></button>
        </div>
        <UnifiedSearch
          width="100%"
          placeholder="차량번호 / 고객명 / 계약번호 (초성 ㅎㄱㄷ 가능)"
          autoFocus
          onSelect={(hit) => { setOpen(false); defaultNavigate(hit); }}
        />
        <div className="text-weak text-xs" style={{ marginTop: 6 }}>
          Ctrl+K (Mac: Cmd+K) — 어디서든 호출 · ↑↓ 이동 · Enter 선택 · Esc 닫기
        </div>
      </div>
    </div>
  );
}
