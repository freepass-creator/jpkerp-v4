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
