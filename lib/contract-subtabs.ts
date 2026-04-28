import type { SubTab } from '@/components/layout/page-shell';

export const CONTRACT_SUBTABS: SubTab[] = [
  { href: '/contract',          label: '계약현황' },
  { href: '/contract/idle',     label: '휴차현황' },
  { href: '/contract/customer', label: '임차인정보' },
  { href: '/contract/schedule', label: '계약스케줄' },
  { href: '/contract/overdue',  label: '미납' },
  { href: '/contract/return',   label: '반납예정' },
  { href: '/contract/expire',   label: '만기도래' },
];

export const CONTRACT_SUBTAB_PENDING: Record<string, number> = {
  '/contract/idle':     0,
  '/contract/customer': 1,  // 폐기 임박
  '/contract/schedule': 0,
  '/contract/overdue':  2,
  '/contract/return':   0,
  '/contract/expire':   1,
};
