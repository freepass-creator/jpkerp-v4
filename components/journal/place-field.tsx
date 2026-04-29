'use client';

import { Plus, X } from '@phosphor-icons/react';
import { useFavorites } from '@/lib/use-locations';
import { cn } from '@/lib/cn';

interface Props {
  label: string;
  /** 즐겨찾기 namespace 분리 키 ('from'/'to'/'pc-vendor' 등) */
  namespace: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  /** 4 컬럼 grid 에서 차지 칸수 (기본 2) */
  colSpan?: 1 | 2 | 4;
  placeholder?: string;
}

/**
 * 장소(출발지·도착지·입고지 등) 입력 필드.
 *  - 입력칸 + 우측 [+ 즐겨찾기 등록] 버튼 (이미 등록된 값이면 비활성)
 *  - 입력칸 아래 즐겨찾기 chip — 클릭 = 채움, 개별 ✕ = 삭제
 *  - namespace 별로 즐겨찾기 분리 (출발지/도착지/입고지 각각 다른 목록)
 */
export function PlaceField({ label, namespace, required, value, onChange, colSpan = 2, placeholder }: Props) {
  const { list: favs, toggle, isFav } = useFavorites(namespace);
  const trimmed = value.trim();
  const currentInFavs = !!trimmed && isFav(trimmed);
  const span: Record<1 | 2 | 4, string> = { 1: 'span 1', 2: 'span 2', 4: 'span 4' };

  return (
    <div className="block" style={{ gridColumn: span[colSpan] }}>
      <span className={cn('label', required && 'label-required')}>{label}</span>
      <div style={{ display: 'flex', gap: 4 }}>
        <input
          className="input"
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? `${label} 입력 (또는 아래 chip 클릭)`}
          style={{ flex: 1, minWidth: 0 }}
        />
        <button
          type="button"
          className="btn"
          onClick={() => trimmed && !currentInFavs && toggle(trimmed)}
          disabled={!trimmed || currentInFavs}
          title={currentInFavs ? '이미 즐겨찾기에 등록됨' : '즐겨찾기 등록'}
          style={{ flexShrink: 0 }}
        >
          <Plus size={12} weight="bold" />
        </button>
      </div>
      {favs.length > 0 && (
        <div className="chip-group" style={{ flexWrap: 'wrap', marginTop: 4 }}>
          {favs.map((v) => (
            <span
              key={v}
              className={cn('chip', value === v && 'active')}
              style={{ paddingRight: 4 }}
            >
              <span
                role="button"
                tabIndex={0}
                onClick={() => onChange(v)}
                style={{ cursor: 'pointer' }}
              >
                {v}
              </span>
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); toggle(v); }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 14,
                  height: 14,
                  marginLeft: 4,
                  cursor: 'pointer',
                  opacity: 0.6,
                }}
                title="즐겨찾기 삭제"
              >
                <X size={10} weight="bold" />
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
