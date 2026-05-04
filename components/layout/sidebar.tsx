'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Fragment } from 'react';
import { Gear, Code } from '@phosphor-icons/react';
import { MENU, type MenuItem } from '@/lib/menu';
import { useUserProfile } from '@/lib/use-user-profile';
import { cn } from '@/lib/cn';

function isActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  return pathname.startsWith(`${href}/`);
}

export function Sidebar() {
  const pathname = usePathname();
  const { profile } = useUserProfile();

  return (
    <aside className="sidebar">
      <div className="sb-brand">
        {/* 사용자 프로필의 companyName — 미설정 시 비어있음 (설정 → 계정 → 회사명 입력) */}
        <div className="sb-company-name" title={profile.companyName || '설정 → 계정 설정에서 회사명 입력'}>
          {profile.companyName || <span className="text-weak">회사명 미설정</span>}
        </div>
      </div>

      <nav className="sb-nav">
        {MENU.map((section, idx) => (
          <Fragment key={section.label}>
            {idx > 0 && <div className="sb-divider" />}
            <div className="sb-section">
              {section.items.map((item) => (
                <SidebarItem key={item.href} item={item} active={isActive(pathname, item.href)} />
              ))}
            </div>
          </Fragment>
        ))}
      </nav>

      <div className="sb-foot">
        <Link
          href="/dev"
          className={cn('sb-item', isActive(pathname, '/dev') && 'active')}
        >
          <Code size={15} />
          <span>개발도구</span>
        </Link>
        <Link
          href="/settings"
          className={cn('sb-item', isActive(pathname, '/settings') && 'active')}
        >
          <Gear size={15} />
          <span>설정</span>
        </Link>
      </div>
    </aside>
  );
}

function SidebarItem({ item, active }: { item: MenuItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link href={item.href} className={cn('sb-item', active && 'active')}>
      <Icon size={15} weight={active ? 'fill' : 'regular'} />
      <span>{item.label}</span>
      {item.count !== undefined && item.count > 0 && (
        <span className="sb-count">{item.count}</span>
      )}
    </Link>
  );
}
