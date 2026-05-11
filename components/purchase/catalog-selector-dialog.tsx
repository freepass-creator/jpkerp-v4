'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle, MagnifyingGlass, CircleNotch, Warning } from '@phosphor-icons/react';
import { Dialog, DialogContent, DialogFooter, DialogClose } from '@/components/ui/dialog';

/**
 * 차종 카탈로그 선택 — 외부 카탈로그 데이터를 직접 fetch 해서 자체 UI 구현.
 *
 * 데이터 source (CORS 허용 정적 파일):
 *   · _index.json   — 모든 catalog 메타 (1회 fetch + 메모리 캐시)
 *   · {id}.json     — 개별 catalog (trims + select_groups) — 선택된 모델만 lazy fetch
 *
 * 선택 흐름: 제조사 → 모델 → 세부모델 → 세부트림 → 패키지 체크 → [매칭 결과 사용]
 * 노출 정책: 가공·필터 최소화. 데이터에 있는 그대로 표시.
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
type SelectGroup = { codes: string[]; price?: number; name?: string };
type TrimMeta = {
  slug?: string;
  price?: { base?: number };
  basic?: string[];
  select?: string[];
  select_groups?: SelectGroup[];     // 트림별 선택 패키지 묶음 (정확)
  name_en?: string;
};

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
  /** 사용자가 추가 선택한 옵션 라벨 (트림 기본옵션은 트림 자체에 함의되므로 미포함). */
  options?: string[];
  optionCodes?: string[];
  /** 카탈로그에 없는 항목 — 사용자 직접입력 (줄바꿈 구분). */
  customOptions?: string[];
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

  // 차량 종류 — 신차(현재생산) / 중고(단종 포함 전체)
  const [scope, setScope] = useState<'new' | 'used'>('new');

  // 선택 상태 — 4단계 (제조사 → 모델 → 세부모델 → 세부트림)
  const [maker, setMaker] = useState<string>('');
  const [modelRoot, setModelRoot] = useState<string>('');     // 모델 — 같은 차종군 (예: 아반떼)
  const [catalogId, setCatalogId] = useState<string>('');     // 세부모델 — 세대/특수 (예: 아반떼 N CN7)
  const [trimName, setTrimName] = useState<string>('');
  // 선택된 패키지의 인덱스 (트림.select_groups 기준). 인덱스 사용해서 같은 trim 안에서 패키지 단위 토글.
  const [pickedPkgIdx, setPickedPkgIdx] = useState<Set<number>>(new Set());
  const [customRaw, setCustomRaw] = useState<string>('');      // 직접입력 — 줄바꿈 구분

  // 선택 catalog 의 detail
  const [detail, setDetail] = useState<CatalogDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // 다이얼로그 열릴 때 _index 한번만 fetch
  useEffect(() => {
    if (!open) return;
    setScope('new');
    setMaker(''); setModelRoot(''); setCatalogId(''); setTrimName('');
    setPickedPkgIdx(new Set()); setCustomRaw('');
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
    if (cached) { setDetail(cached); setTrimName(''); setPickedPkgIdx(new Set()); return; }
    setDetailLoading(true); setDetailError(null);
    fetchDetail(catalogId)
      .then((j) => { setDetail(j); setTrimName(''); setPickedPkgIdx(new Set()); })
      .catch((e) => { setDetailError(String(e?.message ?? e)); setDetail(null); })
      .finally(() => setDetailLoading(false));
  }, [catalogId]);

  // 신차 = 현재 생산중. 중고 = 단종 포함이지만 10년 이내만.
  function isInProduction(v: IndexEntry): boolean {
    const y = (v.year_end ?? '').trim();
    if (y === '' || y === '현재') return true;
    const n = Number(y);
    if (Number.isFinite(n)) return n >= new Date().getFullYear();
    return false;
  }
  function within10y(v: IndexEntry): boolean {
    const cutoff = new Date().getFullYear() - 10;
    // year_start 또는 year_end 중 하나라도 cutoff 이상이면 통과
    const ys = Number((v.year_start ?? '').trim());
    if (Number.isFinite(ys) && ys >= cutoff) return true;
    const ye = (v.year_end ?? '').trim();
    if (ye === '현재') return true;
    const yen = Number(ye);
    if (Number.isFinite(yen) && yen >= cutoff) return true;
    // 연식 정보가 없으면 일단 포함 (데이터 누락 대비)
    return !v.year_start && !v.year_end;
  }

  const inScope = useMemo(() => {
    if (!index) return [] as IndexEntry[];
    const all = Object.values(index);
    if (scope === 'new') return all.filter(isInProduction);
    return all.filter(within10y);
  }, [index, scope]);

  // 제조사 인기순 — 한국 렌터카 운영 기준
  const MAKER_POPULARITY = [
    '현대', '기아', '제네시스', 'KGM', '쉐보레', '르노',
    'BMW', '벤츠', '폭스바겐', '아우디', '미니', '볼보',
    '포르쉐', '테슬라', '랜드로버', '지프', '혼다', '포드', '마세라티',
  ];
  const makers = useMemo(() => {
    const set = new Set<string>();
    for (const v of inScope) set.add(v.maker);
    const all = Array.from(set);
    all.sort((a, b) => {
      const ai = MAKER_POPULARITY.indexOf(a);
      const bi = MAKER_POPULARITY.indexOf(b);
      if (ai >= 0 && bi >= 0) return ai - bi;
      if (ai >= 0) return -1;
      if (bi >= 0) return 1;
      return a.localeCompare(b, 'ko');
    });
    return all;
  }, [inScope]);

  // 모델(model_root) 인기순 — 같은 메이커 내 catalog 갯수 많을수록 인기
  // (세대 분리·페이스리프트 등으로 모델당 catalog 갯수가 인기도와 비례)
  const modelRoots = useMemo(() => {
    if (!maker) return [] as string[];
    const counts = new Map<string, number>();
    for (const v of inScope) {
      if (v.maker !== maker || !v.model_root) continue;
      counts.set(v.model_root, (counts.get(v.model_root) ?? 0) + 1);
    }
    const list = Array.from(counts.entries());
    list.sort((a, b) => {
      if (a[1] !== b[1]) return b[1] - a[1];   // catalog 갯수 desc
      return a[0].localeCompare(b[0], 'ko');
    });
    return list.map(([m]) => m);
  }, [inScope, maker]);

  // 세부모델 — 연식 최신순 (year_start desc)
  const catalogs = useMemo(() => {
    if (!maker || !modelRoot) return [] as IndexEntry[];
    const list = inScope.filter((v) => v.maker === maker && v.model_root === modelRoot);
    list.sort((a, b) => {
      const ay = a.year_start ?? '';
      const by = b.year_start ?? '';
      if (ay !== by) return by.localeCompare(ay);
      return a.title.localeCompare(b.title, 'ko');
    });
    return list;
  }, [inScope, maker, modelRoot]);

  // 세부트림 — 상위→하위 (price.base desc). 가격 없으면 끝으로.
  const trimEntries = useMemo(() => {
    if (!detail?.trims) return [] as Array<[string, TrimMeta]>;
    const list = Object.entries(detail.trims);
    list.sort((a, b) => {
      const pa = a[1]?.price?.base ?? -1;
      const pb = b[1]?.price?.base ?? -1;
      if (pa !== pb) return pb - pa;
      return a[0].localeCompare(b[0], 'ko');
    });
    return list;
  }, [detail]);

  // 선택된 trim 의 basic 옵션 코드 set
  const basicCodes = useMemo(() => {
    if (!detail || !trimName) return new Set<string>();
    const t = detail.trims?.[trimName];
    return new Set<string>(t?.basic ?? []);
  }, [detail, trimName]);

  function togglePkg(idx: number) {
    const next = new Set(pickedPkgIdx);
    if (next.has(idx)) next.delete(idx); else next.add(idx);
    setPickedPkgIdx(next);
  }

  function confirm() {
    if (!index || !catalogId || !detail) {
      alert('카탈로그 선택을 완료해주세요.');
      return;
    }
    const entry = index[catalogId];
    const trim = trimName ? detail.trims?.[trimName] : undefined;
    // 패키지 단위 → 옵션 코드 합집합 + 패키지 이름들을 options 라벨로 사용
    const codeArr = pickedSummary.codes;
    const sel: CatalogSelection = {
      maker: detail.maker,
      model: detail.title || entry?.title,
      modelRoot: detail.model_root || entry?.model_root,
      trim: trimName || undefined,
      year: detail.year_end || entry?.year_end || undefined,
      options: pickedSummary.names.length > 0 ? pickedSummary.names : undefined,
      optionCodes: codeArr.length > 0 ? codeArr : undefined,
      customOptions: customOptions.length > 0 ? customOptions : undefined,
      catalogId,
      basePrice: trim?.price?.base,
    };
    onPick(sel);
  }

  // 트림의 select_groups (패키지 묶음) — 카탈로그 데이터에 있는 그대로 사용.
  const selectGroups: SelectGroup[] = useMemo(() => {
    if (!detail || !trimName) return [];
    return detail.trims?.[trimName]?.select_groups ?? [];
  }, [detail, trimName]);

  // 선택 패키지의 가격 합 + 옵션 코드 합집합
  const pickedSummary = useMemo(() => {
    let priceTotal = 0;
    const codes = new Set<string>();
    const names: string[] = [];
    for (const idx of pickedPkgIdx) {
      const g = selectGroups[idx];
      if (!g) continue;
      priceTotal += g.price ?? 0;
      if (g.name) names.push(g.name);
      for (const c of g.codes) codes.add(c);
    }
    return { priceTotal, codes: Array.from(codes), names };
  }, [pickedPkgIdx, selectGroups]);

  // 직접입력 파싱 — 줄바꿈 구분, 공백·빈 줄 제거
  const customOptions = useMemo(() => {
    return customRaw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  }, [customRaw]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="차종 카탈로그 선택" size="xl">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '75vh' }}>
          {/* 신차 / 중고 토글 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div className="chip-group">
              <button
                type="button"
                className={'chip' + (scope === 'new' ? ' active' : '')}
                onClick={() => { setScope('new'); setMaker(''); setModelRoot(''); setCatalogId(''); }}
              >
                신차 (현재 생산중)
              </button>
              <button
                type="button"
                className={'chip' + (scope === 'used' ? ' active' : '')}
                onClick={() => { setScope('used'); setMaker(''); setModelRoot(''); setCatalogId(''); }}
              >
                중고 (10년 이내)
              </button>
            </div>
          </div>

          {/* 1·2·3·4 단계: 제조사 / 모델 / 세부모델 / 세부트림 */}
          <div className="form-grid">
            <label className="block">
              <span className="label">제조사 *</span>
              <select
                className="input w-full"
                value={maker}
                onChange={(e) => { setMaker(e.target.value); setModelRoot(''); setCatalogId(''); }}
                disabled={!index}
              >
                <option value="">{indexLoading ? '로딩 중…' : '선택'}</option>
                {makers.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              {indexError && <span className="text-red text-xs">에러: {indexError}</span>}
            </label>
            <label className="block">
              <span className="label">모델 *</span>
              <select
                className="input w-full"
                value={modelRoot}
                onChange={(e) => { setModelRoot(e.target.value); setCatalogId(''); }}
                disabled={!maker}
              >
                <option value="">선택</option>
                {modelRoots.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="label">세부모델 *</span>
              <select
                className="input w-full"
                value={catalogId}
                onChange={(e) => setCatalogId(e.target.value)}
                disabled={!modelRoot}
              >
                <option value="">선택</option>
                {catalogs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}{c.year_start ? ` (${c.year_start}~${c.year_end ?? '현재'})` : ''}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* 세부트림 — 카드 리스트로 펼침 (상위→하위 순). 클릭 = 선택 */}
          {detail && (
            <div>
              <div className="label" style={{ marginBottom: 4 }}>
                세부트림 * <span className="text-weak text-xs">(상위→하위 순, 클릭하여 선택)</span>
                {detailError && <span className="text-red text-xs" style={{ marginLeft: 6 }}>에러: {detailError}</span>}
              </div>
              {detailLoading && <div className="text-weak text-xs">로딩 중…</div>}
              {!detailLoading && trimEntries.length === 0 && (
                <div className="text-weak text-xs">트림 데이터 없음</div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 220, overflow: 'auto' }}>
                {trimEntries.map(([name, t]) => {
                  const selected = trimName === name;
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => { setTrimName(name); setPickedPkgIdx(new Set()); }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '6px 10px',
                        background: selected ? 'var(--brand-soft, #eef2fb)' : 'var(--bg-card)',
                        border: `1px solid ${selected ? 'var(--brand)' : 'var(--border)'}`,
                        borderRadius: 4,
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontSize: 12,
                      }}
                    >
                      <input type="radio" checked={selected} readOnly />
                      <span style={{ flex: 1 }}>{name}</span>
                      {t?.price?.base ? (
                        <span className={selected ? '' : 'text-weak'} style={{ fontVariantNumeric: 'tabular-nums' }}>
                          ₩{t.price.base.toLocaleString('ko-KR')}
                        </span>
                      ) : (
                        <span className="dim">-</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 옵션 영역 — 트림.select_groups 의 패키지를 카드로 노출 + 직접입력 */}
          {detail && trimName && (
            <div style={{ flex: 1, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 4, padding: 10 }}>
              <div className="text-xs" style={{ marginBottom: 6 }}>
                <strong>선택 패키지</strong>
                {selectGroups.length > 0 ? (
                  <span className="text-weak" style={{ marginLeft: 6 }}>· 추가할 패키지만 체크 (가격은 옵션가)</span>
                ) : (
                  <span className="text-weak" style={{ marginLeft: 6 }}>· 트림에 패키지 데이터 없음 — 직접입력으로 추가하세요</span>
                )}
              </div>

              {selectGroups.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
                  {selectGroups.map((g, idx) => {
                    const checked = pickedPkgIdx.has(idx);
                    const optNames = g.codes
                      .map((c) => detail.options?.[c]?.name)
                      .filter((n): n is string => !!n);
                    return (
                      <label
                        key={idx}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 8,
                          padding: 8,
                          background: checked ? 'var(--brand-soft, #eef2fb)' : 'var(--bg-card)',
                          border: `1px solid ${checked ? 'var(--brand)' : 'var(--border)'}`,
                          borderRadius: 4,
                          cursor: 'pointer',
                          fontSize: 12,
                        }}
                      >
                        <input type="checkbox" checked={checked} onChange={() => togglePkg(idx)} style={{ marginTop: 2 }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <strong>{g.name || `패키지 ${idx + 1}`}</strong>
                            {typeof g.price === 'number' && g.price > 0 && (
                              <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                                +₩{g.price.toLocaleString('ko-KR')}
                              </span>
                            )}
                          </div>
                          {optNames.length > 0 && (
                            <div className="text-weak" style={{ fontSize: 11, marginTop: 2 }}>
                              포함: {optNames.join(' / ')}
                            </div>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}

              {/* 직접입력 — select_groups 유무 관계없이 항상 노출 */}
              <div style={{ paddingTop: 10, borderTop: '1px dashed var(--border)' }}>
                <div className="text-weak text-xs" style={{ marginBottom: 4, fontWeight: 600 }}>
                  직접입력 <span className="dim">(카탈로그에 없는 항목 — 줄당 1개)</span>
                </div>
                <textarea
                  className="input w-full"
                  rows={3}
                  style={{ fontSize: 12 }}
                  value={customRaw}
                  onChange={(e) => setCustomRaw(e.target.value)}
                  placeholder={'예) 하이패스 단말기\n예) 차량용 청소기\n예) 후방카메라 외부장착'}
                />
              </div>
            </div>
          )}

          {/* 요약 — 기본가 + 패키지 합계 */}
          {catalogId && detail && (() => {
            const basePrice = trimName ? detail.trims?.[trimName]?.price?.base ?? 0 : 0;
            const grandTotal = basePrice + pickedSummary.priceTotal;
            const fmt = (n: number) => `₩${n.toLocaleString('ko-KR')}`;
            return (
              <div className="text-xs" style={{
                padding: 10,
                background: 'var(--success-green-bg, #e7f5ea)',
                border: '1px solid var(--success-green, #2a9d3a)',
                borderRadius: 4,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <CheckCircle size={14} weight="fill" style={{ color: 'var(--success-green, #2a9d3a)' }} />
                  <strong>{detail.maker} · {detail.title}</strong>
                  {trimName && <> · {trimName}</>}
                </div>
                {trimName && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, fontVariantNumeric: 'tabular-nums' }}>
                    <div className="text-weak">
                      기본가 {basePrice > 0 ? fmt(basePrice) : '-'}
                      {pickedSummary.priceTotal > 0 && <> + 패키지 {pickedPkgIdx.size}개 {fmt(pickedSummary.priceTotal)}</>}
                      {customOptions.length > 0 && <> · 직접입력 {customOptions.length}개</>}
                    </div>
                    {grandTotal > 0 && (
                      <div>
                        <span className="dim" style={{ marginRight: 6 }}>합계</span>
                        <strong style={{ fontSize: 14 }}>{fmt(grandTotal)}</strong>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {!catalogId && index && !indexLoading && (
            <div className="text-xs text-weak" style={{
              padding: 8, background: 'var(--bg-stripe)', border: '1px dashed var(--border)', borderRadius: 4,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <MagnifyingGlass size={14} weight="bold" /> 제조사 → 모델 → 세부모델 → 세부트림 순으로 선택. (총 {Object.keys(index).length}개 catalog)
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
