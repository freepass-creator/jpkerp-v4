/**
 * asset-import.ts — 자산 엑셀 → Asset[].
 *
 * 자동차등록증(① ~ ㉟) + 회사 운영 필드(메이커/모델/색상 등) 전체를 양식에 노출.
 *
 * 필수입력 (헤더에 ` *` 접미 표시) :
 *   회사코드 · 차량번호 · 차대번호 · 차종 · 용도 · 차명 · 성명(명칭) · 최초등록일
 *
 * 부가입력은 빈 칸이어도 무방. mapColumns 는 `*` 제거 정규화 후 .includes 매칭이라
 * 양식의 `*` 표시는 헤더 검출에 영향 X.
 */

import {
  readExcel,
  detectHeaderRow,
  mapColumns,
  cellToNumber,
  cellToDateTime,
  cellToString,
} from './excel-import';
import type { Asset } from './sample-assets';

export type AssetImportContext = {
  /** 기본 회사 — 행에 회사코드 누락 시 fallback. */
  defaultCompanyCode: string;
};

export type AssetImportRow = {
  data: Partial<Asset>;
  errors: string[];
};

export type AssetImportResult = {
  rows: AssetImportRow[];
  total: number;
  skipped: number;
  detected: boolean;
};

const DETECT_KEYWORDS = ['차량번호', '차대번호', '차명', '회사', '회사코드', '성명', '명칭'];

const COLUMN_MAP = {
  /* 필수 */
  companyCode:     ['회사코드', '회사'],
  plate:           ['차량번호', '등록번호', '자동차등록번호'],
  vin:             ['차대번호', 'VIN'],
  vehicleClass:    ['차종'],
  usage:           ['용도'],
  vehicleName:     ['차명'],
  ownerName:       ['성명', '명칭', '성명(명칭)'],
  firstRegistDate: ['최초등록일'],
  /* 부가 — 자동차등록증 ⑤ ~ ㉞ */
  modelType:       ['형식'],
  manufactureDate: ['제작연월', '연식'],
  engineType:      ['원동기형식'],
  ownerLocation:   ['사용본거지', '본거지'],
  ownerRegNumber:  ['생년월일', '법인등록번호'],
  documentNo:      ['문서확인번호'],
  certIssueDate:   ['등록증발급일', '발급일자'],
  approvalNumber:  ['제원관리번호', '형식승인번호'],
  length:          ['길이'],
  width:           ['너비'],
  height:          ['높이'],
  totalWeight:     ['총중량'],
  capacity:        ['승차정원'],
  maxLoad:         ['최대적재량'],
  displacement:    ['배기량'],
  ratedOutput:     ['정격출력'],
  cylinders:       ['기통수'],
  fuelType:        ['연료종류', '연료'],
  fuelEfficiency:  ['연료소비율'],
  batteryMaker:    ['셀제조사', '구동축전지셀제조사'],
  batteryShape:    ['셀형태', '구동축전지셀형태'],
  batteryMaterial: ['셀주요원료', '셀원료'],
  plateIssueType:  ['번호판구분'],
  plateIssueDate:  ['번호판발급일'],
  plateIssueAgent: ['번호판발급대행자'],
  mortgageType:    ['저당권구분'],
  mortgageDate:    ['저당권날짜'],
  inspectionFrom:  ['검사유효기간시작', '검사시작일'],
  inspectionTo:    ['검사유효기간종료', '검사만기'],
  mileage:         ['주행거리'],
  acquisitionPrice:['출고가격', '취득가격'],
  /* 부가 — 운영·마케팅 */
  maker:           ['제조사', '메이커'],
  modelName:       ['모델명', '모델'],
  detailModel:     ['세부모델'],
  detailTrim:      ['세부트림', '트림'],
  exteriorColor:   ['외부색상', '색상'],
  interiorColor:   ['내부색상'],
  driveType:       ['구동방식'],
  options:         ['선택옵션', '옵션'],
};

const PLATE_RE = /^\d{2,3}[가-힣]\d{4}$/;
const DRIVE_OK = new Set(['전륜', '후륜', '4륜', 'AWD']);

function rowsToAssets(rows: unknown[][], ctx: AssetImportContext): AssetImportResult {
  const headerIdx = detectHeaderRow(rows, DETECT_KEYWORDS, 2);
  if (headerIdx < 0) return { rows: [], total: 0, skipped: 0, detected: false };

  const headers = (rows[headerIdx] ?? []).map((c) => cellToString(c));
  const cols = mapColumns(headers, COLUMN_MAP);

  const out: AssetImportRow[] = [];
  let skipped = 0;

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const plate = cellToString(row[cols.plate]).trim().replace(/\s/g, '');
    const ownerName = cellToString(row[cols.ownerName]).trim();
    if (!plate && !ownerName) { skipped++; continue; }

    const companyCode = cellToString(row[cols.companyCode]).trim() || ctx.defaultCompanyCode;
    const errors: string[] = [];
    if (!companyCode) errors.push('회사코드 누락');
    if (!plate) errors.push('차량번호 누락');
    else if (!PLATE_RE.test(plate)) errors.push(`차량번호 형식 오류: ${plate}`);
    if (!ownerName) errors.push('성명(명칭) 누락');

    const vehicleClass = cellToString(row[cols.vehicleClass]).trim();
    const usage = cellToString(row[cols.usage]).trim();
    const vehicleName = cellToString(row[cols.vehicleName]).trim();
    const vin = cellToString(row[cols.vin]).trim();
    const firstRegistDate = cellToDateTime(row[cols.firstRegistDate])?.slice(0, 10) || '';
    if (!vehicleClass) errors.push('차종 누락');
    if (!usage) errors.push('용도 누락');
    if (!vehicleName) errors.push('차명 누락');
    if (!vin) errors.push('차대번호 누락');
    if (!firstRegistDate) errors.push('최초등록일 누락');

    const driveRaw = cellToString(row[cols.driveType]).trim();
    const driveType = DRIVE_OK.has(driveRaw) ? (driveRaw as Asset['driveType']) : undefined;
    const optionsRaw = cellToString(row[cols.options]).trim();
    const options = optionsRaw ? optionsRaw.split(/[,/]/).map((s) => s.trim()).filter(Boolean) : undefined;

    const data: Partial<Asset> = {
      companyCode,
      plate,
      vin,
      vehicleClass,
      usage,
      vehicleName,
      ownerName,
      firstRegistDate,
      modelType:        cellToString(row[cols.modelType]).trim() || undefined,
      manufactureDate:  cellToDateTime(row[cols.manufactureDate])?.slice(0, 10) || undefined,
      engineType:       cellToString(row[cols.engineType]).trim() || undefined,
      ownerLocation:    cellToString(row[cols.ownerLocation]).trim() || undefined,
      ownerRegNumber:   cellToString(row[cols.ownerRegNumber]).trim() || undefined,
      documentNo:       cellToString(row[cols.documentNo]).trim() || undefined,
      certIssueDate:    cellToDateTime(row[cols.certIssueDate])?.slice(0, 10) || undefined,
      approvalNumber:   cellToString(row[cols.approvalNumber]).trim() || undefined,
      length:           cellToNumber(row[cols.length]) ?? undefined,
      width:            cellToNumber(row[cols.width]) ?? undefined,
      height:           cellToNumber(row[cols.height]) ?? undefined,
      totalWeight:      cellToNumber(row[cols.totalWeight]) ?? undefined,
      capacity:         cellToNumber(row[cols.capacity]) ?? undefined,
      maxLoad:          cellToNumber(row[cols.maxLoad]) ?? undefined,
      displacement:     cellToNumber(row[cols.displacement]) ?? undefined,
      ratedOutput:      cellToString(row[cols.ratedOutput]).trim() || undefined,
      cylinders:        cellToString(row[cols.cylinders]).trim() || undefined,
      fuelType:         cellToString(row[cols.fuelType]).trim() || undefined,
      fuelEfficiency:   cellToNumber(row[cols.fuelEfficiency]) ?? undefined,
      batteryMaker:     cellToString(row[cols.batteryMaker]).trim() || undefined,
      batteryShape:     cellToString(row[cols.batteryShape]).trim() || undefined,
      batteryMaterial:  cellToString(row[cols.batteryMaterial]).trim() || undefined,
      plateIssueType:   cellToString(row[cols.plateIssueType]).trim() || undefined,
      plateIssueDate:   cellToDateTime(row[cols.plateIssueDate])?.slice(0, 10) || undefined,
      plateIssueAgent:  cellToString(row[cols.plateIssueAgent]).trim() || undefined,
      mortgageType:     cellToString(row[cols.mortgageType]).trim() || undefined,
      mortgageDate:     cellToDateTime(row[cols.mortgageDate])?.slice(0, 10) || undefined,
      inspectionFrom:   cellToDateTime(row[cols.inspectionFrom])?.slice(0, 10) || undefined,
      inspectionTo:     cellToDateTime(row[cols.inspectionTo])?.slice(0, 10) || undefined,
      mileage:          cellToNumber(row[cols.mileage]) ?? undefined,
      acquisitionPrice: cellToNumber(row[cols.acquisitionPrice]) ?? undefined,
      maker:            cellToString(row[cols.maker]).trim() || undefined,
      modelName:        cellToString(row[cols.modelName]).trim() || undefined,
      detailModel:      cellToString(row[cols.detailModel]).trim() || undefined,
      detailTrim:       cellToString(row[cols.detailTrim]).trim() || undefined,
      exteriorColor:    cellToString(row[cols.exteriorColor]).trim() || undefined,
      interiorColor:    cellToString(row[cols.interiorColor]).trim() || undefined,
      driveType,
      options,
      status: '대기',
    };

    out.push({ data, errors });
  }

  return { rows: out, total: rows.length - headerIdx - 1, skipped, detected: true };
}

export async function parseAssetExcel(file: File, ctx: AssetImportContext): Promise<AssetImportResult> {
  const { rows } = await readExcel(file);
  return rowsToAssets(rows, ctx);
}

/** 필수 입력 — 양식 헤더에 ` *` 접미 표시. */
export const ASSET_EXCEL_REQUIRED = [
  '회사코드',
  '차량번호',
  '차대번호',
  '차종',
  '용도',
  '차명',
  '성명(명칭)',
  '최초등록일',
] as const;

/** 부가 입력 — 빈칸 허용. 자동차등록증 본문 + 운영 메타. */
export const ASSET_EXCEL_OPTIONAL = [
  // 운영·마케팅
  '제조사', '모델명', '세부모델', '세부트림',
  '제작연월', '연료종류', '구동방식', '외부색상', '내부색상', '선택옵션',
  // 등록증 헤더·기타
  '문서확인번호', '등록증발급일',
  // 등록증 본문
  '형식', '원동기형식', '사용본거지', '법인등록번호',
  // 제원
  '제원관리번호', '길이', '너비', '높이', '총중량', '승차정원', '최대적재량',
  '배기량', '정격출력', '기통수', '연료소비율',
  '셀제조사', '셀형태', '셀주요원료',
  // 번호판·저당권·검사·가격
  '번호판구분', '번호판발급일', '번호판발급대행자',
  '저당권구분', '저당권날짜',
  '검사유효기간시작', '검사유효기간종료', '주행거리',
  '출고가격',
] as const;

/** 양식에 들어가는 최종 헤더 — 필수에 ` *` 표시. mapColumns 는 `*` 무시. */
export const ASSET_EXCEL_HEADERS: string[] = [
  ...ASSET_EXCEL_REQUIRED.map((h) => `${h} *`),
  ...ASSET_EXCEL_OPTIONAL,
];
