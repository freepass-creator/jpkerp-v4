/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // dev 모드 좌하단 N 인디케이터 숨김
  devIndicators: false,
  // @sparticuz/chromium은 바이너리 포함이라 webpack 번들에 들어가면 안 됨
  serverExternalPackages: ['@sparticuz/chromium', 'puppeteer-core'],
  // 큰 라이브러리들의 barrel import 최적화 — dev 모드 컴파일/번들 시간 대폭 감소.
  // Phosphor Icons 같은 9000+ 아이콘 라이브러리에서 사용하는 것만 트리쉐이킹.
  experimental: {
    optimizePackageImports: [
      '@phosphor-icons/react',
      '@radix-ui/react-dialog',
      '@radix-ui/react-tabs',
      '@tanstack/react-table',
    ],
  },
};

export default nextConfig;
