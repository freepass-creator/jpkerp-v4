'use client';

import { useRef, useState } from 'react';
import { runWithConcurrency } from './parallel';

/**
 * 도메인 무관 OCR 배치 훅 — 자산·과태료·회사 등 공통 사용.
 *
 * 흐름: handleFiles → (옵션) PDF 분할 → placeholder 행 추가 → /api/ocr/extract 병렬 호출
 *      → applyResult 로 도메인 데이터 채우기 → 행 _status: 'done' | 'failed'
 *
 *   const ocr = useOcrBatch<MyWorkItem>({
 *     docType: 'vehicle_reg',
 *     createPlaceholder: (file, id) => ({ id, fileName: file.name, _status: 'pending', data: {} }),
 *     applyResult: (prev, raw, allItems) => ({ ...prev, data: mapResult(raw) }),
 *   });
 *   <OcrUploadStage progress={ocr.progress} onFiles={ocr.handleFiles} ... />
 */

export type OcrBatchStatus = 'pending' | 'done' | 'failed';

/** 모든 도메인 WorkItem이 충족해야 하는 최소 형태. */
export interface OcrBatchItem {
  id: string;
  fileName: string;
  _status: OcrBatchStatus;
  _error?: string;
}

type Options<W extends OcrBatchItem> = {
  /** /api/ocr/extract 의 type 파라미터 (vehicle_reg / penalty / business_reg ...) */
  docType: string;
  /** placeholder 행 생성 — 파일 + 고유 ID 받아 초기 WorkItem 반환 (status는 항상 'pending').
   *  PDF→이미지 변환 등 비동기 전처리가 필요하면 Promise 반환. */
  createPlaceholder: (file: File, id: string) => W | Promise<W>;
  /** OCR 성공 시 prev WorkItem + raw + 동일 배치 다른 항목들 → 새 WorkItem 반환 */
  applyResult: (prev: W, raw: Record<string, unknown>, allItems: ReadonlyArray<W>) => W;
  /** 동시성 (default 30) */
  concurrency?: number;
  /** 파일 expand (예: PDF 페이지별 분할). 없으면 file 그대로 1:1. */
  expandFile?: (file: File) => Promise<File[]>;
};

export function useOcrBatch<W extends OcrBatchItem>(opts: Options<W>) {
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const [items, setItems] = useState<W[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  function reset() { setItems([]); setBusy(false); setProgress(null); }
  function removeItem(id: string) { setItems((p) => p.filter((i) => i.id !== id)); }

  async function handleFiles(files: FileList | File[]) {
    const arr = Array.from(files);
    if (arr.length === 0) return;
    const O = optsRef.current;
    setBusy(true);

    // 1) PDF 분할 등 파일 확장 (선택)
    const expanded: File[] = [];
    if (O.expandFile) {
      for (const f of arr) {
        try { expanded.push(...await O.expandFile(f)); }
        catch { expanded.push(f); }
      }
    } else {
      expanded.push(...arr);
    }

    // 2) placeholder 행을 한꺼번에 추가 (createPlaceholder 가 async 인 경우도 지원)
    const stamp = Date.now();
    const placeholders: W[] = await Promise.all(
      expanded.map((f, i) => Promise.resolve(O.createPlaceholder(f, `p-${stamp}-${i}-${Math.random().toString(36).slice(2, 5)}`))),
    );
    setItems((prev) => [...prev, ...placeholders]);
    setProgress((p) => ({ done: p?.done ?? 0, total: (p?.total ?? 0) + expanded.length }));

    // 3) 동시성 제한 병렬 OCR
    try {
      await runWithConcurrency(expanded, O.concurrency ?? 30, async (file, i) => {
        const id = placeholders[i].id;
        try {
          const fd = new FormData();
          fd.append('file', file);
          fd.append('type', O.docType);
          const res = await fetch('/api/ocr/extract', { method: 'POST', body: fd });
          const json = await res.json();
          if (!json.ok) throw new Error(json.error || 'OCR 실패');
          const raw = json.extracted as Record<string, unknown>;
          setItems((prev) => prev.map((it) => {
            if (it.id !== id) return it;
            const applied = optsRef.current.applyResult(it, raw, prev);
            return { ...applied, _status: 'done' as const };
          }));
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[ocr-batch:${O.docType}]`, err);
          setItems((prev) => prev.map((it) => it.id === id ? { ...it, _status: 'failed' as const, _error: msg } : it));
        } finally {
          setProgress((p) => p ? { done: p.done + 1, total: p.total } : null);
        }
      });
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return { items, setItems, busy, progress, handleFiles, removeItem, reset };
}
