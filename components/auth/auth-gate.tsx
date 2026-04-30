'use client';

import { useAuth, login } from '@/lib/use-auth';

/**
 * 인증 게이트 — 로그인 안 된 사용자는 로그인 화면으로.
 * Workspace 전체를 감싸서 모든 페이지에 인증 강제.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{
        height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-sub)', fontSize: 12,
      }}>
        인증 확인 중...
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  return <>{children}</>;
}

function LoginScreen() {
  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 24,
      background: 'var(--bg-page)',
    }}>
      {/* JPK ERP 로고 */}
      <div style={{
        width: 120,
        height: 120,
        borderRadius: 18,
        background: 'var(--brand)',
        color: 'var(--text-inverse)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 900,
        fontSize: 36,
        letterSpacing: -1,
        lineHeight: 1.0,
        fontFamily: 'Consolas, monospace',
      }}>
        <div>JPK</div>
        <div>ERP</div>
      </div>

      <div style={{ textAlign: 'center', color: 'var(--text-sub)' }}>
        장기렌터카 ERP
      </div>

      <button
        onClick={login}
        className="btn btn-primary"
        style={{
          fontSize: 13,
          padding: '10px 24px',
          height: 'auto',
          gap: 8,
        }}
      >
        <GoogleIcon /> Google 계정으로 로그인
      </button>

      <div style={{ fontSize: 11, color: 'var(--text-weak)', maxWidth: 320, textAlign: 'center', lineHeight: 1.6 }}>
        직원 Google 계정으로 로그인하세요.<br />
        문의는 관리자에게.
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <path d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z" fill="#4285F4"/>
      <path d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2.04a4.8 4.8 0 0 1-7.18-2.54H1.83v2.07A8 8 0 0 0 8.98 17z" fill="#34A853"/>
      <path d="M4.5 10.48a4.8 4.8 0 0 1 0-3.04V5.37H1.83a8 8 0 0 0 0 7.18l2.67-2.07z" fill="#FBBC05"/>
      <path d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 1.83 5.37L4.5 7.44a4.77 4.77 0 0 1 4.48-3.26z" fill="#EA4335"/>
    </svg>
  );
}
