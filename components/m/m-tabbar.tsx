'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UploadSimple, MagnifyingGlass, NotePencil, GearSix } from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import { cn } from '@/lib/cn';

type Tab = { href: string; label: string; icon: Icon };

const TABS: Tab[] = [
  { href: '/m/upload',   label: '업로드', icon: UploadSimple },
  { href: '/m/search',   label: '조회',   icon: MagnifyingGlass },
  { href: '/m/journal',  label: '입력',   icon: NotePencil },
  { href: '/m/settings', label: '설정',   icon: GearSix },
];

function isActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  return pathname.startsWith(`${href}/`);
}

export function MobileTabbar() {
  const pathname = usePathname() ?? '';
  return (
    <nav className="m-tabbar" aria-label="모바일 메인 탭">
      {TABS.map((t) => {
        const active = isActive(pathname, t.href);
        const Icon = t.icon;
        return (
          <Link key={t.href} href={t.href} className={cn('m-tab', active && 'active')}>
            <Icon size={22} weight={active ? 'fill' : 'regular'} />
            <span>{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
