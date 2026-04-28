'use client';

/**
 * RegistrationForm — 자산 등록·수정·복사에서 공용으로 사용하는 폼.
 * 등록증 ① ~ ㉟ 전 항목 + 부가(차종마스터·견적서 자동입력 영역).
 */

import { useEffect, useState } from 'react';
import { DialogClose, DialogFooter } from '@/components/ui/dialog';
import { cn } from '@/lib/cn';
import { loadVehicleMaster, MAKERS_SYNC, getModels, getDetailModels } from '@/lib/vehicle-master';
import { EXT_COLORS, INT_COLORS, DRIVE_TYPES } from '@/lib/data/vehicle-constants';
import type { Asset, AssetStatus } from '@/lib/sample-assets';

const STATUS_OPTIONS: AssetStatus[] = ['등록예정', '대기', '운행중', '정비', '매각'];

type Props = {
  data: Partial<Asset>;
  onSubmit: (d: Partial<Asset>) => void;
  submitLabel?: string;
};

export function RegistrationForm({ data, onSubmit, submitLabel = '등록' }: Props) {
  return (
    <>
      <div className="form-stack">
        <Section title="식별자">
          <F label="회사코드 (CP01~CP99)" value={data.companyCode} placeholder="CP01" />
          <SF label="상태" value={data.status} options={STATUS_OPTIONS as unknown as string[]} />
        </Section>

        <Section title="등록증 헤더">
          <F label="문서확인번호"   value={data.documentNo} />
          <F label="최초등록일"     value={data.firstRegistDate} />
          <F label="등록증 발급일"  value={data.certIssueDate} />
        </Section>

        <Section title="본문">
          <F label="차량번호"  value={data.plate} />
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

        <Section title="기타">
          <F label="자동차 출고(취득)가격" value={num(data.acquisitionPrice)} colSpan={2} />
        </Section>

        <Section title="부가 — 선택입력 (등록증에 없음 / 차종마스터·견적서 연동)">
          <VehicleCascade data={data} />
          <F  label="세부트림"     value={data.detailTrim}      placeholder="견적서 업로드 시 자동" />
          <SF label="외부색상"     value={data.exteriorColor}   options={EXT_COLORS as unknown as string[]} />
          <SF label="내부색상"     value={data.interiorColor}   options={INT_COLORS as unknown as string[]} />
          <SF label="구동방식"     value={data.driveType}       options={DRIVE_TYPES as unknown as string[]} />
          <F  label="선택옵션"     value={data.options?.join(', ')} placeholder="견적서 업로드 시 자동" colSpan={3} />
        </Section>
      </div>

      <DialogFooter>
        <DialogClose asChild>
          <button className="btn">취소</button>
        </DialogClose>
        <button className="btn btn-primary" onClick={() => onSubmit(data)}>{submitLabel}</button>
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
  placeholder,
}: {
  label: string;
  value?: string;
  options: string[];
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <select className="input w-full" defaultValue={value ?? ''}>
        <option value="">{placeholder ? `- ${placeholder}` : '-'}</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

/* 차종마스터 cascading — 제조사 → 모델명 → 세부모델 종속.
   엔카 시드는 lazy fetch (첫 렌더 시 마운트). */
function VehicleCascade({ data }: { data: Partial<Asset> }) {
  const [maker, setMaker] = useState(data.maker ?? '');
  const [model, setModel] = useState(data.modelName ?? '');
  const [detailModel, setDetailModel] = useState(data.detailModel ?? '');
  const [makers, setMakers] = useState<string[]>(MAKERS_SYNC());

  useEffect(() => {
    if (makers.length > 0) return;
    let mounted = true;
    loadVehicleMaster().then(() => {
      if (mounted) setMakers(MAKERS_SYNC());
    });
    return () => { mounted = false; };
  }, [makers.length]);

  const models = getModels(maker);
  const detailModels = getDetailModels(maker, model);

  return (
    <>
      <label className="block">
        <span className="label">제조사</span>
        <select
          className="input w-full"
          value={maker}
          onChange={(e) => { setMaker(e.target.value); setModel(''); setDetailModel(''); }}
        >
          <option value="">- 차종마스터</option>
          {makers.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </label>

      <label className={cn('block', !maker && 'opacity-60')}>
        <span className="label">모델명</span>
        <select
          className="input w-full"
          value={model}
          disabled={!maker}
          onChange={(e) => { setModel(e.target.value); setDetailModel(''); }}
        >
          <option value="">{maker ? '- 모델 선택' : '- 제조사 먼저'}</option>
          {models.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </label>

      <label className={cn('block', !model && 'opacity-60')}>
        <span className="label">세부모델</span>
        <select
          className="input w-full"
          value={detailModel}
          disabled={!model}
          onChange={(e) => setDetailModel(e.target.value)}
        >
          <option value="">{model ? '- 세부모델 선택' : '- 모델 먼저'}</option>
          {detailModels.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </label>
    </>
  );
}
