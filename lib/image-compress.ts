/**
 * 클라이언트 이미지 압축 — RTDB dataUrl 부담 줄이기.
 *
 * 폰 카메라 사진은 4-8MB JPG 가 흔함. base64 + RTDB 저장하면 무거움.
 * 1280px 폭 + JPEG 80% 로 줄이면 보통 200-500KB → 일상 운영에 충분한 화질.
 */

export type CompressOptions = {
  maxWidth?: number;     // default 1280
  maxHeight?: number;    // default 1920
  quality?: number;      // 0-1, default 0.8
  type?: 'image/jpeg' | 'image/webp' | 'image/png';
};

export async function compressImage(file: File, opts: CompressOptions = {}): Promise<{ blob: Blob; width: number; height: number; size: number }> {
  const maxWidth = opts.maxWidth ?? 1280;
  const maxHeight = opts.maxHeight ?? 1920;
  const quality = opts.quality ?? 0.8;
  const type = opts.type ?? 'image/jpeg';

  const bitmap = await fileToImage(file);
  const ratio = Math.min(maxWidth / bitmap.width, maxHeight / bitmap.height, 1);
  const w = Math.round(bitmap.width * ratio);
  const h = Math.round(bitmap.height * ratio);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context 미지원');
  ctx.drawImage(bitmap, 0, 0, w, h);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => {
      if (!b) return reject(new Error('Canvas → Blob 실패'));
      resolve(b);
    }, type, quality);
  });
  return { blob, width: w, height: h, size: blob.size };
}

function fileToImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

/** 이미지 아닌 파일 (PDF 등) — 그대로 dataUrl. 압축 안 함. */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error ?? new Error('파일 읽기 실패'));
    r.readAsDataURL(file);
  });
}
