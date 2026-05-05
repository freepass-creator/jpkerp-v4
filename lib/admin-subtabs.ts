import type { SubTab } from '@/components/layout/page-shell';

export const ADMIN_SUBTABS: SubTab[] = [
  { href: '/admin/company',    label: '회사정보' },
  { href: '/admin/audit',      label: '감사로그' },
  // 직원관리·근태관리·휴가관리는 stub — 구현 후 복원.
  // 페이지 파일은 보존: app/(workspace)/admin/{staff,attendance,leave}/page.tsx
];
