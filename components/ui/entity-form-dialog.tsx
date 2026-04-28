'use client';

/**
 * EntityFormDialog — 도메인 무관 schema-driven 등록·수정 다이얼로그.
 *
 * 사용:
 *   <EntityFormDialog
 *     open={open}
 *     onOpenChange={setOpen}
 *     title="계약 등록"
 *     fields={[
 *       { key: 'contractNo', label: '계약번호', placeholder: 'C-2026-NNNN' },
 *       { key: 'plate', label: '차량번호' },
 *       { key: 'startDate', label: '시작일', type: 'date' },
 *       ...
 *     ]}
 *     onSubmit={(data) => { onCreate(data); setOpen(false); }}
 *   />
 */

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogClose, DialogFooter } from './dialog';

export type FieldDef = {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'date' | 'select' | 'textarea';
  options?: readonly string[] | string[];
  placeholder?: string;
  colSpan?: 1 | 2 | 3 | 4;
  required?: boolean;
};

export type FieldSection = {
  title: string;
  fields: FieldDef[];
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** 단순 평면 필드 목록 또는 섹션 단위 */
  fields?: FieldDef[];
  sections?: FieldSection[];
  initial?: Record<string, string>;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  submitLabel?: string;
  onSubmit: (data: Record<string, string>) => void;
};

export function EntityFormDialog({
  open,
  onOpenChange,
  title,
  fields,
  sections,
  initial = {},
  size = 'lg',
  submitLabel = '등록',
  onSubmit,
}: Props) {
  const [data, setData] = useState<Record<string, string>>(initial);

  useEffect(() => {
    if (open) setData(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function setField(key: string, value: string) {
    setData((d) => ({ ...d, [key]: value }));
  }

  const allSections: FieldSection[] = sections ?? (fields ? [{ title: '', fields }] : []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title} size={size}>
        <div className="form-stack">
          {allSections.map((section, i) => (
            <div key={i} className="form-section">
              {section.title && <div className="form-section-title">{section.title}</div>}
              <div className="form-grid">
                {section.fields.map((f) => (
                  <Field key={f.key} f={f} value={data[f.key] ?? ''} onChange={(v) => setField(f.key, v)} />
                ))}
              </div>
            </div>
          ))}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <button className="btn">취소</button>
          </DialogClose>
          <button
            className="btn btn-primary"
            onClick={() => onSubmit(data)}
          >
            {submitLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ f, value, onChange }: { f: FieldDef; value: string; onChange: (v: string) => void }) {
  const span = f.colSpan === 4 ? 'col-span-4' : f.colSpan === 3 ? 'col-span-3' : f.colSpan === 2 ? 'col-span-2' : '';
  return (
    <label className={`block ${span}`}>
      <span className={`label${f.required ? ' label-required' : ''}`}>{f.label}</span>
      {f.type === 'select' ? (
        <select className="input w-full" value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">- {f.placeholder ?? '선택'}</option>
          {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : f.type === 'textarea' ? (
        <textarea
          className="input w-full"
          rows={3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={f.placeholder}
        />
      ) : (
        <input
          type={f.type === 'number' || f.type === 'date' ? f.type : 'text'}
          className="input w-full"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={f.placeholder}
        />
      )}
    </label>
  );
}
