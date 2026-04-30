'use client';

import { useEffect, useState, useCallback } from 'react';
import { ref, set, onValue, get } from 'firebase/database';
import { getRtdb } from './firebase/client';
import type { JournalEntry } from './sample-journal';

/**
 * 업무일지 영구 저장소 — Firebase RTDB.
 * 다른 store 와 동일 패턴: 모듈 캐시 + onValue 구독 + localStorage 마이그레이션.
 */
const RTDB_PATH = 'journal_entries';
const LOCAL_KEY_LEGACY = 'jpkerp-v4:journal_entries';

let cache: JournalEntry[] = [];
const listeners = new Set<(v: JournalEntry[]) => void>();
let subscribed = false;

function asArray(val: unknown): JournalEntry[] {
  if (!val) return [];
  if (Array.isArray(val)) return val.filter((x): x is JournalEntry => x != null && typeof x === 'object');
  if (typeof val === 'object') return Object.values(val as Record<string, JournalEntry>);
  return [];
}

function stripUndef<T>(v: T): T {
  if (Array.isArray(v)) return v.map(stripUndef) as unknown as T;
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (val !== undefined) out[k] = stripUndef(val);
    }
    return out as T;
  }
  return v;
}

async function migrateLocalToRtdb() {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(LOCAL_KEY_LEGACY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as JournalEntry[];
    if (!Array.isArray(parsed) || parsed.length === 0) return;
    const snap = await get(ref(getRtdb(), RTDB_PATH));
    if (snap.exists() && asArray(snap.val()).length > 0) {
      localStorage.removeItem(LOCAL_KEY_LEGACY);
      return;
    }
    await set(ref(getRtdb(), RTDB_PATH), stripUndef(parsed));
    localStorage.removeItem(LOCAL_KEY_LEGACY);
  } catch (e) {
    console.warn('[journal-store] migrate failed', e);
  }
}

function ensureSubscription() {
  if (subscribed || typeof window === 'undefined') return;
  subscribed = true;
  void migrateLocalToRtdb().finally(() => {
    onValue(ref(getRtdb(), RTDB_PATH), (snap) => {
      const v = asArray(snap.val());
      cache = v;
      listeners.forEach((l) => l(v));
    });
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
    set(ref(getRtdb(), RTDB_PATH), stripUndef(next)).catch((e) => {
      console.error('[journal-store] write failed', e);
      if (typeof window !== 'undefined') alert(`업무일지 저장 실패: ${e?.message ?? e}\n\nFirebase Console → Realtime Database → Rules 에 'journal_entries' 노드 권한이 있는지 확인하세요.`);
    });
  }, []);

  return [entries, setEntries] as const;
}
