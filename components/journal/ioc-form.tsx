'use client';

import { PlaceField } from './place-field';
import { cn } from '@/lib/cn';

const IOC_SUBKINDS = ['출고', '반납', '회수', '이동'] as const;
type IocSubkind = typeof IOC_SUBKINDS[number];

interface Props {
  data: Record<string, string>;
  setData: (next: Record<string, string>) => void;
}

/** 입출고 — 종류 / 출발지 / 도착지 / 주행거리. */
export function IocForm({ data, setData }: Props) {
  const sub = (data.subkind ?? '') as IocSubkind | '';
  const mileageDisplay = data.mileage ? Number(data.mileage).toLocaleString('ko-KR') : '';

  function set(key: string, value: string) {
    setData({ ...data, [key]: value });
  }

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
