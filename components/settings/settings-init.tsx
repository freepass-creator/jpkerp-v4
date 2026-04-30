'use client';

import { useEffect } from 'react';
import { initSettingsOnce } from '@/lib/use-settings';

/** 마운트 즉시 사용자 설정을 :root에 적용. layout 에 한 번만 둠. */
export function SettingsInit() {
  useEffect(() => { initSettingsOnce(); }, []);
  return null;
}
