/**
 * Google Gemini 기반 문서 구조화 추출 엔드포인트.
 *
 *   POST /api/ocr/extract  (multipart/form-data)
 *     - file: File (PDF | JPG | PNG)
 *     - type: 'vehicle_reg' | 'business_reg' | 'penalty'
 *
 *   → { ok: true, extracted: { ... }, model: 'gemini-2.5-flash' }
 *
 * GEMINI_API_KEY 필요. 503/429는 자동 재시도.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';

export const runtime = 'nodejs';
export const maxDuration = 120;

const MODEL = 'gemini-2.5-flash';

const VEHICLE_REG_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    car_number: { type: Type.STRING, nullable: true },
    car_name: { type: Type.STRING, nullable: true },
    manufacturer: { type: Type.STRING, nullable: true },
    car_model: { type: Type.STRING, nullable: true },
    detail_model: { type: Type.STRING, nullable: true },
    vin: { type: Type.STRING, nullable: true },
    type_number: { type: Type.STRING, nullable: true },
    engine_type: { type: Type.STRING, nullable: true },
    car_year: { type: Type.INTEGER, nullable: true },
    first_registration_date: { type: Type.STRING, nullable: true },
    category_hint: { type: Type.STRING, nullable: true },
    usage_type: { type: Type.STRING, nullable: true },
    displacement: { type: Type.INTEGER, nullable: true },
    seats: { type: Type.INTEGER, nullable: true },
    fuel_type: { type: Type.STRING, nullable: true },
    owner_name: { type: Type.STRING, nullable: true },
    owner_biz_no: { type: Type.STRING, nullable: true },
    address: { type: Type.STRING, nullable: true },
    length_mm: { type: Type.INTEGER, nullable: true },
    width_mm: { type: Type.INTEGER, nullable: true },
    height_mm: { type: Type.INTEGER, nullable: true },
    gross_weight_kg: { type: Type.INTEGER, nullable: true },
  },
  required: [
    'car_number', 'car_name', 'manufacturer', 'car_model', 'detail_model',
    'vin', 'type_number', 'engine_type', 'car_year',
    'first_registration_date', 'category_hint', 'usage_type', 'displacement',
    'seats', 'fuel_type', 'owner_name', 'owner_biz_no', 'address',
    'length_mm', 'width_mm', 'height_mm', 'gross_weight_kg',
  ],
};

const BUSINESS_REG_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    biz_no: { type: Type.STRING, nullable: true },
    corp_no: { type: Type.STRING, nullable: true },
    partner_name: { type: Type.STRING, nullable: true },
    ceo: { type: Type.STRING, nullable: true },
    open_date: { type: Type.STRING, nullable: true },
    address: { type: Type.STRING, nullable: true },
    hq_address: { type: Type.STRING, nullable: true },
    industry: { type: Type.STRING, nullable: true },
    category: { type: Type.STRING, nullable: true },
    email: { type: Type.STRING, nullable: true },
    entity_type: { type: Type.STRING, enum: ['corporate', 'individual'] },
  },
  required: [
    'biz_no', 'corp_no', 'partner_name', 'ceo', 'open_date', 'address',
    'hq_address', 'industry', 'category', 'email', 'entity_type',
  ],
};

const INSTALLMENT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    cycle: { type: Type.INTEGER, description: '회차 (1, 2, 3, ...)' },
    due_date: { type: Type.STRING, nullable: true, description: '납부일 YYYY-MM-DD' },
    amount: { type: Type.INTEGER, nullable: true, description: '회차 금액(원)' },
  },
  required: ['cycle', 'due_date', 'amount'],
};

const INSURANCE_POLICY_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    insurer: { type: Type.STRING, nullable: true, description: '보험사 (예: DB손해보험, 전국렌터카공제조합)' },
    product_name: { type: Type.STRING, nullable: true, description: '상품명 (예: 프로미카다이렉트업무용(베이직형)자동차보험)' },
    policy_no: { type: Type.STRING, nullable: true, description: '증권번호/공제번호' },
    contractor: { type: Type.STRING, nullable: true, description: '계약자 명' },
    insured: { type: Type.STRING, nullable: true, description: '피보험자 명' },
    biz_no: { type: Type.STRING, nullable: true, description: '계약자 사업자번호 (예: 158-81-*****)' },
    start_date: { type: Type.STRING, nullable: true, description: '보험 시작일 YYYY-MM-DD' },
    end_date: { type: Type.STRING, nullable: true, description: '보험 종료일(만기) YYYY-MM-DD' },
    car_number: { type: Type.STRING, nullable: true, description: '차량번호 (\\d{2,3}[가-힣]\\d{4})' },
    car_name: { type: Type.STRING, nullable: true, description: '차명' },
    car_year: { type: Type.INTEGER, nullable: true, description: '연식 4자리' },
    car_class: { type: Type.STRING, nullable: true, description: '차종 (예: 승용대형_세단)' },
    displacement: { type: Type.INTEGER, nullable: true, description: '배기량 cc' },
    seats: { type: Type.INTEGER, nullable: true, description: '정원' },
    vehicle_value_man: { type: Type.INTEGER, nullable: true, description: '차량가액(만원)' },
    accessory_value_man: { type: Type.INTEGER, nullable: true, description: '부속가액(만원)' },
    accessories: { type: Type.STRING, nullable: true, description: '부속품 텍스트 그대로' },
    driver_scope: { type: Type.STRING, nullable: true, description: '운전가능범위 (누구나운전/임직원한정/기타)' },
    driver_age: { type: Type.STRING, nullable: true, description: '운전가능연령 (만21/24/26/30/35세이상한정 등)' },
    deductible_man: { type: Type.INTEGER, nullable: true, description: '물적사고할증금액(만원)' },
    cov_personal_1: { type: Type.STRING, nullable: true, description: '대인배상Ⅰ 한도/내용' },
    cov_personal_2: { type: Type.STRING, nullable: true, description: '대인배상Ⅱ 한도 (예: 1인당 무한)' },
    cov_property: { type: Type.STRING, nullable: true, description: '대물배상 한도 (예: 1사고당 3억원)' },
    cov_self_accident: { type: Type.STRING, nullable: true, description: '자기신체사고 또는 자동차상해 한도' },
    cov_uninsured: { type: Type.STRING, nullable: true, description: '무보험차상해 한도' },
    cov_self_vehicle: { type: Type.STRING, nullable: true, description: '자기차량손해 한도/공제 (미가입이면 미가입)' },
    cov_emergency: { type: Type.STRING, nullable: true, description: '긴급출동(프로미카SOS 등) 내용' },
    paid_premium: { type: Type.INTEGER, nullable: true, description: '납입한 보험료(원)' },
    total_premium: { type: Type.INTEGER, nullable: true, description: '총보험료(원)' },
    auto_debit_bank: { type: Type.STRING, nullable: true, description: '분납 자동이체 은행 (예: 신한은행(통합))' },
    auto_debit_account: { type: Type.STRING, nullable: true, description: '자동이체 계좌번호 (마스킹 포함)' },
    auto_debit_holder: { type: Type.STRING, nullable: true, description: '자동이체 예금주' },
    installments: {
      type: Type.ARRAY,
      description: '분납 회차별 정보. 비고란의 "분납보험료: 2회차: ... / 3회차: ..." 항목을 회차/날짜/금액으로 분해. 1회차는 보통 가입시 납입한 보험료',
      items: INSTALLMENT_SCHEMA,
    },
  },
  required: [
    'insurer', 'product_name', 'policy_no', 'contractor', 'insured', 'biz_no',
    'start_date', 'end_date', 'car_number', 'car_name', 'car_year', 'car_class',
    'displacement', 'seats', 'vehicle_value_man', 'accessory_value_man', 'accessories',
    'driver_scope', 'driver_age', 'deductible_man',
    'cov_personal_1', 'cov_personal_2', 'cov_property', 'cov_self_accident',
    'cov_uninsured', 'cov_self_vehicle', 'cov_emergency',
    'paid_premium', 'total_premium',
    'auto_debit_bank', 'auto_debit_account', 'auto_debit_holder',
    'installments',
  ],
};

const DEPOSIT_INSTALLMENT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    cycle: { type: Type.INTEGER, description: '회차 (1, 2, 3)' },
    amount: { type: Type.INTEGER, nullable: true, description: '회차별 보증금 (원)' },
  },
  required: ['cycle', 'amount'],
};

const RENTAL_CONTRACT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    // 계약 메타
    contract_no: { type: Type.STRING, nullable: true, description: '계약서 번호 (있으면)' },
    contract_date: { type: Type.STRING, nullable: true, description: '계약 체결일 YYYY-MM-DD' },

    // 임차인 (계약자)
    contractor_name: { type: Type.STRING, nullable: true, description: '임차인 성명' },
    contractor_kind: { type: Type.STRING, nullable: true, enum: ['개인', '사업자', '법인'] },
    contractor_ident: { type: Type.STRING, nullable: true, description: '주민번호 (XXXXXX-XXXXXXX) 또는 사업자등록번호 (XXX-XX-XXXXX)' },
    contractor_license_no: { type: Type.STRING, nullable: true, description: '운전면허번호 (XX-XX-XXXXXX-XX)' },
    contractor_phone: { type: Type.STRING, nullable: true, description: '임차인 휴대전화' },
    contractor_address: { type: Type.STRING, nullable: true, description: '주소' },
    contractor_emergency_phone: { type: Type.STRING, nullable: true, description: '비상연락처/가족연락처' },
    contractor_biz_name: { type: Type.STRING, nullable: true, description: '개인사업자 상호 (있을 때)' },
    contractor_biz_address: { type: Type.STRING, nullable: true, description: '사업장 소재지' },

    // 차량
    car_number: { type: Type.STRING, nullable: true, description: '차량번호 \\d{2,3}[가-힣]\\d{4}' },
    car_name: { type: Type.STRING, nullable: true, description: '차종/모델명 (예: G80, 올 뉴 K3 1.6 가솔린 럭셔리 A/T)' },
    fuel: { type: Type.STRING, nullable: true, description: '연료 (가솔린/디젤/하이브리드/전기 등)' },
    color: { type: Type.STRING, nullable: true, description: '색상 (예: 화이트/블랙)' },
    options: { type: Type.STRING, nullable: true, description: '옵션 (선루프, 후방카메라 등)' },
    maintenance_product: { type: Type.STRING, nullable: true, description: '정비상품 (정비제외/엔진오일 연1회 등)' },

    // 계약 기간
    rental_period_months: { type: Type.INTEGER, nullable: true, description: '대여기간 개월. "차량 인도일로부터 48개월" → 48' },
    start_date: { type: Type.STRING, nullable: true, description: '계약시작일 YYYY-MM-DD' },
    end_date: { type: Type.STRING, nullable: true, description: '계약종료일 YYYY-MM-DD' },
    driver_age_min: { type: Type.INTEGER, nullable: true, description: '운전자 최소 연령. "만 26세이상" → 26' },
    initial_mileage_km: { type: Type.INTEGER, nullable: true, description: '현재 주행거리 km (계약 시점)' },
    annual_mileage_limit_km: { type: Type.INTEGER, nullable: true, description: '연간 약정 주행거리 km. "3.0만Km" → 30000' },

    // 결제
    monthly_amount: { type: Type.INTEGER, nullable: true, description: '월 대여료 (원, VAT 포함)' },
    deposit_total: { type: Type.INTEGER, nullable: true, description: '보증금 합계 (원). 분납이면 회차별 합산' },
    deposit_installments: {
      type: Type.ARRAY,
      description: '보증금 분납 회차별. 일시납이면 [{cycle:1, amount:전체}]. 분납이면 1·2·3회차 모두',
      items: DEPOSIT_INSTALLMENT_SCHEMA,
    },
    purchase_option_amount: { type: Type.STRING, nullable: true, description: '인수가격. "만기협의"/숫자/null' },
    payment_account_bank: { type: Type.STRING, nullable: true, description: '입금계좌 은행 (예: 신한은행)' },
    payment_account_no: { type: Type.STRING, nullable: true, description: '입금계좌번호 (140-013-750928)' },
    payment_account_holder: { type: Type.STRING, nullable: true, description: '입금계좌 예금주 (회사명)' },
    autopay_day: { type: Type.INTEGER, nullable: true, description: '자동이체일 (5/10/15/20/25 중 1, 체크된 거 우선)' },

    // 회사 (임대인)
    company_name: { type: Type.STRING, nullable: true, description: '렌트회사명' },
    company_ceo: { type: Type.STRING, nullable: true, description: '대표자' },
    company_biz_no: { type: Type.STRING, nullable: true, description: '회사 사업자번호' },
    company_phone: { type: Type.STRING, nullable: true, description: '회사 연락처' },
    company_address: { type: Type.STRING, nullable: true, description: '회사 주소' },
  },
  required: [
    'contract_no', 'contract_date',
    'contractor_name', 'contractor_kind', 'contractor_ident', 'contractor_license_no',
    'contractor_phone', 'contractor_address', 'contractor_emergency_phone',
    'contractor_biz_name', 'contractor_biz_address',
    'car_number', 'car_name', 'fuel', 'color', 'options', 'maintenance_product',
    'rental_period_months', 'start_date', 'end_date',
    'driver_age_min', 'initial_mileage_km', 'annual_mileage_limit_km',
    'monthly_amount', 'deposit_total', 'deposit_installments',
    'purchase_option_amount', 'payment_account_bank', 'payment_account_no',
    'payment_account_holder', 'autopay_day',
    'company_name', 'company_ceo', 'company_biz_no', 'company_phone', 'company_address',
  ],
};

const PENALTY_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    doc_type: { type: Type.STRING, nullable: true, description: '과태료/범칙금/통행료/주정차위반/속도위반/신호위반/기타' },
    notice_no: { type: Type.STRING, nullable: true, description: '고지서번호 (있으면)' },
    issuer: { type: Type.STRING, nullable: true, description: '발급기관 (예: ○○경찰서, ○○시청)' },
    issue_date: { type: Type.STRING, nullable: true, description: '발송일/발급일 YYYY-MM-DD' },
    car_number: { type: Type.STRING, nullable: true, description: '차량번호 (정확히 \\d{2,3}[가-힣]\\d{4})' },
    date: { type: Type.STRING, nullable: true, description: '위반일시 YYYY-MM-DD HH:mm (시간 없으면 YYYY-MM-DD)' },
    location: { type: Type.STRING, nullable: true, description: '위반장소' },
    description: { type: Type.STRING, nullable: true, description: '위반내용 (예: 주정차위반, 속도위반(50km/h 초과))' },
    law_article: { type: Type.STRING, nullable: true, description: '적용법조 (예: 도로교통법 제32조)' },
    amount: { type: Type.INTEGER, nullable: true, description: '실제 부과 금액 (원). 과태료 또는 통행료 등 메인 금액' },
    due_date: { type: Type.STRING, nullable: true, description: '납부기한 YYYY-MM-DD' },
    pay_account: { type: Type.STRING, nullable: true, description: '납부 가상계좌 (은행 + 계좌번호)' },
  },
  required: [
    'doc_type', 'notice_no', 'issuer', 'issue_date', 'car_number',
    'date', 'location', 'description', 'law_article',
    'amount', 'due_date', 'pay_account',
  ],
};

interface TypeSpec {
  label: string;
  prompt: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: any;
}

const TYPE_SPECS: Record<string, TypeSpec> = {
  vehicle_reg: {
    label: '자동차등록증',
    prompt: `이 문서는 한국 자동차등록증입니다. 차량번호는 \`\\d{2,3}[가-힣]\\d{4}\` 포맷만 유효합니다. 한글이 없거나 17자/하이픈 포함이면 절대 car_number로 넣지 마세요. 값 없으면 null.`,
    schema: VEHICLE_REG_SCHEMA,
  },
  business_reg: {
    label: '사업자등록증',
    prompt: `이 문서는 한국 사업자등록증입니다. 사업자등록번호 XXX-XX-XXXXX, 법인등록번호 XXXXXX-XXXXXXX. 개인사업자는 corp_no=null. 값 없으면 null.`,
    schema: BUSINESS_REG_SCHEMA,
  },
  insurance_policy: {
    label: '자동차보험증권',
    prompt: `이 문서는 한국의 자동차보험증권(또는 렌터카공제 가입증명서)입니다. 보통 1쪽 단위로 1대 차량의 보험 정보를 담고 있습니다.

## 핵심 추출 규칙

- **insurer**: 상단 로고/문구로 식별. "DB손해보험"·"DB손해보험주식회사" → "DB손해보험". "전국렌터카공제조합"·"KRMA" → "전국렌터카공제조합". 그 외는 원문.
- **product_name**: "프로미카다이렉트업무용(베이직형)자동차보험", "플러스자동차공제" 등 상단 상품명 텍스트 그대로.
- **policy_no**: "증권번호" 또는 "공제번호" 라벨 옆 값. 하이픈 포함 그대로.
- **start_date / end_date**: "보험기간 YYYY년 MM월 DD일 ~ YYYY년 MM월 DD일" → YYYY-MM-DD 두 개로 분해.
- **car_number**: 정확히 \`\\d{2,3}[가-힣]\\d{4}\` 포맷. 한글 없거나 하이픈/17자면 무조건 null.
- **car_year**: "연식 2017년" → 2017 (정수).
- **car_class**: "승용대형_세단 (2,500cc초과)" 같은 텍스트 그대로.
- **displacement**: "3,342CC" → 3342 (정수).
- **seats**: "정원 5 명" → 5.
- **vehicle_value_man / accessory_value_man**: "차량가액(부속가액) 1,331 만원(20만원)" → vehicle=1331, accessory=20.
- **accessories**: "블랙박스, 파노라마선루프" 등 부속품란 원문.
- **driver_scope**: "누구나운전" / "임직원한정" / "가족운전" 등.
- **driver_age**: "만21세이상한정", "만35세이상한정" 등.
- **deductible_man**: "(물적사고할증금액 : 200만원)" → 200.
- **cov_personal_1**: 대인배상Ⅰ 셀 ("자배법시행령에서 규정한 한도" 등).
- **cov_personal_2**: 대인배상Ⅱ 셀 ("1인당 무한" 등).
- **cov_property**: 대물배상 셀.
- **cov_self_accident**: "자기신체사고" 또는 "자동차상해" 한도 텍스트.
- **cov_uninsured**: 무보험차상해.
- **cov_self_vehicle**: 자기차량손해. "미가입"이면 "미가입".
- **cov_emergency**: "프로미카SOS 긴급출동서비스 (6)회, 긴급견인(40Km)" 같이 통째로.
- **paid_premium / total_premium**: "납입한 보험료 1,002,090 원", "총보험료 1,388,610 원" → 콤마 제거 정수.

## 분납 자동이체 / 회차별 분납

비고란에 "분납 자동이체 : 신한은행(통합) / 14001438**** / 스위치플랜(주)" 형태로 들어 있음:
- **auto_debit_bank** = "신한은행(통합)"
- **auto_debit_account** = "14001438****"  (마스킹 그대로)
- **auto_debit_holder** = "스위치플랜(주)"

그 다음 줄 "분납보험료: 2회차: 2026.04.14 / 77,300원, 3회차: 2026.05.14 / 77,300원, 4회차: ..." 형태:
- **installments**: 배열로 분해. **1회차 = 가입시 납입(= paid_premium 액수, due_date=start_date)**로 추가하고, 그 뒤 2회차/3회차/.../6회차 순서대로.
  예) 보험기간 2026-03-14 시작, 납입한보험료 1,002,090원, 분납 2회차 2026.04.14 / 77,300원 ...
  → installments = [
       { cycle: 1, due_date: "2026-03-14", amount: 1002090 },
       { cycle: 2, due_date: "2026-04-14", amount: 77300 },
       { cycle: 3, due_date: "2026-05-14", amount: 77300 },
       ...
     ]

분납 정보가 아예 없는 일시납 증권은 installments에 [{cycle:1, due_date:start_date, amount:total_premium}] 한 건만 넣음.

값 없으면 null. 차량번호는 포맷 안 맞으면 무조건 null.`,
    schema: INSURANCE_POLICY_SCHEMA,
  },
  rental_contract: {
    label: '자동차 렌탈(대여) 계약서',
    prompt: `이 문서는 한국 자동차 렌탈(대여) 계약서입니다. 보통 다중 페이지 PDF (계약서 본문 + 사실확인서 + 동의서 + 자동이체 신청서 + 약관 등)이며 1번째·2번째 페이지에 핵심 정보가 모두 들어 있습니다.

## 핵심 추출 규칙

### 임차인 (계약자)
- **contractor_name**: 성명 셀의 이름. "홍길동" 등
- **contractor_kind**: "개인사업자(해당 시 기입)" 박스에 사업자정보가 채워져 있으면 "사업자". 사업자 정보가 비어있고 주민번호만 있으면 "개인". 법인이면 "법인"
- **contractor_ident**: 주민번호(XXXXXX-XXXXXXX) 또는 사업자등록번호(XXX-XX-XXXXX). 신분에 맞는 거 우선
- **contractor_license_no**: 면허번호 (XX-XX-XXXXXX-XX 포맷)
- **contractor_phone**: 전화번호 / 휴대전화
- **contractor_address**: 주소 (서울/경기 등)
- **contractor_emergency_phone**: "비상연락처" 또는 "가족 연락처" 셀
- **contractor_biz_name**: 개인사업자 박스의 "상호" (있을 때)
- **contractor_biz_address**: "사업장소재지"

### 차량
- **car_number**: 정확히 \`\\d{2,3}[가-힣]\\d{4}\` 포맷. "12가1234" 등. "차량번호(차대번호)" 셀 또는 상단 "계약서 번호" 줄 참고. 한글 없거나 17자 차대번호면 무조건 null
- **car_name**: "대여차종(모델명, 트림)" 셀. "G80", "올 뉴 K3 1.6 가솔린 럭셔리 A/T" 등
- **fuel**: "연료" 셀. "가솔린", "디젤", "하이브리드", "전기"
- **color**: "색상" 셀. "화이트/블랙", "흰색" 등 그대로
- **options**: "옵션" 셀. "선루프" 등
- **maintenance_product**: "정비상품" 셀. "정비제외" / "엔진오일 연1회" 등

### 계약 기간
- **rental_period_months**: "대여기간" / "차량 인도일로부터 N개월". "차량 인도일로부터 48개월" → 48
- **start_date**: "계약시작일" YYYY-MM-DD. 비어있으면 null
- **end_date**: "계약종료일" YYYY-MM-DD. 비어있으면 null
- **driver_age_min**: "운전자 연령". "만 26세이상" → 26
- **initial_mileage_km**: "현재 주행거리". "100,000Km" → 100000
- **annual_mileage_limit_km**: "연간 약정 주행거리". "3.0만Km" → 30000

### 결제
- **monthly_amount**: "월 대여료" 큰 숫자. "1,000,000" → 1000000
- **deposit_total**: 1·2·3회차 보증금 합. 일시납이면 1회차만
- **deposit_installments**: 보증금 분납 박스. "보증금 분납 여부 = 일시납"이면 1회차만, 분납이면 회차별 모두. amount 비어있으면 null로 (cycle만 채움)
- **purchase_option_amount**: "인수가격" 셀. "만기협의" / 숫자 / null
- **payment_account_bank**: "대여료 입금계좌" 라인의 은행명 (예: "신한은행")
- **payment_account_no**: 입금계좌번호 (140-013-750928 등)
- **payment_account_holder**: 입금계좌 예금주 = 회사명
- **autopay_day**: "대여료 자동이체일" 라인. 5/10/15/20/25 중 □ 체크된 거 우선. 체크 인식 어려우면 가장 명확한 숫자 1개

### 회사 (임대인)
- **company_name**: "렌트회사" 셀 또는 표지의 큰 회사명
- **company_ceo**: "대표자"
- **company_biz_no**: 회사 사업자번호 (XXX-XX-XXXXX)
- **company_phone**: 회사 연락처 (1544-3871 등)
- **company_address**: 회사 주소

## 추출 원칙
1. 라벨이 같은 줄/셀 또는 인접 셀에 있는 값을 우선 매칭
2. "년 월 일" 형태인데 빈 칸이면 null (placeholder)
3. 금액은 콤마 제거 후 정수
4. 차량번호 포맷 안 맞으면 무조건 null`,
    schema: RENTAL_CONTRACT_SCHEMA,
  },
  penalty: {
    label: '과태료/범칙금/통행료 고지서',
    prompt: `이 문서는 한국의 과태료·범칙금·통행료·주정차위반·속도위반·신호위반 등 교통 관련 부과 고지서입니다.

## 핵심 필드

- **car_number** (차량번호): 정확히 \`\\d{2,3}[가-힣]\\d{4}\` 포맷. 예 "01도9893", "12가3456". 한글이 없거나 하이픈 포함이면 절대 차량번호 아님.
- **doc_type** (구분): 다음 중 하나로 분류 — "과태료", "범칙금", "통행료", "주정차위반", "속도위반", "신호위반", "기타". 문서에 "통행료"가 있으면 "통행료". "주정차"는 "주정차위반". "속도"+"과태료"면 "속도위반". "신호"+"과태료"면 "신호위반". 기본은 "과태료".
- **notice_no** (고지서번호): 고지서 우상단 또는 OMR 영역의 번호. 하이픈/공백 제거.
- **issuer** (발급기관): "○○경찰서", "○○시청", "○○구청", "○○영업소" 등. 문서 발신/직인.
- **issue_date** (발송일): YYYY-MM-DD.
- **date** (위반일시): YYYY-MM-DD HH:mm (시간 표시 있을 때). 시간 없으면 YYYY-MM-DD.
- **location** (위반장소): 도로명·지번 그대로. 통행료면 영업소/대교/터널 이름.
- **description** (위반내용): "속도위반(50km/h 초과)", "주정차금지위반" 등 구체. 통행료면 "통행료 미납".
- **law_article** (적용법조): "도로교통법 제xx조" 형식.
- **amount** (금액): 실제 부과 금액(원) — 정수. 과태료/범칙금/통행료 중 메인 금액 하나.
- **due_date** (납부기한): YYYY-MM-DD.
- **pay_account** (납부계좌): "농협 123-4567-8901" 같이 은행+계좌 결합.

## 추출 원칙

1. 라벨이 같은 줄 또는 바로 다음 줄에 있는 값을 우선 매칭.
2. 금액은 콤마 제거 후 정수로 변환.
3. 라벨에 매칭되는 값이 명확하지 않으면 null.
4. 차량번호는 위 포맷에 안 맞으면 무조건 null.`,
    schema: PENALTY_SCHEMA,
  },
};

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: 'GEMINI_API_KEY 환경변수 미설정' },
      { status: 500 },
    );
  }

  let docType: string | null;
  let file: File | null;
  try {
    const formData = await req.formData();
    docType = String(formData.get('type') || '');
    file = formData.get('file') as File | null;
  } catch (err) {
    return NextResponse.json({ ok: false, error: `FormData 파싱 실패: ${(err as Error).message}` }, { status: 400 });
  }

  if (!file) {
    return NextResponse.json({ ok: false, error: 'file 필드 누락' }, { status: 400 });
  }
  const spec = TYPE_SPECS[docType ?? ''];
  if (!spec) {
    return NextResponse.json({ ok: false, error: `지원하지 않는 type: ${docType}` }, { status: 400 });
  }

  if (file.size > 20 * 1024 * 1024) {
    return NextResponse.json({ ok: false, error: '파일 크기는 20MB 이하만 가능' }, { status: 413 });
  }

  const arrayBuf = await file.arrayBuffer();
  const base64 = Buffer.from(arrayBuf).toString('base64');
  const mediaType = file.type || inferMediaTypeFromName(file.name);

  const ai = new GoogleGenAI({ apiKey });

  async function callWithRetry(): Promise<Awaited<ReturnType<typeof ai.models.generateContent>>> {
    const maxRetries = 3;
    let lastErr: unknown;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await ai.models.generateContent({
          model: MODEL,
          contents: [{
            role: 'user',
            parts: [
              { inlineData: { mimeType: mediaType, data: base64 } },
              { text: spec.prompt },
            ],
          }],
          config: {
            responseMimeType: 'application/json',
            responseSchema: spec.schema,
            temperature: 0,
            ...(MODEL.startsWith('gemini-2.5') ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
            maxOutputTokens: 2048,
          },
        });
      } catch (err) {
        lastErr = err;
        const msg = (err as { message?: string })?.message ?? '';
        const isRetryable = msg.includes('503') || msg.includes('429') || msg.includes('UNAVAILABLE') || msg.includes('RESOURCE_EXHAUSTED');
        if (!isRetryable || attempt === maxRetries - 1) throw err;
        const delayMs = Math.min(1000 * Math.pow(2, attempt), 8000) + Math.random() * 1000;
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
    throw lastErr;
  }

  try {
    const response = await callWithRetry();
    const text = response.text;
    if (!text) {
      return NextResponse.json({ ok: false, error: 'Gemini 응답에 텍스트 없음' }, { status: 502 });
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      return NextResponse.json(
        { ok: false, error: `JSON 파싱 실패: ${(err as Error).message}`, raw: text },
        { status: 502 },
      );
    }

    // 차량번호 후처리 — 잘못 잡은 garbage 제거
    if ((docType === 'vehicle_reg' || docType === 'penalty' || docType === 'insurance_policy' || docType === 'rental_contract') && parsed.car_number && typeof parsed.car_number === 'string') {
      const cn = parsed.car_number.replace(/[\s-]/g, '');
      const valid = /^\d{2,3}[가-힣]\d{4}$/.test(cn);
      parsed.car_number = valid ? cn : null;
    }

    if (docType === 'vehicle_reg' && !parsed.detail_model && parsed.car_name) {
      const cleanedName = String(parsed.car_name).replace(/\s*\([^)]*\)/g, '').trim();
      if (cleanedName) parsed.detail_model = cleanedName;
    }

    return NextResponse.json({
      ok: true,
      doc_type: docType,
      doc_label: spec.label,
      extracted: parsed,
      model: MODEL,
      usage: {
        input_tokens: response.usageMetadata?.promptTokenCount ?? 0,
        output_tokens: response.usageMetadata?.candidatesTokenCount ?? 0,
      },
    });
  } catch (err) {
    const e = err as { status?: number; message?: string };
    const msg = e.message || String(err);
    const status = typeof e.status === 'number' ? e.status : 500;
    return NextResponse.json({ ok: false, error: `Gemini API 실패: ${msg}` }, { status });
  }
}

function inferMediaTypeFromName(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'pdf': return 'application/pdf';
    case 'jpg': case 'jpeg': return 'image/jpeg';
    case 'png': return 'image/png';
    case 'gif': return 'image/gif';
    case 'webp': return 'image/webp';
    default: return 'application/octet-stream';
  }
}
