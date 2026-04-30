import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';
import { AuthGate } from '@/components/auth/auth-gate';

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <div className="app">
        <Sidebar />
        <Topbar />
        <div className="workspace">{children}</div>
      </div>
    </AuthGate>
  );
}
