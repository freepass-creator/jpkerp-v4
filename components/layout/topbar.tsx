'use client';

import { useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { CaretRight, MagnifyingGlass, User, Bell, SignOut } from '@phosphor-icons/react';
import { useAuth, logout } from '@/lib/use-auth';
import { MENU } from '@/lib/menu';
import { ASSET_SUBTABS } from '@/lib/asset-subtabs';
import { ADMIN_SUBTABS } from '@/lib/admin-subtabs';
import { CONTRACT_SUBTABS } from '@/lib/contract-subtabs';
import { FINANCE_SUBTABS } from '@/lib/finance-subtabs';
import { useTopbarSearch } from '@/lib/use-topbar-search';
import { ContextMenu } from '@/components/ui/context-menu';

const ALL_SUBTABS = [...ASSET_SUBTABS, ...ADMIN_SUBTABS, ...CONTRACT_SUBTABS, ...FINANCE_SUBTABS];

/** 현재 경로에서 [메인메뉴, sub-tab, ...] breadcrumb 추출 */
function findBreadcrumb(pathname: string): string[] {
  for (const section of MENU) {
    for (const item of section.items) {
      if (pathname === item.href || pathname.startsWith(`${item.href}/`)) {
        const sub = ALL_SUBTABS
          .filter((t) => pathname === t.href || pathname.startsWith(`${t.href}/`))
          .sort((a, b) => b.href.length - a.href.length)[0];
        const parts = [item.label];
        if (sub) parts.push(sub.label);
        const base = sub ? sub.href : item.href;
        const remainder = pathname.slice(base.length).replace(/^\/+/, '');
        if (remainder) {
          remainder.split('/').filter(Boolean).forEach((seg) => {
            parts.push(decodeURIComponent(seg));
          });
        }
        return parts;
      }
    }
  }
  return [];
}

/** 페이지별 검색 placeholder — topbar 의 현재 페이지 목록 필터용. */
function pageSearchPlaceholder(pathname: string): string {
  if (pathname.startsWith('/asset'))    return '차량번호 / 차명 / 차대번호 / 임차인';
  if (pathname.startsWith('/contract')) return '계약번호 / 차량 / 고객';
  if (pathname.startsWith('/finance'))  return '계좌 / 적요 / 상대계좌';
  if (pathname.startsWith('/journal'))  return '메모 / 차량 / 담당';
  if (pathname.startsWith('/pending'))  return '미결 항목';
  if (pathname.startsWith('/admin'))    return '회사 / 직원';
  return '이 페이지 검색';
}

export function Topbar() {
  const pathname = usePathname();
  const crumbs = findBreadcrumb(pathname);
  const { search, setSearch } = useTopbarSearch();

  return (
    <header className="topbar">
      {/* 좌측 — 페이지 검색 (현재 페이지 목록 필터). 전역 통합검색은 Ctrl+K. */}
      <div className="relative" style={{ width: 320 }}>
        <MagnifyingGlass
          size={13}
          className="text-weak"
          style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
        />
        <input
          className="input w-full"
          style={{ paddingLeft: 28, paddingRight: 60 }}
          placeholder={pageSearchPlaceholder(pathname)}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span
          title="전역 통합 검색"
          style={{
            position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
            fontSize: 10, color: 'var(--text-weak)', border: '1px solid var(--border)', borderRadius: 3,
            padding: '0 4px', pointerEvents: 'none',
          }}
        >
          ⌘K
        </span>
      </div>

      {/* 가운데 — Breadcrumb (절대 가운데) */}
      <div className="topbar-breadcrumb">
        {crumbs.length > 0 ? (
          crumbs.map((c, i) => (
            <span key={i} className="topbar-crumb">
              {i > 0 && <CaretRight size={11} className="text-weak mx-1.5" />}
              <span className={i === crumbs.length - 1 ? 'text-medium text-main' : 'text-sub'}>{c}</span>
            </span>
          ))
        ) : (
          <span className="text-weak">대시보드</span>
        )}
      </div>

      {/* 우측 — 알림 + 사용자 + 로그아웃 */}
      <UserPanel />
    </header>
  );
}

function UserPanel() {
  const { user } = useAuth();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  if (!user) return null;
  const name = user.displayName ?? user.email?.split('@')[0] ?? '사용자';
  const email = user.email ?? '';

  function openMenu() {
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return;
    setMenu({ x: r.right - 180, y: r.bottom + 4 });
  }

  return (
    <div className="ml-auto flex items-center gap-2">
      <button className="btn-ghost btn btn-icon" title="알림">
        <Bell size={14} />
      </button>
      <button
        ref={triggerRef}
        type="button"
        className="topbar-user"
        title="계정 메뉴"
        onClick={openMenu}
      >
        {user.photoURL ? (
          <img src={user.photoURL} alt={name} className="topbar-user-avatar" referrerPolicy="no-referrer" />
        ) : (
          <div className="topbar-user-avatar">
            <User size={12} weight="bold" />
          </div>
        )}
        <div className="leading-tight text-left">
          <div className="text-medium">{name}</div>
          <div className="text-weak">{email}</div>
        </div>
      </button>
      <ContextMenu
        open={menu !== null}
        x={menu?.x ?? 0}
        y={menu?.y ?? 0}
        items={[
          {
            label: '로그아웃',
            icon: <SignOut size={13} />,
            danger: true,
            onClick: () => logout(),
          },
        ]}
        onClose={() => setMenu(null)}
      />
    </div>
  );
}
