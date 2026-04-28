'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { MagnifyingGlass } from '@phosphor-icons/react';
import { MENU } from '@/lib/menu';

function findTitle(pathname: string): string {
  for (const section of MENU) {
    for (const item of section.items) {
      if (pathname === item.href || pathname.startsWith(`${item.href}/`)) return item.label;
    }
  }
  return '';
}

export function Topbar() {
  const pathname = usePathname();
  const title = findTitle(pathname);
  const [keyword, setKeyword] = useState('');

  return (
    <header className="topbar">
      <div className="text-medium">{title}</div>

      <div className="relative ml-4 w-80">
        <MagnifyingGlass
          size={14}
          className="absolute left-2 top-1/2 -translate-y-1/2 text-weak"
        />
        <input
          className="input pl-7 w-full"
          placeholder="차량번호 / 계약번호 / 고객명 검색"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
      </div>

      <div className="ml-auto text-weak">
        {new Date().toLocaleDateString('ko-KR')}
      </div>
    </header>
  );
}
