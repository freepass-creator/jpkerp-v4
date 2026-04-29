'use client';

import { PlaceField } from './place-field';
import { useFavorites } from '@/lib/use-locations';
import { cn } from '@/lib/cn';
import { Plus, X } from '@phosphor-icons/react';

const ACC_TYPES = ['단독', '쌍방'];
const ROLES = ['가해', '피해'];
const STATUS = ['접수', '처리중', '수리중', '종결'];
const RENTAL = ['미정', '대차제공', '대차없음'];
const DEDUCT_STATUS = ['미수', '수납완료', '면제'];
const FAULT_STEPS = ['0', '10', '20', '30', '40', '50', '60', '70', '80', '90', '100'];
const INS_OPTIONS: { key: string; label: string }[] = [
  { key: 'ins_car', label: '자차' },
  { key: 'ins_property', label: '대물' },
  { key: 'ins_person', label: '대인' },
  { key: 'ins_self', label: '자손' },
  { key: 'ins_uninsured', label: '무보험' },
];

interface Props {
  data: Record<string, string>;
  setData: (next: Record<string, string>) => void;
}

/**
 * 사고접수 — v3 accident-form 의 핵심 필드 포팅.
 * 사고형태 / 가해피해 / 보험유형(multi) / 진행상태 / 과실% / 대차 / 우리·상대 보험사 / 면책금
 */
export function AccidentForm({ data, setData }: Props) {
  function set(key: string, value: string) {
    setData({ ...data, [key]: value });
  }
  function toggleMulti(key: string) {
    setData({ ...data, [key]: data[key] === 'Y' ? '' : 'Y' });
  }

  return (
    <>
      {/* 사고형태 / 가해피해 */}
      <div className="block" style={{ gridColumn: 'span 2' }}>
        <span className="label label-required">사고형태</span>
        <div className="chip-group">
          {ACC_TYPES.map((v) => (
            <button key={v} type="button" className={cn('chip', data.acc_type === v && 'active')} onClick={() => set('acc_type', v)}>{v}</button>
          ))}
        </div>
      </div>
      <div className="block" style={{ gridColumn: 'span 2' }}>
        <span className="label label-required">가해/피해</span>
        <div className="chip-group">
          {ROLES.map((v) => (
            <button key={v} type="button" className={cn('chip', data.acc_role === v && 'active')} onClick={() => set('acc_role', v)}>{v}</button>
          ))}
        </div>
      </div>

      {/* 보험유형 multi */}
      <div className="block" style={{ gridColumn: 'span 2' }}>
        <span className="label">보험유형 <span style={{ color: 'var(--text-weak)', fontWeight: 400 }}>(복수)</span></span>
        <div className="chip-group" style={{ flexWrap: 'wrap' }}>
          {INS_OPTIONS.map((o) => (
            <button
              key={o.key}
              type="button"
              className={cn('chip', data[o.key] === 'Y' && 'active')}
              onClick={() => toggleMulti(o.key)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* 진행상태 */}
      <div className="block" style={{ gridColumn: 'span 2' }}>
        <span className="label label-required">진행 상태</span>
        <div className="chip-group">
          {STATUS.map((v) => (
            <button key={v} type="button" className={cn('chip', data.accident_status === v && 'active')} onClick={() => set('accident_status', v)}>{v}</button>
          ))}
        </div>
      </div>

      {/* 내 과실 / 대차 */}
      <div className="block" style={{ gridColumn: 'span 2' }}>
        <span className="label">내 과실 (%)</span>
        <div className="chip-group" style={{ flexWrap: 'wrap' }}>
          {FAULT_STEPS.map((v) => (
            <button key={v} type="button" className={cn('chip', data.fault_pct === v && 'active')} onClick={() => set('fault_pct', v)}>{v}</button>
          ))}
        </div>
      </div>
      <div className="block" style={{ gridColumn: 'span 2' }}>
        <span className="label">대차</span>
        <div className="chip-group">
          {RENTAL.map((v) => (
            <button key={v} type="button" className={cn('chip', data.rental_car === v && 'active')} onClick={() => set('rental_car', v)}>{v}</button>
          ))}
        </div>
      </div>

      {/* 우리쪽 */}
      <InsurerField label="우리 보험사" namespace="insurer" value={data.our_insurance ?? ''} onChange={(v) => set('our_insurance', v)} />
      <label className="block" style={{ gridColumn: 'span 1' }}>
        <span className="label">접수번호</span>
        <input className="input w-full mono" type="text" value={data.insurance_no ?? ''} onChange={(e) => set('insurance_no', e.target.value)} />
      </label>
      <label className="block" style={{ gridColumn: 'span 1' }}>
        <span className="label">담당자 연락처</span>
        <input className="input w-full mono" type="text" value={data.insurance_contact ?? ''} onChange={(e) => set('insurance_contact', e.target.value)} placeholder="010-..." />
      </label>

      {/* 상대쪽 */}
      <label className="block" style={{ gridColumn: 'span 1' }}>
        <span className="label">상대 차량번호</span>
        <input className="input w-full mono" type="text" value={data.accident_other ?? ''} onChange={(e) => set('accident_other', e.target.value)} placeholder="12가3456" />
      </label>
      <label className="block" style={{ gridColumn: 'span 1' }}>
        <span className="label">상대방 이름</span>
        <input className="input w-full" type="text" value={data.other_party_name ?? ''} onChange={(e) => set('other_party_name', e.target.value)} />
      </label>
      <label className="block" style={{ gridColumn: 'span 1' }}>
        <span className="label">상대 연락처</span>
        <input className="input w-full mono" type="text" value={data.other_party_phone ?? ''} onChange={(e) => set('other_party_phone', e.target.value)} placeholder="010-..." />
      </label>
      <InsurerField label="상대 보험사" namespace="insurer" value={data.other_party_insurance ?? ''} onChange={(v) => set('other_party_insurance', v)} />
      <label className="block" style={{ gridColumn: 'span 1' }}>
        <span className="label">상대 접수번호</span>
        <input className="input w-full mono" type="text" value={data.other_insurance_no ?? ''} onChange={(e) => set('other_insurance_no', e.target.value)} />
      </label>
      <label className="block" style={{ gridColumn: 'span 1' }}>
        <span className="label">상대 담당자 연락처</span>
        <input className="input w-full mono" type="text" value={data.other_insurance_contact ?? ''} onChange={(e) => set('other_insurance_contact', e.target.value)} placeholder="010-..." />
      </label>

      {/* 사고 장소 */}
      <PlaceField
        label="사고 장소"
        namespace="accident-location"
        colSpan={4}
        value={data.location ?? ''}
        onChange={(v) => set('location', v)}
      />

      {/* 금액 */}
      <label className="block">
        <span className="label">총 수리비</span>
        <MoneyInput value={data.amount ?? ''} onChange={(v) => set('amount', v)} />
      </label>
      <label className="block">
        <span className="label">보험처리 금액</span>
        <MoneyInput value={data.insurance_amount ?? ''} onChange={(v) => set('insurance_amount', v)} />
      </label>
      <label className="block">
        <span className="label">면책금 (고객부담)</span>
        <MoneyInput value={data.deductible_amount ?? ''} onChange={(v) => set('deductible_amount', v)} />
      </label>
      <label className="block">
        <span className="label">수납한 면책금</span>
        <MoneyInput value={data.deductible_paid ?? ''} onChange={(v) => set('deductible_paid', v)} />
      </label>

      <div className="block" style={{ gridColumn: 'span 4' }}>
        <span className="label">면책금 상태 <span style={{ color: 'var(--text-weak)', fontWeight: 400 }}>· 미수면 미결로 남음</span></span>
        <div className="chip-group">
          {DEDUCT_STATUS.map((v) => (
            <button key={v} type="button" className={cn('chip', data.deductible_status === v && 'active')} onClick={() => set('deductible_status', v)}>{v}</button>
          ))}
        </div>
      </div>
    </>
  );
}

function InsurerField({ label, namespace, value, onChange }: { label: string; namespace: string; value: string; onChange: (v: string) => void }) {
  const { list: favs, toggle, isFav } = useFavorites(namespace);
  const trimmed = value.trim();
  const inFav = !!trimmed && isFav(trimmed);
  return (
    <div className="block" style={{ gridColumn: 'span 2' }}>
      <span className="label">{label}</span>
      <div style={{ display: 'flex', gap: 4 }}>
        <input
          className="input"
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="DB손해보험 등"
          style={{ flex: 1, minWidth: 0 }}
        />
        <button
          type="button"
          className="btn"
          onClick={() => trimmed && !inFav && toggle(trimmed)}
          disabled={!trimmed || inFav}
          title={inFav ? '이미 등록됨' : '즐겨찾기 등록'}
          style={{ flexShrink: 0 }}
        >
          <Plus size={12} weight="bold" />
        </button>
      </div>
      {favs.length > 0 && (
        <div className="chip-group" style={{ flexWrap: 'wrap', marginTop: 4 }}>
          {favs.map((v) => (
            <span key={v} className={cn('chip', value === v && 'active')} style={{ paddingRight: 4 }}>
              <span role="button" tabIndex={0} onClick={() => onChange(v)} style={{ cursor: 'pointer' }}>{v}</span>
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); toggle(v); }}
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 14, height: 14, marginLeft: 4, cursor: 'pointer', opacity: 0.6 }}
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

function MoneyInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const display = value ? Number(value).toLocaleString('ko-KR') : '';
  return (
    <input
      className="input w-full mono"
      type="text"
      inputMode="numeric"
      value={display}
      onChange={(e) => onChange(e.target.value.replace(/[^\d-]/g, ''))}
      placeholder="0"
      style={{ textAlign: 'right' }}
    />
  );
}
