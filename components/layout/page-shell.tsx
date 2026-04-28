'use client';

/**
 * PageShell — 데이터 탭 표준 레이아웃 (v3 박스 패턴).
 *
 *   workspace (수직 스택, 박스 1개)
 *   └─ main-panel
 *      ├─ tabs           (sub-tab navigation, 사각 박스 버튼)
 *      ├─ filterbar      (선택)
 *      ├─ children       (보통 .table-wrap)
 *      └─ app-footer     (좌: 통계+미결 / 우: 행위 버튼)
 *
 * 미결은 별도 우측/상단 패널 두지 않고 footer 좌측에 inline으로 표시.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';

export type SubTab = { href: string; label: string };

type Props = {
  subTabs?: SubTab[];
  /** Sub-tab href별 미결 개수. 0보다 크면 우상단에 빨간 dot 표시. */
  subTabPending?: Record<string, number>;
  children: React.ReactNode;
  filterbar?: React.ReactNode;
  footerLeft?: React.ReactNode;
  footerRight?: React.ReactNode;
};

export function PageShell({
  subTabs,
  subTabPending,
  children,
  filterbar,
  footerLeft,
  footerRight,
}: Props) {
  const pathname = usePathname();
  const showFooter = Boolean(footerLeft || footerRight);

  return (
    <div className="main-panel">
      {subTabs && subTabs.length > 0 && (
        <nav className="tabs">
          {subTabs.map((t) => {
            const active = pathname === t.href;
            const pending = subTabPending?.[t.href] ?? 0;
            return (
              <Link key={t.href} href={t.href} className={cn('tab', active && 'active')}>
                {t.label}
                {pending > 0 && <span className="tab-pending-dot" title={`미결 ${pending}건`} />}
              </Link>
            );
          })}
        </nav>
      )}

      {filterbar && <div className="filterbar">{filterbar}</div>}

      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">{children}</div>

      {showFooter && (
        <footer className="app-footer">
          {footerLeft}
          {footerRight && <div className="right">{footerRight}</div>}
        </footer>
      )}
    </div>
  );
}
