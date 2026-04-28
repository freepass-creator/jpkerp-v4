import type { Icon } from '@phosphor-icons/react';
import {
  Notebook,
  Hourglass,
  Car,
  FileText,
  Bank,
  Buildings,
  UsersThree,
  ClockClockwise,
  CalendarBlank,
} from '@phosphor-icons/react';

export type MenuItem = {
  href: string;
  label: string;
  icon: Icon;
  count?: number;
};

export type MenuSection = {
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
      { href: '/asset',    label: '자산', icon: Car },
      { href: '/contract', label: '계약', icon: FileText },
      { href: '/finance',  label: '재무', icon: Bank },
    ],
  },
  {
    label: '일반관리',
    items: [
      { href: '/admin/company',    label: '회사정보', icon: Buildings },
      { href: '/admin/staff',      label: '직원',     icon: UsersThree },
      { href: '/admin/attendance', label: '근태',     icon: ClockClockwise },
      { href: '/admin/leave',      label: '휴가',     icon: CalendarBlank },
    ],
  },
];
