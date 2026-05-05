'use client';

/**
 * Append-only 감사 로그 — RTDB `audit_logs/` 노드에 push.
 *
 * Entity inline audit-fields 는 "마지막 변경자/시각" 만 보존.
 * 이 모듈은 모든 mutation 을 시계열로 누적해 "누가 언제 무엇을 했는가" 전체 히스토리.
 *
 * 호출은 fire-and-forget — 실패해도 entity write 는 성공해야 함.
 *
 *   const audit = useAuditStamp();
 *   const stamped = { ...company, ...audit.create() };
 *   setCompanies((prev) => [...prev, stamped]);
 *   audit.log({ action: 'create', entityType: 'company', entityId: stamped.code, label: stamped.name, after: stamped });
 *
 * RTDB 권장 인덱스 (Firebase Console > Database > Rules):
 *   "audit_logs": { ".indexOn": ["at", "entityType", "entityId"] }
 */

import { ref, push } from 'firebase/database';
import { getRtdb } from './firebase/client';
import type { AuditActor } from './audit-fields';

export type AuditAction = 'create' | 'update' | 'delete' | 'restore';
export type AuditEntityType =
  | 'asset'
  | 'contract'
  | 'company'
  | 'insurance'
  | 'journal';

export type AuditLogEntry = {
  at: string;                 // ISO timestamp
  actor: AuditActor;          // 변경 행위자
  action: AuditAction;        // create | update | delete | restore
  entityType: AuditEntityType;
  entityId: string;           // asset.id, contract.id, company.code, insurance.id, journal.id
  /** 사람이 읽기 쉬운 식별자 — 자산은 plate, 계약은 contractNo, 회사는 name 등. */
  label?: string;
  /** update/delete 시 이전 상태 스냅샷 (선택). */
  before?: unknown;
  /** create/update/restore 시 새 상태 스냅샷 (선택). */
  after?: unknown;
};

const RTDB_PATH = 'audit_logs';

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

export type AuditLogInput = Omit<AuditLogEntry, 'at' | 'actor'>;

/**
 * audit_logs/ 에 push. 실패는 console.warn 만 — 호출자에게 전파하지 않음 (mutation 본흐름 차단 X).
 */
export function pushAuditLog(actor: AuditActor, input: AuditLogInput): void {
  if (typeof window === 'undefined') return;
  const entry: AuditLogEntry = {
    at: new Date().toISOString(),
    actor,
    ...input,
  };
  push(ref(getRtdb(), RTDB_PATH), stripUndef(entry)).catch((e) => {
    console.warn('[audit-log] push failed', e);
  });
}
