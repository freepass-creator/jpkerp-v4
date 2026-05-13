import { getStorage, ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { getFirebaseApp } from './client';

let _storage: ReturnType<typeof getStorage> | null = null;

function getStore() {
  if (!_storage) _storage = getStorage(getFirebaseApp());
  return _storage;
}

/**
 * 파일 다중 업로드. `basePath/timestamp_filename` 으로 저장.
 * @returns downloadURLs
 */
export async function uploadFiles(basePath: string, files: File[]): Promise<string[]> {
  const urls: string[] = [];
  for (const f of files) {
    const safe = f.name.replace(/[^\w.\-가-힣]/g, '_');
    const path = `${basePath}/${Date.now()}_${safe}`;
    const r = storageRef(getStore(), path);
    await uploadBytes(r, f, { contentType: f.type || undefined });
    urls.push(await getDownloadURL(r));
  }
  return urls;
}

export async function deleteFile(url: string): Promise<void> {
  try {
    const r = storageRef(getStore(), url);
    await deleteObject(r);
  } catch {
    /* 이미 삭제됐거나 권한 없음 — 조용히 무시 */
  }
}

/**
 * data: URL (base64) 을 Storage 에 업로드하고 downloadURL 반환.
 *
 *   OCR 결과의 fileDataUrl (등록증·증권 이미지) 같은 큰 base64 를 RTDB 에 박지 않고
 *   Storage 로 옮길 때 사용. RTDB 단일 write 크기 한계 (~10MB) 우회.
 *
 *   const url = await uploadDataUrl('assets/CP01VH0001/cert', dataUrl);
 *   // dataUrl: 'data:image/jpeg;base64,...'
 *   // returns: 'https://firebasestorage.googleapis.com/...'
 */
export async function uploadDataUrl(basePath: string, dataUrl: string): Promise<string> {
  const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!m) throw new Error('uploadDataUrl: not a base64 data URL');
  const [, mime, b64] = m;
  const ext = mime.split('/')[1]?.replace('+xml', '') || 'bin';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const path = `${basePath}.${ext}`;
  const r = storageRef(getStore(), path);
  await uploadBytes(r, bytes, { contentType: mime });
  return getDownloadURL(r);
}
