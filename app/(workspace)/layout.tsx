import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';
import { AuthGate } from '@/components/auth/auth-gate';
import { SettingsInit } from '@/components/settings/settings-init';

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <SettingsInit />
      <div className="app">
        <Sidebar />
        <Topbar />
        <div className="workspace">{children}</div>
      </div>
    </AuthGate>
  );
}
