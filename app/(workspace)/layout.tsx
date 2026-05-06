import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';
import { AuthGate } from '@/components/auth/auth-gate';
import { SettingsInit } from '@/components/settings/settings-init';
import { AuditInit } from '@/components/audit/audit-init';
import { TopbarSearchProvider } from '@/lib/use-topbar-search';
import { UnifiedSearchModal } from '@/components/ui/unified-search';

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <SettingsInit />
      <AuditInit />
      <TopbarSearchProvider>
        <div className="app">
          <Sidebar />
          <Topbar />
          <div className="workspace">{children}</div>
        </div>
        <UnifiedSearchModal />
      </TopbarSearchProvider>
    </AuthGate>
  );
}
