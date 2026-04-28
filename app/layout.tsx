import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'JPK ERP v4',
  description: '장기렌터카 ERP — 자산/계약/재무/업무일지',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
