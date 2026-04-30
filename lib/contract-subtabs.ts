import type { SubTab } from '@/components/layout/page-shell';

export const CONTRACT_SUBTABS: SubTab[] = [
  { href: '/contract',          label: '계약현황' },
  { href: '/contract/idle',     label: '휴차현황' },
  { href: '/contract/customer', label: '임차인정보' },
  { href: '/contract/schedule', label: '계약스케줄' },
  { href: '/contract/overdue',  label: '미납' },
  { href: '/contract/return',   label: '반납예정' },
  { href: '/contract/expire',   label: '만기도래' },
  { href: '/contract/ended',    label: '종료계약' },
];
