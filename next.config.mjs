/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
