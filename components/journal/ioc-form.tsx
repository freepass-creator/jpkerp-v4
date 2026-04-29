'use client';

import { useFavorites } from '@/lib/use-locations';
import { cn } from '@/lib/cn';
import { Plus, X } from '@phosphor-icons/react';

const IOC_SUBKINDS = ['출고', '반납', '회수', '이동'] as const;
type IocSubkind = typeof IOC_SUBKINDS[number];

interface Props {
  data: Record<string, string>;
  setData: (next: Record<string, string>) => void;
}

/**
 * 입출고 — 종류 / 출발지 / 도착지 / 주행거리.
 * 출발지·도착지 즐겨찾기는 namespace 별도 ('from' / 'to').
 */
export function IocForm({ data, setData }: Props) {
  const sub = (data.subkind ?? '') as IocSubkind | '';

  function set(key: string, value: string) {
    setData({ ...data, [key]: value });
  }

  const mileageDisplay = data.mileage ? Number(data.mileage).toLocaleString('ko-KR') : '';

  return (
    <>
      <div className="block" style={{ gridColumn: 'span 4' }}>
        <span className="label label-required">종류</span>
        <div className="chip-group" style={{ flexWrap: 'wrap' }}>
          {IOC_SUBKINDS.map((s) => (
            <button
              key={s}
              type="button"
              className={cn('chip', sub === s && 'active')}
              onClick={() => setData({ ...data, subkind: s })}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <PlaceField
        label="출발지"
        namespace="from"
        value={data.from ?? ''}
        onChange={(v) => set('from', v)}
      />
      <PlaceField
        label="도착지"
        namespace="to"
        required
        value={data.to ?? ''}
        onChange={(v) => set('to', v)}
      />

      <label className="block" style={{ gridColumn: 'span 2' }}>
        <span className="label label-required">주행거리(km)</span>
        <input
          className="input w-full mono"
          type="text"
          inputMode="numeric"
          value={mileageDisplay}
          onChange={(e) => {
            const n = e.target.value.replace(/[^\d]/g, '');
            set('mileage', n);
          }}
          placeholder="0"
          style={{ textAlign: 'right' }}
        />
      </label>
    </>
  );
}

interface PlaceFieldProps {
  label: string;
  namespace: 'from' | 'to';
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
}

function PlaceField({ label, namespace, required, value, onChange }: PlaceFieldProps) {
  const { list: favs, toggle, isFav } = useFavorites(namespace);
  const trimmed = value.trim();
  const currentInFavs = !!trimmed && isFav(trimmed);

  return (
    <div className="block" style={{ gridColumn: 'span 2' }}>
      <span className={cn('label', required && 'label-required')}>{label}</span>
      <div style={{ display: 'flex', gap: 4 }}>
        <input
          className="input"
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`${label} 입력 (또는 아래 chip 클릭)`}
          style={{ flex: 1, minWidth: 0 }}
        />
        <button
          type="button"
          className="btn"
          onClick={() => trimmed && toggle(trimmed)}
          disabled={!trimmed}
          title={currentInFavs ? '즐겨찾기 해제' : '즐겨찾기 등록'}
          style={{ flexShrink: 0 }}
        >
          {currentInFavs ? <X size={12} weight="bold" /> : <Plus size={12} weight="bold" />}
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
