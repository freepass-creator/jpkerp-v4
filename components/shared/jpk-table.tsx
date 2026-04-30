'use client';

/**
 * JpkTable — v3에서 포팅. 자체 HTML <table> 기반 그리드.
 *
 * 지원:
 *  - 고정 폭 / flex 폭 / minWidth 컬럼
 *  - valueFormatter, valueGetter, cellStyle (object/function), cellRenderer
 *  - 컬럼 헤더 클릭 → 엑셀식 set filter 팝업 (정렬·검색·체크박스)
 *  - filterType='range' → 숫자 min/max 범위 필터
 *  - 컬럼 경계 드래그 → 폭 조절
 *  - 컬럼 경계 더블클릭 → 자동맞춤 ↔ 원래 폭 토글
 *  - sticky thead, 스크롤 tbody
 *  - 행 클릭 핸들러
 *  - localStorage 정렬·필터·컬럼폭 영속 (storageKey)
 */

import type { CSSProperties, ReactNode } from 'react';
import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';

export interface JpkColumn<T> {
  headerName: string;
  field?: keyof T | string;
  width?: number;
  minWidth?: number;
  flex?: number;
  sortable?: boolean;
  filterable?: boolean;
  filterType?: 'set' | 'range' | 'date';
  filterStep?: number;
  filterUnit?: number;
  filterUnitLabel?: string;
  align?: 'left' | 'right' | 'center';
  valueFormatter?: (params: { value: unknown; data: T }) => string;
  valueGetter?: (params: { data: T; rowIndex: number }) => unknown;
  cellStyle?: CSSProperties | ((params: { value: unknown; data: T }) => CSSProperties | undefined);
  cellRenderer?: (params: { value: unknown; data: T; rowIndex: number }) => ReactNode;
  sort?: 'asc' | 'desc';
}

export interface JpkTableApi<T> {
  getSelectedRow: () => T | null;
  getFilteredRows: () => readonly T[];
}

interface JpkTableProps<T> {
  columns: JpkColumn<T>[];
  rows: readonly T[];
  getRowId?: (row: T, index: number) => string;
  onRowClick?: (row: T, index: number) => void;
  onRowContextMenu?: (row: T, index: number, ev: React.MouseEvent) => void;
  onCountChange?: (count: number) => void;
  onFilteredChange?: (rows: readonly T[]) => void;
  className?: string;
  storageKey?: string;
  hideHeader?: boolean;
  selectedKey?: string | null;
}

type SortState = { field: string; dir: 'asc' | 'desc' } | null;
type FilterState = Record<string, string[] | undefined>;
type RangeState = Record<string, [number, number] | undefined>;
type WidthState = Record<string, number | undefined>;
type Granularity = 'year' | 'quarter' | 'month' | 'day';
type DateFilter = { granularity: Granularity; values: string[] };
type DateFilterState = Record<string, DateFilter | undefined>;

/** 'YYYY-MM-DD HH:mm' / 'YYYY-MM-DD' / ISO 등에서 그래뉴러리티별 키 추출 */
function toPeriodKey(txDate: string, gran: Granularity): string {
  const m = String(txDate ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  const [, y, mo, d] = m;
  if (gran === 'year') return y;
  if (gran === 'month') return `${y}-${mo}`;
  if (gran === 'day') return `${y}-${mo}-${d}`;
  // quarter
  const q = Math.ceil(Number(mo) / 3);
  return `${y}-Q${q}`;
}

function JpkTableInner<T>(
  {
    columns, rows, getRowId, onRowClick, onRowContextMenu, onCountChange, onFilteredChange,
    className, storageKey, hideHeader, selectedKey: selectedKeyProp,
  }: JpkTableProps<T>,
  ref: React.Ref<JpkTableApi<T>>,
) {
  const [sort, setSort] = useState<SortState>(() => {
    if (storageKey && typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem(`${storageKey}.sort`);
        if (raw) return JSON.parse(raw) as SortState;
      } catch { /* ignore */ }
    }
    for (const c of columns) {
      if (c.sort && c.field) return { field: String(c.field), dir: c.sort };
    }
    return null;
  });
  const [filters, setFilters] = useState<FilterState>(() => {
    if (storageKey && typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem(`${storageKey}.filters`);
        if (raw) return JSON.parse(raw) as FilterState;
      } catch { /* ignore */ }
    }
    return {};
  });
  const [ranges, setRanges] = useState<RangeState>(() => {
    if (storageKey && typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem(`${storageKey}.ranges`);
        if (raw) return JSON.parse(raw) as RangeState;
      } catch { /* ignore */ }
    }
    return {};
  });
  const [dateFilters, setDateFilters] = useState<DateFilterState>(() => {
    if (storageKey && typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem(`${storageKey}.dateFilters`);
        if (raw) return JSON.parse(raw) as DateFilterState;
      } catch { /* ignore */ }
    }
    return {};
  });
  const [widths, setWidths] = useState<WidthState>(() => {
    if (storageKey && typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem(`${storageKey}.widths`);
        if (raw) return JSON.parse(raw) as WidthState;
      } catch { /* ignore */ }
    }
    return {};
  });
  const [selectedKeyInner, setSelectedKeyInner] = useState<string | null>(null);
  const selectedKey = selectedKeyProp !== undefined ? selectedKeyProp : selectedKeyInner;
  const [openFilter, setOpenFilter] = useState<string | null>(null);
  const tableElRef = useRef<HTMLTableElement | null>(null);

  useEffect(() => {
    if (!storageKey || typeof window === 'undefined') return;
    try {
      if (sort) localStorage.setItem(`${storageKey}.sort`, JSON.stringify(sort));
      else localStorage.removeItem(`${storageKey}.sort`);
    } catch { /* ignore */ }
  }, [sort, storageKey]);
  useEffect(() => {
    if (!storageKey || typeof window === 'undefined') return;
    try {
      const hasFilters = Object.values(filters).some((v) => v && v.length > 0);
      if (hasFilters) localStorage.setItem(`${storageKey}.filters`, JSON.stringify(filters));
      else localStorage.removeItem(`${storageKey}.filters`);
    } catch { /* ignore */ }
  }, [filters, storageKey]);
  useEffect(() => {
    if (!storageKey || typeof window === 'undefined') return;
    try {
      const hasRanges = Object.values(ranges).some((v) => v !== undefined);
      if (hasRanges) localStorage.setItem(`${storageKey}.ranges`, JSON.stringify(ranges));
      else localStorage.removeItem(`${storageKey}.ranges`);
    } catch { /* ignore */ }
  }, [ranges, storageKey]);
  useEffect(() => {
    if (!storageKey || typeof window === 'undefined') return;
    try {
      const hasDateFilters = Object.values(dateFilters).some((v) => v && v.values.length > 0);
      if (hasDateFilters) localStorage.setItem(`${storageKey}.dateFilters`, JSON.stringify(dateFilters));
      else localStorage.removeItem(`${storageKey}.dateFilters`);
    } catch { /* ignore */ }
  }, [dateFilters, storageKey]);
  useEffect(() => {
    if (!storageKey || typeof window === 'undefined') return;
    try {
      const hasWidths = Object.values(widths).some((w) => w !== undefined);
      if (hasWidths) localStorage.setItem(`${storageKey}.widths`, JSON.stringify(widths));
      else localStorage.removeItem(`${storageKey}.widths`);
    } catch { /* ignore */ }
  }, [widths, storageKey]);

  const filteredRows = useMemo(() => {
    const activeFilters = Object.entries(filters).filter(([, v]) => v && v.length > 0) as [string, string[]][];
    const activeRanges = Object.entries(ranges).filter(([, v]) => v !== undefined) as [string, [number, number]][];
    const activeDates = Object.entries(dateFilters).filter(([, v]) => v && v.values.length > 0) as [string, DateFilter][];
    if (activeFilters.length === 0 && activeRanges.length === 0 && activeDates.length === 0) return rows;
    return rows.filter((row, i) => {
      for (const [field, allowed] of activeFilters) {
        const col = columns.find((c) => c.field === field);
        if (!col) continue;
        const value = readValue(col, row, i);
        const key = stringifyValue(value);
        if (!allowed.includes(key)) return false;
      }
      for (const [field, [min, max]] of activeRanges) {
        const col = columns.find((c) => c.field === field);
        if (!col) continue;
        const v = Number(readValue(col, row, i));
        if (Number.isNaN(v)) return false;
        if (v < min || v > max) return false;
      }
      for (const [field, df] of activeDates) {
        const col = columns.find((c) => c.field === field);
        if (!col) continue;
        const value = String(readValue(col, row, i) ?? '');
        const periodKey = toPeriodKey(value, df.granularity);
        if (!periodKey || !df.values.includes(periodKey)) return false;
      }
      return true;
    });
  }, [rows, filters, ranges, dateFilters, columns]);

  const sortedRows = useMemo(() => {
    if (!sort) return filteredRows;
    const col = columns.find((c) => c.field === sort.field);
    if (!col) return filteredRows;
    const arr = [...filteredRows];
    arr.sort((a, b) => {
      const va = readValue(col, a, 0);
      const vb = readValue(col, b, 0);
      const cmp = compare(va, vb);
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [filteredRows, sort, columns]);

  useEffect(() => { onCountChange?.(sortedRows.length); }, [sortedRows.length, onCountChange]);
  useEffect(() => { onFilteredChange?.(sortedRows); }, [sortedRows, onFilteredChange]);

  useImperativeHandle(ref, () => ({
    getSelectedRow: () => {
      if (!selectedKey) return null;
      const found = sortedRows.find((r, i) => (getRowId ? getRowId(r, i) : String(i)) === selectedKey);
      return found ?? null;
    },
    getFilteredRows: () => sortedRows,
  }), [selectedKey, sortedRows, getRowId]);

  const setColumnFilter = useCallback((field: string, values: string[] | undefined) => {
    setFilters((cur) => {
      const next = { ...cur };
      if (!values || values.length === 0) delete next[field];
      else next[field] = values;
      return next;
    });
  }, []);
  const setColumnRange = useCallback((field: string, range: [number, number] | undefined) => {
    setRanges((cur) => {
      const next = { ...cur };
      if (!range) delete next[field];
      else next[field] = range;
      return next;
    });
  }, []);
  const setColumnDateFilter = useCallback((field: string, df: DateFilter | undefined) => {
    setDateFilters((cur) => {
      const next = { ...cur };
      if (!df || df.values.length === 0) delete next[field];
      else next[field] = df;
      return next;
    });
  }, []);

  const startResize = useCallback((e: React.MouseEvent, field: string) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const th = (e.currentTarget as HTMLElement).closest('th');
    const startW = th?.getBoundingClientRect().width ?? 80;
    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      const w = Math.max(40, Math.round(startW + dx));
      setWidths((cur) => ({ ...cur, [field]: w }));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const autoFit = useCallback((e: React.MouseEvent, col: JpkColumn<T>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!col.field) return;
    const f = String(col.field);
    if (widths[f] !== undefined) {
      setWidths((cur) => {
        const next = { ...cur };
        delete next[f];
        return next;
      });
      return;
    }
    const table = tableElRef.current;
    if (!table) return;
    const colIdx = columns.findIndex((c) => c.field === f);
    if (colIdx < 0) return;
    const ths = table.querySelectorAll('thead th');
    const headerCell = ths[colIdx] as HTMLElement | undefined;
    const sample = headerCell ?? table.querySelector('tbody td');
    const font = sample ? getFontShorthand(sample) : '400 12px sans-serif';
    let max = measureText(col.headerName, font) + 28;
    const cells = table.querySelectorAll(`tbody td:nth-child(${colIdx + 1})`);
    cells.forEach((td) => {
      const txt = (td as HTMLElement).innerText;
      const w = measureText(txt, font) + 16;
      if (w > max) max = w;
    });
    const final = Math.min(600, Math.max(40, Math.round(max)));
    setWidths((cur) => ({ ...cur, [f]: final }));
  }, [widths, columns]);

  const totalFixed = columns.reduce((sum, c) => sum + (c.width ?? 0), 0);
  const hasFlex = columns.some((c) => c.flex);

  return (
    <div className={`jpk-table-host ${className ?? ''}`}>
      <div className="jpk-table-scroll">
        <table
          ref={tableElRef}
          className="jpk-table"
          style={hasFlex ? { width: '100%' } : { width: totalFixed }}
        >
          <colgroup>
            {columns.map((c) => (
              <col key={`${c.headerName}-${String(c.field ?? '')}`} style={colStyle(c, widths)} />
            ))}
          </colgroup>
          {!hideHeader && <thead>
            <tr>
              {columns.map((c) => {
                const f = c.field ? String(c.field) : '';
                const active = sort?.field === f;
                const filterable = c.filterable !== false && !!c.field && c.sortable !== false;
                const filterActive = (!!filters[f] && filters[f]!.length > 0) || ranges[f] !== undefined || (!!dateFilters[f] && dateFilters[f]!.values.length > 0);
                const resizable = !!c.field;
                return (
                  <th
                    key={`${c.headerName}-${f}`}
                    data-field={f}
                    className={[
                      filterable ? 'is-filterable' : '',
                      active ? 'is-sorted' : '',
                      filterActive ? 'is-filtered' : '',
                      c.align ? `align-${c.align}` : '',
                    ].filter(Boolean).join(' ')}
                    onClick={filterable ? () => setOpenFilter((cur) => (cur === f ? null : f)) : undefined}
                  >
                    <span className="jpk-th-label">{c.headerName}</span>
                    {openFilter === f && (
                      c.filterType === 'range' ? (
                        <RangePopup<T>
                          column={c}
                          rows={rows}
                          sort={sort}
                          onSortChange={(dir) => { if (dir === null) setSort(null); else setSort({ field: f, dir }); }}
                          selected={ranges[f]}
                          onSelect={(r) => setColumnRange(f, r)}
                          onClose={() => setOpenFilter(null)}
                        />
                      ) : c.filterType === 'date' ? (
                        <DatePopup<T>
                          column={c}
                          rows={rows}
                          sort={sort}
                          onSortChange={(dir) => { if (dir === null) setSort(null); else setSort({ field: f, dir }); }}
                          selected={dateFilters[f]}
                          onSelect={(df) => setColumnDateFilter(f, df)}
                          onClose={() => setOpenFilter(null)}
                        />
                      ) : (
                        <FilterPopup<T>
                          column={c}
                          rows={rows}
                          sort={sort}
                          onSortChange={(dir) => { if (dir === null) setSort(null); else setSort({ field: f, dir }); }}
                          selected={filters[f]}
                          onSelect={(values) => setColumnFilter(f, values)}
                          onClose={() => setOpenFilter(null)}
                        />
                      )
                    )}
                    {resizable && (
                      <span
                        className="jpk-th-resize"
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => startResize(e, f)}
                        onDoubleClick={(e) => autoFit(e, c)}
                        title="드래그로 조절 / 더블클릭으로 자동맞춤·복원"
                      />
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>}
          <tbody>
            {sortedRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="jpk-table-empty">데이터 없음</td>
              </tr>
            ) : sortedRows.map((row, rowIndex) => {
              const rowKey = getRowId ? getRowId(row, rowIndex) : String(rowIndex);
              return (
                <JpkTableRow<T>
                  key={rowKey}
                  rowKey={rowKey}
                  row={row}
                  rowIndex={rowIndex}
                  columns={columns}
                  isSelected={selectedKey === rowKey}
                  onRowClick={onRowClick}
                  onRowContextMenu={onRowContextMenu}
                  onSelectInternal={selectedKeyProp === undefined ? setSelectedKeyInner : undefined}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export const JpkTable = forwardRef(JpkTableInner) as <T>(
  props: JpkTableProps<T> & { ref?: React.Ref<JpkTableApi<T> | null> },
) => React.ReactElement;

/* ─── JpkTableRow — React.memo 로 isSelected 변경 시 영향받은 row 만 리렌더 ───
   row 클릭 시 100+ row 가 모두 리렌더되던 비용을 → 이전 selected + 새 selected 2개만 리렌더로 축소. */
type JpkTableRowProps<T> = {
  row: T;
  rowKey: string;
  rowIndex: number;
  columns: JpkColumn<T>[];
  isSelected: boolean;
  onRowClick?: (row: T, index: number) => void;
  onRowContextMenu?: (row: T, index: number, ev: React.MouseEvent) => void;
  onSelectInternal?: (key: string) => void;
};

function JpkTableRowInner<T>({
  row, rowKey, rowIndex, columns, isSelected,
  onRowClick, onRowContextMenu, onSelectInternal,
}: JpkTableRowProps<T>) {
  return (
    <tr
      onClick={() => {
        onSelectInternal?.(rowKey);
        onRowClick?.(row, rowIndex);
      }}
      onContextMenu={onRowContextMenu ? (ev) => {
        ev.preventDefault();
        onSelectInternal?.(rowKey);
        onRowContextMenu(row, rowIndex, ev);
      } : undefined}
      className={isSelected ? 'is-selected' : undefined}
    >
      {columns.map((c) => {
        const value = readValue(c, row, rowIndex);
        const display = c.cellRenderer
          ? c.cellRenderer({ value, data: row, rowIndex })
          : c.valueFormatter
            ? c.valueFormatter({ value, data: row })
            : value === null || value === undefined ? '' : String(value);
        const style = resolveCellStyle(c, value, row);
        return (
          <td
            key={`${c.headerName}-${String(c.field ?? '')}`}
            className={c.align ? `align-${c.align}` : undefined}
            style={style}
          >
            {display}
          </td>
        );
      })}
    </tr>
  );
}

const JpkTableRow = memo(JpkTableRowInner) as <T>(props: JpkTableRowProps<T>) => React.ReactElement;

interface FilterPopupProps<T> {
  column: JpkColumn<T>;
  rows: readonly T[];
  sort: SortState;
  onSortChange: (dir: 'asc' | 'desc' | null) => void;
  selected?: string[];
  onSelect: (values: string[] | undefined) => void;
  onClose: () => void;
}

function FilterPopup<T>({ column, rows, sort, onSortChange, selected, onSelect, onClose }: FilterPopupProps<T>) {
  const popupRef = useRef<HTMLDivElement | null>(null);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<Set<string> | null>(
    selected && selected.length > 0 ? new Set(selected) : null,
  );

  const allValues = useMemo(() => {
    const counts = new Map<string, number>();
    rows.forEach((r, i) => {
      const v = readValue(column, r, i);
      const key = stringifyValue(v);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, column]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allValues;
    return allValues.filter(([v]) => v.toLowerCase().includes(q));
  }, [allValues, search]);

  useEffect(() => {
    const q = search.trim().toLowerCase();
    if (!q) return;
    setDraft(new Set(filtered.map(([v]) => v)));
  }, [search, filtered]);

  const f = String(column.field);
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target) return;
      if (popupRef.current && popupRef.current.contains(target)) return;
      if (target.closest('.jpk-table-host')) return;
      onClose();
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [onClose, f]);

  const toggle = (val: string) => {
    setDraft((cur) => {
      const next = new Set(cur ?? []);
      if (next.has(val)) next.delete(val);
      else next.add(val);
      return next;
    });
  };
  const apply = () => {
    if (draft && draft.size > 0 && draft.size < allValues.length) onSelect([...draft]);
    else onSelect(undefined);
    onClose();
  };
  const reset = () => {
    setDraft(null);
    setSearch('');
    onSelect(undefined);
  };

  const sortDir = sort?.field === f ? sort.dir : null;

  return (
    <div ref={popupRef} className="jpk-filter-popup" onClick={(e) => e.stopPropagation()}>
      <div className="jpk-filter-sort">
        <button type="button" className={sortDir === 'asc' ? 'is-active' : ''}
                onClick={() => onSortChange(sortDir === 'asc' ? null : 'asc')}>오름차순</button>
        <button type="button" className={sortDir === 'desc' ? 'is-active' : ''}
                onClick={() => onSortChange(sortDir === 'desc' ? null : 'desc')}>내림차순</button>
      </div>
      <div className="jpk-filter-search">
        <input type="text" autoFocus placeholder="검색"
               value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="jpk-filter-list">
        {filtered.length === 0 ? (
          <div className="jpk-filter-empty">결과 없음</div>
        ) : (
          filtered.map(([v, n]) => {
            const checked = draft ? draft.has(v) : false;
            return (
              <label key={v} className={`jpk-filter-item${checked ? ' is-checked' : ''}`}>
                <input type="checkbox" checked={checked} onChange={() => toggle(v)} />
                <span className="jpk-filter-label">{v}</span>
                <span className="jpk-filter-count">{n}</span>
              </label>
            );
          })
        )}
      </div>
      <div className="jpk-filter-actions">
        <button type="button" onClick={reset} className="is-reset">초기화</button>
        <button type="button" onClick={onClose} className="is-close">닫기</button>
        <button type="button" onClick={apply} className="is-apply">적용</button>
      </div>
    </div>
  );
}

interface RangePopupProps<T> {
  column: JpkColumn<T>;
  rows: readonly T[];
  sort: SortState;
  onSortChange: (dir: 'asc' | 'desc' | null) => void;
  selected?: [number, number];
  onSelect: (range: [number, number] | undefined) => void;
  onClose: () => void;
}

function RangePopup<T>({ column, rows, sort, onSortChange, selected, onSelect, onClose }: RangePopupProps<T>) {
  const popupRef = useRef<HTMLDivElement | null>(null);
  const f = String(column.field);
  const step = column.filterStep ?? 100000;
  const unit = column.filterUnit ?? 1;
  const unitLabel = column.filterUnitLabel ?? '';

  const dataBounds = useMemo<[number, number]>(() => {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    rows.forEach((r, i) => {
      const v = Number(readValue(column, r, i));
      if (!Number.isFinite(v)) return;
      if (v < min) min = v;
      if (v > max) max = v;
    });
    if (!Number.isFinite(min)) min = 0;
    if (!Number.isFinite(max)) max = 0;
    const lo = Math.floor(min / step) * step;
    const hi = Math.ceil(max / step) * step;
    return [lo, hi];
  }, [rows, column, step]);

  const [draftMin, setDraftMin] = useState<number>(selected?.[0] ?? dataBounds[0]);
  const [draftMax, setDraftMax] = useState<number>(selected?.[1] ?? dataBounds[1]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target) return;
      if (popupRef.current && popupRef.current.contains(target)) return;
      if (target.closest('.jpk-table-host')) return;
      onClose();
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [onClose]);

  const sortDir = sort?.field === f ? sort.dir : null;

  const apply = () => {
    if (draftMin <= dataBounds[0] && draftMax >= dataBounds[1]) onSelect(undefined);
    else onSelect([draftMin, draftMax]);
    onClose();
  };
  const reset = () => {
    setDraftMin(dataBounds[0]);
    setDraftMax(dataBounds[1]);
    onSelect(undefined);
  };

  const fmt = (n: number) => (unit > 1 ? Math.round(n / unit) : n).toLocaleString();
  const parse = (s: string) => {
    const n = Number(s.replace(/,/g, ''));
    return Number.isFinite(n) ? n * unit : 0;
  };

  return (
    <div ref={popupRef} className="jpk-filter-popup" onClick={(e) => e.stopPropagation()}>
      <div className="jpk-filter-sort">
        <button type="button" className={sortDir === 'asc' ? 'is-active' : ''}
                onClick={() => onSortChange(sortDir === 'asc' ? null : 'asc')}>오름차순</button>
        <button type="button" className={sortDir === 'desc' ? 'is-active' : ''}
                onClick={() => onSortChange(sortDir === 'desc' ? null : 'desc')}>내림차순</button>
      </div>
      <div className="jpk-range-body">
        <div className="jpk-range-label">
          {column.headerName} 구간{unitLabel ? ` (${unitLabel})` : ''}
        </div>
        <div className="jpk-range-row">
          <input type="text" value={fmt(draftMin)} onChange={(e) => setDraftMin(parse(e.target.value))} />
          <span>~</span>
          <input type="text" value={fmt(draftMax)} onChange={(e) => setDraftMax(parse(e.target.value))} />
        </div>
        <div className="jpk-range-hint">
          데이터 범위 {fmt(dataBounds[0])} ~ {fmt(dataBounds[1])} {unitLabel}<br />
          step {step.toLocaleString()}원
        </div>
      </div>
      <div className="jpk-filter-actions">
        <button type="button" onClick={reset} className="is-reset">초기화</button>
        <button type="button" onClick={onClose} className="is-close">닫기</button>
        <button type="button" onClick={apply} className="is-apply">적용</button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   DatePopup — 거래일시 등 날짜 컬럼용 계층 필터.
   - 그래뉴러리티 탭: 해 / 분기 / 월 / 일
   - 선택 그래뉴러리티의 unique period 체크박스 리스트 (최신순)
   - 적용 시 해당 그래뉴러리티 + 선택된 period 로 row 필터
   ═══════════════════════════════════════════════════════════════ */
const GRANS: { v: Granularity; label: string }[] = [
  { v: 'year', label: '해' },
  { v: 'quarter', label: '분기' },
  { v: 'month', label: '월' },
  { v: 'day', label: '일' },
];

interface DatePopupProps<T> {
  column: JpkColumn<T>;
  rows: readonly T[];
  sort: SortState;
  onSortChange: (dir: 'asc' | 'desc' | null) => void;
  selected?: DateFilter;
  onSelect: (df: DateFilter | undefined) => void;
  onClose: () => void;
}

function DatePopup<T>({ column, rows, sort, onSortChange, selected, onSelect, onClose }: DatePopupProps<T>) {
  const popupRef = useRef<HTMLDivElement | null>(null);
  const f = String(column.field);
  const [granularity, setGranularity] = useState<Granularity>(selected?.granularity ?? 'month');
  const [draft, setDraft] = useState<Set<string>>(
    selected?.granularity === granularity ? new Set(selected.values) : new Set(),
  );

  // 그래뉴러리티 변경 시 draft 초기화
  useEffect(() => {
    if (selected?.granularity === granularity) setDraft(new Set(selected.values));
    else setDraft(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [granularity]);

  const allValues = useMemo(() => {
    const counts = new Map<string, number>();
    rows.forEach((r, i) => {
      const v = String(readValue(column, r, i) ?? '');
      const key = toPeriodKey(v, granularity);
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => b[0].localeCompare(a[0])); // 최신 위로
  }, [rows, column, granularity]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target) return;
      if (popupRef.current && popupRef.current.contains(target)) return;
      if (target.closest('.jpk-table-host')) return;
      onClose();
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [onClose]);

  const toggle = (val: string) => {
    setDraft((cur) => {
      const next = new Set(cur);
      if (next.has(val)) next.delete(val);
      else next.add(val);
      return next;
    });
  };
  const toggleAll = () => {
    setDraft((cur) => {
      if (cur.size === allValues.length) return new Set();
      return new Set(allValues.map(([v]) => v));
    });
  };
  const apply = () => {
    if (draft.size > 0 && draft.size < allValues.length) {
      onSelect({ granularity, values: [...draft] });
    } else {
      onSelect(undefined);
    }
    onClose();
  };
  const reset = () => {
    setDraft(new Set());
    onSelect(undefined);
  };

  const sortDir = sort?.field === f ? sort.dir : null;
  const allChecked = draft.size === allValues.length && allValues.length > 0;

  return (
    <div ref={popupRef} className="jpk-filter-popup" onClick={(e) => e.stopPropagation()} style={{ width: 240 }}>
      <div className="jpk-filter-sort">
        <button type="button" className={sortDir === 'asc' ? 'is-active' : ''}
                onClick={() => onSortChange(sortDir === 'asc' ? null : 'asc')}>오름차순</button>
        <button type="button" className={sortDir === 'desc' ? 'is-active' : ''}
                onClick={() => onSortChange(sortDir === 'desc' ? null : 'desc')}>내림차순</button>
      </div>
      <div className="jpk-date-grans">
        {GRANS.map((g) => (
          <button key={g.v} type="button"
                  className={granularity === g.v ? 'is-active' : ''}
                  onClick={() => setGranularity(g.v)}>{g.label}</button>
        ))}
      </div>
      <div className="jpk-filter-list">
        {allValues.length === 0 ? (
          <div className="jpk-filter-empty">데이터 없음</div>
        ) : (
          <>
            <label className={`jpk-filter-item${allChecked ? ' is-checked' : ''}`} style={{ borderBottom: '1px solid var(--border)' }}>
              <input type="checkbox" checked={allChecked} onChange={toggleAll} />
              <span className="jpk-filter-label" style={{ fontWeight: 600 }}>전체</span>
              <span className="jpk-filter-count">{allValues.length}</span>
            </label>
            {allValues.map(([v, n]) => {
              const checked = draft.has(v);
              return (
                <label key={v} className={`jpk-filter-item${checked ? ' is-checked' : ''}`}>
                  <input type="checkbox" checked={checked} onChange={() => toggle(v)} />
                  <span className="jpk-filter-label">{v}</span>
                  <span className="jpk-filter-count">{n}</span>
                </label>
              );
            })}
          </>
        )}
      </div>
      <div className="jpk-filter-actions">
        <button type="button" onClick={reset} className="is-reset">초기화</button>
        <button type="button" onClick={onClose} className="is-close">닫기</button>
        <button type="button" onClick={apply} className="is-apply">적용</button>
      </div>
    </div>
  );
}

/* ── helpers ── */

function colStyle<T>(c: JpkColumn<T>, widths?: WidthState): CSSProperties {
  const s: CSSProperties = {};
  const f = c.field ? String(c.field) : '';
  const userW = widths?.[f];
  if (userW !== undefined) s.width = userW;
  else if (c.width !== undefined) s.width = c.width;
  if (c.minWidth !== undefined) s.minWidth = c.minWidth;
  return s;
}

let _measureCtx: CanvasRenderingContext2D | null = null;
function measureText(text: string, font: string): number {
  if (typeof document === 'undefined') return 0;
  if (!_measureCtx) {
    const c = document.createElement('canvas');
    _measureCtx = c.getContext('2d');
  }
  if (!_measureCtx) return 0;
  _measureCtx.font = font;
  return _measureCtx.measureText(text ?? '').width;
}

function getFontShorthand(el: Element): string {
  const cs = getComputedStyle(el);
  return `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
}

function readValue<T>(col: JpkColumn<T>, row: T, rowIndex: number): unknown {
  if (col.valueGetter) return col.valueGetter({ data: row, rowIndex });
  if (col.field) {
    const r = row as Record<string, unknown>;
    return r[String(col.field)];
  }
  return undefined;
}

function resolveCellStyle<T>(col: JpkColumn<T>, value: unknown, row: T): CSSProperties | undefined {
  if (!col.cellStyle) return undefined;
  if (typeof col.cellStyle === 'function') return col.cellStyle({ value, data: row });
  return col.cellStyle;
}

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), 'ko');
}

function stringifyValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return '(빈 값)';
  return String(v);
}

/** RowNum 컬럼 — 거의 모든 그리드 첫 컬럼 */
export function rowNumCol<T>(width = 45): JpkColumn<T> {
  return {
    headerName: '#',
    width,
    sortable: false,
    filterable: false,
    align: 'right',
    valueGetter: ({ rowIndex }) => rowIndex + 1,
    cellStyle: { color: 'var(--text-weak)' },
  };
}
