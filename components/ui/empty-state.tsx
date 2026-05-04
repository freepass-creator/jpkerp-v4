'use client';

import type { ReactNode } from 'react';
import type { Icon } from '@phosphor-icons/react';
import { CheckCircle } from '@phosphor-icons/react';

/**
 * 빈 상태 표시 — 페이지에 데이터 없을 때 통일된 안내.
 *
 * 두 가지 유형:
 *  · '데이터 없음'  — 처음 시작하는 단계, 다음 행동 안내 + CTA 버튼 (선택)
 *  · '결과 없음'   — 조건/필터로 0건 (filtered/done 상태)
 *
 *   <EmptyState
 *     icon={Car}
 *     title="등록된 자산 없음"
 *     description="자동차등록증 OCR 업로드로 자산을 등록하세요."
 *     hint="[+ 자산등록] 버튼 클릭 → PDF/이미지 다중 업로드 → 즉시 분석"
 *     cta={<button className="btn btn-primary">+ 자산등록</button>}
 *   />
 *
 *   <EmptyState
 *     variant="ok"
 *     icon={CheckCircle}
 *     title="모든 미수 정리됨"
 *     description="계약 만기 도래 회차가 모두 납부 완료 상태입니다."
 *   />
 */

type Variant = 'empty' | 'ok' | 'noresult';

type Props = {
  /** 표시 아이콘 */
  icon?: Icon;
  /** 제목 (한 줄) */
  title: string;
  /** 본문 — 상황 설명 */
  description?: string;
  /** 다음 행동 가이드 — 단계별 텍스트 */
  hint?: ReactNode;
  /** CTA 버튼 (있을 때만) */
  cta?: ReactNode;
  /**
   * 색상 변형:
   *  · empty (기본) — 회색 (시작 안내)
   *  · ok — 초록 체크 (정상 완료)
   *  · noresult — 회색 (필터로 0건)
   */
  variant?: Variant;
};

export function EmptyState({
  icon: IconCmp,
  title,
  description,
  hint,
  cta,
  variant = 'empty',
}: Props) {
  const iconColor =
    variant === 'ok' ? 'var(--alert-green-text)' : 'var(--text-weak)';
  const ResolvedIcon = IconCmp ?? (variant === 'ok' ? CheckCircle : null);

  return (
    <div className="page-section-center">
      {ResolvedIcon && <ResolvedIcon size={32} className="mx-auto" style={{ color: iconColor }} />}
      <div className="mt-2 text-medium">{title}</div>
      {description && <div className="mt-1 text-weak">{description}</div>}
      {hint && (
        <div className="mt-3 text-weak text-xs" style={{ maxWidth: 480, marginInline: 'auto' }}>
          {hint}
        </div>
      )}
      {cta && <div className="mt-4">{cta}</div>}
    </div>
  );
}
