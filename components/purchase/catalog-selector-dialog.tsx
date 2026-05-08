'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle, MagnifyingGlass, ArrowSquareOut, CircleNotch, Warning } from '@phosphor-icons/react';
import { Dialog, DialogContent, DialogFooter, DialogClose } from '@/components/ui/dialog';

/**
 * 차종 카탈로그 선택 — freepasserp3 의 catalog 데이터를 직접 fetch 해서 자체 UI 구현.
 *
 * 데이터 source: https://freepasserp3.vercel.app/data/car-master/
 *   · _index.json   — 모든 catalog 메타 (한 번만 fetch + 메모리 캐시)
 *   · {id}.json     — 개별 catalog (trims + options) — 선택된 모델만 lazy fetch
 *
 * 선택 흐름: 메이커 → 모델 → 세부트림 → 옵션 체크 → [매칭 결과 사용]
 *   결과 = { maker, model, trim, year?, options[], catalogId, basePrice? }
 *
 * CORS: freepasserp3.vercel.app 의 정적 파일은 access-control-allow-origin: * 로 응답 (확인됨).
 * 데이터 갱신: freepasserp3 에서 git push → Vercel 자동 배포 → v4 fetch 시 자동 반영.
 */
const DATA_BASE = 'https://freepasserp3.vercel.app/data/car-master';

type IndexEntry = {
  id: string;
  title: string;
  maker: string;
  model_root: string;
  year_start?: string;
  year_end?: string;
  trims?: string[];
};
type CatalogIndex = Record<string, IndexEntry>;

type OptionMeta = { name: string; category: string; is_package?: boolean };
type TrimMeta = { slug?: string; price?: { base?: number }; basic?: string[]; name_en?: string };

type CatalogDetail = {
  catalog_id: string;
  model_root: string;
  title: string;
  maker: string;
  options?: Record<string, OptionMeta>;
  trims?: Record<string, TrimMeta>;
  categories?: Record<string, string[]>;
  year_start?: string;
  year_end?: string;
};

export type CatalogSelection = {
  maker: string;
  model: string;
  modelRoot?: string;
  trim?: string;
  year?: string;
  options?: string[];           // 선택된 옵션의 한글 라벨
  optionCodes?: string[];       // 옵션 코드 (CN06xxx 등)
  catalogId: string;
  basePrice?: number;
};

// ─── 모듈 캐시: 같은 다이얼로그 여러번 열어도 재fetch 안 함 ───
let indexCache: CatalogIndex | null = null;
let indexPromise: Promise<CatalogIndex> | null = null;
const detailCache = new Map<string, CatalogDetail>();

function fetchIndex(): Promise<CatalogIndex> {
  if (indexCache) return Promise.resolve(indexCache);
  if (indexPromise) return indexPromise;
  indexPromise = fetch(`${DATA_BASE}/_index.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`_index.json HTTP ${r.status}`);
      return r.json() as Promise<CatalogIndex>;
    })
    .then((j) => { indexCache = j; return j; })
    .finally(() => { indexPromise = null; });
  return indexPromise;
}

async function fetchDetail(id: string): Promise<CatalogDetail> {
  const cached = detailCache.get(id);
  if (cached) return cached;
  const r = await fetch(`${DATA_BASE}/${encodeURIComponent(id)}.json`);
  if (!r.ok) throw new Error(`${id}.json HTTP ${r.status}`);
  const j = (await r.json()) as CatalogDetail;
  detailCache.set(id, j);
  return j;
}

export function CatalogSelectorDialog({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onPick: (sel: CatalogSelection) => void;
}) {
  // index 로드 상태
  const [index, setIndex] = useState<CatalogIndex | null>(indexCache);
  const [indexLoading, setIndexLoading] = useState(false);
  const [indexError, setIndexError] = useState<string | null>(null);

  // 선택 상태
  const [maker, setMaker] = useState<string>('');
  const [catalogId, setCatalogId] = useState<string>('');
  const [trimName, setTrimName] = useState<string>('');
  const [extraCodes, setExtraCodes] = useState<Set<string>>(new Set());

  // 선택 catalog 의 detail
  const [detail, setDetail] = useState<CatalogDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // 다이얼로그 열릴 때 _index 한번만 fetch
  useEffect(() => {
    if (!open) return;
    setMaker(''); setCatalogId(''); setTrimName(''); setExtraCodes(new Set());
    setDetail(null); setDetailError(null);
    if (indexCache) { setIndex(indexCache); return; }
    setIndexLoading(true); setIndexError(null);
    fetchIndex()
      .then((j) => setIndex(j))
      .catch((e) => setIndexError(String(e?.message ?? e)))
      .finally(() => setIndexLoading(false));
  }, [open]);

  // catalogId 바뀌면 detail fetch
  useEffect(() => {
    if (!catalogId) { setDetail(null); return; }
    const cached = detailCache.get(catalogId);
    if (cached) { setDetail(cached); setTrimName(''); setExtraCodes(new Set()); return; }
    setDetailLoading(true); setDetailError(null);
    fetchDetail(catalogId)
      .then((j) => { setDetail(j); setTrimName(''); setExtraCodes(new Set()); })
      .catch((e) => { setDetailError(String(e?.message ?? e)); setDetail(null); })
      .finally(() => setDetailLoading(false));
  }, [catalogId]);

  // 메이커 목록 (한국 → 수입 순으로 정렬)
  const makers = useMemo(() => {
    if (!index) return [] as string[];
    const set = new Set<string>();
    for (const v of Object.values(index)) set.add(v.maker);
    const all = Array.from(set);
    const KR_ORDER = ['현대', '기아', '제네시스', 'KGM', '쉐보레', '르노'];
    all.sort((a, b) => {
      const ai = KR_ORDER.indexOf(a);
      const bi = KR_ORDER.indexOf(b);
      if (ai >= 0 && bi >= 0) return ai - bi;
      if (ai >= 0) return -1;
      if (bi >= 0) return 1;
      return a.localeCompare(b, 'ko');
    });
    return all;
  }, [index]);

  // 선택 메이커의 catalog 목록
  const catalogs = useMemo(() => {
    if (!index || !maker) return [] as IndexEntry[];
    const list = Object.values(index).filter((v) => v.maker === maker);
    list.sort((a, b) => a.title.localeCompare(b.title, 'ko'));
    return list;
  }, [index, maker]);

  // 선택된 trim 의 basic 옵션 코드 set
  const basicCodes = useMemo(() => {
    if (!detail || !trimName) return new Set<string>();
    const t = detail.trims?.[trimName];
    return new Set<string>(t?.basic ?? []);
  }, [detail, trimName]);

  // 선택된 옵션 코드 (basic + extra)
  const selectedCodes = useMemo(() => {
    const s = new Set(basicCodes);
    for (const c of extraCodes) s.add(c);
    return s;
  }, [basicCodes, extraCodes]);

  function toggleExtra(code: string) {
    const next = new Set(extraCodes);
    if (basicCodes.has(code)) {
      // basic 은 끄지 못함 (필수 표시)
      return;
    }
    if (next.has(code)) next.delete(code); else next.add(code);
    setExtraCodes(next);
  }

  function confirm() {
    if (!index || !catalogId || !detail) {
      alert('카탈로그 선택을 완료해주세요.');
      return;
    }
    const entry = index[catalogId];
    const trim = trimName ? detail.trims?.[trimName] : undefined;
    const codeArr = Array.from(selectedCodes);
    const labels: string[] = [];
    for (const c of codeArr) {
      const o = detail.options?.[c];
      if (o) labels.push(o.name);
    }
    const sel: CatalogSelection = {
      maker: detail.maker,
      model: detail.title || entry?.title,
      modelRoot: detail.model_root || entry?.model_root,
      trim: trimName || undefined,
      year: detail.year_end || entry?.year_end || undefined,
      options: labels,
      optionCodes: codeArr,
      catalogId,
      basePrice: trim?.price?.base,
    };
    onPick(sel);
  }

  // 옵션 카테고리별 그룹 (선택된 catalog 의 categories 키 순서 유지)
  const optionGroups = useMemo(() => {
    if (!detail) return [] as Array<{ category: string; codes: string[] }>;
    const groups: Array<{ category: string; codes: string[] }> = [];
    if (detail.categories) {
      for (const [cat, codes] of Object.entries(detail.categories)) {
        groups.push({ category: cat, codes });
      }
    } else if (detail.options) {
      // categories 없으면 options 의 category 필드로 그룹화
      const byCat = new Map<string, string[]>();
      for (const [code, meta] of Object.entries(detail.options)) {
        const list = byCat.get(meta.category) ?? [];
        list.push(code);
        byCat.set(meta.category, list);
      }
      for (const [cat, codes] of byCat.entries()) groups.push({ category: cat, codes });
    }
    return groups;
  }, [detail]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="차종 카탈로그 선택" size="xl">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '75vh' }}>
          <div className="text-weak text-xs" style={{ background: 'var(--bg-card)', padding: 8, borderRadius: 4 }}>
            freepasserp3 차종 매트릭스 데이터 직접 fetch (CORS 허용). 메이커 → 모델 → 세부트림 → 옵션 순으로 선택.
            <a
              href={`${DATA_BASE}/_index.json`}
              target="_blank"
              rel="noreferrer"
              className="dim"
              style={{ marginLeft: 8 }}
              title="원본 데이터"
            >
              <ArrowSquareOut size={11} weight="bold" /> 원본
            </a>
          </div>

          {/* 1·2·3 단계: 메이커 / 모델 / 트림 */}
          <div className="form-grid">
            <label className="block">
              <span className="label">메이커 *</span>
              <select className="input w-full" value={maker} onChange={(e) => { setMaker(e.target.value); setCatalogId(''); }} disabled={!index}>
                <option value="">{indexLoading ? '로딩 중…' : '선택'}</option>
                {makers.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              {indexError && <span className="text-red text-xs">에러: {indexError}</span>}
            </label>
            <label className="block">
              <span className="label">모델 *</span>
              <select className="input w-full" value={catalogId} onChange={(e) => setCatalogId(e.target.value)} disabled={!maker}>
                <option value="">선택</option>
                {catalogs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title} {c.year_start ? `(${c.year_start}~${c.year_end ?? '현재'})` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="block col-span-2">
              <span className="label">세부트림</span>
              <select className="input w-full" value={trimName} onChange={(e) => { setTrimName(e.target.value); setExtraCodes(new Set()); }} disabled={!detail}>
                <option value="">{detailLoading ? '로딩 중…' : '선택 (옵션)'}</option>
                {detail?.trims && Object.entries(detail.trims).map(([name, t]) => (
                  <option key={name} value={name}>
                    {name}{t?.price?.base ? ` — ₩${t.price.base.toLocaleString('ko-KR')}` : ''}
                  </option>
                ))}
              </select>
              {detailError && <span className="text-red text-xs">에러: {detailError}</span>}
            </label>
          </div>

          {/* 4 단계: 옵션 체크박스 — 카테고리별 그룹 */}
          {detail && trimName && (
            <div style={{ flex: 1, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 4, padding: 10 }}>
              <div className="text-xs" style={{ marginBottom: 6 }}>
                <strong>옵션 — 트림 기본은 ☑ 자동 체크 (해제 불가) / 추가 항목은 자유 체크</strong>
              </div>
              {optionGroups.length === 0 ? (
                <div className="text-weak text-xs">옵션 데이터 없음</div>
              ) : (
                optionGroups.map(({ category, codes }) => (
                  <div key={category} style={{ marginBottom: 8 }}>
                    <div className="text-weak text-xs" style={{ marginBottom: 4, fontWeight: 600 }}>
                      {category} <span className="dim">({codes.length})</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 4 }}>
                      {codes.map((code) => {
                        const meta = detail.options?.[code];
                        if (!meta) return null;
                        const isBasic = basicCodes.has(code);
                        const isChecked = selectedCodes.has(code);
                        return (
                          <label
                            key={code}
                            className="text-xs"
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                              padding: 4,
                              background: isBasic ? 'var(--success-green-bg, #e7f5ea)' : isChecked ? 'var(--brand-soft, #eef2fb)' : 'transparent',
                              borderRadius: 3,
                              cursor: isBasic ? 'default' : 'pointer',
                              opacity: isBasic ? 0.85 : 1,
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              disabled={isBasic}
                              onChange={() => toggleExtra(code)}
                            />
                            <span>{meta.name}</span>
                            {isBasic && <span className="dim" style={{ fontSize: 10 }}>(기본)</span>}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* 요약 */}
          {catalogId && detail && (
            <div className="text-xs" style={{
              padding: 8,
              background: 'var(--success-green-bg, #e7f5ea)',
              border: '1px solid var(--success-green, #2a9d3a)',
              borderRadius: 4,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}>
              <CheckCircle size={14} weight="fill" style={{ color: 'var(--success-green, #2a9d3a)' }} />
              <span>
                <strong>{detail.maker} · {detail.title}</strong>
                {trimName && <> · {trimName}</>}
                {selectedCodes.size > 0 && <> · 옵션 {selectedCodes.size}개 (기본 {basicCodes.size} + 추가 {extraCodes.size})</>}
              </span>
            </div>
          )}

          {!catalogId && index && !indexLoading && (
            <div className="text-xs text-weak" style={{
              padding: 8, background: 'var(--bg-stripe)', border: '1px dashed var(--border)', borderRadius: 4,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <MagnifyingGlass size={14} weight="bold" /> 메이커 → 모델 순으로 선택해주세요. (총 {Object.keys(index).length}개 catalog)
            </div>
          )}

          {indexLoading && !index && (
            <div className="text-xs text-weak" style={{ padding: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <CircleNotch size={14} weight="bold" className="spin" />
              카탈로그 인덱스 로딩 중…
            </div>
          )}

          {indexError && (
            <div className="text-xs text-red" style={{ padding: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Warning size={14} weight="fill" />
              인덱스 로드 실패: {indexError}
            </div>
          )}
        </div>

        <DialogFooter>
          <DialogClose asChild><button className="btn">취소</button></DialogClose>
          <button className="btn btn-primary" onClick={confirm} disabled={!detail}>
            매칭 결과 사용
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
