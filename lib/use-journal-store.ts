'use client';

import { createKeyedStore } from './create-keyed-store';
import type { JournalEntry } from './sample-journal';

/**
 * 업무일지 영구 저장소 — Firebase RTDB. RTDB 노드는 **id 를 키로 하는 객체**:
 *   journal_entries/{entryId}/{...}
 * legacy 배열도 read 시 호환 처리.
 */
const { useStore } = createKeyedStore<JournalEntry>({
  path: 'journal_entries',
  getKey: (e) => e.id,
  storeName: 'journal-store',
  alertLabel: '업무일지',
});

export const useJournalStore = useStore;
