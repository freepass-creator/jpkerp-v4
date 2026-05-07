import 'server-only';

/**
 * Aligo (apis.aligo.in/fax_send/) 팩스 API 클라이언트 — 서버 전용.
 *
 * SMS 와 동일 계정 사용. 발신 팩스번호는 Aligo 콘솔에서 사전등록 필요.
 *
 *   ALIGO_KEY        — API 키 (SMS 와 동일)
 *   ALIGO_USER_ID    — 회원 ID (SMS 와 동일)
 *   ALIGO_FAX_SENDER — 발신 팩스번호 (env fallback. UI 에서 회사별로 override 가능)
 *   ALIGO_TESTMODE   — 'Y' 면 실제 발송 X
 *
 * 참조: https://smartfax.aligo.in/admin/api/spec/
 */

const API_URL = 'https://apis.aligo.in/fax_send/';

export type FaxResult = {
  ok: boolean;
  faxId?: string;
  resultCode?: string;
  message?: string;
  raw?: unknown;
};

export type FaxSendArgs = {
  /** 받는 팩스번호 — 하이픈 무관 */
  receiver: string;
  /** 발신 팩스번호 — 미지정 시 ALIGO_FAX_SENDER env */
  sender?: string;
  /** 표지 제목 (선택, 표지 사용 시) */
  title?: string;
  /** 본문 (선택, 표지 사용 시) */
  memo?: string;
  /** 첨부 파일 (PDF/JPG/PNG/TIFF). Aligo 는 multi-file 지원 — file1, file2... */
  files: File[] | Blob[];
  /** Blob 일 때 파일명 지정 (multipart 헤더용) */
  fileNames?: string[];
};

function normalizePhone(p: string): string {
  return p.replace(/[^0-9]/g, '');
}

/** Aligo 팩스 발송. 환경변수 누락 또는 첨부 없으면 throw/실패. */
export async function sendFax(args: FaxSendArgs): Promise<FaxResult> {
  const key = process.env.ALIGO_KEY;
  const userId = process.env.ALIGO_USER_ID;
  const envSender = process.env.ALIGO_FAX_SENDER;
  if (!key || !userId) {
    throw new Error('Aligo 환경변수 누락 — ALIGO_KEY / ALIGO_USER_ID 확인');
  }

  const sender = normalizePhone(args.sender || envSender || '');
  const receiver = normalizePhone(args.receiver);
  if (!sender) return { ok: false, message: '발신 팩스번호 누락' };
  if (!receiver) return { ok: false, message: '받는 팩스번호 누락' };
  if (!args.files || args.files.length === 0) return { ok: false, message: '첨부 파일 없음' };

  const fd = new FormData();
  fd.append('key', key);
  fd.append('user_id', userId);
  fd.append('sender', sender);
  fd.append('receiver', receiver);
  if (args.title) fd.append('title', args.title.slice(0, 60));
  if (args.memo) fd.append('memo', args.memo.slice(0, 200));
  fd.append('testmode_yn', process.env.ALIGO_TESTMODE === 'Y' ? 'Y' : 'N');

  args.files.forEach((f, i) => {
    const idx = i + 1;
    const fname = args.fileNames?.[i] ?? (f instanceof File ? f.name : `fax-${idx}.bin`);
    fd.append(`fax_file_${idx}`, f, fname);
  });

  try {
    const res = await fetch(API_URL, { method: 'POST', body: fd });
    const json = (await res.json()) as Record<string, unknown>;
    const resultCode = String(json.result_code ?? '');
    const ok = resultCode === '1';
    return {
      ok,
      faxId: json.fax_id != null ? String(json.fax_id) : undefined,
      resultCode,
      message: typeof json.message === 'string' ? json.message : undefined,
      raw: json,
    };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}
