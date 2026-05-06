# Firebase RTDB Rules — jpkerp-v4

이 문서의 JSON 을 Firebase Console → Realtime Database → Rules 에 그대로 붙여넣기.

## 정책

**Rules 는 외부 보안만 — 인증 여부만 체크. 권한 (직원/관리자/대표) 은 ERP 코드(role) 에서 관리.**

- 인증된 사용자 = 모든 read/write (entity 단순 분리 안 함)
- audit_logs / event_uploads / sms_logs = append-only (무결성, role 무관 보장)
- 직원 권한 분리는 클라이언트 + 서버 코드의 `users/{uid}/role` 체크로 처리 (admin / superadmin / staff)

회사(companyCode) 격리도 안 함 — 한 사장의 다회사 가정.

## Rules JSON

```json
{
  "rules": {
    ".read": "auth != null",

    "audit_logs": {
      ".indexOn": ["at", "entityType", "entityId"],
      "$logId": {
        ".write": "auth != null && !data.exists()"
      }
    },

    "event_uploads": {
      ".indexOn": ["at", "plate", "kind"],
      "$id": {
        ".write": "auth != null && !data.exists()"
      }
    },

    "sms_logs": {
      ".indexOn": ["at"],
      "$id": {
        ".write": "auth != null && !data.exists()"
      }
    },

    "companies":  { ".write": "auth != null", ".indexOn": ["code", "bizNo", "name"] },
    "assets":     { ".write": "auth != null", ".indexOn": ["plate", "companyCode", "vin", "status", "assetCode"] },
    "contracts":  { ".write": "auth != null", ".indexOn": ["contractNo", "plate", "companyCode", "customerName", "status", "startDate", "endDate", "customerCode"] },
    "customers":  { ".write": "auth != null", ".indexOn": ["code", "companyCode", "phone", "ident"] },
    "insurances": { ".write": "auth != null", ".indexOn": ["carNumber", "companyCode", "policyNo", "endDate"] },
    "journal_entries": { ".write": "auth != null", ".indexOn": ["companyCode", "kind", "at", "staff"] },
    "ledger":     { ".write": "auth != null", ".indexOn": ["companyCode", "txDate", "uploadedAt", "txKey"] },
    "settings":   { ".write": "auth != null" },
    "users":      { ".write": "auth != null" }
  }
}
```

## 핵심 포인트

**왜 root `.write` 안 박는가:**
- root 에 `.write: "auth != null"` 두면 audit_logs append-only 가 부모 cascade 로 무력화됨 (Firebase Rules: 부모 grant 는 자식에서 deny 못 함)
- 그래서 root 는 `.read` 만 두고, write 는 entity 마다 `.write: "auth != null"` 명시
- audit_logs / event_uploads / sms_logs 는 부모 .write 없이 `$id` 레벨에서만 `!data.exists()` 조건으로 write — 새 항목만 push, 기존 항목 수정·삭제 불가

**append-only 가 어떻게 보장되나:**
- 부모 `audit_logs.".write"` 없음 → admin 도 `set('audit_logs', null)` 같은 통째 삭제 불가
- 자식 `$logId.".write": "auth != null && !data.exists()"` → 새 push 만 OK, 기존 update/delete 불가
- 결과: 운영중 누구도 (대표 포함) 감사 로그 변조 불가

## 적용 방법

1. Firebase Console → 프로젝트 → Realtime Database → 규칙 탭
2. 위 JSON 통째로 붙여넣기 → **게시**
3. 검증:
   - 직원 ERP 로그인 → 회사/자산/계약/고객 read/write 정상
   - 로그아웃 상태 직접 RTDB read → 거부
   - audit_logs 의 기존 항목 update/delete 시도 → 거부

## 권한 분리 (ERP 코드 레벨)

Rules 가 아니라 **app 코드** 에서 role 체크:

```ts
// users/{uid}/role 값:
//   'superadmin' — 전권 (대표)
//   'admin'      — 운영 관리 (회사·자산·계약 CRUD, 일부 직원 관리)
//   'staff'      — 일반 직원 (계약 조회·등록, 자기 일지)
//   undefined    — 신규 가입 (admin 승인 대기)

const { user } = useAuth();
const profile = useUserProfile(user?.uid);
if (profile?.role !== 'admin' && profile?.role !== 'superadmin') {
  return <AccessDenied />;
}
```

UI 에서 role 별 메뉴 노출 / 등록·삭제 버튼 disable / `/dev` 페이지 superadmin 전용 등.

## 서버 사이드 (Firebase Admin SDK — Rules 우회)

`/api/customer/lookup` 등은 Admin SDK 사용 — Rules 무관하게 동작.
환경변수: `FIREBASE_ADMIN_KEY` (Vercel) 또는 `GOOGLE_APPLICATION_CREDENTIALS` (로컬).
