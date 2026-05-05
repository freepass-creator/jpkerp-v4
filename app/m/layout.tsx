import { AuthGate } from '@/components/auth/auth-gate';

/**
 * 모바일 직원앱 — /m/* 라우트 그룹.
 *
 * 데스크탑 ERP (workspace) 와 분리:
 *  · 사이드바·topbar 없음
 *  · Pretendard, 16px base, 큰 라운드, 단일 컬럼
 *  · 직원 권한 (AuthGate 통과)
 *
 * 4 메인 액션: 업로드 / 조회 / 입력 / 설정
 */
export default function MobileLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <div className="m-shell">{children}</div>
    </AuthGate>
  );
}
