'use client';

import Link from 'next/link';
import { UploadSimple, MagnifyingGlass, NotePencil, GearSix } from '@phosphor-icons/react';
import { useAuth } from '@/lib/use-auth';

/**
 * 모바일 직원앱 홈 — 4 메인 액션.
 *
 * 업로드 — 출고/반납/상품화/기타 사진·파일 첨부
 * 조회   — 차량번호/계약번호/이름으로 검색
 * 입력   — 업무일지 카테고리 입력 (현장 응대 기록)
 * 설정   — 사용자 정보, 로그아웃
 */
export default function MobileHome() {
  const { user } = useAuth();
  const name = user?.displayName ?? user?.email?.split('@')[0] ?? '직원';

  return (
    <>
      <header className="m-topbar">
        <div className="m-topbar-title">JPK ERP</div>
        <div className="m-topbar-back" aria-label="현재 사용자">
          {name}
        </div>
      </header>

      <main className="m-main">
        <div className="m-card">
          <div className="m-h1">안녕하세요, {name}님</div>
          <div className="m-lead">현장에서 자주 쓰는 4가지를 빠르게.</div>
        </div>

        <div className="m-action-grid">
          <Link href="/m/upload" className="m-action-tile">
            <span className="m-action-tile-icon"><UploadSimple size={22} weight="duotone" /></span>
            <div>
              <div className="m-action-tile-label">업로드</div>
              <div className="m-action-tile-sub">출고/반납/상품화 사진</div>
            </div>
          </Link>
          <Link href="/m/search" className="m-action-tile">
            <span className="m-action-tile-icon"><MagnifyingGlass size={22} weight="duotone" /></span>
            <div>
              <div className="m-action-tile-label">조회</div>
              <div className="m-action-tile-sub">차량/계약/이름 검색</div>
            </div>
          </Link>
          <Link href="/journal" className="m-action-tile">
            <span className="m-action-tile-icon"><NotePencil size={22} weight="duotone" /></span>
            <div>
              <div className="m-action-tile-label">입력</div>
              <div className="m-action-tile-sub">업무일지 작성</div>
            </div>
          </Link>
          <Link href="/m/settings" className="m-action-tile">
            <span className="m-action-tile-icon"><GearSix size={22} weight="duotone" /></span>
            <div>
              <div className="m-action-tile-label">설정</div>
              <div className="m-action-tile-sub">계정 / 로그아웃</div>
            </div>
          </Link>
        </div>
      </main>
    </>
  );
}
