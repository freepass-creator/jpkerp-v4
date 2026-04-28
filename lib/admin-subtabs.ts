import type { SubTab } from '@/components/layout/page-shell';

export const ADMIN_SUBTABS: SubTab[] = [
  { href: '/admin/company',    label: '회사정보' },
  { href: '/admin/staff',      label: '직원관리' },
  { href: '/admin/attendance', label: '근태관리' },
  { href: '/admin/leave',      label: '휴가관리' },
];
