'use client';

/**
 * 금액 입력 — 천원 단위 콤마 자동 포맷, 저장은 숫자 string.
 * accident-form / pc-form / 기타 generic number 필드에서 공통 사용.
 */
export function MoneyInput({ value, onChange, placeholder = '0' }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const display = value ? Number(value).toLocaleString('ko-KR') : '';
  return (
    <input
      className="input w-full mono"
      type="text"
      inputMode="numeric"
      value={display}
      onChange={(e) => onChange(e.target.value.replace(/[^\d-]/g, ''))}
      placeholder={placeholder}
      style={{ textAlign: 'right' }}
    />
  );
}
