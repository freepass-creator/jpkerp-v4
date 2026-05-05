'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, SignOut, User, ArrowSquareOut } from '@phosphor-icons/react';
import { useAuth, logout } from '@/lib/use-auth';

export default function MobileSettings() {
  const router = useRouter();
  const { user } = useAuth();
  const name = user?.displayName ?? user?.email?.split('@')[0] ?? '직원';
  const email = user?.email ?? '';

  async function handleLogout() {
    if (!confirm('로그아웃 하시겠어요?')) return;
    await logout();
    router.push('/m');
  }

  return (
    <>
      <header className="m-topbar">
        <button type="button" className="m-topbar-back" onClick={() => router.push('/m')}>
          <ArrowLeft size={16} weight="bold" /> 홈
        </button>
        <div className="m-topbar-title">설정</div>
        <span style={{ width: 40 }} />
      </header>

      <main className="m-main">
        <div className="m-card" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            background: 'var(--m-brand)', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <User size={22} weight="bold" />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 700 }}>{name}</div>
            <div style={{ fontSize: 13, color: 'var(--m-text-sub)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email}</div>
          </div>
        </div>

        <div className="m-settings-list">
          <Link href="/asset" className="m-settings-row" style={{ textDecoration: 'none' }}>
            <span className="m-settings-row-label">
              <span>데스크탑 ERP 열기</span>
              <span className="m-settings-row-sub">자산·계약·재무 등 풀 기능</span>
            </span>
            <ArrowSquareOut size={16} className="text-weak" />
          </Link>
          <button type="button" className="m-settings-row is-danger" onClick={handleLogout}>
            <span className="m-settings-row-label">
              <span>로그아웃</span>
              <span className="m-settings-row-sub">{email}</span>
            </span>
            <SignOut size={16} />
          </button>
        </div>
      </main>
    </>
  );
}
