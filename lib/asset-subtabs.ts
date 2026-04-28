import type { SubTab } from '@/components/layout/page-shell';

export const ASSET_SUBTABS: SubTab[] = [
  { href: '/asset',            label: '차량등록현황' },
  { href: '/asset/insurance',  label: '보험내역' },
  { href: '/asset/loan',       label: '할부스케줄' },
  { href: '/asset/inspection', label: '검사내역' },
  { href: '/asset/repair',     label: '차량수선' },
  { href: '/asset/gps',        label: 'GPS관리' },
  { href: '/asset/disposal',   label: '자산처분' },
];

/** sub-tab href별 미결 카운트 — 우상단 빨간 dot 표시용 (추후 실데이터로 교체) */
export const ASSET_SUBTAB_PENDING: Record<string, number> = {
  '/asset/insurance':  3,  // 보험미결
  '/asset/loan':       1,  // 할부미납
  '/asset/inspection': 1,  // 검사만기 임박
  '/asset/repair':     0,
  '/asset/disposal':   0,
};
