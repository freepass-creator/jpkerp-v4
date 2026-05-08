import type { AuditFields, AuditActor } from './audit-fields';

export type AssetStatus = '등록예정' | '대기' | '운행중' | '정비' | '매각';

/**
 * 차량 구매 흐름 — 신차 구매부터 고객인도까지 8단계 메타데이터.
 *
 *  1. 구매결정          decide        — flow 시작 (다이얼로그)
 *  2. 생산일정확정      productionConfirm
 *  3. 증차신청          apply
 *  4. 차량출고(입고)    intake        — 우리가 차량을 받는 시점
 *  5. 상품화·차량등록   productize    — 등록증 발급 + 블박/선팅/번호판 등 묶음
 *  6. 1차 해피콜        happyCall1    — 고객 진행상황 안내·일정조율
 *  7. 2차 해피콜        happyCall2    — 고객 인도일정 최종 확정
 *  8. 고객인도          deliver       — 출고 event 완료 + 운행중 전환
 *
 * 구매결정 시점에 자산이 placeholder plate (`구매-YYMM-NNN`) + status='등록예정' 으로
 * 즉시 push 되고, 5단계(상품화·등록)에서 placeholder 가 실제 plate 로 교체된다.
 */
export type ProductizationItem = {
  key: string;            // '블박' | '선팅' | '번호판' | 자유 텍스트
  required?: boolean;     // 회사 정책상 필수 (false 면 옵션)
  doneAt?: string;
  doneBy?: AuditActor;
  note?: string;
};

export type PurchaseFlow = {
  /* 1 — 구매결정 */
  decidedAt: string;
  decidedBy: AuditActor;
  matchedContractId?: string;

  vehicleSpecMemo?: string;
  exteriorColor?: string;
  expectedIntakeDate?: string;
  decisionNote?: string;

  /* 2 — 생산일정확정 (제조사로부터 생산·출고 일정 통보 받음) */
  productionConfirmAt?: string;
  productionConfirmBy?: AuditActor;
  expectedProductionDate?: string;   // 제조사 예상 출고일

  /* 3 — 증차신청 (관할 구청·VAN) */
  applicationNo?: string;
  applicationDoneAt?: string;
  applicationDoneBy?: AuditActor;

  /* 4 — 차량출고(입고) — 차량 도착 */
  intakeAt?: string;
  intakeBy?: AuditActor;
  intakeLocation?: string;

  /* 5 — 상품화·차량등록 (등록증 발급 + 블박/선팅/번호판 등) */
  registeredAt?: string;
  registeredBy?: AuditActor;
  productizationItems?: ProductizationItem[];
  productizationCompletedAt?: string;   // 모든 required item 완료 시점

  /* 6 — 1차 해피콜 */
  happyCall1At?: string;
  happyCall1By?: AuditActor;
  happyCall1Note?: string;

  /* 7 — 2차 해피콜 */
  happyCall2At?: string;
  happyCall2By?: AuditActor;
  happyCall2Note?: string;

  /* 8 — 고객인도 */
  /** 고객 출고예정일 — 1차/2차 해피콜에서 협의·확정. D-2 SMS 알람 트리거. */
  expectedDeliveryDate?: string;
  deliveredAt?: string;
  deliveredBy?: AuditActor;

  /** 흐름 종료 — 인도 완료(매칭) 또는 입고 마감(선도). */
  closedAt?: string;
};

/** 회사 기본 상품화 항목 — 신규 구매 시 자동 채움. 추후 회사별 설정으로 분리 가능. */
export const DEFAULT_PRODUCTIZATION_ITEMS: ProductizationItem[] = [
  { key: '블박', required: true },
  { key: '선팅', required: true },
  { key: '번호판', required: true },
];

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
  assetCode?: string;         // 차량코드 (CP01VH0001) — 회사+VH+4자리. 등록 시 자동 부여, 변경 불가.

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

  /** 구매 흐름 메타. 차량구매 다이얼로그로 시작된 자산만 가짐. */
  purchase?: PurchaseFlow;

  /* ─── 등록증 원본 (OCR 한 첫 페이지를 이미지 dataUrl 로 보관) ─── */
  /** 등록증 이미지 dataUrl. insurance/contract.fileDataUrl 와 동일 키 (규격 통일). */
  fileDataUrl?: string;
  fileName?: string;

  /** 소프트 삭제 — 코드 영구 보존 (재발급 금지). */
  deletedAt?: string;  // ISO 시각. 미설정이면 active.
} & AuditFields;

/** 실데이터는 사용자가 OCR 또는 개별 입력으로 채움. 샘플 없음. */
export const SAMPLE_ASSETS: Asset[] = [];

/** active 차량만 (UI 드롭다운·신규 매칭용). */
export function activeAssets(assets: readonly Asset[]): Asset[] {
  return assets.filter((a) => !a.deletedAt);
}
