/**
 * 엑셀 양식 빌더 — exceljs 기반.
 *
 *  · 9pt 통일 (ERP 컴팩트 밀도)
 *  · 제목 + 다줄 설명 블록
 *  · 헤더: 필수=노란 / 부가=회색 배경, bold
 *  · 셀 보더, 정렬, 천단위 콤마(`#,##0`)
 *  · Excel 데이터 유효성 검사 (드롭다운) — 항목별 list type
 */
'use client';

export type TemplateOptions = {
  sheetName: string;
  title: string;
  description?: string | string[];
  headers: readonly string[];
  requiredCount: number;
  sample?: Record<string, string | number>;
  numberCols?: readonly string[];
  /** 드롭다운 옵션 — 헤더 이름 → 값들. Excel data validation list type. */
  dropdowns?: Record<string, readonly string[]>;
};

const FONT_BASE = { name: '맑은 고딕', size: 9 };
const FONT_BOLD = { ...FONT_BASE, bold: true };
const FONT_TITLE = { ...FONT_BASE, size: 11, bold: true };
const FONT_NOTE = { ...FONT_BASE, color: { argb: 'FF666666' } };

// ARGB (alpha 'FF' + RGB) — exceljs 규격
const FILL_REQUIRED = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF4CC' } };
const FILL_OPTIONAL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
const FILL_TITLE    = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F0FE' } };

const BORDER_THIN = {
  top:    { style: 'thin' as const, color: { argb: 'FFBBBBBB' } },
  bottom: { style: 'thin' as const, color: { argb: 'FFBBBBBB' } },
  left:   { style: 'thin' as const, color: { argb: 'FFBBBBBB' } },
  right:  { style: 'thin' as const, color: { argb: 'FFBBBBBB' } },
};

function colLetter(idx: number): string {
  let s = '';
  let n = idx;
  while (true) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
    if (n < 0) break;
  }
  return s;
}

/** 양식 다운로드 — buildTemplate + writeFile 통합. */
export async function downloadTemplate(opts: TemplateOptions & { fileName: string }): Promise<void> {
  const blob = await buildTemplateBlob(opts);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = opts.fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** exceljs 로 xlsx Blob 생성. 외부에서 추가 작업 후 직접 다운로드도 가능. */
export async function buildTemplateBlob(opts: TemplateOptions): Promise<Blob> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(opts.sheetName);
  populateSheet(ws, opts);
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/** Worksheet 에 양식 컨텐츠 채움 — 외부에서 추가 행 push 도 가능 (받은 ws 그대로 반환). */
export function populateSheet(
  ws: import('exceljs').Worksheet,
  opts: TemplateOptions,
): { headerRow: number; sampleRow: number; lastRow: number } {
  const { title, description, headers, requiredCount, sample = {}, numberCols = [], dropdowns = {} } = opts;
  const colCount = headers.length;
  const lastColLetter = colLetter(colCount - 1);

  const descLines = Array.isArray(description) ? description : description ? [description] : ['필수항목 * 표시 / 부가항목은 빈칸 허용'];

  // 1행: 제목 (전 컬럼 병합)
  ws.getCell('A1').value = title;
  ws.mergeCells(`A1:${lastColLetter}1`);
  const titleCell = ws.getCell('A1');
  titleCell.font = FONT_TITLE;
  titleCell.fill = FILL_TITLE as never;
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  titleCell.border = BORDER_THIN;
  ws.getRow(1).height = 22;

  // 2 ~ : 설명 라인 (각 행 병합)
  descLines.forEach((line, i) => {
    const rowNum = 2 + i;
    ws.getCell(`A${rowNum}`).value = line;
    ws.mergeCells(`A${rowNum}:${lastColLetter}${rowNum}`);
    const cell = ws.getCell(`A${rowNum}`);
    cell.font = FONT_NOTE;
    cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
    cell.border = BORDER_THIN;
    ws.getRow(rowNum).height = 20;
  });

  // 헤더 행
  const headerRowNum = 1 + descLines.length + 1;
  headers.forEach((h, c) => {
    const isReq = c < requiredCount;
    const cell = ws.getCell(`${colLetter(c)}${headerRowNum}`);
    cell.value = h;
    cell.font = FONT_BOLD;
    cell.fill = (isReq ? FILL_REQUIRED : FILL_OPTIONAL) as never;
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = BORDER_THIN;
  });
  ws.getRow(headerRowNum).height = 20;

  // 예시 행
  const sampleRowNum = headerRowNum + 1;
  headers.forEach((h, c) => {
    const raw = sample[h];
    const cell = ws.getCell(`${colLetter(c)}${sampleRowNum}`);
    const isNumberCol = numberCols.some((nc) => h.includes(nc));
    if (typeof raw === 'number') {
      cell.value = raw;
      if (isNumberCol) cell.numFmt = '#,##0';
      cell.alignment = { horizontal: 'right', vertical: 'middle' };
    } else {
      cell.value = raw ?? '';
      if (isNumberCol) {
        cell.numFmt = '#,##0';
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
      } else {
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
      }
    }
    cell.font = FONT_BASE;
    cell.border = BORDER_THIN;
  });
  ws.getRow(sampleRowNum).height = 18;

  // 빈 입력 행 5개
  const EMPTY_ROWS = 5;
  for (let r = 0; r < EMPTY_ROWS; r++) {
    const rowNum = sampleRowNum + 1 + r;
    headers.forEach((h, c) => {
      const cell = ws.getCell(`${colLetter(c)}${rowNum}`);
      const isNumberCol = numberCols.some((nc) => h.includes(nc));
      if (isNumberCol) {
        cell.numFmt = '#,##0';
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
      } else {
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
      }
      cell.font = FONT_BASE;
      cell.border = BORDER_THIN;
    });
    ws.getRow(rowNum).height = 18;
  }
  const lastRow = sampleRowNum + EMPTY_ROWS;

  // 컬럼 폭
  headers.forEach((h, c) => {
    ws.getColumn(c + 1).width = Math.max(h.length + 4, 11);
  });

  // 드롭다운 — Excel data validation list
  for (const [header, options] of Object.entries(dropdowns)) {
    if (!options || options.length === 0) continue;
    const colIdx = headers.findIndex((h) => h === header || h === `${header} *`);
    if (colIdx < 0) continue;
    const col = colLetter(colIdx);
    // 데이터 입력 영역 전체에 validation 적용 (샘플 행 + 빈 행들)
    for (let r = sampleRowNum; r <= lastRow; r++) {
      ws.getCell(`${col}${r}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`"${options.join(',')}"`],
        showErrorMessage: true,
        errorTitle: '유효하지 않은 값',
        error: `다음 중 선택: ${options.join(' / ')}`,
      };
    }
  }

  return { headerRow: headerRowNum, sampleRow: sampleRowNum, lastRow };
}
