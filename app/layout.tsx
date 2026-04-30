import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'JPK ERP v4',
  description: '장기렌터카 ERP — 자산/계약/재무/업무일지',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        {/* 한글 웹폰트 — 설정 페이지에서 사용자가 선택 시 적용. preconnect로 빠른 로드. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&family=Nanum+Gothic:wght@400;700&family=Nanum+Square+Round:wght@400;700&family=IBM+Plex+Sans+KR:wght@400;500;700&family=Gowun+Dodum&display=swap"
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.css"
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/spoqa/spoqa-han-sans@01ff0283e44dba80f88abec6cdfe1b5b6e7b5dd9/css/SpoqaHanSansNeo.css"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
