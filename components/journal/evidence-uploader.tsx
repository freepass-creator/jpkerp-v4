'use client';

import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { Upload, Paperclip, X, Image as ImageIcon, FilePdf } from '@phosphor-icons/react';
import { uploadFiles } from '@/lib/firebase/storage';

export interface EvidenceUploaderHandle {
  /** 폼 제출 시 호출 — 모든 첨부파일 업로드 후 download URL 배열 반환 */
  commitUpload: (basePath: string) => Promise<string[]>;
  getFiles: () => File[];
  clear: () => void;
}

interface Props {
  label?: string;
  accept?: string;
  /** 다중 파일 가능 여부 */
  multiple?: boolean;
}

/**
 * 정비/사고수리/상품화 등에서 영수증·견적서·사진 등 증빙 파일 업로드.
 * 등록 시 forwardRef 의 commitUpload 호출 → Firebase Storage 업로드 후 URL 배열 반환.
 * 파일은 등록 클릭 전까지 메모리에만 보유.
 */
export const EvidenceUploader = forwardRef<EvidenceUploaderHandle, Props>(function EvidenceUploader(
  { label = '증빙 파일 (영수증·견적서·사진)', accept = 'image/*,application/pdf', multiple = true },
  ref,
) {
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    commitUpload: async (basePath: string) => {
      if (files.length === 0) return [];
      return await uploadFiles(basePath, files);
    },
    getFiles: () => files,
    clear: () => setFiles([]),
  }), [files]);

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const arr = Array.from(newFiles);
    setFiles((prev) => (multiple ? [...prev, ...arr] : arr.slice(0, 1)));
  }, [multiple]);

  function removeAt(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  function fileIcon(f: File) {
    if (f.type.startsWith('image/')) return <ImageIcon size={14} />;
    if (f.type === 'application/pdf') return <FilePdf size={14} />;
    return <Paperclip size={14} />;
  }

  function fileSize(b: number): string {
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
    return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <div style={{
      border: '1px solid var(--border)',
      borderRadius: 4,
      background: dragOver ? 'var(--brand-bg)' : 'var(--bg-card)',
      overflow: 'hidden',
    }}>
      <div className="panel-head">
        <Paperclip size={14} />
        <span>{label}</span>
        {files.length > 0 && <span className="panel-head-right" style={{ color: 'var(--text)', fontWeight: 600 }}>{files.length}건</span>}
      </div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        style={{
          padding: 16,
          textAlign: 'center',
          cursor: 'pointer',
          color: 'var(--text-weak)',
          fontSize: 12,
          borderBottom: files.length > 0 ? '1px solid var(--border-soft)' : 'none',
        }}
      >
        <Upload size={20} style={{ marginBottom: 4, color: 'var(--text-sub)' }} />
        <div>클릭 또는 드래그&드롭 — JPG / PNG / PDF</div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) addFiles(e.target.files);
          e.target.value = '';
        }}
      />
      {files.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {files.map((f, i) => (
            <li key={i} style={{
              padding: '6px 12px',
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              borderBottom: i < files.length - 1 ? '1px solid var(--border-soft)' : 'none',
            }}>
              {fileIcon(f)}
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
              <span className="mono" style={{ color: 'var(--text-weak)', fontSize: 11 }}>{fileSize(f.size)}</span>
              <button
                type="button"
                className="btn"
                onClick={(e) => { e.stopPropagation(); removeAt(i); }}
                style={{ height: 22, width: 22, padding: 0 }}
                title="삭제"
              >
                <X size={11} weight="bold" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});
