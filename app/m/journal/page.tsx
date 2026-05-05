'use client';

/**
 * 모바일 입력 — 업무일지 카테고리별 빠른 입력.
 * (PC /journal 의 단순화 모바일 버전 — 추후 카테고리 폼 포팅)
 */
export default function MobileJournalPage() {
  return (
    <>
      <header className="m-topbar">
        <div className="m-topbar-title">입력</div>
      </header>
      <main className="m-main">
        <div className="m-card">
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>업무일지 입력</div>
          <div style={{ color: 'var(--m-text-sub)', fontSize: 13, lineHeight: 1.6 }}>
            PC 의 업무일지 (/journal) 모바일 버전.<br />
            카테고리별 입력 화면 — 추후 포팅 예정.
          </div>
        </div>
      </main>
    </>
  );
}
