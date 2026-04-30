'use client';

import { useMemo } from 'react';
import type { SubTab } from '@/components/layout/page-shell';
import type { Asset } from './sample-assets';
import { useAssetStore } from './use-asset-store';

export const ASSET_SUBTABS: SubTab[] = [
  { href: '/asset',            label: '차량등록현황' },
  { href: '/asset/insurance',  label: '보험내역' },
  { href: '/asset/loan',       label: '할부스케줄' },
  { href: '/asset/inspection', label: '검사내역' },
  { href: '/asset/repair',     label: '차량수선' },
  { href: '/asset/gps',        label: 'GPS관리' },
  { href: '/asset/disposal',   label: '자산처분' },
];

const DAY_MS = 24 * 60 * 60 * 1000;

/** 검사 만기 임박 (오늘 ~ 30일 이내, 또는 이미 만기 경과) — 정비/점검 필요 신호. */
function inspectionPending(assets: readonly Asset[]): number {
  const horizon = Date.now() + 30 * DAY_MS;
  return assets.filter((a) => {
    if (!a.inspectionTo) return false;
    const t = Date.parse(a.inspectionTo);
    return Number.isFinite(t) && t <= horizon;
  }).length;
}

/**
 * sub-tab href별 미결 카운트. 0이면 빨간 dot 안 나오게 한다.
 * 추후 보험/할부/수선/처분 store 추가되면 여기서 합산.
 */
export function computeAssetSubtabPending(assets: readonly Asset[]): Record<string, number> {
  return {
    '/asset/insurance':  0,
    '/asset/loan':       0,
    '/asset/inspection': inspectionPending(assets),
    '/asset/repair':     0,
    '/asset/disposal':   0,
  };
}

/** 자산 sub-tab pending 카운트 — 모든 자산 sub 페이지에서 공통 사용. */
export function useAssetSubtabPending(): Record<string, number> {
  const [assets] = useAssetStore();
  return useMemo(() => computeAssetSubtabPending(assets), [assets]);
}
