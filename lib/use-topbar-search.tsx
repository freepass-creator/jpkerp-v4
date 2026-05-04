'use client';

import { createContext, useContext, useState } from 'react';

/**
 * 페이지 검색 키워드 — topbar input 이 set, 각 페이지가 read.
 * JpkTable 의 globalSearch prop 으로 전달되거나, 페이지별 자체 filter 에 사용.
 */
type Ctx = {
  search: string;
  setSearch: (v: string) => void;
};

const TopbarSearchCtx = createContext<Ctx>({ search: '', setSearch: () => {} });

export function TopbarSearchProvider({ children }: { children: React.ReactNode }) {
  const [search, setSearch] = useState('');
  return <TopbarSearchCtx.Provider value={{ search, setSearch }}>{children}</TopbarSearchCtx.Provider>;
}

export function useTopbarSearch() {
  return useContext(TopbarSearchCtx);
}
