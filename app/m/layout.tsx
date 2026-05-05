import { AuthGate } from '@/components/auth/auth-gate';
import { MobileTabbar } from '@/components/m/m-tabbar';

/**
 * 모바일 직원앱 — /m/* 라우트 그룹.
 *  · 사이드바·topbar 없음
 *  · 하단 탭바: 업로드 / 조회 / 입력 / 설정
 *  · 직원 권한 (AuthGate 통과)
 */
export default function MobileLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <div className="m-shell">
        <div className="m-shell-body">{children}</div>
        <MobileTabbar />
      </div>
    </AuthGate>
  );
}
