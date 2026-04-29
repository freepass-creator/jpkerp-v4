export type AssetStatus = '등록예정' | '대기' | '운행중' | '정비' | '매각';

/**
 * 자산(차량) 데이터 모델 — 자동차등록증 ① ~ ㉟ 전 항목 + 헤더/푸터 + 부가.
 *
 * 메인(등록증) — OCR로 자동 채워짐. 빈 칸은 그대로 비워둠.
 * 부가(선택)   — 등록증에 없는 마케팅·운영 정보 (제조사·모델명·색상 등).
 */
export type Asset = {
  id: string;

  /* ─── 운영 식별자 ─── */
  companyCode: string;        // 회사코드 (CP01~CP99) — 차량번호와 묶여 unique key

  /* ─── 등록증 헤더 ─── */
  documentNo?: string;        // 문서확인번호
  firstRegistDate: string;    // 최초등록일
  certIssueDate?: string;     // 등록증 발급일

  /* ─── 본문 ① ~ ⑩ ─── */
  plate: string;              // ① 자동차등록번호
  vehicleClass: string;       // ② 차종
  usage: string;              // ③ 용도
  vehicleName: string;        // ④ 차명
  modelType?: string;         // ⑤ 형식
  manufactureDate?: string;   // ⑤ 제작연월
  vin: string;                // ⑥ 차대번호
  engineType?: string;        // ⑦ 원동기형식
  ownerLocation?: string;     // ⑧ 사용본거지
  ownerName: string;          // ⑨ 성명(명칭)
  ownerRegNumber?: string;    // ⑩ 생년월일/법인등록번호

  /* ─── 1. 제원 ⑪ ~ ㉔ ─── */
  approvalNumber?: string;    // ⑪ 제원관리번호(형식승인번호)
  length?: number;            // ⑫ 길이  (mm)
  width?: number;             // ⑬ 너비  (mm)
  height?: number;            // ⑭ 높이  (mm)
  totalWeight?: number;       // ⑮ 총중량 (kg)
  capacity?: number;          // ⑯ 승차정원
  maxLoad?: number;           // ⑰ 최대적재량 (kg)
  displacement?: number;      // ⑱ 배기량 / 구동축전지 용량 (cc)
  ratedOutput?: string;       // ⑲ 정격출력 (Ps/rpm)
  cylinders?: string;         // ⑳ 기통수 / 정격전압 / 최고출력
  fuelType?: string;          // ㉑ 연료종류
  fuelEfficiency?: number;    // ㉑ 연료소비율 (km/L)
  batteryMaker?: string;      // ㉒ 구동축전지 셀 제조사 (전기차)
  batteryShape?: string;      // ㉓ 구동축전지 셀 형태   (전기차)
  batteryMaterial?: string;   // ㉔ 구동축전지 셀 주요원료(전기차)

  /* ─── 2. 등록번호판 교부 ㉕ ~ ㉗ ─── */
  plateIssueType?: string;    // ㉕ 구분
  plateIssueDate?: string;    // ㉖ 번호판 발급일
  plateIssueAgent?: string;   // ㉗ 발급대행자확인

  /* ─── 3. 저당권등록사실 ㉘ ~ ㉙ ─── */
  mortgageType?: string;      // ㉘ 구분 (저당설정/말소)
  mortgageDate?: string;      // ㉙ 날짜

  /* ─── 4. 검사 유효기간 ㉚ ~ ㉟ ─── */
  inspectionFrom?: string;    // ㉚ 연월일부터
  inspectionTo?: string;      // ㉛ 연월일까지
  inspectionPlace?: string;   // ㉜ 검사시행장소
  mileage?: number;           // ㉝ 주행거리
  inspectionAuthority?: string;// ㉞ 검사책임자확인
  inspectionType?: string;    // ㉟ 검사구분

  /* ─── 기타 (등록증 푸터) ─── */
  acquisitionPrice?: number;  // 자동차 출고(취득)가격 (부가세 제외)

  /* ─── 부가 (선택입력 — 등록증에 없음) ─── */
  maker?: string;             // 제조사
  modelName?: string;         // 모델명
  detailModel?: string;       // 세부모델
  detailTrim?: string;        // 세부트림
  options?: string[];         // 선택옵션
  exteriorColor?: string;     // 외부색상
  interiorColor?: string;     // 내부색상
  driveType?: '전륜' | '후륜' | '4륜' | 'AWD'; // 구동방식

  /* ─── 운영 상태 ─── */
  status: AssetStatus;
};

/** 차량번호 입력·매칭 UX 확인용 샘플 1대. 실데이터는 사용자가 OCR 또는 개별 입력으로 채움. */
export const SAMPLE_ASSETS: Asset[] = [
  {
    id: 'a-sample-001',
    companyCode: 'CP01',
    firstRegistDate: '2022-03-14',
    plate: '11가1234',
    vehicleClass: '승용',
    usage: '대여',
    vehicleName: '아반떼(CN7)',
    vin: 'KMHL14JA8MA123456',
    ownerName: '스위치플랜(주)',
    maker: '현대',
    modelName: '아반떼',
    detailModel: '아반떼(CN7)',
    fuelType: '가솔린',
    exteriorColor: '화이트',
    status: '운행중',
  },
];
