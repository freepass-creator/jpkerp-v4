'use client';

import { useEffect, useState, useCallback } from 'react';
import { ref, set, onValue } from 'firebase/database';
import { getRtdb } from './firebase/client';
import { stripUndef } from './store-utils';
import type { JournalEntry } from './sample-journal';

/**
 * 업무일지 영구 저장소 — Firebase RTDB. RTDB 노드는 **id 를 키로 하는 객체**:
 *   journal_entries/{entryId}/{...}
 * legacy 배열도 read 시 호환 처리.
 */
const RTDB_PATH = 'journal_entries';

let cache: JournalEntry[] = [];
const listeners = new Set<(v: JournalEntry[]) => void>();
let subscribed = false;

/** RTDB 에서 읽은 raw 값 → JournalEntry[]. keyed object / legacy array 둘 다 지원. */
function fromRtdb(val: unknown): JournalEntry[] {
  if (!val || typeof val !== 'object') return [];
  const arr = Array.isArray(val)
    ? val.filter((x): x is JournalEntry => x != null && typeof x === 'object')
    : Object.values(val as Record<string, JournalEntry>).filter((x): x is JournalEntry => x != null && typeof x === 'object');
  return arr;
}

/** JournalEntry[] → RTDB keyed object (id 키). */
function toRtdb(arr: JournalEntry[]): Record<string, JournalEntry> {
  const out: Record<string, JournalEntry> = {};
  for (const e of arr) {
    if (e.id) out[e.id] = e;
  }
  return out;
}

function ensureSubscription() {
  if (subscribed || typeof window === 'undefined') return;
  subscribed = true;
  onValue(ref(getRtdb(), RTDB_PATH), (snap) => {
    const v = fromRtdb(snap.val());
    cache = v;
    listeners.forEach((l) => l(v));
  });
}

export function useJournalStore() {
  const [entries, setLocal] = useState<JournalEntry[]>(() => cache);

  useEffect(() => {
    ensureSubscription();
    const fn = (v: JournalEntry[]) => setLocal(v);
    listeners.add(fn);
    setLocal(cache);
    return () => { listeners.delete(fn); };
  }, []);

  const setEntries = useCallback((updater: JournalEntry[] | ((prev: JournalEntry[]) => JournalEntry[])) => {
    const prev = cache;
    const next = typeof updater === 'function' ? (updater as (p: JournalEntry[]) => JournalEntry[])(prev) : updater;
    cache = next;
    listeners.forEach((l) => l(next));
    const obj = toRtdb(next);
    set(ref(getRtdb(), RTDB_PATH), stripUndef(obj)).catch((e) => {
      console.error('[journal-store] write failed', e);
      if (typeof window !== 'undefined') alert(`업무일지 저장 실패: ${e?.message ?? e}\n\nFirebase Console → Realtime Database → Rules 에 'journal_entries' 노드 권한이 있는지 확인하세요.`);
    });
  }, []);

  return [entries, setEntries] as const;
}
