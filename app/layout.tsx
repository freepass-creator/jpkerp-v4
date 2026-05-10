import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'JPK ERP v4',
  description: '장기렌터카 ERP — 자산/계약/재무/업무일지',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#1B2A4A',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        {/* 한글 웹폰트는 강제 로드하지 않음 — 시스템 폰트가 기본.
            사용자가 설정에서 다른 폰트 선택 시 use-settings.ts 가 동적으로 <link> 주입. */}
      </head>
      <body>{children}</body>
    </html>
  );
}
