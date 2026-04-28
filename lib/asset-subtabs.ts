import type { SubTab } from '@/components/layout/page-shell';

export const ASSET_SUBTABS: SubTab[] = [
  { href: '/asset',           label: '차량등록현황' },
  { href: '/asset/insurance', label: '보험가입현황' },
  { href: '/asset/loan',      label: '할부스케줄' },
  { href: '/asset/gps',       label: 'GPS관리' },
  { href: '/asset/disposal',  label: '매각차량' },
];
