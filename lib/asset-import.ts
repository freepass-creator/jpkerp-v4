/**
 * asset-import.ts — 자산 엑셀 → Asset[].
 *
 * 자동차등록증 핵심 항목 (회사코드·차량번호·차대번호·차명·성명·최초등록일 등) 의
 * 표 형식 일괄 등록. OCR 다건 import 의 대안 — 이미 정형 데이터 가진 경우.
 *
 * 행마다 회사코드 검증 필수. 차량번호 형식 검증 (XX가XXXX).
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
  companyCode:     ['회사코드', '회사'],
  plate:           ['차량번호', '등록번호', '자동차등록번호'],
  vin:             ['차대번호', 'VIN'],
  vehicleName:     ['차명'],
  vehicleClass:    ['차종'],
  usage:           ['용도'],
  modelType:       ['형식'],
  manufactureDate: ['제작연월'],
  engineType:      ['원동기형식'],
  ownerLocation:   ['사용본거지', '본거지'],
  ownerName:       ['성명', '명칭', '성명(명칭)'],
  ownerRegNumber:  ['생년월일', '법인등록번호'],
  firstRegistDate: ['최초등록일'],
  maker:           ['제조사', '메이커'],
  modelName:       ['모델명', '모델'],
  exteriorColor:   ['외부색상', '색상'],
  fuelType:        ['연료종류', '연료'],
  displacement:    ['배기량'],
  capacity:        ['승차정원'],
  mileage:         ['주행거리'],
};

const PLATE_RE = /^\d{2,3}[가-힣]\d{4}$/;

function rowsToAssets(rows: unknown[][], ctx: AssetImportContext): AssetImportResult {
  const headerIdx = detectHeaderRow(rows, DETECT_KEYWORDS, 2);
  if (headerIdx < 0) return { rows: [], total: 0, skipped: 0, detected: false };

  const headers = (rows[headerIdx] ?? []).map((c) => cellToString(c));
  const cols = mapColumns(headers, COLUMN_MAP);

  const out: AssetImportRow[] = [];
  let skipped = 0;

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const plate = cellToString(row[cols.plate]).trim();
    if (!plate) { skipped++; continue; }

    const companyCode = cellToString(row[cols.companyCode]).trim() || ctx.defaultCompanyCode;
    const errors: string[] = [];
    if (!companyCode) errors.push('회사코드 누락');
    if (!PLATE_RE.test(plate.replace(/\s/g, ''))) errors.push(`차량번호 형식 오류: ${plate}`);

    const data: Partial<Asset> = {
      companyCode,
      plate: plate.replace(/\s/g, ''),
      vin: cellToString(row[cols.vin]).trim(),
      vehicleName: cellToString(row[cols.vehicleName]).trim(),
      vehicleClass: cellToString(row[cols.vehicleClass]).trim(),
      usage: cellToString(row[cols.usage]).trim(),
      modelType: cellToString(row[cols.modelType]).trim() || undefined,
      manufactureDate: cellToDateTime(row[cols.manufactureDate])?.slice(0, 10) || undefined,
      engineType: cellToString(row[cols.engineType]).trim() || undefined,
      ownerLocation: cellToString(row[cols.ownerLocation]).trim() || undefined,
      ownerName: cellToString(row[cols.ownerName]).trim(),
      ownerRegNumber: cellToString(row[cols.ownerRegNumber]).trim() || undefined,
      firstRegistDate: cellToDateTime(row[cols.firstRegistDate])?.slice(0, 10) || '',
      maker: cellToString(row[cols.maker]).trim() || undefined,
      modelName: cellToString(row[cols.modelName]).trim() || undefined,
      exteriorColor: cellToString(row[cols.exteriorColor]).trim() || undefined,
      fuelType: cellToString(row[cols.fuelType]).trim() || undefined,
      displacement: cellToNumber(row[cols.displacement]) ?? undefined,
      capacity: cellToNumber(row[cols.capacity]) ?? undefined,
      mileage: cellToNumber(row[cols.mileage]) ?? undefined,
      status: '대기',
    };

    if (!data.ownerName) errors.push('성명(명칭) 누락');

    out.push({ data, errors });
  }

  return { rows: out, total: rows.length - headerIdx - 1, skipped, detected: true };
}

export async function parseAssetExcel(file: File, ctx: AssetImportContext): Promise<AssetImportResult> {
  const { rows } = await readExcel(file);
  return rowsToAssets(rows, ctx);
}

export const ASSET_EXCEL_HEADERS = [
  '회사코드', '차량번호', '차대번호', '차명', '차종', '용도',
  '성명(명칭)', '최초등록일', '제조사', '모델명', '색상', '연료종류',
];
