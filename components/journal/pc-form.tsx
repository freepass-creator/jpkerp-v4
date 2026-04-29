'use client';

import { useMemo, type Ref } from 'react';
import { ItemTable, type ItemRow } from './item-table';
import { EvidenceUploader, type EvidenceUploaderHandle } from './evidence-uploader';
import { cn } from '@/lib/cn';

/**
 * 차량수선(PC) 카테고리 — subkind 클릭하면 그 종류의 입력칸이 펼쳐짐.
 *  - 정비: 소모품교체 + 기능수리 ItemTable + 다음정비예정 + 합계
 *  - 사고수리: 사고부위 chips + 골격/대차 + 수리예상/보험금/자기부담
 *  - 세차: 세차유형 chips + 금액
 *  - 상품화: (간소화) 부속품 + 외판 + 소모품 ItemTable + 외관/실내/타이어
 *  - 연료보충: 금액 + 메모
 *  - 키 교체: 금액 + 메모
 *
 * data: 메인 데이터(상위 컴포넌트의 data state). Record<string, string> 으로 관리.
 *       구조 데이터(ItemTable rows 등)는 JSON.stringify 해서 단일 키에 저장.
 */

const PC_SUBKINDS = ['정비', '상품화', '사고수리', '세차', '연료보충', '차키제작'] as const;
type PcSubkind = typeof PC_SUBKINDS[number];

const PARTS_SUGGESTIONS = ['엔진오일', '미션오일', '브레이크오일', '냉각수', '에어필터', '에어컨필터', '와이퍼', '배터리', '타이어'];
const FIX_SUGGESTIONS = ['엔진 점검', '미션 점검', '브레이크 점검', '전기 계통', '냉각 계통', '연료 계통'];
const ACCIDENT_AREAS = ['앞범퍼', '뒷범퍼', '앞휀더', '뒷휀더', '도어', '본넷', '트렁크', '사이드미러', '유리', '휠', '기타'];
const WASH_TYPES = ['외부세차', '실내크리닝', '풀세차', '광택'];

function parseRows(s: string | undefined): ItemRow[] {
  if (!s) return [];
  try {
    const parsed = JSON.parse(s);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

interface Props {
  data: Record<string, string>;
  setData: (next: Record<string, string>) => void;
  /** 증빙 업로더 ref — 정비/사고수리/상품화 일 때 활성. 등록 시 commitUpload 호출용 */
  uploaderRef?: Ref<EvidenceUploaderHandle>;
}

const SUBKINDS_WITH_EVIDENCE: PcSubkind[] = ['정비', '사고수리', '상품화'];

export function PcForm({ data, setData, uploaderRef }: Props) {
  const sub = (data.subkind ?? '') as PcSubkind | '';

  function set(key: string, value: string) {
    setData({ ...data, [key]: value });
  }
  function setRows(key: string, rows: ItemRow[]) {
    setData({ ...data, [key]: JSON.stringify(rows) });
  }
  function selectSub(s: PcSubkind) {
    setData({ ...data, subkind: s });
  }

  const partsRows = useMemo(() => parseRows(data.parts_items), [data.parts_items]);
  const fixRows = useMemo(() => parseRows(data.fix_items), [data.fix_items]);
  const prodAcc = useMemo(() => parseRows(data.prod_accessory), [data.prod_accessory]);
  const prodBody = useMemo(() => parseRows(data.prod_body), [data.prod_body]);
  const prodParts = useMemo(() => parseRows(data.prod_parts), [data.prod_parts]);

  const maintTotal = partsRows.reduce((s, r) => s + r.amount, 0) + fixRows.reduce((s, r) => s + r.amount, 0);
  const productTotal = prodAcc.reduce((s, r) => s + r.amount, 0) + prodBody.reduce((s, r) => s + r.amount, 0) + prodParts.reduce((s, r) => s + r.amount, 0);

  return (
    <>
      {/* subkind buttons — 클릭 시 아래 섹션 변경 */}
      <div className="block" style={{ gridColumn: 'span 4' }}>
        <span className="label label-required">종류</span>
        <div className="chip-group" style={{ flexWrap: 'wrap' }}>
          {PC_SUBKINDS.map((s) => (
            <button
              key={s}
              type="button"
              className={cn('chip', sub === s && 'active')}
              onClick={() => selectSub(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* 정비 — ItemTable 세로 stack + 다음정비예정 + 합계 */}
      {sub === '정비' && (
        <div className="block" style={{ gridColumn: 'span 4', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <ItemTable
            title="소모품 교체"
            rows={partsRows}
            onChange={(rows) => setRows('parts_items', rows)}
            suggestions={PARTS_SUGGESTIONS}
            listId="dl-pc-parts"
          />
          <ItemTable
            title="기능 수리"
            rows={fixRows}
            onChange={(rows) => setRows('fix_items', rows)}
            suggestions={FIX_SUGGESTIONS}
            listId="dl-pc-fix"
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'end' }}>
            <label className="block">
              <span className="label">다음 정비 예정</span>
              <input
                className="input w-full mono"
                type="date"
                value={data.next_maint_date ?? ''}
                onChange={(e) => set('next_maint_date', e.target.value)}
              />
            </label>
            <div className="block">
              <span className="label">총 정비금액</span>
              <div className="input w-full mono" style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                background: 'var(--bg-header)',
                fontWeight: 600,
                color: 'var(--text)',
                cursor: 'default',
              }}>
                {maintTotal.toLocaleString('ko-KR')}원
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 사고수리 — 사고부위/골격/대차 + 금액 */}
      {sub === '사고수리' && (
        <>
          <div className="block" style={{ gridColumn: 'span 4' }}>
            <span className="label">사고부위</span>
            <div className="chip-group" style={{ flexWrap: 'wrap' }}>
              {ACCIDENT_AREAS.map((a) => (
                <button
                  key={a}
                  type="button"
                  className={cn('chip', data.damage_area === a && 'active')}
                  onClick={() => set('damage_area', a)}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>
          <div className="block" style={{ gridColumn: 'span 2' }}>
            <span className="label">골격 손상</span>
            <div className="chip-group">
              {['없음', '경미', '있음'].map((v) => (
                <button key={v} type="button" className={cn('chip', data.damage_frame === v && 'active')} onClick={() => set('damage_frame', v)}>{v}</button>
              ))}
            </div>
          </div>
          <div className="block" style={{ gridColumn: 'span 2' }}>
            <span className="label">대차</span>
            <div className="chip-group">
              {['미정', '대차제공', '대차없음'].map((v) => (
                <button key={v} type="button" className={cn('chip', data.rental_car === v && 'active')} onClick={() => set('rental_car', v)}>{v}</button>
              ))}
            </div>
          </div>
          <label className="block">
            <span className="label">수리예상금액</span>
            <MoneyInput value={data.repair_estimate ?? ''} onChange={(v) => set('repair_estimate', v)} />
          </label>
          <label className="block">
            <span className="label">보험금</span>
            <MoneyInput value={data.insurance_amount ?? ''} onChange={(v) => set('insurance_amount', v)} />
          </label>
          <label className="block">
            <span className="label">자기부담금</span>
            <MoneyInput value={data.self_pay ?? ''} onChange={(v) => set('self_pay', v)} />
          </label>
          <label className="block">
            <span className="label">예상 완료일</span>
            <input className="input w-full mono" type="date" value={data.expected_delivery ?? ''} onChange={(e) => set('expected_delivery', e.target.value)} />
          </label>
        </>
      )}

      {/* 세차 — 세차유형 chips + 금액 */}
      {sub === '세차' && (
        <>
          <div className="block" style={{ gridColumn: 'span 4' }}>
            <span className="label">세차 유형</span>
            <div className="chip-group" style={{ flexWrap: 'wrap' }}>
              {WASH_TYPES.map((w) => (
                <button key={w} type="button" className={cn('chip', data.wash_type === w && 'active')} onClick={() => set('wash_type', w)}>{w}</button>
              ))}
            </div>
          </div>
          <label className="block" style={{ gridColumn: 'span 2' }}>
            <span className="label">금액</span>
            <MoneyInput value={data.amount ?? ''} onChange={(v) => set('amount', v)} />
          </label>
        </>
      )}

      {/* 상품화 — ItemTable 세로 stack + 외관/실내/타이어 */}
      {sub === '상품화' && (
        <>
          <div className="block" style={{ gridColumn: 'span 4', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <ItemTable
              title="부속품"
              rows={prodAcc}
              onChange={(rows) => setRows('prod_accessory', rows)}
              listId="dl-prod-acc"
            />
            <ItemTable
              title="외판수리"
              rows={prodBody}
              onChange={(rows) => setRows('prod_body', rows)}
              listId="dl-prod-body"
            />
            <ItemTable
              title="소모품"
              rows={prodParts}
              onChange={(rows) => setRows('prod_parts', rows)}
              suggestions={PARTS_SUGGESTIONS}
              listId="dl-prod-parts"
            />
          </div>
          <div className="block" style={{ gridColumn: 'span 4', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <div>
              <span className="label">외관</span>
              <div className="chip-group">
                {['양호', '경미흠집', '손상있음'].map((v) => (
                  <button key={v} type="button" className={cn('chip', data.exterior === v && 'active')} onClick={() => set('exterior', v)}>{v}</button>
                ))}
              </div>
            </div>
            <div>
              <span className="label">실내</span>
              <div className="chip-group">
                {['양호', '보통', '청소필요'].map((v) => (
                  <button key={v} type="button" className={cn('chip', data.interior === v && 'active')} onClick={() => set('interior', v)}>{v}</button>
                ))}
              </div>
            </div>
            <div>
              <span className="label">타이어</span>
              <div className="chip-group">
                {['양호', '교체필요', '편마모'].map((v) => (
                  <button key={v} type="button" className={cn('chip', data.tire_status === v && 'active')} onClick={() => set('tire_status', v)}>{v}</button>
                ))}
              </div>
            </div>
          </div>
          <div className="block" style={{ gridColumn: 'span 4' }}>
            <span className="label">총 상품화 비용</span>
            <div className="input w-full mono" style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              background: 'var(--bg-header)',
              fontWeight: 600,
              color: 'var(--text)',
              cursor: 'default',
            }}>
              {productTotal.toLocaleString('ko-KR')}원
            </div>
          </div>
        </>
      )}

      {/* 연료보충 / 차키제작 — 단순 금액 */}
      {(sub === '연료보충' || sub === '차키제작') && (
        <label className="block" style={{ gridColumn: 'span 2' }}>
          <span className="label">금액</span>
          <MoneyInput value={data.amount ?? ''} onChange={(v) => set('amount', v)} />
        </label>
      )}

      {/* 증빙 업로드 — 정비/사고수리/상품화 */}
      {sub && SUBKINDS_WITH_EVIDENCE.includes(sub) && uploaderRef && (
        <div className="block" style={{ gridColumn: 'span 4' }}>
          <EvidenceUploader ref={uploaderRef} label="증빙 (영수증·견적서·작업 사진)" />
        </div>
      )}
    </>
  );
}

/** 금액 입력 — 천원단위 콤마 자동, 숫자만 저장 (string) */
function MoneyInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const display = value ? Number(value).toLocaleString('ko-KR') : '';
  return (
    <input
      className="input w-full mono"
      type="text"
      inputMode="numeric"
      value={display}
      onChange={(e) => {
        const n = e.target.value.replace(/[^\d-]/g, '');
        onChange(n);
      }}
      placeholder="0"
      style={{ textAlign: 'right' }}
    />
  );
}
