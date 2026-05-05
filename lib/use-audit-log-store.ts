'use client';

import { useEffect, useState } from 'react';
import { ref, query, orderByChild, limitToLast, onValue } from 'firebase/database';
import { getRtdb } from './firebase/client';
import type { AuditLogEntry } from './audit-log';

/**
 * audit_logs/ 읽기 전용 구독 — 최신 N개만 (orderByChild 'at' + limitToLast).
 *
 * 누적 무제한이라 전체 fetch 금지. 기본 500개. 더 필요하면 limit 인자 늘림.
 *
 * 클라이언트는 audit_logs 에 직접 push 만 가능 (audit-log.ts).
 * update/delete 는 Rules 에서 차단됨.
 */
const RTDB_PATH = 'audit_logs';

export function useAuditLogStore(limit: number = 500): { entries: AuditLogEntry[]; loading: boolean } {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(ref(getRtdb(), RTDB_PATH), orderByChild('at'), limitToLast(limit));
    const unsub = onValue(q, (snap) => {
      const val = snap.val();
      if (!val || typeof val !== 'object') {
        setEntries([]);
        setLoading(false);
        return;
      }
      const list = Object.values(val as Record<string, AuditLogEntry>).filter(
        (e): e is AuditLogEntry => !!e && typeof e === 'object' && 'at' in e,
      );
      list.sort((a, b) => b.at.localeCompare(a.at));
      setEntries(list);
      setLoading(false);
    }, (err) => {
      console.warn('[audit-log-store] read failed', err);
      setLoading(false);
    });
    return () => unsub();
  }, [limit]);

  return { entries, loading };
}
