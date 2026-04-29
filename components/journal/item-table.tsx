'use client';

import { Plus, X } from '@phosphor-icons/react';

export type ItemRow = {
  /** 항목명 (예: "엔진오일", "타이어 4본") */
  item: string;
  /** 금액 (원) */
  amount: number;
};

interface Props {
  title: string;
  rows: ItemRow[];
  onChange: (rows: ItemRow[]) => void;
  /** 항목 자동완성용 datalist 옵션 (예: ['엔진오일','타이어','브레이크오일']) */
  suggestions?: string[];
  /** datalist id (페이지 내 unique) */
  listId?: string;
  itemPlaceholder?: string;
}

/**
 * 차량수선 정비/상품화 등에서 항목·금액 입력용 미니 그리드.
 *  - [항목] [금액] [삭제]
 *  - 행 추가 버튼
 *  - 자동 합계 표시
 *  - 항목은 datalist 자동완성 (suggestions 가 있을 때)
 */
export function ItemTable({ title, rows, onChange, suggestions, listId, itemPlaceholder }: Props) {
  const total = rows.reduce((s, r) => s + (r.amount || 0), 0);
  const dlId = listId ?? `dl-items-${title.replace(/\s+/g, '-')}`;

  function setRow(idx: number, patch: Partial<ItemRow>) {
    onChange(rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }
  function removeRow(idx: number) {
    onChange(rows.filter((_, i) => i !== idx));
  }
  function addRow() {
    onChange([...rows, { item: '', amount: 0 }]);
  }

  return (
    <div style={{
      border: '1px solid var(--border)',
      borderRadius: 4,
      background: 'var(--bg-card)',
      overflow: 'hidden',
    }}>
      <div className="panel-head">
        <span>{title}</span>
        <span className="mono panel-head-right" style={{ color: 'var(--text)', fontWeight: 600 }}>
          {total.toLocaleString('ko-KR')}원
        </span>
      </div>
      <table className="table" style={{ tableLayout: 'fixed', width: '100%' }}>
        <colgroup>
          <col />
          <col style={{ width: 140 }} />
          <col style={{ width: 32 }} />
        </colgroup>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={3} className="center dim" style={{ padding: 0, fontSize: 12 }}>
                <button
                  type="button"
                  onClick={addRow}
                  style={{
                    width: '100%',
                    padding: '12px 0',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-weak)',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontFamily: 'inherit',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  + 행 추가 (또는 항목 입력하려면 클릭)
                </button>
              </td>
            </tr>
          ) : (
            rows.map((r, i) => (
              <tr key={i}>
                <td style={{ padding: 4 }}>
                  <input
                    className="input mono"
                    type="text"
                    value={r.item}
                    onChange={(e) => setRow(i, { item: e.target.value })}
                    placeholder={itemPlaceholder ?? '항목명'}
                    list={suggestions ? dlId : undefined}
                    style={{ width: '100%', height: 24 }}
                  />
                </td>
                <td style={{ padding: 4 }}>
                  <input
                    className="input mono"
                    type="text"
                    inputMode="numeric"
                    value={r.amount ? r.amount.toLocaleString('ko-KR') : ''}
                    onChange={(e) => {
                      const n = Number(e.target.value.replace(/[^\d-]/g, '')) || 0;
                      setRow(i, { amount: n });
                    }}
                    placeholder="0"
                    style={{ width: '100%', height: 24, textAlign: 'right' }}
                  />
                </td>
                <td style={{ padding: 4, textAlign: 'center' }}>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => removeRow(i)}
                    style={{ height: 24, width: 24, padding: 0 }}
                    title="삭제"
                  >
                    <X size={12} weight="bold" />
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      <div style={{ padding: '6px', borderTop: '1px solid var(--border-soft)' }}>
        <button type="button" className="btn" onClick={addRow} style={{ width: '100%' }}>
          <Plus size={12} weight="bold" /> 행 추가
        </button>
      </div>
      {suggestions && (
        <datalist id={dlId}>
          {suggestions.map((s) => <option key={s} value={s} />)}
        </datalist>
      )}
    </div>
  );
}
