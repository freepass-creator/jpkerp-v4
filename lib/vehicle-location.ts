/**
 * 차량 현재 위치 도출 — 업무일지 IOC(입출고) entries 기반.
 *
 * 운영 흐름:
 *   업무작성 → 입출고 카테고리 → subkind(출고/반납/회수/이동) + from/to 입력
 *   가장 최근 ioc entry 의 'to' 가 차량 현재 위치.
 *
 * 등록증상 사용본거지(ownerLocation) 와 다름 — 운영상 실제 위치 추적용.
 */
import type { JournalEntry } from './sample-journal';

/**
 * plate 차량의 현재 위치.
 *  - 가장 최근 ioc entry 의 data.to (또는 data.toLocation)
 *  - ioc entry 없으면 빈 문자열
 *  - 호출부에서 fallback 으로 ownerLocation 등 사용
 */
export function getCurrentLocation(plate: string, entries: readonly JournalEntry[]): string {
  if (!plate) return '';
  // 최신순 정렬
  let latestAt = '';
  let latestLocation = '';
  for (const e of entries) {
    if (e.kind !== 'ioc') continue;
    if ((e.data?.plate ?? '') !== plate) continue;
    const to = e.data?.to ?? e.data?.toLocation ?? e.data?.dest ?? '';
    if (!to) continue;
    if (e.at > latestAt) {
      latestAt = e.at;
      latestLocation = to;
    }
  }
  return latestLocation;
}

/** 모든 차량 현재 위치 Map — 페이지에서 plate 별 lookup 시 useMemo 로 호출. */
export function buildLocationMap(entries: readonly JournalEntry[]): Map<string, string> {
  const map = new Map<string, { at: string; to: string }>();
  for (const e of entries) {
    if (e.kind !== 'ioc') continue;
    const plate = e.data?.plate ?? '';
    const to = e.data?.to ?? e.data?.toLocation ?? e.data?.dest ?? '';
    if (!plate || !to) continue;
    const prev = map.get(plate);
    if (!prev || e.at > prev.at) map.set(plate, { at: e.at, to });
  }
  const out = new Map<string, string>();
  for (const [k, v] of map) out.set(k, v.to);
  return out;
}
