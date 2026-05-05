/**
 * 손님(임차인) 페이지 layout.
 *
 * /customer/* 경로는 (workspace) 그룹 바깥이라 AuthGate 를 거치지 않음.
 * 직원 ERP 와 톤이 다른 라이트한 풀페이지 레이아웃.
 */
export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  return <div className="cx-shell">{children}</div>;
}
