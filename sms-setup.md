# SMS 발송 (Aligo) 설정 가이드

손님 응대 자동화 — 새 계약 환영 / 미납 / 만기 알림 + 직원 수동 발송.

## 1. Aligo 가입 + 발신번호 등록

1. https://smartsms.aligo.in 가입
2. **발신번호 사전등록** (의무 — 등록 안 한 번호로 발송 불가)
   - 마이페이지 → 발신번호 등록 → 사업자등록증 또는 본인인증
   - 등록 완료까지 1-2영업일
3. **API 키 발급** (마이페이지 → API 인증키)
4. **충전** (선불제, SMS 8원/건, LMS 25원/건 내외)

## 2. 환경변수

`.env.local` 또는 Vercel 환경변수 (Production/Preview/Development 모두):

```
ALIGO_KEY=xxxxxxxxxxxxxxxx       # API 인증키
ALIGO_USER_ID=youraccount        # 회원 ID
ALIGO_SENDER=02-1234-5678        # 사전등록한 발신번호 (하이픈 무관)
ALIGO_TESTMODE=N                 # 'Y' = 발송 안 함 (개발/테스트), 'N' 또는 미설정 = 실발송

NEXT_PUBLIC_APP_URL=https://www.jpkerp.com   # SMS 본문 URL 도메인
CRON_SECRET=<random-string>      # /api/sms/cron/daily 보호용 (Vercel Cron 자동 처리)
```

⚠️ `.env.local` 은 git 커밋 금지 (`.gitignore` 확인).

## 3. 발송 경로

### 직원 수동 발송
- `/contract` → 행 우클릭 → **[문자 발송]**
- 4종 템플릿 (환영 / 미납 / 만기 / 자유작성)
- 미리보기 후 [발송] → 즉시 Aligo 호출
- 결과: `sms_logs/` RTDB 노드에 기록 (성공·실패 모두)

### 자동 — 새 계약 등록 직후
- `/contract` 등록 다이얼로그 → 등록 완료 시 서버 cascade
- `/api/sms/welcome` 호출 → 환영 메시지 자동 발송
- 손님이 SMS URL 클릭 → 손님 페이지로 진입 (ident 매칭)

### 자동 — 매일 cron (Vercel Cron 09:00 KST)
- `vercel.json` 의 `crons` 설정 → `/api/sms/cron/daily`
- 미납 발생 (회차 dueDate < today, status !== 완료) → 매일 1회 알림
- 만기 D-30/D-7 (`endDate` D-30 or D-7) → 만기 알림
- 동일 계약·동일 종류 재발송 방지: `sms_logs/` 에서 24시간 이내 발송 확인 후 skip

## 4. 메시지 본문 길이

- **SMS**: 90 byte (한글 ~45자) — 8원
- **LMS**: 90 byte 초과 시 자동 전환 (한글 ~1000자) — 25원

본문 자동 판정 (`lib/sms/aligo.ts` byteLength).

## 5. 발송 로그 조회

`sms_logs/` RTDB 노드 — Console 에서 직접 조회 또는 추후 `/admin/sms-logs` 뷰어.

```
sms_logs/
  -OabcXXX
    at: '2026-05-05T...'
    actor: { uid, email }
    to: '01012345678'
    kind: 'welcome' | 'overdue' | 'expire' | 'custom'
    content: '...'
    result: { ok, msgId, msgType, resultCode, message }
```

## 6. 비용 가이드라인

- 손님 50명 × 월 1회 미납 + 만기 알림 = 월 ~5,000원
- 새 계약 환영 1회 발송: 8원
- 충전 5만원이면 SMS 6,250건 / LMS 2,000건 가능

## 7. RTDB Rules

`firebase-rules.md` 의 audit_logs 와 같은 패턴으로 sms_logs 도 append-only 권장:

```json
"sms_logs": {
  ".read": "auth != null",
  ".indexOn": ["at"],
  "$logId": {
    ".write": "auth != null && !data.exists()"
  }
}
```

서버 라우트는 Admin SDK 사용이라 Rules 우회.
