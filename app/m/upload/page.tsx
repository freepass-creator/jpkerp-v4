'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, UploadSimple, Camera, Image as ImageIcon, X, CircleNotch, CheckCircle, MagnifyingGlass } from '@phosphor-icons/react';
import { useAssetStore } from '@/lib/use-asset-store';
import { useContractStore } from '@/lib/use-contract-store';
import { useAuth } from '@/lib/use-auth';
import { compressImage } from '@/lib/image-compress';
import { uploadFiles } from '@/lib/firebase/storage';
import { pushEventUpload, type EventUploadKind, type EventUploadFile } from '@/lib/use-event-uploads-store';

/**
 * 모바일 업로드 — 4 카테고리 (출고/반납/상품화/기타) + 차량 + 사진/파일.
 *
 *  · 카메라 직접 촬영 (input capture="environment") + 갤러리 선택
 *  · 이미지 client 압축 (1280px JPEG 80%) → Blob 로컬 보관, 업로드 시 Firebase Storage 전송
 *  · PDF/기타 파일은 원본 그대로 Storage 업로드
 *  · 파일당 5MB 가드, 한 업로드당 10개 cap
 *  · RTDB 에는 download URL 만 저장 (dataUrl 박지 않음)
 */

const KINDS: Array<{ key: EventUploadKind; label: string; sub: string }> = [
  { key: '출고',   label: '출고',   sub: '차량 인도' },
  { key: '반납',   label: '반납',   sub: '차량 회수' },
  { key: '상품화', label: '상품화', sub: '광고/홍보 사진' },
  { key: '기타',   label: '기타',   sub: '사고/정비/응대 등' },
];

const MAX_FILES = 10;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

/** 업로드 큐의 한 항목 — 미리보기는 객체URL, 실제 업로드는 blob */
type FileItem = {
  id: string;
  source: File;
  /** 압축·준비 완료된 상태. null = 처리 중 */
  prepared: {
    blob: Blob;
    previewUrl: string;
    name: string;
    mime: string;
    size: number;
    width?: number;
    height?: number;
  } | null;
  error?: string;
};

export default function MobileUploadPage() {
  const router = useRouter();
  const params = useSearchParams();
  const initialPlate = params?.get('plate') ?? '';

  const { user } = useAuth();
  const [allAssets] = useAssetStore();
  const [allContracts] = useContractStore();
  const assets = useMemo(() => allAssets.filter((a) => !a.deletedAt), [allAssets]);

  const [kind, setKind] = useState<EventUploadKind>('출고');
  const [plate, setPlate] = useState(initialPlate);
  const [plateQ, setPlateQ] = useState('');
  const [files, setFiles] = useState<FileItem[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 자산 후보 — plate 입력 시 자동완성용
  const plateCandidates = useMemo(() => {
    const q = (plateQ || plate).replace(/\s/g, '').toLowerCase();
    if (!q) return assets.slice(0, 8);
    return assets.filter((a) => {
      const fields = [a.plate, a.vehicleName, a.vin].filter(Boolean) as string[];
      return fields.some((f) => f.replace(/\s/g, '').toLowerCase().includes(q));
    }).slice(0, 8);
  }, [assets, plate, plateQ]);

  // 매칭 자산·계약 정보
  const matchedAsset = useMemo(() => assets.find((a) => a.plate === plate.trim()) ?? null, [assets, plate]);
  const matchedContract = useMemo(() => {
    if (!matchedAsset) return null;
    return allContracts.find(
      (c) => !c.deletedAt && c.plate === matchedAsset.plate && c.companyCode === matchedAsset.companyCode
        && c.status !== '만기' && c.status !== '해지'
    ) ?? null;
  }, [allContracts, matchedAsset]);

  async function handleFiles(picked: FileList | null) {
    setError(null);
    if (!picked || picked.length === 0) return;
    const room = MAX_FILES - files.length;
    if (room <= 0) { setError(`최대 ${MAX_FILES}개까지 가능`); return; }
    const list = Array.from(picked).slice(0, room);
    const newItems: FileItem[] = list.map((f) => ({
      id: `f-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      source: f,
      prepared: null,
    }));
    setFiles((prev) => [...prev, ...newItems]);

    // 압축 (이미지) 또는 그대로 (PDF 등) — Blob + 미리보기 URL 만 만들어둠. 실제 업로드는 submit 때.
    for (const item of newItems) {
      try {
        if (item.source.size > MAX_FILE_BYTES * 6) {
          setFiles((prev) => prev.map((f) => f.id === item.id ? { ...f, error: '파일이 너무 큽니다 (>30MB)' } : f));
          continue;
        }
        const isImage = item.source.type.startsWith('image/');
        let prepared: NonNullable<FileItem['prepared']>;
        if (isImage) {
          const c = await compressImage(item.source, { maxWidth: 1280, quality: 0.8 });
          prepared = {
            blob: c.blob,
            previewUrl: URL.createObjectURL(c.blob),
            name: item.source.name.replace(/\.[^.]+$/, '.jpg'),
            mime: 'image/jpeg',
            size: c.size,
            width: c.width,
            height: c.height,
          };
        } else {
          if (item.source.size > MAX_FILE_BYTES) {
            setFiles((prev) => prev.map((f) => f.id === item.id ? { ...f, error: '5MB 초과 — 압축 후 업로드' } : f));
            continue;
          }
          prepared = {
            blob: item.source,
            previewUrl: URL.createObjectURL(item.source),
            name: item.source.name,
            mime: item.source.type || 'application/octet-stream',
            size: item.source.size,
          };
        }
        setFiles((prev) => prev.map((f) => f.id === item.id ? { ...f, prepared } : f));
      } catch (e) {
        setFiles((prev) => prev.map((f) => f.id === item.id ? { ...f, error: (e as Error).message } : f));
      }
    }
  }

  function removeFile(id: string) {
    setFiles((prev) => {
      const target = prev.find((f) => f.id === id);
      if (target?.prepared?.previewUrl) URL.revokeObjectURL(target.prepared.previewUrl);
      return prev.filter((f) => f.id !== id);
    });
  }

  // 컴포넌트 unmount 시 객체 URL 정리
  useEffect(() => {
    return () => {
      for (const f of files) {
        if (f.prepared?.previewUrl) URL.revokeObjectURL(f.prepared.previewUrl);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // submit
  const ready = !!plate.trim() && files.length > 0 && files.every((f) => f.prepared && !f.error);
  const totalBytes = files.reduce((s, f) => s + (f.prepared?.size ?? 0), 0);

  async function handleSubmit() {
    if (!ready || !user) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const prepared = files.map((f) => f.prepared!).filter(Boolean);
      // 1) Firebase Storage 업로드 — event_uploads/{plate}/{ts}/{filename}
      const ts = Date.now();
      const safePlate = plate.trim().replace(/[^\w가-힣\-]/g, '_') || 'no-plate';
      const basePath = `event_uploads/${safePlate}/${ts}`;
      const filesToUpload = prepared.map((p) => new File([p.blob], p.name, { type: p.mime }));
      const urls = await uploadFiles(basePath, filesToUpload);

      // 2) RTDB entry 에는 download URL 만
      const validFiles: EventUploadFile[] = prepared.map((p, i) => ({
        url: urls[i],
        storagePath: `${basePath}/${p.name}`,
        name: p.name,
        size: p.size,
        mime: p.mime,
        width: p.width,
        height: p.height,
      }));
      const id = await pushEventUpload({
        at: new Date().toISOString(),
        uploader: { uid: user.uid, email: user.email ?? undefined, name: user.displayName ?? undefined },
        companyCode: matchedAsset?.companyCode,
        plate: plate.trim(),
        kind,
        files: validFiles,
        note: note.trim() || undefined,
      });

      setInfo(`업로드 완료 (${validFiles.length}건${id ? ` · ${id.slice(-6)}` : ''})`);
      // 객체 URL 해제 + reset
      for (const f of files) {
        if (f.prepared?.previewUrl) URL.revokeObjectURL(f.prepared.previewUrl);
      }
      setFiles([]);
      setNote('');
      setTimeout(() => setInfo(null), 1800);
    } catch (e) {
      setError(`업로드 실패: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  // 차량 입력 시 자동 닫힘 timer
  const [showCandidates, setShowCandidates] = useState(false);
  useEffect(() => { if (initialPlate) setShowCandidates(false); }, [initialPlate]);

  return (
    <>
      <header className="m-topbar">
        <button type="button" className="m-topbar-back" onClick={() => router.push('/m')}>
          <ArrowLeft size={16} weight="bold" /> 홈
        </button>
        <div className="m-topbar-title">업로드</div>
        <span style={{ width: 40 }} />
      </header>

      <main className="m-main">
        {/* 1. 카테고리 */}
        <div>
          <div style={{ fontSize: 13, color: 'var(--m-text-sub)', fontWeight: 600, marginBottom: 8 }}>1. 카테고리</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {KINDS.map((k) => (
              <button
                key={k.key}
                type="button"
                onClick={() => setKind(k.key)}
                style={{
                  padding: '12px 14px',
                  border: kind === k.key ? '1.5px solid var(--m-brand)' : '1px solid var(--m-border)',
                  background: kind === k.key ? 'var(--m-brand-soft)' : 'var(--m-card)',
                  color: kind === k.key ? 'var(--m-brand)' : 'var(--m-text)',
                  borderRadius: 8, fontFamily: 'inherit', cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div style={{ fontSize: 15, fontWeight: 700 }}>{k.label}</div>
                <div style={{ fontSize: 12, color: kind === k.key ? 'var(--m-brand)' : 'var(--m-text-sub)', opacity: 0.85 }}>{k.sub}</div>
              </button>
            ))}
          </div>
        </div>

        {/* 2. 차량 선택 */}
        <div>
          <div style={{ fontSize: 13, color: 'var(--m-text-sub)', fontWeight: 600, marginBottom: 8 }}>2. 차량</div>
          <div className="m-search-bar">
            <MagnifyingGlass size={18} className="m-search-icon" />
            <input
              type="search"
              inputMode="search"
              placeholder="차량번호 / 차명 / VIN"
              value={plate}
              onChange={(e) => { setPlate(e.target.value); setPlateQ(e.target.value); setShowCandidates(true); }}
              onFocus={() => setShowCandidates(true)}
            />
          </div>
          {showCandidates && plateCandidates.length > 0 && plate !== matchedAsset?.plate && (
            <div className="m-result-list" style={{ marginTop: 6 }}>
              {plateCandidates.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className="m-result-row"
                  style={{ textAlign: 'left' }}
                  onClick={() => { setPlate(a.plate); setShowCandidates(false); }}
                >
                  <div className="m-result-row-head">
                    <span className="m-result-plate">{a.plate}</span>
                    <span className="m-result-status">{a.status}</span>
                  </div>
                  <div className="m-result-meta">{a.vehicleName ?? '-'} · {a.companyCode}</div>
                </button>
              ))}
            </div>
          )}
          {matchedAsset && plate === matchedAsset.plate && (
            <div className="m-card" style={{ marginTop: 6, padding: '12px 14px' }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{matchedAsset.plate} · {matchedAsset.vehicleName ?? '-'}</div>
              {matchedContract && (
                <div style={{ fontSize: 13, color: 'var(--m-text-sub)', marginTop: 2 }}>
                  계약 {matchedContract.contractNo} · {matchedContract.customerName}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 3. 사진/파일 */}
        <div>
          <div style={{ fontSize: 13, color: 'var(--m-text-sub)', fontWeight: 600, marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
            <span>3. 사진/파일</span>
            <span className="text-weak">
              {files.length}/{MAX_FILES} · {(totalBytes / 1024).toFixed(0)}KB
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <label style={tileStyle()}>
              <Camera size={20} weight="duotone" />
              <span style={{ fontSize: 14, fontWeight: 600 }}>카메라 촬영</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: 'none' }}
                onChange={(e) => handleFiles(e.target.files)}
              />
            </label>
            <label style={tileStyle()}>
              <ImageIcon size={20} weight="duotone" />
              <span style={{ fontSize: 14, fontWeight: 600 }}>갤러리 선택</span>
              <input
                type="file"
                accept="image/*,.pdf"
                multiple
                style={{ display: 'none' }}
                onChange={(e) => handleFiles(e.target.files)}
              />
            </label>
          </div>

          {files.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
              {files.map((f) => (
                <div key={f.id} style={{ position: 'relative', aspectRatio: '1 / 1', background: 'var(--m-divider)', borderRadius: 6, overflow: 'hidden' }}>
                  {f.prepared?.previewUrl && f.prepared.mime.startsWith('image/') ? (
                    <img src={f.prepared.previewUrl} alt={f.prepared.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : f.prepared ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 11, color: 'var(--m-text-sub)', padding: 4, textAlign: 'center' }}>
                      {f.prepared.name}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                      <CircleNotch size={20} className="auth-spin" style={{ color: 'var(--m-text-weak)' }} />
                    </div>
                  )}
                  {f.error && (
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(220, 38, 38, 0.9)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, padding: 4, textAlign: 'center' }}>
                      {f.error}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => removeFile(f.id)}
                    style={{
                      position: 'absolute', top: 2, right: 2,
                      width: 22, height: 22, borderRadius: '50%',
                      background: 'rgba(0,0,0,0.6)', color: '#fff',
                      border: 0, padding: 0, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <X size={12} weight="bold" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 4. 메모 */}
        <div>
          <div style={{ fontSize: 13, color: 'var(--m-text-sub)', fontWeight: 600, marginBottom: 8 }}>4. 메모 (선택)</div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="외관 상태 / 주행거리 / 특이사항 등"
            rows={3}
            style={{
              width: '100%', padding: '12px 14px',
              fontSize: 14, fontFamily: 'inherit',
              border: '1.5px solid var(--m-border)', borderRadius: 8,
              background: 'var(--m-card)', color: 'var(--m-text)',
              resize: 'vertical',
            }}
          />
        </div>

        {error && <div className="m-card" style={{ background: 'var(--m-danger-bg)', color: 'var(--m-danger)', padding: '10px 14px', fontSize: 14 }}>{error}</div>}
        {info && <div className="m-card" style={{ background: 'var(--m-success-bg)', color: 'var(--m-success)', padding: '10px 14px', fontSize: 14 }}>
          <CheckCircle size={14} weight="bold" style={{ display: 'inline', marginRight: 6 }} />
          {info}
        </div>}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!ready || busy}
          style={{
            marginTop: 4,
            padding: '16px 20px',
            fontSize: 16, fontWeight: 700, fontFamily: 'inherit',
            background: ready && !busy ? 'var(--m-brand)' : 'var(--m-text-weak)',
            color: '#fff', border: 0, borderRadius: 8,
            cursor: ready && !busy ? 'pointer' : 'not-allowed',
          }}
        >
          {busy ? <><CircleNotch size={14} className="auth-spin mr-1" /> 업로드 중...</> : <><UploadSimple size={14} weight="bold" /> {kind} {files.length}건 업로드</>}
        </button>
      </main>
    </>
  );
}

function tileStyle(): React.CSSProperties {
  return {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: 6,
    padding: '18px 12px',
    background: 'var(--m-card)',
    border: '1px solid var(--m-border)',
    borderRadius: 8,
    cursor: 'pointer',
    color: 'var(--m-text)',
  };
}
