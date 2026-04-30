'use client';

import { useState, useEffect } from 'react';
import { Sun, Moon, Desktop, ArrowCounterClockwise, User, Wrench, FloppyDisk, CheckCircle } from '@phosphor-icons/react';
import { PageShell } from '@/components/layout/page-shell';
import { useSettings, type Theme, type FontFamily, type FontSize, type Density } from '@/lib/use-settings';
import { useAuth, logout } from '@/lib/use-auth';
import { useUserProfile, type UserProfile } from '@/lib/use-user-profile';

/**
 * 설정 — 계정 정보 + 시스템 환경설정.
 *  · 계정 설정: 이름·부서·연락처·이메일(고정) — RTDB /users/{uid}/profile
 *  · 시스템 설정: 테마·글꼴·크기·밀도 — localStorage (디바이스별)
 */

type Tab = 'account' | 'system';

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('account');

  return (
    <PageShell
      filterbar={
        <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          <TabButton active={tab === 'account'} onClick={() => setTab('account')} icon={<User size={12} weight="bold" />}>계정 설정</TabButton>
          <TabButton active={tab === 'system'}  onClick={() => setTab('system')}  icon={<Wrench size={12} weight="bold" />}>시스템 설정</TabButton>
        </div>
      }
      footerLeft={
        <span className="stat-item">
          {tab === 'account' ? '계정 정보 — 모든 디바이스 동기화' : '시스템 설정 — 이 디바이스에만 저장'}
        </span>
      }
    >
      <div style={{ padding: '16px 24px', maxWidth: 720 }}>
        {tab === 'account' ? <AccountSettings /> : <SystemSettings />}
      </div>
    </PageShell>
  );
}

/* ─── 계정 설정 ─── */
function AccountSettings() {
  const { user } = useAuth();
  const { profile, save, loading } = useUserProfile();
  const [draft, setDraft] = useState<UserProfile>(profile);
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // 서버 데이터 로드되면 draft 동기화
  useEffect(() => { setDraft(profile); }, [profile]);

  const dirty =
    draft.displayName !== profile.displayName ||
    draft.department !== profile.department ||
    draft.phone !== profile.phone ||
    draft.role !== profile.role;

  async function handleSave() {
    setBusy(true);
    try {
      await save(draft);
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 2000);
    } catch (e) {
      alert(`저장 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  if (!user) return <div className="text-weak">로그인 정보 없음</div>;

  return (
    <Section title="내 정보">
      <div className="form-grid">
        <Field label="이름" colSpan={2}>
          <input className="input w-full" value={draft.displayName}
                 onChange={(e) => setDraft({ ...draft, displayName: e.target.value })}
                 placeholder="홍길동" disabled={loading} />
        </Field>
        <Field label="부서" colSpan={1}>
          <input className="input w-full" value={draft.department}
                 onChange={(e) => setDraft({ ...draft, department: e.target.value })}
                 placeholder="운영팀" disabled={loading} />
        </Field>
        <Field label="직급/역할" colSpan={1}>
          <input className="input w-full" value={draft.role ?? ''}
                 onChange={(e) => setDraft({ ...draft, role: e.target.value })}
                 placeholder="과장" disabled={loading} />
        </Field>
        <Field label="연락처" colSpan={2}>
          <input className="input w-full" value={draft.phone}
                 onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                 placeholder="010-1234-5678" disabled={loading} />
        </Field>
        <Field label="이메일 (변경 불가)" colSpan={2}>
          <input className="input w-full" value={draft.email}
                 disabled
                 style={{ background: 'var(--bg-disabled)', color: 'var(--text-sub)', cursor: 'not-allowed' }} />
        </Field>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
        <button className="btn" onClick={() => { if (confirm('로그아웃할까요?')) logout(); }}>로그아웃</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {savedAt && <span className="text-success" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><CheckCircle size={12} weight="fill" /> 저장됨</span>}
          <button className="btn btn-primary" disabled={!dirty || busy} onClick={handleSave}>
            <FloppyDisk size={12} weight="bold" /> {busy ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </Section>
  );
}

/* ─── 시스템 설정 ─── */
function SystemSettings() {
  const { settings, update, reset } = useSettings();

  return (
    <>
      <Section title="화면">
        <Field label="테마">
          <Segmented
            value={settings.theme}
            options={[
              { value: 'light', label: '라이트', icon: <Sun size={12} weight="bold" /> },
              { value: 'dark',  label: '다크',   icon: <Moon size={12} weight="bold" /> },
              { value: 'auto',  label: '자동',   icon: <Desktop size={12} weight="bold" /> },
            ]}
            onChange={(v) => update({ theme: v as Theme })}
          />
          <Hint>자동: 시스템 다크모드를 따라갑니다.</Hint>
        </Field>

        <Field label="글꼴">
          <Segmented
            value={settings.fontFamily}
            options={[
              { value: 'mono',   label: 'Consolas + 굴림체' },
              { value: 'sans',   label: 'Pretendard' },
              { value: 'system', label: '시스템 기본' },
            ]}
            onChange={(v) => update({ fontFamily: v as FontFamily })}
          />
          <Hint>본문 글꼴. 숫자·차량번호 셀은 항상 모노스페이스 유지.</Hint>
        </Field>

        <Field label="글자 크기">
          <Segmented
            value={String(settings.fontSize)}
            options={[
              { value: '11', label: '11' },
              { value: '12', label: '12 (기본)' },
              { value: '13', label: '13' },
              { value: '14', label: '14' },
            ]}
            onChange={(v) => update({ fontSize: Number(v) as FontSize })}
          />
        </Field>

        <Field label="행 밀도">
          <Segmented
            value={settings.density}
            options={[
              { value: 'compact',     label: '조밀 (기본)' },
              { value: 'comfortable', label: '여유' },
            ]}
            onChange={(v) => update({ density: v as Density })}
          />
          <Hint>표·입력란·버튼 높이를 한 번에 조정.</Hint>
        </Field>
      </Section>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
        <button className="btn" onClick={() => { if (confirm('기본값으로 되돌릴까요?')) reset(); }}>
          <ArrowCounterClockwise size={12} weight="bold" /> 기본값
        </button>
      </div>

      <Section title="추후 지원 예정">
        <ul className="text-weak text-xs" style={{ listStyle: 'disc inside', lineHeight: 1.8 }}>
          <li>알림 설정 — 미납·만기·검사 알림 채널 선택</li>
          <li>회사 기본값 — 주력 회사 코드 자동 선택</li>
          <li>단축키 — 자주 쓰는 메뉴 빠른 이동</li>
        </ul>
      </Section>
    </>
  );
}

/* ─── 공용 컴포넌트 ─── */

function TabButton({
  active, onClick, icon, children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={active ? 'btn btn-primary' : 'btn'}
      style={{
        borderRadius: 0,
        border: 'none',
        display: 'inline-flex', alignItems: 'center', gap: 4,
      }}
    >
      {icon}{children}
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h3 style={{ fontSize: 13, marginBottom: 10, fontWeight: 'var(--font-weight-medium)', color: 'var(--text-main)' }}>{title}</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>{children}</div>
    </div>
  );
}

function Field({ label, colSpan, children }: { label: string; colSpan?: 1 | 2 | 3 | 4; children: React.ReactNode }) {
  const span = colSpan === 4 ? 'col-span-4' : colSpan === 3 ? 'col-span-3' : colSpan === 2 ? 'col-span-2' : '';
  return (
    <div className={`block ${span}`}>
      <div className="label" style={{ marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <div className="text-weak text-xs" style={{ marginTop: 4 }}>{children}</div>;
}

function Segmented({
  value, options, onChange,
}: {
  value: string;
  options: Array<{ value: string; label: string; icon?: React.ReactNode }>;
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
      {options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={value === o.value ? 'btn btn-primary' : 'btn'}
          style={{
            borderRadius: 0,
            border: 'none',
            borderRight: i < options.length - 1 ? '1px solid var(--border)' : 'none',
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}
        >
          {o.icon}{o.label}
        </button>
      ))}
    </div>
  );
}
