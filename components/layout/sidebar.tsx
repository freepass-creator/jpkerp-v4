'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Fragment } from 'react';
import { CaretRight } from '@phosphor-icons/react';
import { MENU, type MenuItem } from '@/lib/menu';
import { cn } from '@/lib/cn';

function isActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  return pathname.startsWith(`${href}/`);
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <div className="sb-brand">
        <div className="sb-brand-mark">JPK</div>
        <div className="sb-brand-name">
          <div className="text-medium">JPK ERP</div>
          <div className="text-weak">v4 · 장기렌터카</div>
        </div>
      </div>

      <nav className="sb-nav">
        {MENU.map((section, idx) => (
          <Fragment key={section.label}>
            {idx > 0 && <div className="sb-divider" />}
            <div className="sb-section">
              <div className="sb-section-label">{section.label}</div>
              {section.items.map((item) => (
                <SidebarItem key={item.href} item={item} active={isActive(pathname, item.href)} />
              ))}
            </div>
          </Fragment>
        ))}
      </nav>

      <div className="sb-foot">
        <div className="sb-user">
          <div className="sb-user-avatar">N</div>
          <div className="flex-1 min-w-0">
            <div className="text-medium truncate">담당자</div>
            <div className="text-weak truncate">staff@jpk.local</div>
          </div>
          <CaretRight size={12} className="text-weak" />
        </div>
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
