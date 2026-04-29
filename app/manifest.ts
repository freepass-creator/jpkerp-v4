import type { MetadataRoute } from 'next';

/**
 * PWA manifest — 데스크탑 Chrome/Edge 에서 "앱으로 설치" 시 별도 창으로 동작.
 *  주소창 ⊕ 아이콘 클릭 → "JPK ERP 설치" → 독립 창 + 작업표시줄 아이콘.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'JPK ERP',
    short_name: 'JPK ERP',
    description: '장기렌터카 ERP — 자산 · 계약 · 재무 · 업무일지',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#1B2A4A',
    lang: 'ko',
    icons: [
      { src: '/icon.svg', sizes: 'any',     type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'maskable' },
    ],
  };
}
