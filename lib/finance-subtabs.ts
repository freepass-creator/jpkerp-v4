import type { SubTab } from '@/components/layout/page-shell';

export const FINANCE_SUBTABS: SubTab[] = [
  { href: '/finance',          label: '계좌내역' },
  { href: '/finance/autopay',  label: '자동이체' },
  { href: '/finance/card',     label: '카드결제' },
  { href: '/finance/daily',    label: '자금일보' },
  { href: '/finance/receipt',  label: '수납내역' },
  { href: '/finance/expense',  label: '지출내역' },
  { href: '/finance/taxbill',  label: '세금계산서' },
];

export const FINANCE_SUBTAB_PENDING: Record<string, number> = {
  '/finance/autopay':  0,
  '/finance/card':     0,
  '/finance/receipt':  0,
  '/finance/expense':  0,
  '/finance/taxbill':  0,
};
