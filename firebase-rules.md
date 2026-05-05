# Firebase RTDB Rules — jpkerp-v4

이 문서의 JSON 을 Firebase Console → Realtime Database → Rules 에 그대로 붙여넣기.

## 정책 요약

- **모든 데이터는 인증된 사용자만 read/write** (직원 ERP 사용)
- **손님 페이지** 는 `/api/customer/lookup` 서버 라우트 통해서만 조회 (Firebase Admin SDK 가 Rules 우회)
- **audit_logs** 는 append-only — 클라이언트는 push 만 가능, update/delete 불가
- **인덱스** 는 audit_logs 시계열 조회 최적화

회사(companyCode) 격리는 미적용 — 한 사장의 다회사 가정.
한 사장 외 다른 사장이 같은 인스턴스에 들어오면 그때 도입.

## Rules JSON

```json
{
  "rules": {
    ".read": "auth != null",
    ".write": "auth != null",

    "audit_logs": {
      ".read": "auth != null",
      ".indexOn": ["at", "entityType", "entityId"],
      "$logId": {
        ".write": "auth != null && !data.exists()",
        ".validate": "newData.hasChildren(['at', 'actor', 'action', 'entityType', 'entityId'])"
      }
    },

    "contracts":  { ".read": "auth != null", ".write": "auth != null" },
    "assets":     { ".read": "auth != null", ".write": "auth != null" },
    "companies":  { ".read": "auth != null", ".write": "auth != null" },
    "insurances": { ".read": "auth != null", ".write": "auth != null" },
    "journal_entries": { ".read": "auth != null", ".write": "auth != null" },
    "ledger":     { ".read": "auth != null", ".write": "auth != null" }
  }
}
```

## 적용 방법

1. Firebase Console → 프로젝트 → Realtime Database → Rules 탭
2. 위 JSON 통째로 붙여넣기 → "게시" 버튼
3. 적용 후 손님 페이지가 정상 동작하는지 검증:
   - 직원 ERP 로그인 → contracts/* 정상 read/write
   - 로그아웃 상태에서 `/customer` 입력 → API 통해 정상 매칭
   - 비인증 client SDK 로 contracts read 시도 → 거부

## 서버 사이드 인증 (Firebase Admin SDK)

`/api/customer/lookup` 은 Admin SDK 사용 — Rules 우회.
환경변수 필요 (둘 중 하나):

- **FIREBASE_ADMIN_KEY** : 서비스계정 JSON 키 통째로 (Vercel 환경변수)
- **GOOGLE_APPLICATION_CREDENTIALS** : 서비스계정 키 파일 경로 (로컬 개발)

서비스계정 키 발급:
1. Firebase Console → 프로젝트 설정 → 서비스 계정
2. "새 비공개 키 생성" → JSON 다운로드
3. JSON 파일 통째 내용을 `FIREBASE_ADMIN_KEY` 환경변수에 박음
   - Vercel: 프로젝트 Settings → Environment Variables → 변수명 `FIREBASE_ADMIN_KEY`
     값 = JSON 파일 내용 그대로 (개행 포함). Vercel 이 알아서 처리.
   - 로컬: `.env.local` 에 `FIREBASE_ADMIN_KEY='{"type":"service_account",...}'` (한 줄로 escape)
     또는 GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json 으로 대체 가능

⚠️ 서비스계정 키는 **절대 git 커밋 금지**. `.gitignore` 에 `.env.local` 포함됨 (확인 권장).

## 향후 강화

- audit_logs 행 단위 ".validate" 보강 (action 값 enum 등)
- 회사(companyCode) 격리 규칙 (다른 사장 합류 시)
- rate limit (현재는 RTDB Rules 레벨에서 미적용 — Cloudflare/Vercel Edge Middleware 권장)
