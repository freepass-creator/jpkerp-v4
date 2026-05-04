'use client';

import { MagnifyingGlass } from '@phosphor-icons/react';
import { useCompanyStore } from '@/lib/use-company-store';

/**
 * 목록 페이지 공통 필터바 — 회사 select + 텍스트 검색.
 *
 *   <ListFilterbar
 *     company={company}    onCompanyChange={setCompany}
 *     search={search}      onSearchChange={setSearch}
 *     extra={<더 필터들/>}
 *   />
 *
 * 페이지에서 useMemo 로 필터 적용:
 *   const filtered = useMemo(
 *     () => applyListFilter(rows, { company, search }, (r) => r.companyCode, (r) => `${r.plate} ${r.customerName}`),
 *     [rows, company, search],
 *   );
 */

type Props = {
  company: string;
  onCompanyChange: (v: string) => void;
  search: string;
  onSearchChange: (v: string) => void;
  searchPlaceholder?: string;
  extra?: React.ReactNode;
};

export function ListFilterbar({
  company, onCompanyChange,
  search, onSearchChange,
  searchPlaceholder = '차량번호 / 고객명 / 계약번호 검색',
  extra,
}: Props) {
  const [companies] = useCompanyStore();
  return (
    <>
      <select
        className="input"
        value={company}
        onChange={(e) => onCompanyChange(e.target.value)}
        style={{ width: 130 }}
      >
        <option value="">전체 회사</option>
        {companies.map((c) => (
          <option key={c.code} value={c.code}>{c.code} {c.name}</option>
        ))}
      </select>
      <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
        <MagnifyingGlass
          size={12}
          style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-weak)' }}
        />
        <input
          className="input w-full"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          style={{ paddingLeft: 24 }}
        />
      </div>
      {extra}
    </>
  );
}

/** 표준 필터 적용 — 회사 일치 AND 검색어가 아래 텍스트 어디든 포함. */
export function applyListFilter<T>(
  rows: readonly T[],
  filter: { company: string; search: string },
  getCompany: (r: T) => string,
  getSearchable: (r: T) => string,
): T[] {
  const q = filter.search.trim().toLowerCase();
  return rows.filter((r) => {
    if (filter.company && getCompany(r) !== filter.company) return false;
    if (q && !getSearchable(r).toLowerCase().includes(q)) return false;
    return true;
  });
}
