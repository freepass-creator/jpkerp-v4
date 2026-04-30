'use client';

import { useEffect, useState } from 'react';

/**
 * 사용자 환경설정 — localStorage 영구 저장 + :root CSS 변수 즉시 반영.
 *
 * 설정 항목:
 *   · theme        — light / dark / auto (시스템 따라감)
 *   · fontFamily   — mono(Consolas+굴림체) / sans(Pretendard) / system
 *   · fontSize     — 11~14px (테이블 밀도)
 *   · density      — compact / comfortable (행 높이)
 *
 * 적용:
 *   - <html data-theme="dark"> 토글로 다크모드 색상 변수 스왑
 *   - --font / --font-mono / --font-size CSS 변수 직접 set
 */

export type Theme = 'light' | 'dark' | 'auto';
export type FontFamily =
  | 'mono'           // Consolas + 굴림체 — ERP 기본
  | 'pretendard'     // Pretendard Variable
  | 'noto'           // Noto Sans KR
  | 'spoqa'          // Spoqa Han Sans Neo
  | 'nanum'          // 나눔고딕
  | 'nanum-square'   // 나눔스퀘어 라운드
  | 'ibm-plex'       // IBM Plex Sans KR
  | 'gowun'          // 고운돋움 (Gowun Dodum)
  | 'system';        // OS 기본
export type FontSize = 11 | 12 | 13 | 14;
export type Density = 'compact' | 'comfortable';

export type Settings = {
  theme: Theme;
  fontFamily: FontFamily;
  fontSize: FontSize;
  density: Density;
};

const DEFAULTS: Settings = {
  theme: 'light',
  fontFamily: 'mono',
  fontSize: 12,
  density: 'compact',
};

const STORAGE_KEY = 'jpkerp-v4:settings';

const FONT_STACKS: Record<FontFamily, { font: string; mono: string }> = {
  mono: {
    font: "Consolas, 'GulimChe', '굴림체', 'Segoe UI', sans-serif",
    mono: "Consolas, 'GulimChe', '굴림체', 'Menlo', monospace",
  },
  pretendard: {
    font: "'Pretendard Variable', Pretendard, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif",
    mono: "Consolas, 'JetBrains Mono', 'Menlo', monospace",
  },
  noto: {
    font: "'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif",
    mono: "Consolas, 'JetBrains Mono', monospace",
  },
  spoqa: {
    font: "'Spoqa Han Sans Neo', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif",
    mono: "Consolas, 'JetBrains Mono', monospace",
  },
  nanum: {
    font: "'Nanum Gothic', '나눔고딕', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif",
    mono: "Consolas, 'D2Coding', 'Menlo', monospace",
  },
  'nanum-square': {
    font: "'Nanum Square Round', '나눔스퀘어라운드', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif",
    mono: "Consolas, 'D2Coding', 'Menlo', monospace",
  },
  'ibm-plex': {
    font: "'IBM Plex Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif",
    mono: "'IBM Plex Mono', Consolas, monospace",
  },
  gowun: {
    font: "'Gowun Dodum', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif",
    mono: "Consolas, 'JetBrains Mono', monospace",
  },
  system: {
    font: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif",
    mono: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  },
};

const DENSITY_VARS: Record<Density, Record<string, string>> = {
  compact:     { '--row-height': '30px', '--input-height': '26px', '--button-height': '26px', '--cell-padding': '6px 8px' },
  comfortable: { '--row-height': '36px', '--input-height': '32px', '--button-height': '32px', '--cell-padding': '8px 10px' },
};

function load(): Settings {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return DEFAULTS;
  }
}

function save(s: Settings) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

/** 시스템 다크모드 매체 쿼리 — 'auto' 일 때 사용. */
function systemPrefersDark(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Settings → DOM 반영 (data-theme + CSS 변수). */
function apply(s: Settings) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;

  // theme
  const dark = s.theme === 'dark' || (s.theme === 'auto' && systemPrefersDark());
  root.dataset.theme = dark ? 'dark' : 'light';

  // font
  const stack = FONT_STACKS[s.fontFamily];
  root.style.setProperty('--font', stack.font);
  root.style.setProperty('--font-mono', stack.mono);
  root.style.setProperty('--font-size', `${s.fontSize}px`);

  // density
  const d = DENSITY_VARS[s.density];
  for (const [k, v] of Object.entries(d)) root.style.setProperty(k, v);
}

let cache: Settings = DEFAULTS;
let initialized = false;
const listeners = new Set<(s: Settings) => void>();

function ensureInit() {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  cache = load();
  apply(cache);
  // 시스템 다크모드 토글 추적 — theme='auto' 일 때만 의미 있음
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (cache.theme === 'auto') apply(cache);
  });
}

export function useSettings() {
  const [settings, setLocal] = useState<Settings>(() => {
    ensureInit();
    return cache;
  });

  useEffect(() => {
    ensureInit();
    const fn = (s: Settings) => setLocal(s);
    listeners.add(fn);
    setLocal(cache);
    return () => { listeners.delete(fn); };
  }, []);

  function update(patch: Partial<Settings>) {
    cache = { ...cache, ...patch };
    save(cache);
    apply(cache);
    listeners.forEach((l) => l(cache));
  }

  function reset() {
    cache = { ...DEFAULTS };
    save(cache);
    apply(cache);
    listeners.forEach((l) => l(cache));
  }

  return { settings, update, reset };
}

/** layout 등 클라이언트 컴포넌트에서 마운트 1회 호출 — settings를 즉시 적용. */
export function initSettingsOnce() { ensureInit(); }
