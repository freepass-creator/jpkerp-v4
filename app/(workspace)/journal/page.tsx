'use client';

import { useState, useMemo } from 'react';
import { Plus, ArrowCounterClockwise } from '@phosphor-icons/react';
import { PageShell } from '@/components/layout/page-shell';
import {
  JOURNAL_KINDS, KIND_LABEL, KIND_HINT,
  SAMPLE_JOURNAL, type JournalEntry, type JournalKind,
} from '@/lib/sample-journal';
import { cn } from '@/lib/cn';

/**
 * 업무일지 — 직원 일상 입력 작업장.
 *  ┌ 상단(filterbar): 9종 + 기타 카테고리 chip
 *  └ 본문: 선택 카테고리 입력 폼 (카테고리별 필드 다름)
 *
 * 기록은 footer에 카테고리별 카운트로 노출. 별도 목록 페이지 없음.
 */

type FieldDef = {
  key: string;
  label: string;
  type?: 'text' | 'date' | 'datetime-local' | 'number' | 'select' | 'textarea';
  options?: string[];
  placeholder?: string;
  required?: boolean;
  /** 4 컬럼 그리드에서 차지하는 칸수 (기본 1, 최대 4) */
  colSpan?: 1 | 2 | 4;
};

const FORMS: Record<JournalKind, FieldDef[]> = {
  ioc: [
    { key: 'plate',    label: '차량번호', placeholder: '12가1234', required: true },
    { key: 'subkind',  label: '종류',     type: 'select', options: ['출고', '반납', '회수', '이동'], required: true },
    { key: 'mileage',  label: '주행거리(km)', type: 'number' },
    { key: 'from',     label: '출발지' },
    { key: 'to',       label: '도착지' },
    { key: 'note',     label: '비고',     type: 'textarea', colSpan: 4 },
  ],
  pc: [
    { key: 'plate',    label: '차량번호', placeholder: '12가1234', required: true },
    { key: 'subkind',  label: '종류',     type: 'select', options: ['정비', '사고수리', '세차', '상품화', '연료보충', '키 교체'], required: true },
    { key: 'vendor',   label: '작업소' },
    { key: 'cost',     label: '비용(원)', type: 'number' },
    { key: 'detail',   label: '작업내용', type: 'textarea', colSpan: 4 },
  ],
  contact: [
    { key: 'channel',  label: '채널',     type: 'select', options: ['전화', '방문', '문자', '메일', '카카오'], required: true },
    { key: 'customer', label: '고객명' },
    { key: 'phone',    label: '연락처',   placeholder: '010-...' },
    { key: 'plate',    label: '차량번호', placeholder: '12가1234' },
    { key: 'detail',   label: '응대내용', type: 'textarea', colSpan: 4, required: true },
  ],
  accident: [
    { key: 'plate',      label: '차량번호',  placeholder: '12가1234', required: true },
    { key: 'happenedAt', label: '발생일시',  type: 'datetime-local', required: true },
    { key: 'location',   label: '장소',      colSpan: 2 },
    { key: 'damage',     label: '피해정도',  colSpan: 2 },
    { key: 'insurer',    label: '보험사',    colSpan: 2 },
    { key: 'detail',     label: '상세',      type: 'textarea', colSpan: 4 },
  ],
  ignition: [
    { key: 'plate',  label: '차량번호', placeholder: '12가1234', required: true },
    { key: 'action', label: '조치',     type: 'select', options: ['시동잠금', '시동해제', '회수결정', '회수진행', '회수완료'], required: true },
    { key: 'reason', label: '사유',     type: 'textarea', colSpan: 4 },
  ],
  insurance: [
    { key: 'plate',     label: '차량번호',  placeholder: '12가1234', required: true },
    { key: 'subkind',   label: '종류',      type: 'select', options: ['신규', '갱신', '해지', '연령변경'], required: true },
    { key: 'insurer',   label: '보험사' },
    { key: 'policyNo',  label: '증권번호' },
    { key: 'startDate', label: '시작일',    type: 'date' },
    { key: 'endDate',   label: '종료일',    type: 'date' },
    { key: 'note',      label: '비고',      type: 'textarea', colSpan: 4 },
  ],
  product_register: [
    { key: 'plate',         label: '차량번호',     placeholder: '12가1234', required: true },
    { key: 'monthlyAmount', label: '월 대여료(원)', type: 'number' },
    { key: 'rentMonths',    label: '대여기간(개월)', type: 'number' },
    { key: 'detail',        label: '상품 설명',     type: 'textarea', colSpan: 4 },
  ],
  penalty_notice: [
    { key: 'plate',    label: '차량번호', placeholder: '12가1234', required: true },
    { key: 'issuer',   label: '부과기관' },
    { key: 'amount',   label: '금액(원)', type: 'number' },
    { key: 'dueDate',  label: '납부기한', type: 'date' },
    { key: 'note',     label: '비고',     type: 'textarea', colSpan: 4 },
  ],
  disposal: [
    { key: 'plate',   label: '차량번호',  placeholder: '12가1234', required: true },
    { key: 'subkind', label: '처분종류',  type: 'select', options: ['매각', '폐차', '반환', '전손'], required: true },
    { key: 'amount',  label: '금액(원)',  type: 'number' },
    { key: 'detail',  label: '상세',      type: 'textarea', colSpan: 4 },
  ],
  etc: [
    { key: 'title',  label: '제목', required: true, colSpan: 2 },
    { key: 'detail', label: '상세', type: 'textarea', colSpan: 4, required: true },
  ],
};

function nowLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function emptyData(fields: FieldDef[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) out[f.key] = '';
  return out;
}

const COL_SPAN: Record<1 | 2 | 4, string> = {
  1: 'span 1',
  2: 'span 2',
  4: 'span 4',
};

export default function JournalPage() {
  const [entries, setEntries] = useState<JournalEntry[]>(SAMPLE_JOURNAL);
  const [kind, setKind] = useState<JournalKind>('ioc');
  const [at, setAt] = useState<string>(nowLocal());
  const [data, setData] = useState<Record<string, string>>(() => emptyData(FORMS['ioc']));

  const counts = useMemo(() => {
    const c: Record<JournalKind, number> = {
      ioc: 0, pc: 0, contact: 0, accident: 0, ignition: 0,
      insurance: 0, product_register: 0, penalty_notice: 0, disposal: 0, etc: 0,
    };
    for (const e of entries) c[e.kind]++;
    return c;
  }, [entries]);

  function selectKind(k: JournalKind) {
    setKind(k);
    setAt(nowLocal());
    setData(emptyData(FORMS[k]));
  }

  function reset() {
    setAt(nowLocal());
    setData(emptyData(FORMS[kind]));
  }

  const fields = FORMS[kind];
  const requiredKeys = fields.filter((f) => f.required).map((f) => f.key);
  const canSubmit = requiredKeys.every((k) => (data[k] ?? '').trim().length > 0);

  function submit() {
    if (!canSubmit) return;
    const next: JournalEntry = {
      id: `j-${Date.now()}`,
      no: `J-${new Date().getFullYear()}-${String(entries.length + 1).padStart(4, '0')}`,
      companyCode: 'CP01',
      kind,
      at: at || nowLocal(),
      staff: '담당자',
      data: { ...data },
    };
    setEntries([next, ...entries]);
    reset();
  }

  return (
    <PageShell
      filterbar={
        <div className="chip-group">
          {JOURNAL_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              className={cn('chip', kind === k && 'active')}
              onClick={() => selectKind(k)}
              title={KIND_HINT[k]}
            >
              {KIND_LABEL[k]}
              {counts[k] > 0 && <span style={{ marginLeft: 4, opacity: 0.7 }}>{counts[k]}</span>}
            </button>
          ))}
        </div>
      }
      footerLeft={
        <>
          <span className="stat-item">전체 <strong>{entries.length}</strong></span>
        </>
      }
      footerRight={
        <>
          <button className="btn" onClick={reset}>
            <ArrowCounterClockwise size={14} weight="bold" /> 초기화
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={!canSubmit}>
            <Plus size={14} weight="bold" /> 등록
          </button>
        </>
      }
    >
      <div style={{ padding: 16, overflow: 'auto', flex: 1 }}>
        <div className="form-stack">
          <div className="form-section">
            <div className="form-section-title" style={{ marginBottom: 8, color: 'var(--text-sub)', fontWeight: 500 }}>
              {KIND_LABEL[kind]}
              <span style={{ marginLeft: 8, color: 'var(--text-weak)', fontWeight: 400 }}>{KIND_HINT[kind]}</span>
            </div>
            <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px 12px' }}>
              <label className="block" style={{ gridColumn: 'span 1' }}>
                <span className="label label-required">일시</span>
                <input
                  className="input w-full mono"
                  type="text"
                  value={at}
                  onChange={(e) => setAt(e.target.value)}
                  placeholder="YYYY-MM-DD HH:mm"
                />
              </label>

              {fields.map((f) => (
                <label key={f.key} className="block" style={{ gridColumn: COL_SPAN[f.colSpan ?? 1] }}>
                  <span className={cn('label', f.required && 'label-required')}>{f.label}</span>
                  {f.type === 'select' ? (
                    <select
                      className="input w-full"
                      value={data[f.key] ?? ''}
                      onChange={(e) => setData({ ...data, [f.key]: e.target.value })}
                    >
                      <option value="">- 선택 -</option>
                      {f.options?.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : f.type === 'textarea' ? (
                    <textarea
                      className="input w-full"
                      rows={3}
                      value={data[f.key] ?? ''}
                      onChange={(e) => setData({ ...data, [f.key]: e.target.value })}
                      placeholder={f.placeholder}
                    />
                  ) : (
                    <input
                      className={cn('input w-full', f.type === 'number' && 'mono')}
                      type={f.type ?? 'text'}
                      value={data[f.key] ?? ''}
                      onChange={(e) => setData({ ...data, [f.key]: e.target.value })}
                      placeholder={f.placeholder}
                    />
                  )}
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
