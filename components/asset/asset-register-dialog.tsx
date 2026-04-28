'use client';

import { useState } from 'react';
import { Upload, FileXls, Pencil, Plus } from '@phosphor-icons/react';
import { Dialog, DialogTrigger, DialogContent, DialogClose, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import type { Asset } from '@/lib/sample-assets';

type Props = {
  onCreate: (asset: Partial<Asset>) => void;
};

export function AssetRegisterDialog({ onCreate }: Props) {
  const [open, setOpen] = useState(false);
  const [parsed, setParsed] = useState<Partial<Asset> | null>(null);

  // OCR stub — 첨부된 등록증(01도9893 모닝)을 파싱한 듯한 결과
  function handleFileUpload(_file: File) {
    setParsed({
      documentNo: '7836830517987332',
      firstRegistDate: '2017-09-21',
      certIssueDate: '2025-12-22',
      plate: '01도9893',
      vehicleClass: '경형 승용',
      usage: '자가용',
      vehicleName: '모닝',
      modelType: 'JA51BA-T6-P',
      manufactureDate: '2017-09',
      vin: 'KNAB5511BHT151725',
      engineType: 'G3LA',
      ownerLocation: '경기도 연천군 전곡읍 은천로 97',
      ownerName: '스위치플랜(주)',
      ownerRegNumber: '110111-8596368',
      approvalNumber: 'A01-1-00062-0019-1416',
      length: 3595, width: 1595, height: 1485,
      totalWeight: 1280, capacity: 5, maxLoad: 0,
      displacement: 998, ratedOutput: '76/6200', cylinders: '3',
      fuelType: '휘발유(무연)', fuelEfficiency: 14.7,
      mortgageType: '저당설정', mortgageDate: '2024-10-21',
      inspectionFrom: '2024-08-21', inspectionTo: '2026-08-20',
      mileage: 50199, inspectionType: '종합검사(경과)',
      acquisitionPrice: 14386363,
    });
  }

  function handleSubmit() {
    if (!parsed) return;
    onCreate(parsed);
    setOpen(false);
    setParsed(null);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="btn btn-primary">
          <Plus size={14} weight="bold" /> 자산등록
        </button>
      </DialogTrigger>

      <DialogContent title="자산 등록 (자동차등록증 기준)" size="xl">
        <Tabs defaultValue="ocr">
          <TabsList>
            <TabsTrigger value="ocr">
              <Upload size={14} className="mr-1.5 inline" /> 등록증 OCR
            </TabsTrigger>
            <TabsTrigger value="manual">
              <Pencil size={14} className="mr-1.5 inline" /> 개별 입력
            </TabsTrigger>
            <TabsTrigger value="sheet">
              <FileXls size={14} className="mr-1.5 inline" /> 시트 (다건)
            </TabsTrigger>
          </TabsList>

          <TabsContent value="ocr">
            {parsed ? (
              <RegistrationForm data={parsed} onSubmit={handleSubmit} />
            ) : (
              <DropZone onUpload={handleFileUpload} />
            )}
          </TabsContent>

          <TabsContent value="manual">
            <RegistrationForm data={{}} onSubmit={(d) => { onCreate(d); setOpen(false); }} />
          </TabsContent>

          <TabsContent value="sheet">
            <div className="text-sub text-center py-8">
              구글시트 / 엑셀 붙여넣기 영역 (나중 구현)
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function DropZone({ onUpload }: { onUpload: (f: File) => void }) {
  return (
    <label className="block border border-dashed py-12 text-center cursor-pointer hover:bg-stripe">
      <input
        type="file"
        accept="image/*,.pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onUpload(f);
        }}
      />
      <Upload size={28} className="mx-auto text-weak" />
      <div className="mt-2 text-sub">자동차등록증 이미지 / PDF를 드롭하거나 클릭</div>
      <div className="mt-1 text-weak">JPG / PNG / PDF</div>
    </label>
  );
}

/* ─── Registration form ─── */

function RegistrationForm({
  data,
  onSubmit,
}: {
  data: Partial<Asset>;
  onSubmit: (d: Partial<Asset>) => void;
}) {
  // 완성된 폼 제출은 실데이터 연결 시점에 — 지금은 받은 data 그대로 전달
  return (
    <>
      <div className="form-stack">

        <Section title="등록증 헤더">
          <F label="문서확인번호"   value={data.documentNo} />
          <F label="최초등록일"     value={data.firstRegistDate} />
          <F label="등록증 발급일"  value={data.certIssueDate} />
        </Section>

        <Section title="본문">
          <F label="자동차등록번호"  value={data.plate} />
          <F label="차종"           value={data.vehicleClass} />
          <F label="용도"           value={data.usage} />
          <F label="차명"           value={data.vehicleName} />
          <F label="형식"           value={data.modelType} />
          <F label="제작연월"       value={data.manufactureDate} />
          <F label="차대번호"       value={data.vin} colSpan={2} />
          <F label="원동기형식"     value={data.engineType} />
          <F label="사용본거지"     value={data.ownerLocation} colSpan={3} />
          <F label="성명/명칭"      value={data.ownerName} colSpan={2} />
          <F label="법인등록번호"   value={data.ownerRegNumber} colSpan={2} />
        </Section>

        <Section title="1. 제원">
          <F label="제원관리번호"   value={data.approvalNumber} colSpan={2} />
          <F label="길이 (mm)"      value={num(data.length)} />
          <F label="너비 (mm)"      value={num(data.width)} />
          <F label="높이 (mm)"      value={num(data.height)} />
          <F label="총중량 (kg)"    value={num(data.totalWeight)} />
          <F label="승차정원"       value={num(data.capacity)} />
          <F label="최대적재량"     value={num(data.maxLoad)} />
          <F label="배기량 (cc)"    value={num(data.displacement)} />
          <F label="정격출력"       value={data.ratedOutput} />
          <F label="기통수"         value={data.cylinders} />
          <F label="연료종류"       value={data.fuelType} />
          <F label="연료소비율 (km/L)" value={num(data.fuelEfficiency)} />
          <F label="셀 제조사 (전기차)"  value={data.batteryMaker} />
          <F label="셀 형태 (전기차)"    value={data.batteryShape} />
          <F label="셀 주요원료 (전기차)" value={data.batteryMaterial} colSpan={2} />
        </Section>

        <Section title="2. 등록번호판 교부">
          <F label="구분"           value={data.plateIssueType} />
          <F label="발급일"         value={data.plateIssueDate} />
          <F label="발급대행자확인" value={data.plateIssueAgent} colSpan={2} />
        </Section>

        <Section title="3. 저당권등록사실">
          <F label="구분"           value={data.mortgageType} />
          <F label="날짜"           value={data.mortgageDate} />
        </Section>

        <Section title="4. 검사 유효기간">
          <F label="부터"           value={data.inspectionFrom} />
          <F label="까지"           value={data.inspectionTo} />
          <F label="시행장소"       value={data.inspectionPlace} colSpan={2} />
          <F label="주행거리 (km)"  value={num(data.mileage)} />
          <F label="책임자확인"     value={data.inspectionAuthority} />
          <F label="검사구분"       value={data.inspectionType} colSpan={2} />
        </Section>

        <Section title="기타">
          <F label="자동차 출고(취득)가격" value={num(data.acquisitionPrice)} colSpan={2} />
        </Section>

        <Section title="부가 — 선택입력 (등록증에 없음)">
          <F label="제조사"            value={data.maker}            placeholder="예: 기아" />
          <F label="모델명"            value={data.modelName}        placeholder="예: 올뉴 모닝" />
          <F label="세부모델"          value={data.detailModel}      placeholder="예: JA" />
          <F label="세부트림"          value={data.detailTrim}       placeholder="예: 디럭스 스페셜" />
          <F label="외부색상"          value={data.exteriorColor} />
          <F label="내부색상"          value={data.interiorColor} />
          <SF label="구동방식"         value={data.driveType} options={['전륜', '후륜', '4륜', 'AWD']} />
          <F label="선택옵션"          value={data.options?.join(', ')} placeholder="선루프, 내비게이션, ..." />
        </Section>
      </div>

      <DialogFooter>
        <DialogClose asChild>
          <button className="btn">취소</button>
        </DialogClose>
        <button className="btn btn-primary" onClick={() => onSubmit(data)}>등록</button>
      </DialogFooter>
    </>
  );
}

function num(n?: number): string {
  return typeof n === 'number' ? String(n) : '';
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="form-section">
      <div className="form-section-title">{title}</div>
      <div className="form-grid">{children}</div>
    </div>
  );
}

function F({
  label,
  value,
  placeholder,
  colSpan = 1,
}: {
  label: string;
  value?: string;
  placeholder?: string;
  colSpan?: 1 | 2 | 3 | 4;
}) {
  const span = colSpan === 1 ? '' : colSpan === 2 ? 'col-span-2' : colSpan === 3 ? 'col-span-3' : 'col-span-4';
  return (
    <label className={`block ${span}`}>
      <span className="label">{label}</span>
      <input className="input w-full" defaultValue={value ?? ''} placeholder={placeholder} />
    </label>
  );
}

function SF({
  label,
  value,
  options,
}: {
  label: string;
  value?: string;
  options: string[];
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <select className="input w-full" defaultValue={value ?? ''}>
        <option value="">-</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}
