'use client';

/**
 * EntityFormDialog — 도메인 무관 schema-driven 등록·조회·수정·복사 다이얼로그.
 *
 * 4-mode (자산 다이얼로그 패턴):
 *  - view      : readonly + 회색 dot. [닫기] [수정→edit]
 *  - edit      : editable + 황색 dot.  [취소→view] [저장]
 *  - create    : editable + 기본 색.   [취소] [등록]
 *  - duplicate : editable + 녹색 dot.  [취소] [등록]
 *
 * 사용:
 *   <EntityFormDialog
 *     open={open} onOpenChange={setOpen}
 *     title="계약" mode="view" sections={...} initial={...}
 *     onSubmit={(data) => { onUpdate(data); setOpen(false); }}
 *   />
 */

import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogClose, DialogFooter } from './dialog';
import { cn } from '@/lib/cn';
import { useDialogShortcuts, countChanges } from '@/lib/use-dialog-shortcuts';

export type FieldDef = {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'date' | 'select' | 'textarea';
  options?: readonly string[] | string[];
  placeholder?: string;
  colSpan?: 1 | 2 | 3 | 4;
  required?: boolean;
  /** 변경 불가 — 등록 후 식별자(코드 등) 잠금용 */
  readOnly?: boolean;
};

export type FieldSection = {
  title: string;
  fields: FieldDef[];
};

export type EntityDialogMode = 'view' | 'edit' | 'create' | 'duplicate';

const MODE_DOT: Record<EntityDialogMode, string> = {
  view: '#9ca3af',       // 회색
  edit: '#f59e0b',       // 황색
  create: '#3b82f6',     // 파랑 (기본)
  duplicate: '#22c55e',  // 녹색
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** 모드 — 미지정 시 'create' (구버전 호환) */
  mode?: EntityDialogMode;
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
  mode = 'create',
  fields,
  sections,
  initial = {},
  size = 'lg',
  submitLabel,
  onSubmit,
}: Props) {
  const [data, setData] = useState<Record<string, string>>(initial);
  const [currentMode, setCurrentMode] = useState<EntityDialogMode>(mode);

  useEffect(() => {
    if (open) {
      setData(initial);
      setCurrentMode(mode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode]);

  function setField(key: string, value: string) {
    setData((d) => ({ ...d, [key]: value }));
  }

  const allSections: FieldSection[] = sections ?? (fields ? [{ title: '', fields }] : []);
  const isReadonly = currentMode === 'view';

  // 변경 감지 — initial vs current data
  const dirtyCount = useMemo(() => countChanges(initial, data), [initial, data]);

  function handleClose() {
    if (currentMode === 'edit' && dirtyCount > 0) {
      if (!window.confirm('미저장 변경이 있습니다. 닫을까요?')) return;
    }
    onOpenChange(false);
  }

  // 키보드 단축키 — Esc 닫기 / Ctrl+S 저장
  const canSave =
    (currentMode === 'edit' && dirtyCount > 0) ||
    currentMode === 'create' ||
    currentMode === 'duplicate';
  useDialogShortcuts({
    open,
    onClose: handleClose,
    onSave: canSave ? () => onSubmit(data) : undefined,
  });

  // 모드별 색깔 dot 헤더
  const titleNode = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span aria-hidden style={{
        display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
        background: MODE_DOT[currentMode], flexShrink: 0,
      }} />
      <span>{title}</span>
    </span>
  );

  const defaultSubmitLabel =
    currentMode === 'edit' ? '저장' :
    currentMode === 'duplicate' ? '등록' :
    submitLabel ?? '등록';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={titleNode} size={size}>
        <fieldset
          disabled={isReadonly}
          className={cn('form-stack', `form-mode-${currentMode}`)}
          style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
        >
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
        </fieldset>

        <DialogFooter>
          {currentMode === 'view' ? (
            <>
              <DialogClose asChild><button className="btn">닫기</button></DialogClose>
              <button className="btn btn-primary" onClick={() => setCurrentMode('edit')}>수정</button>
            </>
          ) : currentMode === 'edit' ? (
            <>
              <button
                className="btn"
                style={{ marginRight: 'auto' }}
                onClick={() => { setData(initial); setCurrentMode('view'); }}
              >
                취소 (조회로 복귀)
              </button>
              <DialogClose asChild><button className="btn">닫기</button></DialogClose>
              {dirtyCount > 0 && (
                <span className="text-weak" style={{ fontSize: 12, marginRight: 4 }}>
                  변경 {dirtyCount}건 미저장
                </span>
              )}
              <button
                className="btn btn-primary"
                disabled={dirtyCount === 0}
                onClick={() => onSubmit(data)}
              >
                저장
              </button>
            </>
          ) : (
            // create / duplicate
            <>
              <DialogClose asChild><button className="btn">취소</button></DialogClose>
              <button className="btn btn-primary" onClick={() => onSubmit(data)}>
                {defaultSubmitLabel}
              </button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ f, value, onChange }: { f: FieldDef; value: string; onChange: (v: string) => void }) {
  const span = f.colSpan === 4 ? 'col-span-4' : f.colSpan === 3 ? 'col-span-3' : f.colSpan === 2 ? 'col-span-2' : '';
  const lockedStyle = f.readOnly
    ? { background: 'var(--bg-disabled)', color: 'var(--text-main)', cursor: 'default' as const }
    : undefined;
  const lockedTitle = f.readOnly ? '등록 후 변경 불가' : undefined;
  return (
    <label className={`block ${span}`}>
      <span className={`label${f.required ? ' label-required' : ''}`}>
        {f.label}{f.readOnly && <span className="text-weak"> (변경 불가)</span>}
      </span>
      {f.type === 'select' ? (
        <select
          className="input w-full"
          value={value}
          onChange={(e) => !f.readOnly && onChange(e.target.value)}
          disabled={f.readOnly}
          title={lockedTitle}
          style={lockedStyle}
        >
          <option value="">- {f.placeholder ?? '선택'}</option>
          {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : f.type === 'textarea' ? (
        <textarea
          className="input w-full"
          rows={3}
          value={value}
          onChange={(e) => !f.readOnly && onChange(e.target.value)}
          placeholder={f.placeholder}
          readOnly={f.readOnly}
          title={lockedTitle}
          style={lockedStyle}
        />
      ) : (
        <input
          type={f.type === 'number' || f.type === 'date' ? f.type : 'text'}
          className="input w-full"
          value={value}
          onChange={(e) => !f.readOnly && onChange(e.target.value)}
          placeholder={f.placeholder}
          readOnly={f.readOnly}
          title={lockedTitle}
          style={lockedStyle}
        />
      )}
    </label>
  );
}
