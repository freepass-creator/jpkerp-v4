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
    if ((docType === 'vehicle_reg' || docType === 'penalty') && parsed.car_number && typeof parsed.car_number === 'string') {
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
