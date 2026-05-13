'use client';

import { useEffect, useRef } from 'react';

/**
 * useKeepAwake — 백그라운드 throttle 완화.
 *
 *   const ocr = useOcrBatch(...)
 *   useKeepAwake(ocr.busy, { titleAlert: 'OCR 진행 중 — 창 활성 유지' });
 *
 * 동작:
 *   1) active=true 시 navigator.wakeLock.request('screen') — 화면 sleep / 시스템 절전 방지
 *      (탭 hidden 시 자동 release 됨 → visibility 복귀 시 재요청)
 *   2) 탭 hidden + active 인 동안 document.title 을 깜빡임 ▶ 「⚠ OCR... | 원래 제목」
 *      → 사용자가 다른 탭/창에 있어도 브라우저 탭 라벨에 경고 보임
 *   3) cleanup: active=false 또는 unmount 시 wake lock release + title 복원
 *
 * Wake Lock API 지원:
 *   Chrome 84+, Edge 84+, Safari 16.4+, Firefox ❌ (degrade — title 만 작동)
 */
type Sentinel = { release: () => Promise<void>; released: boolean };

export function useKeepAwake(active: boolean, opts?: { titleAlert?: string }) {
  const sentinelRef = useRef<Sentinel | null>(null);
  const originalTitleRef = useRef<string>('');
  const flashTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    async function requestLock() {
      if (sentinelRef.current && !sentinelRef.current.released) return;
      const nav = navigator as unknown as { wakeLock?: { request: (type: string) => Promise<Sentinel> } };
      if (!nav.wakeLock) return;
      try {
        const sentinel = await nav.wakeLock.request('screen');
        sentinelRef.current = sentinel;
      } catch (e) {
        // 사용자 권한 거부 / 비활성 탭 등 — silent (essential 기능 아님)
        console.warn('[keep-awake] wake lock failed', e);
      }
    }

    function releaseLock() {
      const s = sentinelRef.current;
      if (s && !s.released) s.release().catch(() => { /* ignore */ });
      sentinelRef.current = null;
    }

    function startTitleFlash() {
      if (!opts?.titleAlert) return;
      if (flashTimerRef.current) return;
      originalTitleRef.current = document.title;
      let toggle = false;
      flashTimerRef.current = setInterval(() => {
        document.title = toggle ? originalTitleRef.current : `⚠ ${opts.titleAlert} | ${originalTitleRef.current}`;
        toggle = !toggle;
      }, 1000);
    }

    function stopTitleFlash() {
      if (flashTimerRef.current) {
        clearInterval(flashTimerRef.current);
        flashTimerRef.current = null;
      }
      if (originalTitleRef.current) {
        document.title = originalTitleRef.current;
      }
    }

    function onVisibility() {
      if (!active) return;
      if (document.hidden) {
        startTitleFlash();
      } else {
        stopTitleFlash();
        void requestLock();      // hidden 시 release 된 lock 재요청
      }
    }

    if (active) {
      void requestLock();
      document.addEventListener('visibilitychange', onVisibility);
      // 탭이 이미 hidden 상태에서 active 시작 시 즉시 flash
      if (document.hidden) startTitleFlash();
    }

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      stopTitleFlash();
      releaseLock();
    };
  }, [active, opts?.titleAlert]);
}
