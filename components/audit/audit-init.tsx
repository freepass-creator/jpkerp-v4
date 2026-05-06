'use client';

import { useEffect } from 'react';
import { primeAuditIp } from '@/lib/audit-meta';

/**
 * 마운트 즉시 IP 캐싱 — `/api/whoami` 1회 호출. layout 에 한 번만 둠.
 * 이후 audit log push 들이 IP 포함하게 됨 (실패 시 IP 빠진 채로 push, 본 흐름 차단 X).
 */
export function AuditInit() {
  useEffect(() => { void primeAuditIp(); }, []);
  return null;
}
