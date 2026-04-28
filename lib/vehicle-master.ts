/**
 * 차종마스터 — 엔카 시드(`public/data/encar-master-seed.json`, 1,092 row, 21 제조사) cascading helper.
 * 시드는 lazy fetch (첫 사용 시점에만 로드 → 페이지 초기 번들 가벼움).
 */

export type CarSeed = {
  _key: string;
  origin?: string;
  maker: string;
  model: string;
  sub: string;
  car_name?: string;
  source?: string;
  status?: string;
  category?: string;
  production_start?: string;
  production_end?: string;
  archived?: boolean;
  maker_eng?: string;
  maker_code?: string;
};

let masterCache: Record<string, Record<string, CarSeed[]>> | null = null;
let makersCache: string[] = [];
let loadingPromise: Promise<void> | null = null;

async function ensureLoaded(): Promise<void> {
  if (masterCache) return;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    if (typeof window === 'undefined') {
      // SSR — 빈 마스터로 시작 (클라이언트에서 다시 로드)
      masterCache = {};
      makersCache = [];
      return;
    }
    const res = await fetch('/data/encar-master-seed.json');
    const seed: CarSeed[] = await res.json();
    const m: Record<string, Record<string, CarSeed[]>> = {};
    for (const row of seed) {
      if (row.archived || row.status === 'inactive') continue;
      const mk = (row.maker ?? '').trim();
      const md = (row.model ?? '').trim();
      if (!mk || !md) continue;
      if (!m[mk]) m[mk] = {};
      if (!m[mk][md]) m[mk][md] = [];
      m[mk][md].push(row);
    }
    masterCache = m;
    makersCache = Object.keys(m).sort((a, b) => a.localeCompare(b, 'ko'));
  })();

  return loadingPromise;
}

export async function loadVehicleMaster(): Promise<void> {
  return ensureLoaded();
}

export function MAKERS_SYNC(): string[] {
  return makersCache;
}

export function getModels(maker?: string): string[] {
  if (!maker || !masterCache) return [];
  return Object.keys(masterCache[maker] ?? {}).sort((a, b) => a.localeCompare(b, 'ko'));
}

export function getDetailModels(maker?: string, model?: string): string[] {
  if (!maker || !model || !masterCache) return [];
  return (masterCache[maker]?.[model] ?? []).map((s) => s.sub);
}

export function findDetailSeed(maker: string, model: string, detailLabel: string): CarSeed | undefined {
  return masterCache?.[maker]?.[model]?.find((s) => s.sub === detailLabel);
}

/* 호환용 — 이미 import된 곳들 위해 빈 배열 export */
export const MAKERS: string[] = [];
