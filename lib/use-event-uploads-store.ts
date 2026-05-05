'use client';

import { ref, push } from 'firebase/database';
import { getRtdb } from './firebase/client';
import { stripUndef } from './store-utils';

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
  /** Firebase Storage download URL (신규) */
  url?: string;
  /** @deprecated 구 RTDB base64 (호환용 — 새 entry 는 url 사용) */
  dataUrl?: string;
  /** Firebase Storage 경로 (삭제용) */
  storagePath?: string;
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

export async function pushEventUpload(entry: Omit<EventUploadEntry, 'id'>): Promise<string> {
  const r = ref(getRtdb(), RTDB_PATH);
  const result = await push(r, stripUndef(entry));
  return result.key ?? '';
}
