'use client';

import { Sun, Moon, Desktop, ArrowCounterClockwise } from '@phosphor-icons/react';
import { PageShell } from '@/components/layout/page-shell';
import { useSettings, type Theme, type FontFamily, type FontSize, type Density } from '@/lib/use-settings';
import { useAuth, logout } from '@/lib/use-auth';

/**
 * 설정 — 사용자별 환경설정.
 *  · 화면: 테마(라이트/다크/자동) · 글꼴 · 글자 크기 · 행 밀도
 *  · 계정: 로그인 정보 + 로그아웃
 *  · 저장: localStorage (디바이스별). 서버 동기화는 추후.
 */
export default function SettingsPage() {
  const { settings, update, reset } = useSettings();
  const { user } = useAuth();

  return (
    <PageShell
      footerLeft={<span className="stat-item">설정 변경은 즉시 반영 — 디바이스에 저장</span>}
      footerRight={
        <button className="btn" onClick={() => { if (confirm('기본값으로 되돌릴까요?')) reset(); }}>
          <ArrowCounterClockwise size={12} weight="bold" /> 기본값
        </button>
      }
    >
      <div style={{ padding: '16px 24px', maxWidth: 720 }}>
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
            <Hint>영문/숫자 가독성과 한글 균형을 결정. 모노 = ERP 톤, sans = 모던, 시스템 = OS 기본.</Hint>
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

        <Section title="계정">
          {user ? (
            <div className="border" style={{ borderColor: 'var(--border)', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div className="text-medium">{user.displayName || user.email}</div>
                <div className="text-weak text-xs mt-1">{user.email}</div>
              </div>
              <button className="btn" onClick={() => { if (confirm('로그아웃할까요?')) logout(); }}>로그아웃</button>
            </div>
          ) : (
            <div className="text-weak">로그인 정보 없음</div>
          )}
        </Section>

        <Section title="추후 지원 예정">
          <ul className="text-weak text-xs" style={{ listStyle: 'disc inside', lineHeight: 1.8 }}>
            <li>알림 설정 — 미납·만기·검사 알림 채널 선택</li>
            <li>회사 기본값 — 주력 회사 코드 자동 선택</li>
            <li>단축키 — 자주 쓰는 메뉴 빠른 이동</li>
            <li>서버 동기화 — 디바이스 간 설정 공유</li>
          </ul>
        </Section>
      </div>
    </PageShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <h3 style={{ fontSize: 13, marginBottom: 10, fontWeight: 'var(--font-weight-medium)', color: 'var(--text-main)' }}>{title}</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
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
            borderRight: i < options.length - 1 ? '1px solid var(--border)' : 'none',
            borderTop: 'none', borderBottom: 'none', borderLeft: 'none',
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}
        >
          {o.icon}{o.label}
        </button>
      ))}
    </div>
  );
}
