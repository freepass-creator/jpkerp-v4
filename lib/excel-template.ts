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
  /**
   * 사용 안내 — string 이면 1줄, string[] 이면 각 element 가 한 행.
   * 행마다 전 컬럼 병합. ERP 사용자 가이드 (회사코드/날짜/등록번호 형식 등) 풍부히 적기 좋음.
   */
  description?: string | string[];
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
  /**
   * 드롭다운 옵션 — 헤더 이름 → 선택 가능 값들.
   * 예: { '신분': ['개인','개인사업자','법인'], '결제방법': ['자동이체','카드',...] }
   * 데이터 행 전체에 Excel 데이터 유효성 검사 적용.
   */
  dropdowns?: Record<string, readonly string[]>;
};

/* xlsx-js 호환 셀 스타일 — write 시 cell.s/cell.z 가 그대로 반영.
 * 폰트 사이즈는 ERP 화면 밀도(12px)와 비슷한 시각감 — Excel pt 기준 10pt 정도. */
const FONT_BASE = { name: '맑은 고딕', sz: 10 };
const FONT_BOLD = { ...FONT_BASE, bold: true };
const FONT_TITLE = { ...FONT_BASE, sz: 12, bold: true };
const FONT_NOTE = { ...FONT_BASE, sz: 9, color: { rgb: '666666' } };

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
  const { sheetName, title, description, headers, requiredCount, sample = {}, numberCols = [], dropdowns = {} } = opts;
  const colCount = headers.length;
  const lastCol = colLetter(colCount - 1);

  /* 행 구성 (dynamic):
       row 0:                                 제목 (병합)
       row 1 .. 1+descLines-1:                설명 N 줄 (각 행 병합)
       row descLines+1:                       헤더
       row descLines+2:                       예시 데이터
       row descLines+3 .. descLines+8:        빈 입력 행 6개 (스타일만)
     0-based row index 그대로 사용. A1 표기는 +1.                                  */
  const descLines = Array.isArray(description) ? description : description ? [description] : ['필수항목 * 표시 / 부가항목은 빈칸 허용'];
  const headerRow = 1 + descLines.length;    // 0-based
  const sampleRow = headerRow + 1;
  const emptyRows = 6;
  const lastRow = sampleRow + emptyRows;     // 0-based 마지막 행 인덱스

  const ws: WorkSheet = {};

  // 행 0 — 제목
  ws['A1'] = { t: 's', v: title, s: { font: FONT_TITLE, fill: FILL_TITLE, alignment: ALIGN_CENTER, border: BORDER_THIN } } as CellObject;
  for (let c = 1; c < colCount; c++) {
    ws[`${colLetter(c)}1`] = { t: 's', v: '', s: { font: FONT_TITLE, fill: FILL_TITLE, alignment: ALIGN_CENTER, border: BORDER_THIN } } as CellObject;
  }

  // 행 1 ~ — 설명 라인들
  descLines.forEach((line, i) => {
    const r = 1 + i;     // 0-based
    ws[`A${r + 1}`] = { t: 's', v: line, s: { font: FONT_NOTE, alignment: ALIGN_LEFT_WRAP, border: BORDER_THIN } } as CellObject;
    for (let c = 1; c < colCount; c++) {
      ws[`${colLetter(c)}${r + 1}`] = { t: 's', v: '', s: { font: FONT_NOTE, alignment: ALIGN_LEFT_WRAP, border: BORDER_THIN } } as CellObject;
    }
  });

  // 헤더 행
  headers.forEach((h, c) => {
    const isReq = c < requiredCount;
    ws[`${colLetter(c)}${headerRow + 1}`] = {
      t: 's', v: h,
      s: {
        font: FONT_BOLD,
        fill: isReq ? FILL_REQUIRED : FILL_OPTIONAL,
        alignment: ALIGN_CENTER,
        border: BORDER_THIN,
      },
    } as CellObject;
  });

  // 예시 데이터 행
  headers.forEach((h, c) => {
    const raw = sample[h];
    const ref = `${colLetter(c)}${sampleRow + 1}`;
    const isNumberCol = numberCols.some((nc) => h.includes(nc));
    if (typeof raw === 'number') {
      ws[ref] = {
        t: 'n', v: raw,
        z: isNumberCol ? '#,##0' : undefined,
        s: { font: FONT_BASE, alignment: { horizontal: 'right', vertical: 'center' }, border: BORDER_THIN },
      } as CellObject;
    } else if (isNumberCol) {
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

  // 빈 입력 행들 (스타일만)
  for (let r = sampleRow + 1; r <= lastRow; r++) {
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
  ws['!ref'] = `A1:${lastCol}${lastRow + 1}`;
  // 컬럼 폭
  ws['!cols'] = headers.map((h) => ({ wch: Math.max(h.length + 4, 11) }));
  // 행 높이 — 제목 22, 설명 라인마다 22, 헤더 20, 데이터 18
  ws['!rows'] = [
    { hpx: 22 },
    ...descLines.map(() => ({ hpx: 22 })),
    { hpx: 20 },
    ...Array.from({ length: emptyRows + 1 }, () => ({ hpx: 18 })),
  ];
  // 제목 + 설명 라인들 전 컬럼 병합
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } },
    ...descLines.map((_, i) => ({ s: { r: 1 + i, c: 0 }, e: { r: 1 + i, c: colCount - 1 } })),
  ];

  // 드롭다운 — Excel 데이터 유효성 검사 (data validation)
  // sqref: 데이터 입력 영역 (예시 행 ~ 마지막 빈 행)
  const dataValidations: Array<{ sqref: string; type: string; formula1: string; allowBlank?: boolean }> = [];
  for (const [header, options] of Object.entries(dropdowns)) {
    if (!options || options.length === 0) continue;
    const colIdx = headers.findIndex((h) => h === header || h === `${header} *`);
    if (colIdx < 0) continue;
    const col = colLetter(colIdx);
    const sqref = `${col}${sampleRow + 1}:${col}${lastRow + 1}`;
    dataValidations.push({
      sqref,
      type: 'list',
      formula1: `"${options.join(',')}"`,
      allowBlank: true,
    });
  }
  if (dataValidations.length > 0) {
    (ws as unknown as { '!dataValidation': typeof dataValidations })['!dataValidation'] = dataValidations;
  }

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
