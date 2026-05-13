/**
 * 엑셀 양식 빌더 — 일괄 등록 양식 다운로드 시 일관 스타일 적용.
 *
 *  · 12px 통일 (시스템 표시 폰트와 동일감)
 *  · 제목/설명 행 상단에 표시
 *  · 헤더 행: 필수 * 표시는 노란 배경 + bold, 부가는 회색 배경
 *  · 금액 컬럼은 천단위 콤마 자동 (`#,##0`)
 *  · 컬럼 폭은 헤더 길이 + 패딩 자동
 *
 * 사용:
 *   const wb = buildTemplate({
 *     title: '계약 일괄 등록',
 *     description: '필수항목 * 표시. 미수금액 입력 시 시스템이 회차 자동 분배.',
 *     headers: CONTRACT_EXCEL_HEADERS,
 *     requiredCount: CONTRACT_EXCEL_REQUIRED.length,
 *     sample: { ... },
 *     numberCols: ['월대여료', '보증금', '선수금', '미수금액', '주행한도'],
 *   });
 *   XLSX.writeFile(wb, fileName);
 */
import type { WorkBook, WorkSheet, CellObject } from 'xlsx';

export type TemplateOptions = {
  /** 시트 이름 (xlsx 시트 탭) */
  sheetName: string;
  /** 상단 표시 제목 (병합 행 1) */
  title: string;
  /** 사용 안내 (병합 행 2~3, 2줄까지 자동 줄바꿈) */
  description?: string;
  /** 헤더 순서. 필수는 `*` 표시 그대로 둠. */
  headers: readonly string[];
  /** 필수 컬럼 개수 — headers 의 앞 N개를 필수로 인식 (노란 배경). */
  requiredCount: number;
  /** 예시 데이터 — 헤더명 → 값. 빈칸은 공백. */
  sample?: Record<string, string | number>;
  /**
   * 천단위 콤마(`#,##0`) 적용할 헤더 이름들 (예: '월대여료', '미수금액').
   * `*` 접미사 포함 가능 — includes 비교.
   */
  numberCols?: readonly string[];
};

/* xlsx-js 호환 셀 스타일 — write 시 cell.s/cell.z 가 그대로 반영. */
const FONT_BASE = { name: '맑은 고딕', sz: 12 };
const FONT_BOLD = { ...FONT_BASE, bold: true };
const FONT_TITLE = { ...FONT_BASE, sz: 14, bold: true };
const FONT_NOTE = { ...FONT_BASE, sz: 11, color: { rgb: '666666' } };

const FILL_REQUIRED = { patternType: 'solid', fgColor: { rgb: 'FFF4CC' } };  // 노란
const FILL_OPTIONAL = { patternType: 'solid', fgColor: { rgb: 'F2F2F2' } };  // 회색
const FILL_TITLE    = { patternType: 'solid', fgColor: { rgb: 'E8F0FE' } };  // 연파랑

const ALIGN_CENTER: { horizontal?: 'center' | 'left' | 'right'; vertical?: 'center' | 'top' | 'bottom'; wrapText?: boolean } = {
  horizontal: 'center', vertical: 'center',
};
const ALIGN_LEFT_WRAP: typeof ALIGN_CENTER = { horizontal: 'left', vertical: 'center', wrapText: true };

const BORDER_THIN = {
  top:    { style: 'thin', color: { rgb: 'BBBBBB' } },
  bottom: { style: 'thin', color: { rgb: 'BBBBBB' } },
  left:   { style: 'thin', color: { rgb: 'BBBBBB' } },
  right:  { style: 'thin', color: { rgb: 'BBBBBB' } },
};

function colLetter(idx: number): string {
  // 0-based → A, B, ..., Z, AA, AB, ...
  let s = '';
  let n = idx;
  while (true) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
    if (n < 0) break;
  }
  return s;
}

export async function buildTemplate(opts: TemplateOptions): Promise<WorkBook> {
  const XLSX = await import('xlsx-js-style');
  const { sheetName, title, description, headers, requiredCount, sample = {}, numberCols = [] } = opts;
  const colCount = headers.length;
  const lastCol = colLetter(colCount - 1);

  // 행 구성: 1=제목, 2=설명, 3=빈행, 4=헤더, 5=예시
  // (row index 는 0-based 코드 내부, A1 표기는 1-based)
  const ws: WorkSheet = {};

  // 행 1 — 제목
  ws['A1'] = { t: 's', v: title, s: { font: FONT_TITLE, fill: FILL_TITLE, alignment: ALIGN_CENTER, border: BORDER_THIN } } as CellObject;
  for (let c = 1; c < colCount; c++) {
    ws[`${colLetter(c)}1`] = { t: 's', v: '', s: { font: FONT_TITLE, fill: FILL_TITLE, alignment: ALIGN_CENTER, border: BORDER_THIN } } as CellObject;
  }

  // 행 2 — 설명 (병합)
  const desc = description ?? '필수항목 * 표시 / 부가항목은 빈칸 허용';
  ws['A2'] = { t: 's', v: desc, s: { font: FONT_NOTE, alignment: ALIGN_LEFT_WRAP, border: BORDER_THIN } } as CellObject;
  for (let c = 1; c < colCount; c++) {
    ws[`${colLetter(c)}2`] = { t: 's', v: '', s: { font: FONT_NOTE, alignment: ALIGN_LEFT_WRAP, border: BORDER_THIN } } as CellObject;
  }

  // 행 3 — 헤더
  headers.forEach((h, c) => {
    const isReq = c < requiredCount;
    ws[`${colLetter(c)}3`] = {
      t: 's', v: h,
      s: {
        font: FONT_BOLD,
        fill: isReq ? FILL_REQUIRED : FILL_OPTIONAL,
        alignment: ALIGN_CENTER,
        border: BORDER_THIN,
      },
    } as CellObject;
  });

  // 행 4 — 예시 데이터
  headers.forEach((h, c) => {
    const raw = sample[h];
    const ref = `${colLetter(c)}4`;
    const isNumberCol = numberCols.some((nc) => h.includes(nc));
    if (typeof raw === 'number') {
      ws[ref] = {
        t: 'n', v: raw,
        z: isNumberCol ? '#,##0' : undefined,
        s: { font: FONT_BASE, alignment: { horizontal: 'right', vertical: 'center' }, border: BORDER_THIN },
      } as CellObject;
    } else if (isNumberCol) {
      // 숫자 컬럼인데 값 없음 — 포맷만 미리 적용 (사용자가 숫자 입력하면 자동 콤마)
      ws[ref] = {
        t: 's', v: raw ?? '',
        z: '#,##0',
        s: { font: FONT_BASE, alignment: { horizontal: 'right', vertical: 'center' }, border: BORDER_THIN },
      } as CellObject;
    } else {
      ws[ref] = {
        t: 's', v: raw ?? '',
        s: { font: FONT_BASE, alignment: { horizontal: 'left', vertical: 'center' }, border: BORDER_THIN },
      } as CellObject;
    }
  });

  // 빈 데이터 행 추가 (행 5~10) — 사용자가 바로 입력하기 좋게 빈 스타일 셀
  for (let r = 4; r < 10; r++) {
    headers.forEach((h, c) => {
      const isNumberCol = numberCols.some((nc) => h.includes(nc));
      ws[`${colLetter(c)}${r + 1}`] = {
        t: 's', v: '',
        z: isNumberCol ? '#,##0' : undefined,
        s: {
          font: FONT_BASE,
          alignment: { horizontal: isNumberCol ? 'right' : 'left', vertical: 'center' },
          border: BORDER_THIN,
        },
      } as CellObject;
    });
  }

  // 시트 범위
  ws['!ref'] = `A1:${lastCol}10`;
  // 컬럼 폭 — 헤더 길이 기반 (한글 가중치 +2)
  ws['!cols'] = headers.map((h) => ({ wch: Math.max(h.length + 4, 11) }));
  // 행 높이 — 1행(제목) 24, 2행(설명) 32, 3행(헤더) 22, 그 외 18
  ws['!rows'] = [
    { hpx: 28 },
    { hpx: 36 },
    { hpx: 24 },
    ...Array.from({ length: 6 }, () => ({ hpx: 22 })),
  ];
  // 1, 2행은 전 컬럼 병합
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: colCount - 1 } },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return wb;
}

/** 양식 다운로드 — buildTemplate + writeFile 통합. */
export async function downloadTemplate(opts: TemplateOptions & { fileName: string }): Promise<void> {
  const XLSX = await import('xlsx-js-style');
  const wb = await buildTemplate(opts);
  XLSX.writeFile(wb, opts.fileName);
}
