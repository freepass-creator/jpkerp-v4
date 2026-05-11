'use client';

import { useState } from 'react';
import { CircleNotch } from '@phosphor-icons/react';
import { useAuth, login, resetPassword, signup } from '@/lib/use-auth';

/**
 * 인증 게이트 — 미인증 시 로그인/가입 화면. 인증 후 children 렌더.
 * 이메일/비밀번호 로그인 + 신규 가입 폼 (회사명·부서·연락처 포함).
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');

  if (loading) {
    return (
      <div style={{
        height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 8, background: 'var(--bg-page)', color: 'var(--text-sub)', fontSize: 12,
      }}>
        <CircleNotch size={14} className="auth-spin" style={{ color: 'var(--brand)' }} />
        <span>로딩 중...</span>
      </div>
    );
  }

  if (!user) {
    return mode === 'login'
      ? <LoginScreen onSignup={() => setMode('signup')} />
      : <SignupScreen onBack={() => setMode('login')} />;
  }
  return <>{children}</>;
}

function LoginScreen({ onSignup }: { onSignup: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
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

  async function handleForgot() {
    setError(null);
    setInfo(null);
    if (!email.trim()) {
      setError('이메일을 먼저 입력해주세요');
      return;
    }
    try {
      await resetPassword(email);
      setInfo('비밀번호 재설정 메일을 보냈습니다. 메일함을 확인해주세요.');
    } catch (err) {
      setError((err as Error).message);
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
          {info && <p className="auth-message" style={{ color: 'var(--alert-green-text, #137333)' }}>{info}</p>}
          <button type="submit" className="auth-submit" disabled={busy}>
            {busy ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                <CircleNotch size={14} className="auth-spin" /> 접속 중...
              </span>
            ) : '로그인'}
          </button>
          <button
            type="button"
            onClick={handleForgot}
            style={{
              background: 'transparent', border: 0, padding: '6px 0', marginTop: 4,
              fontSize: 12, color: 'var(--text-sub)', cursor: 'pointer',
              textDecoration: 'underline', textUnderlineOffset: 3,
              fontFamily: 'inherit',
            }}
          >
            비밀번호 찾기
          </button>
        </form>
        <p className="auth-guide">
          계정이 없으신가요?{' '}
          <button
            type="button"
            onClick={onSignup}
            style={{
              background: 'transparent', border: 0, padding: 0,
              color: 'var(--brand)', cursor: 'pointer',
              textDecoration: 'underline', textUnderlineOffset: 3,
              fontFamily: 'inherit', fontSize: 'inherit',
            }}
          >
            회원가입
          </button>
        </p>
      </section>
      <div className="auth-copyright">&copy; 2026 teamjpk. All Rights Reserved.</div>
    </div>
  );
}

function SignupScreen({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordCheck, setPasswordCheck] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [department, setDepartment] = useState('');
  const [role, setRole] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  function validate(): string | null {
    if (!email.trim() || !email.includes('@')) return '올바른 이메일을 입력해주세요';
    if (password.length < 8) return '비밀번호는 8자 이상이어야 합니다';
    if (password !== passwordCheck) return '비밀번호 확인이 일치하지 않습니다';
    if (!displayName.trim()) return '이름을 입력해주세요';
    if (!companyName.trim()) return '회사명을 입력해주세요';
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    const v = validate();
    if (v) { setError(v); return; }
    setBusy(true);
    try {
      await signup({
        email, password, displayName, companyName, department, role, phone,
      });
      setInfo('가입 완료 — 자동 로그인됩니다.');
      // AuthGate 가 onAuthStateChanged 로 자동 전환
    } catch (err) {
      const msg = (err as Error).message;
      setError(
        msg.includes('email-already-in-use')
          ? '이미 가입된 이메일입니다'
          : msg.includes('weak-password')
            ? '비밀번호가 너무 약합니다 (8자 이상, 영문+숫자 권장)'
            : msg.includes('invalid-email')
              ? '이메일 형식이 잘못되었습니다'
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
      <section className="auth-card" aria-label="회원가입" style={{ maxWidth: 420 }}>
        <header className="auth-card__head">
          <h2 className="auth-card__title">회원가입</h2>
          <p className="auth-card__sub">신규 직원 계정 생성 — 모든 필수 항목 입력</p>
        </header>
        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          <div className="auth-field">
            <label htmlFor="signup-email">이메일 *</label>
            <input
              id="signup-email"
              type="email"
              autoComplete="email"
              placeholder="name@company.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="auth-field">
            <label htmlFor="signup-password">비밀번호 * (8자 이상)</label>
            <input
              id="signup-password"
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="auth-field">
            <label htmlFor="signup-password-check">비밀번호 확인 *</label>
            <input
              id="signup-password-check"
              type="password"
              autoComplete="new-password"
              required
              value={passwordCheck}
              onChange={(e) => setPasswordCheck(e.target.value)}
            />
          </div>
          <div className="auth-field">
            <label htmlFor="signup-name">이름 *</label>
            <input
              id="signup-name"
              type="text"
              autoComplete="name"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          <div className="auth-field">
            <label htmlFor="signup-company">회사명 *</label>
            <input
              id="signup-company"
              type="text"
              placeholder="예: JPK오토셀렉션"
              required
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
            />
          </div>
          <div className="auth-field">
            <label htmlFor="signup-dept">부서</label>
            <input
              id="signup-dept"
              type="text"
              placeholder="예: 영업팀"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
            />
          </div>
          <div className="auth-field">
            <label htmlFor="signup-role">직급</label>
            <input
              id="signup-role"
              type="text"
              placeholder="예: 대리"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            />
          </div>
          <div className="auth-field">
            <label htmlFor="signup-phone">연락처</label>
            <input
              id="signup-phone"
              type="tel"
              autoComplete="tel"
              placeholder="010-0000-0000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          {error && <p className="auth-message" role="alert">{error}</p>}
          {info && <p className="auth-message" style={{ color: 'var(--alert-green-text, #137333)' }}>{info}</p>}
          <button type="submit" className="auth-submit" disabled={busy}>
            {busy ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                <CircleNotch size={14} className="auth-spin" /> 가입 중...
              </span>
            ) : '가입하기'}
          </button>
          <button
            type="button"
            onClick={onBack}
            style={{
              background: 'transparent', border: 0, padding: '6px 0', marginTop: 4,
              fontSize: 12, color: 'var(--text-sub)', cursor: 'pointer',
              textDecoration: 'underline', textUnderlineOffset: 3,
              fontFamily: 'inherit',
            }}
          >
            ← 로그인으로 돌아가기
          </button>
        </form>
        <p className="auth-guide text-weak text-xs">
          가입 후 자동 로그인. 회사명·부서는 설정 페이지에서 수정 가능.
        </p>
      </section>
      <div className="auth-copyright">&copy; 2026 teamjpk. All Rights Reserved.</div>
    </div>
  );
}
