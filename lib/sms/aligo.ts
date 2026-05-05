import 'server-only';
import { smsByteLength as byteLength } from './byte-length';

/**
 * Aligo (smartsms.aligo.in) API 클라이언트 — 서버 전용.
 *
 * 가입 + 발신번호 사전등록 (의무) → API 키 발급 → 환경변수 박기:
 *   ALIGO_KEY       — API 키
 *   ALIGO_USER_ID   — 회원 ID
 *   ALIGO_SENDER    — 사전등록한 발신번호 (02-XXXX-XXXX or 010-XXXX-XXXX)
 *   ALIGO_TESTMODE  — 'Y' 면 실제 발송 X (개발/검증용). 미설정 또는 'N' = 실발송.
 *
 * SMS (90 byte / 한글 ~45자) 와 LMS (2000 byte / 한글 ~1000자) 자동 판정.
 * 비용: SMS 8원, LMS 25원 내외 (대행사 단가).
 */

export type SmsResult = {
  ok: boolean;
  msgId?: string;
  msgType?: 'SMS' | 'LMS' | 'MMS';
  successCount?: number;
  errorCount?: number;
  resultCode?: string;
  message?: string;
  raw?: unknown;
};

export type SendArgs = {
  to: string | string[];      // 수신번호 (하이픈 무관)
  content: string;            // 본문
  title?: string;             // LMS/MMS 제목 (선택)
};

const API_URL = 'https://apis.aligo.in/send/';

function detectMsgType(content: string): 'SMS' | 'LMS' {
  return byteLength(content) > 90 ? 'LMS' : 'SMS';
}

function normalizePhone(p: string): string {
  return p.replace(/[^0-9]/g, '');
}

/** Aligo 발송. 환경변수 누락 시 throw. testmode_yn 적용. */
export async function sendSms(args: SendArgs): Promise<SmsResult> {
  const key = process.env.ALIGO_KEY;
  const userId = process.env.ALIGO_USER_ID;
  const sender = process.env.ALIGO_SENDER;
  if (!key || !userId || !sender) {
    throw new Error('Aligo 환경변수 누락 — ALIGO_KEY / ALIGO_USER_ID / ALIGO_SENDER 확인');
  }

  const receivers = (Array.isArray(args.to) ? args.to : [args.to])
    .map(normalizePhone)
    .filter((p) => p.length >= 9 && p.length <= 11);
  if (receivers.length === 0) {
    return { ok: false, message: '유효한 수신번호 없음' };
  }

  const msgType = detectMsgType(args.content);
  const params = new URLSearchParams({
    key,
    user_id: userId,
    sender: normalizePhone(sender),
    receiver: receivers.join(','),
    msg: args.content,
    msg_type: msgType,
    testmode_yn: process.env.ALIGO_TESTMODE === 'Y' ? 'Y' : 'N',
  });
  if (msgType === 'LMS' && args.title) params.set('title', args.title.slice(0, 44));

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const json = (await res.json()) as Record<string, unknown>;
    const resultCode = String(json.result_code ?? '');
    const ok = resultCode === '1';
    return {
      ok,
      msgId: json.msg_id != null ? String(json.msg_id) : undefined,
      msgType,
      successCount: typeof json.success_cnt === 'number' ? json.success_cnt : undefined,
      errorCount: typeof json.error_cnt === 'number' ? json.error_cnt : undefined,
      resultCode,
      message: typeof json.message === 'string' ? json.message : undefined,
      raw: json,
    };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}
