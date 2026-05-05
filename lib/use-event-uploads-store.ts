'use client';

import { ref, push } from 'firebase/database';
import { getRtdb } from './firebase/client';

/**
 * 모바일 업로드 — 출고/반납/상품화/기타 사진·파일 RTDB 적재.
 *
 * append-only push (각 업로드 = 새 push key). 직원 권한 (auth != null) 통과만 필요.
 * 큰 dataUrl 누적이라 추후 retention / Storage 마이그레이션 후속.
 *
 * Rules 권장 (firebase-rules.md 추가 예정):
 *   "event_uploads": {
 *     ".read": "auth != null",
 *     ".indexOn": ["at", "plate", "kind"],
 *     "$id": { ".write": "auth != null && !data.exists()" }
 *   }
 */

export type EventUploadKind = '출고' | '반납' | '상품화' | '기타';

export type EventUploadFile = {
  dataUrl: string;
  name: string;
  size: number;
  mime: string;
  width?: number;
  height?: number;
};

export type EventUploadEntry = {
  id?: string;
  at: string;                    // ISO
  uploader: { uid: string; email?: string; name?: string };
  companyCode?: string;
  plate: string;
  kind: EventUploadKind;
  files: EventUploadFile[];
  note?: string;
};

const RTDB_PATH = 'event_uploads';

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

export async function pushEventUpload(entry: Omit<EventUploadEntry, 'id'>): Promise<string> {
  const r = ref(getRtdb(), RTDB_PATH);
  const result = await push(r, stripUndef(entry));
  return result.key ?? '';
}
