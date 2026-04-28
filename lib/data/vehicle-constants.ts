/**
 * 차량 관련 공용 상수 + 타입.
 * asset-create-form, car-master, fuel-form 등에서 공유.
 */

// ─── 타입 (리터럴 유니온) ─────────────────────
export type FuelType = '가솔린' | '디젤' | '하이브리드' | '전기' | 'LPG';
export type CarOrigin = '국산' | '수입';
export type Powertrain = '내연' | '하이브리드' | '전기' | '수소';
export type DriveType = '전륜' | '후륜' | '4륜' | 'AWD';
export type UsageType = '자가용' | '렌터카' | '영업용' | '관용' | '기타';
export type AssetStatus = 'active' | 'idle' | 'maint' | 'product';

// ─── 드랍다운·BtnGroup 옵션 배열 ──────────────
export const FUEL_TYPES: FuelType[] = ['가솔린', '디젤', '하이브리드', '전기', 'LPG'];
export const ORIGINS: CarOrigin[] = ['국산', '수입'];
export const POWERTRAINS: Powertrain[] = ['내연', '하이브리드', '전기', '수소'];
export const DRIVE_TYPES: DriveType[] = ['전륜', '후륜', '4륜', 'AWD'];
export const USAGE_TYPES: UsageType[] = ['자가용', '렌터카', '영업용', '관용', '기타'];

export const TRANSMISSIONS = ['자동', '수동', 'CVT', 'DCT', '8단 자동', '10단 자동', '1단 (EV)'] as const;
export const EXT_COLORS = ['흰색', '검정', '회색', '은색', '남색', '빨강', '파랑', '초록', '갈색', '베이지', '기타'] as const;
export const INT_COLORS = ['검정', '회색', '베이지', '갈색', '아이보리', '적색', '기타'] as const;
export const BODY_SHAPES = ['세단', '해치백', 'SUV', 'RV/MPV', '쿠페', '컨버터블', '왜건', '트럭', '승합', '기타'] as const;
export const SEATS_OPTIONS = [2, 4, 5, 6, 7, 8, 9, 11, 15, 25] as const;

export const CATEGORIES = [
  '경차', '경형 SUV', '경형 EV',
  '소형 SUV', '소형 EV SUV', '소형 EV', '소형 트럭', '소형 EV 트럭',
  '준중형 세단', '준중형 SUV', '준중형 EV', '준중형 EV SUV',
  '중형 세단', '중형 SUV', '중형 EV 세단', '중형 EV SUV',
  '준대형 세단', '준대형 SUV',
  '대형 세단', '대형 SUV', '대형 MPV', '대형 EV SUV',
  '스포츠 세단', '수소 SUV', '픽업트럭',
] as const;

export const ASSET_STATUS_OPTS: Array<{ value: AssetStatus; label: string }> = [
  { value: 'active', label: '활성' },
  { value: 'idle', label: '휴차' },
  { value: 'maint', label: '정비중' },
  { value: 'product', label: '상품화' },
];
