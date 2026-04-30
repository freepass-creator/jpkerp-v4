'use client';

import { useState } from 'react';
import { CircleNotch } from '@phosphor-icons/react';
import { useAuth, login } from '@/lib/use-auth';

/**
 * 인증 게이트 — 미인증 시 로그인 화면. jpkerp3 의 디자인 그대로 포팅.
 * 이메일/비밀번호 로그인. 계정은 Firebase Console 에서 관리자가 추가.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="auth-loading">
        <div className="auth-loading__brand">
          <span className="auth-brand__base">team</span>
          <span className="auth-brand__main">jpk</span>{' '}
          <span className="auth-brand__erp">ERP</span>
        </div>
        <CircleNotch size={28} className="auth-spin" style={{ color: '#1B2A4A' }} />
        <div style={{ fontSize: 12, color: '#5f6368' }}>인증 확인 중...</div>
      </div>
    );
  }

  if (!user) return <LoginScreen />;
  return <>{children}</>;
}

function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      // 인증 상태 변경은 onAuthStateChanged 가 자동 처리 → AuthGate 가 children 렌더
    } catch (err) {
      const msg = (err as Error).message;
      setError(
        msg.includes('invalid') || msg.includes('wrong-password')
          ? '이메일 또는 비밀번호가 잘못되었습니다'
          : msg.includes('user-not-found')
            ? '등록되지 않은 계정입니다'
            : msg.includes('too-many-requests')
              ? '시도 너무 많음 — 잠시 후 다시 시도하세요'
              : msg,
      );
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-brand">
        <span className="auth-brand__base">team</span>
        <span className="auth-brand__main">jpk</span>{' '}
        <span className="auth-brand__erp">ERP</span>
      </div>
      <section className="auth-card" aria-label="로그인">
        <header className="auth-card__head">
          <h2 className="auth-card__title">로그인</h2>
          <p className="auth-card__sub">이메일과 비밀번호를 입력해주세요.</p>
        </header>
        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          <div className="auth-field">
            <label htmlFor="login-email">이메일</label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              placeholder="name@company.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="auth-field">
            <label htmlFor="login-password">비밀번호</label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              placeholder="비밀번호 입력"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <p className="auth-message" role="alert">{error}</p>}
          <button type="submit" className="auth-submit" disabled={busy}>
            {busy ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                <CircleNotch size={14} className="auth-spin" /> 접속 중...
              </span>
            ) : '로그인'}
          </button>
        </form>
        <p className="auth-guide">기존 jpkerp 계정으로 로그인</p>
      </section>
      <div className="auth-copyright">&copy; 2026 teamjpk. All Rights Reserved.</div>
    </div>
  );
}
