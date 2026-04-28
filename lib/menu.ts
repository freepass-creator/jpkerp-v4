import type { Icon } from '@phosphor-icons/react';
import {
  Notebook,
  Hourglass,
  Car,
  FileText,
  Bank,
  Wrench,
  Warning,
} from '@phosphor-icons/react';

export type MenuItem = {
  href: string;
  label: string;
  icon: Icon;
  count?: number;
};

export type MenuSection = {
  /** 섹션 라벨 — 사이드바엔 표시하지 않고 divider 그룹화에만 사용 */
  label: string;
  items: MenuItem[];
};

export const MENU: MenuSection[] = [
  {
    label: '운영',
    items: [
      { href: '/journal', label: '업무일지', icon: Notebook },
      { href: '/pending', label: '미결현황', icon: Hourglass },
    ],
  },
  {
    label: '데이터',
    items: [
      { href: '/asset',    label: '자산관리', icon: Car },
      { href: '/contract', label: '계약관리', icon: FileText },
      { href: '/finance',  label: '재무관리', icon: Bank },
    ],
  },
  {
    label: '관리',
    items: [
      { href: '/admin',   label: '일반관리',    icon: Wrench },
      { href: '/penalty', label: '과태료 업무', icon: Warning },
    ],
  },
];
