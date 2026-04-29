/**
 * PDF 1페이지짜리를 이미지(JPEG dataURL)로 렌더링.
 * pdfjs-dist는 ~1MB라 lazy import. worker는 CDN(unpkg)에서 로드해서 별도 설정 없이 사용.
 *
 * 과태료 변경부과 PDF에 고지서 원본을 박을 때, jsPDF.addImage는 PDF dataURL을 못 읽으므로
 * 업로드 시 PDF는 이 함수로 이미지화해서 저장한다.
 */

let workerSetupDone = false;

async function ensurePdfjs() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfjs: any = await import('pdfjs-dist');
  if (!workerSetupDone) {
    pdfjs.GlobalWorkerOptions.workerSrc =
      `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
    workerSetupDone = true;
  }
  return pdfjs;
}

export async function pdfFirstPageToImageDataUrl(file: File, scale = 2): Promise<string> {
  const pdfjs = await ensurePdfjs();
  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  try {
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2d context 획득 실패');
    await page.render({ canvasContext: ctx, viewport }).promise;
    return canvas.toDataURL('image/jpeg', 0.92);
  } finally {
    pdf.destroy?.();
  }
}

/** 업로드된 파일을 이미지 dataURL로 — PDF면 렌더링, 이미지면 그대로 */
export async function fileToImageDataUrl(file: File): Promise<string> {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (isPdf) {
    return pdfFirstPageToImageDataUrl(file);
  }
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error ?? new Error('파일 읽기 실패'));
    r.readAsDataURL(file);
  });
}
