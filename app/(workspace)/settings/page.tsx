'use client';

import { useState, useEffect } from 'react';
import { Sun, Moon, Desktop, ArrowCounterClockwise, User, Wrench, FloppyDisk, CheckCircle, SignOut } from '@phosphor-icons/react';
import { PageShell } from '@/components/layout/page-shell';
import { useSettings, type Theme, type FontFamily, type FontSize, type Density } from '@/lib/use-settings';
import { useAuth, logout } from '@/lib/use-auth';
import { useUserProfile, type UserProfile } from '@/lib/use-user-profile';

/**
 * 설정 — 계정 정보 + 시스템 환경설정.
 *  · 계정 설정: 이름·직급·부서·연락처·근무지·팩스 (명함 정보) — RTDB /users/{uid}/profile
 *  · 시스템 설정: 테마·글꼴·크기·밀도 — localStorage (디바이스별)
 *
 * 모든 액션 버튼 (저장 / 로그아웃 / 기본값) 은 PageShell footer 로 통일 — 페이지 규격.
 */

type Tab = 'account' | 'system';

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('account');
  const { user } = useAuth();
  const { profile, save: saveProfile, loading } = useUserProfile();
  const { settings, update, reset } = useSettings();

  // 계정 draft 상태 (저장 전)
  const [draft, setDraft] = useState<UserProfile>(profile);
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => { setDraft(profile); }, [profile]);

  const dirty =
    draft.displayName     !== profile.displayName     ||
    draft.role            !== profile.role            ||
    draft.department      !== profile.department      ||
    draft.phone           !== profile.phone           ||
    draft.officePhone     !== profile.officePhone     ||
    draft.fax             !== profile.fax             ||
    draft.workplace       !== profile.workplace       ||
    draft.workplaceAddress !== profile.workplaceAddress;

  async function handleSave() {
    setBusy(true);
    try {
      await saveProfile(draft);
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 2000);
    } catch (e) {
      alert(`저장 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

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
          {tab === 'account'
            ? (savedAt ? <span className="text-success" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><CheckCircle size={12} weight="fill" /> 저장됨</span> : '계정 정보 — 모든 디바이스 동기화')
            : '시스템 설정 — 이 디바이스에만 저장'}
        </span>
      }
      footerRight={
        tab === 'account' ? (
          <>
            <button className="btn" onClick={() => { if (confirm('로그아웃할까요?')) logout(); }}>
              <SignOut size={12} weight="bold" /> 로그아웃
            </button>
            <button className="btn btn-primary" disabled={!dirty || busy || loading} onClick={handleSave}>
              <FloppyDisk size={12} weight="bold" /> {busy ? '저장 중...' : '저장'}
            </button>
          </>
        ) : (
          <button className="btn" onClick={() => { if (confirm('기본값으로 되돌릴까요?')) reset(); }}>
            <ArrowCounterClockwise size={12} weight="bold" /> 기본값
          </button>
        )
      }
    >
      <div className="page-section-narrow">
        {tab === 'account' ? (
          user ? <AccountFields draft={draft} setDraft={setDraft} loading={loading} /> : <div className="text-weak">로그인 정보 없음</div>
        ) : (
          <SystemFields settings={settings} update={update} />
        )}
      </div>
    </PageShell>
  );
}

/* ─── 계정 입력 필드 (명함 정보) ─── */
function AccountFields({
  draft, setDraft, loading,
}: {
  draft: UserProfile;
  setDraft: (d: UserProfile) => void;
  loading: boolean;
}) {
  const set = <K extends keyof UserProfile>(k: K, v: UserProfile[K]) => setDraft({ ...draft, [k]: v });

  return (
    <>
      <Section title="기본 정보">
        <div className="form-grid">
          <Field label="이름 *" colSpan={2}>
            <input className="input w-full" value={draft.displayName} onChange={(e) => set('displayName', e.target.value)} placeholder="홍길동" disabled={loading} />
          </Field>
          <Field label="직급/역할" colSpan={1}>
            <input className="input w-full" value={draft.role} onChange={(e) => set('role', e.target.value)} placeholder="과장" disabled={loading} />
          </Field>
          <Field label="부서" colSpan={1}>
            <input className="input w-full" value={draft.department} onChange={(e) => set('department', e.target.value)} placeholder="운영팀" disabled={loading} />
          </Field>
        </div>
      </Section>

      <Section title="연락처 (명함)">
        <div className="form-grid">
          <Field label="이메일 (변경 불가)" colSpan={2}>
            <input className="input w-full" value={draft.email} disabled
                   style={{ background: 'var(--bg-disabled)', color: 'var(--text-sub)', cursor: 'not-allowed' }} />
          </Field>
          <Field label="휴대폰" colSpan={2}>
            <input className="input w-full" value={draft.phone} onChange={(e) => set('phone', e.target.value)} placeholder="010-1234-5678" disabled={loading} />
          </Field>
          <Field label="사무실 직통" colSpan={2}>
            <input className="input w-full" value={draft.officePhone} onChange={(e) => set('officePhone', e.target.value)} placeholder="02-1234-5678" disabled={loading} />
          </Field>
          <Field label="팩스" colSpan={2}>
            <input className="input w-full" value={draft.fax} onChange={(e) => set('fax', e.target.value)} placeholder="02-1234-5679" disabled={loading} />
          </Field>
        </div>
      </Section>

      <Section title="근무지">
        <div className="form-grid">
          <Field label="근무지명" colSpan={2}>
            <input className="input w-full" value={draft.workplace} onChange={(e) => set('workplace', e.target.value)} placeholder="본사 / 서울지점 / 강남영업소" disabled={loading} />
          </Field>
          <Field label="근무지 주소" colSpan={4}>
            <input className="input w-full" value={draft.workplaceAddress} onChange={(e) => set('workplaceAddress', e.target.value)} placeholder="서울특별시 ..." disabled={loading} />
          </Field>
        </div>
      </Section>
    </>
  );
}

/* ─── 시스템 설정 필드 ─── */
function SystemFields({
  settings, update,
}: {
  settings: ReturnType<typeof useSettings>['settings'];
  update: ReturnType<typeof useSettings>['update'];
}) {
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
            wrap
            options={[
              { value: 'mono',         label: 'Consolas + 굴림체' },
              { value: 'pretendard',   label: 'Pretendard' },
              { value: 'noto',         label: 'Noto Sans KR' },
              { value: 'spoqa',        label: 'Spoqa Han Sans' },
              { value: 'nanum',        label: '나눔고딕' },
              { value: 'nanum-square', label: '나눔스퀘어' },
              { value: 'ibm-plex',     label: 'IBM Plex KR' },
              { value: 'gowun',        label: '고운돋움' },
              { value: 'system',       label: '시스템 기본' },
            ]}
            onChange={(v) => update({ fontFamily: v as FontFamily })}
          />
          <Hint>본문 글꼴. 차량번호·금액 등 모노 셀은 별도 유지. 클릭하면 즉시 미리보기.</Hint>
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
      style={{ borderRadius: 0, border: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}
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
  value, options, onChange, wrap,
}: {
  value: string;
  options: Array<{ value: string; label: string; icon?: React.ReactNode }>;
  onChange: (v: string) => void;
  wrap?: boolean;
}) {
  return (
    <div style={{
      display: 'inline-flex',
      flexWrap: wrap ? 'wrap' : 'nowrap',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      overflow: 'hidden',
      gap: wrap ? 0 : undefined,
    }}>
      {options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={value === o.value ? 'btn btn-primary' : 'btn'}
          style={{
            borderRadius: 0,
            border: 'none',
            borderRight: !wrap && i < options.length - 1 ? '1px solid var(--border)' : 'none',
            borderTop: wrap && i >= 5 ? '1px solid var(--border)' : 'none',
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}
        >
          {o.icon}{o.label}
        </button>
      ))}
    </div>
  );
}
