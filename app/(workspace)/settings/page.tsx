'use client';

import { useState, useEffect } from 'react';
import { Sun, Moon, Desktop, ArrowCounterClockwise, User, Wrench, FloppyDisk, CheckCircle, SignOut, Question } from '@phosphor-icons/react';
import { PageShell } from '@/components/layout/page-shell';
import { useSettings, type Theme, type FontFamily, type FontSize, type Density } from '@/lib/use-settings';
import { useAuth, logout } from '@/lib/use-auth';
import { useUserProfile, type UserProfile } from '@/lib/use-user-profile';
import { cn } from '@/lib/cn';

/**
 * 설정 — 계정 정보 + 시스템 환경설정.
 *  · 계정 설정: 이름·직급·부서·연락처·근무지·팩스 (명함 정보) — RTDB /users/{uid}/profile
 *  · 시스템 설정: 테마·글꼴·크기·밀도 — localStorage (디바이스별)
 *
 * 모든 액션 버튼 (저장 / 로그아웃 / 기본값) 은 PageShell footer 로 통일 — 페이지 규격.
 */

type Tab = 'account' | 'system' | 'help';

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
    draft.companyName     !== profile.companyName     ||
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
        <div className="chip-group">
          <button
            type="button"
            className={cn('chip', tab === 'account' && 'active')}
            onClick={() => setTab('account')}
          >
            <User size={12} weight="bold" /> 계정 설정
          </button>
          <button
            type="button"
            className={cn('chip', tab === 'system' && 'active')}
            onClick={() => setTab('system')}
          >
            <Wrench size={12} weight="bold" /> 시스템 설정
          </button>
          <button
            type="button"
            className={cn('chip', tab === 'help' && 'active')}
            onClick={() => setTab('help')}
          >
            <Question size={12} weight="bold" /> 사용설명서
          </button>
        </div>
      }
      footerLeft={
        <span className="stat-item">
          {tab === 'account'
            ? (savedAt ? <span className="text-success" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><CheckCircle size={12} weight="fill" /> 저장됨</span> : '계정 정보 — 모든 디바이스 동기화')
            : tab === 'system' ? '시스템 설정 — 이 디바이스에만 저장'
            : 'jpkerp v4 사용설명서 — 페이지·버튼별 안내'}
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
        ) : tab === 'system' ? (
          <button className="btn" onClick={() => { if (confirm('기본값으로 되돌릴까요?')) reset(); }}>
            <ArrowCounterClockwise size={12} weight="bold" /> 기본값
          </button>
        ) : null
      }
    >
      <div className="page-section-narrow">
        {tab === 'account' ? (
          user ? <AccountFields draft={draft} setDraft={setDraft} loading={loading} /> : <div className="text-weak">로그인 정보 없음</div>
        ) : tab === 'system' ? (
          <SystemFields settings={settings} update={update} />
        ) : (
          <HelpManual />
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
      <Section title="회사">
        <div className="form-grid">
          <Field label="회사명 (사이드바 상단·명함 표시)" colSpan={4}>
            <input className="input w-full" value={draft.companyName} onChange={(e) => set('companyName', e.target.value)} placeholder="예: 스위치플랜(주) / 본사" disabled={loading} />
          </Field>
        </div>
      </Section>

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
              { value: 'pretendard',      label: 'Pretendard (기본)' },
              { value: 'pretendard-mono', label: 'Pretendard + 영문Consolas' },
              { value: 'mono',            label: 'Consolas + 굴림체' },
              { value: 'noto',            label: 'Noto Sans KR' },
              { value: 'spoqa',           label: 'Spoqa Han Sans' },
              { value: 'nanum',           label: '나눔고딕' },
              { value: 'nanum-square',    label: '나눔스퀘어' },
              { value: 'ibm-plex',        label: 'IBM Plex KR' },
              { value: 'gowun',           label: '고운돋움' },
              { value: 'system',          label: '시스템 기본' },
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

/* ─── 사용설명서 ─── */
function HelpManual() {
  return (
    <>
      <Section title="시작하기">
        <Steps>
          <Step n={1} title="회사 등록" desc="일반관리 → 회사정보 → [+ 회사 등록]. 사업자등록증 OCR 또는 수기 입력. 회사가 없으면 자산·계약 모두 미매칭." />
          <Step n={2} title="자산(차량) 등록" desc="자산관리 → [+ 자산등록]. 자동차등록증 다중 업로드 → OCR 즉시 분석 → 법인번호로 회사 자동 매칭. VIN/차량번호 중복 자동 차단." />
          <Step n={3} title="계약 등록" desc="계약관리 → [+ 계약등록]. 3 모드: ① 계약서 OCR 다건 ② 시트(TSV) 다건 ③ 개별 입력. 계약 등록 시 수납 스케줄 + 출고 이벤트 자동 생성." />
          <Step n={4} title="출고 처리" desc="계약스케줄에서 출고 이벤트 [완료]. 매칭 자산 상태 → 운행중. (개발도구 [출고생성] 일괄 처리 가능)" />
          <Step n={5} title="수납 관리" desc="만기 도래 회차는 미납으로 분류. 업무현황 → 미납현황 에서 일괄 확인." />
        </Steps>
      </Section>

      <Section title="페이지 안내">
        <PageGuide
          title="업무작성"
          desc="직원 일상 입력 작업장. 카테고리별(고객응대/입출고/차량수선/사고접수/시동제어 등) 폼이 다름."
          buttons={[
            ['카테고리 chip', '입력할 카테고리 선택'],
            ['차량번호 입력', '자산에서 자동완성'],
            ['등록', '입력 즉시 RTDB 저장 — 새로고침 후에도 유지'],
          ]}
        />
        <PageGuide
          title="업무현황"
          desc="4개 sub-tab. 빨간 dot 은 처리 필요한 건수가 있다는 의미."
          buttons={[
            ['미결업무', '검사만기·미수납·출고미완 모두 모음. D-day 색상 코딩'],
            ['미납현황', '계약 단위 미납 회차/금액/최장 연체일'],
            ['휴차현황', '활성 운행중 계약 없는 자산. 운행중미매칭 = 정합성 경보'],
            ['업무일지', '업무작성에서 입력한 모든 기록 누적'],
          ]}
        />
        <PageGuide
          title="자산관리"
          desc="차량등록현황 / 보험내역 / 할부스케줄 / 검사내역 / 차량수선 / GPS관리 / 자산처분."
          buttons={[
            ['+ 자산등록', '자동차등록증 OCR (다건) 또는 수기 입력'],
            ['수정 / 복사 / 삭제', '행 선택 후 푸터 우측'],
            ['검사내역 빨간 dot', '30일 이내 만기 자산 있을 때'],
          ]}
        />
        <PageGuide
          title="계약관리"
          desc="계약현황 / 휴차현황 / 임차인정보 / 계약스케줄 / 미납 / 반납예정 / 만기도래 / 종료계약."
          buttons={[
            ['+ 계약등록', 'OCR 다건 / 시트 다건 / 개별 입력 통합 다이얼로그'],
            ['계약스케줄', '회차별 수납·출고·검사 이행 추적'],
            ['시트 (다건)', '구글시트 헤더+예시 복사 → 시트 작성 → TSV 붙여넣기'],
          ]}
        />
        <PageGuide
          title="재무관리"
          desc="계좌내역 / 자동이체 / 카드결제 / 자금일보 / 수납내역 / 지출내역 / 세금계산서."
          buttons={[
            ['계좌내역 업로드', '엑셀/CSV 형식 인식 자동 매핑'],
          ]}
        />
        <PageGuide
          title="일반관리"
          desc="회사정보 / 직원관리 / 근태관리 / 휴가관리."
          buttons={[
            ['+ 회사 등록', '사업자등록증 OCR + 계좌·카드 추가'],
            ['수정', '회사코드는 한 번 부여 후 변경 불가'],
          ]}
        />
        <PageGuide
          title="과태료 업무"
          desc="고지서 OCR → 변경부과 PDF 생성 → 임차인 통지."
          buttons={[
            ['+ 고지서 등록', 'PDF 다건 업로드. PDF는 페이지별 분할. 차량번호로 계약 자동 매칭'],
            ['변경부과 PDF', '회사 × 발급기관 단위 그룹별 zip 다운로드'],
          ]}
        />
        <PageGuide
          title="개발도구 (관리자)"
          desc="RTDB 데이터 점검·정리 + 시드 도구."
          buttons={[
            ['수납생성', '모든 계약의 만기 도래 회차 일괄 완료 처리 (데모 데이터)'],
            ['출고생성', '모든 계약 출고 완료 + 매칭 자산 운행중 전환'],
            ['데이터 삭제', '회사·자산·계약·계좌내역 체크박스 선택 또는 모두 삭제'],
            ['행별 [X]', '단건 삭제'],
          ]}
        />
      </Section>

      <Section title="공통 UX">
        <ul className="help-list">
          <li><strong>OCR 흐름</strong> — 파일 업로드 즉시 분석 시작 (분석 시작 버튼 X). 진행 카운터 + 행별 상태 배지 (분석중/오류/중복/미매칭/신규).</li>
          <li><strong>회사 매칭</strong> — 자산 OCR 은 등록증의 법인번호 → 회사. 계약 OCR 은 차량번호 → 등록 자산 → 회사.</li>
          <li><strong>중복 검증</strong> — 자산은 차대번호(VIN) 1순위, 차량번호 2순위. 과태료는 고지서번호 1순위.</li>
          <li><strong>다이얼로그 푸터</strong> — 길어져도 [취소] [등록] 버튼 항상 하단 고정 (sticky).</li>
          <li><strong>빨간 dot</strong> — 서브탭 우상단 작은 빨간 점은 미결 카운트 &gt; 0 신호.</li>
          <li><strong>다크모드</strong> — 설정 → 시스템 설정 → 테마. 자동(시스템 따라가기) 가능.</li>
          <li><strong>글꼴</strong> — 9종 (Pretendard, Noto Sans KR, Spoqa, 나눔고딕, IBM Plex 등). 즉시 미리보기.</li>
        </ul>
      </Section>

      <Section title="문제 발생 시">
        <ul className="help-list">
          <li><strong>"권한 없음" alert</strong> — Firebase Console → Realtime Database → Rules 에서 해당 노드 권한 확인. 신규 노드 추가 시 관리자 알림.</li>
          <li><strong>저장 후 새로고침 시 사라짐</strong> — Rules 미적용 가능성. 또는 alert 가 떴는데 닫혔을 수 있음. Console 빨간 에러 확인.</li>
          <li><strong>OCR 실패</strong> — 파일이 너무 크거나 (Vercel Hobby 10초 제한), 이미지 화질이 낮을 때. 행 우측 [X] 로 제거 후 재업로드.</li>
          <li><strong>회사코드 미매칭</strong> — 회사를 먼저 등록했는지, 법인번호가 등록증과 일치하는지 확인.</li>
        </ul>
      </Section>
    </>
  );
}

function Steps({ children }: { children: React.ReactNode }) {
  return <ol style={{ display: 'flex', flexDirection: 'column', gap: 10, listStyle: 'none' }}>{children}</ol>;
}
function Step({ n, title, desc }: { n: number; title: string; desc: string }) {
  return (
    <li style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <span className="badge badge-blue" style={{ flexShrink: 0, padding: '0 8px' }}>{n}</span>
      <div>
        <div className="text-medium">{title}</div>
        <div className="text-weak text-xs mt-1">{desc}</div>
      </div>
    </li>
  );
}
function PageGuide({ title, desc, buttons }: { title: string; desc: string; buttons: Array<[string, string]> }) {
  return (
    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
      <div className="text-medium">{title}</div>
      <div className="text-weak text-xs mt-1">{desc}</div>
      {buttons.length > 0 && (
        <ul className="help-list" style={{ marginTop: 6 }}>
          {buttons.map(([label, hint]) => (
            <li key={label}><strong>{label}</strong> — <span className="text-sub">{hint}</span></li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ─── 공용 컴포넌트 ─── */

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
  // wrap=true 일 때는 chip 그리드 — 각 버튼이 독립 박스로 명확히 보임.
  // wrap=false (3~4개) 는 segmented (붙어있는 토글바) 유지.
  if (wrap) {
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={value === o.value ? 'btn btn-primary' : 'btn'}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            {o.icon}{o.label}
          </button>
        ))}
      </div>
    );
  }
  return (
    <div style={{
      display: 'inline-flex',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      overflow: 'hidden',
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
