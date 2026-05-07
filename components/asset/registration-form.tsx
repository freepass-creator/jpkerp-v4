'use client';

/**
 * RegistrationForm — 자산 등록·수정·복사·조회에서 공용으로 사용하는 폼.
 * 등록증 ① ~ ㉟ 전 항목 + 부가(차종마스터·견적서 자동입력 영역) + 첨부 미리보기.
 *
 * 4-mode UX:
 *  - view      : readonly (회색)   — 더블클릭 진입, [수정]으로 edit 전환
 *  - edit      : editable (황색)   — view 의 [수정] 클릭
 *  - create    : editable (기본)   — + 자산등록 manual 탭
 *  - duplicate : editable (녹색)   — 우클릭 메뉴 → 복사 (unique 필드 비움)
 */

import { useEffect, useState } from 'react';
import type { Icon as PhosphorIcon } from '@phosphor-icons/react';
import { IdentificationCard, FileText, Car } from '@phosphor-icons/react';
import { DialogClose, DialogFooter } from '@/components/ui/dialog';
import { cn } from '@/lib/cn';
import { loadVehicleMaster, MAKERS_SYNC, getModels, getDetailModels } from '@/lib/vehicle-master';
import { EXT_COLORS, INT_COLORS, DRIVE_TYPES } from '@/lib/data/vehicle-constants';
import { fileToImageDataUrl } from '@/lib/pdf-to-image';
import type { Asset, AssetStatus } from '@/lib/sample-assets';

const STATUS_OPTIONS: AssetStatus[] = ['등록예정', '대기', '운행중', '정비', '매각'];

export type FormMode = 'view' | 'edit' | 'create' | 'duplicate';

type Props = {
  data: Partial<Asset>;
  onSubmit: (d: Partial<Asset>) => void;
  submitLabel?: string;
  /** 'view' = readonly + 회색 / 'edit' = 황색 / 'create' = 기본 / 'duplicate' = 녹색 */
  mode?: FormMode;
  /** 저장/취소 버튼 hide (다이얼로그가 자체 footer 가지는 경우) */
  hideFooter?: boolean;
};

export function RegistrationForm({
  data,
  onSubmit,
  submitLabel = '등록',
  mode = 'create',
  hideFooter = false,
}: Props) {
  // 첨부 (create/duplicate 모드에서만 변경 가능). view/edit 은 미리보기 only.
  const [fileDataUrl, setFileDataUrl] = useState<string | undefined>(data.fileDataUrl);
  const [fileName, setFileName] = useState<string | undefined>(data.fileName);

  useEffect(() => {
    setFileDataUrl(data.fileDataUrl);
    setFileName(data.fileName);
  }, [data.fileDataUrl, data.fileName]);

  const isReadonly = mode === 'view';
  const canEditAttachment = mode === 'create' || mode === 'duplicate';

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const url = await fileToImageDataUrl(f);
      setFileDataUrl(url);
      setFileName(f.name);
    } catch (err) {
      alert('파일 읽기 실패: ' + (err instanceof Error ? err.message : String(err)));
    }
  }

  function handleSubmit() {
    onSubmit({ ...data, fileDataUrl, fileName });
  }

  return (
    <>
      <fieldset
        disabled={isReadonly}
        className={cn('form-stack', `form-mode-${mode}`)}
        style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
      >
        <Section title="기본정보" icon={IdentificationCard}>
          <F  label="차량번호"        value={data.plate} />
          <F  label="회사코드 (CP01~CP99)" value={data.companyCode} placeholder="CP01" />
          <SF label="상태"            value={data.status} options={STATUS_OPTIONS as unknown as string[]} />
          <F  label="소유자명"        value={data.ownerName} colSpan={2} />
          <F  label="법인등록번호"    value={data.ownerRegNumber} />
          <F  label="사용본거지"      value={data.ownerLocation} colSpan={3} />
        </Section>

        <Section title="제조사 스펙" icon={Car}>
          <VehicleCascade data={data} />
          <F  label="세부트림"  value={data.detailTrim}    placeholder="견적서 업로드 시 자동" colSpan={2} />
          <F  label="제작연월"  value={data.manufactureDate} placeholder="2024-03 (연식)" />
          <F  label="연료종류"  value={data.fuelType} />
          <SF label="구동방식"  value={data.driveType}     options={DRIVE_TYPES as unknown as string[]} />
          <SF label="외부색상"  value={data.exteriorColor} options={EXT_COLORS as unknown as string[]} />
          <SF label="내부색상"  value={data.interiorColor} options={INT_COLORS as unknown as string[]} />
          <F  label="선택옵션"  value={data.options?.join(', ')} placeholder="견적서 업로드 시 자동" colSpan={3} />
        </Section>

        <Section title="등록증 스펙" icon={FileText}>
          {/* 등록증 헤더 */}
          <F label="문서확인번호"   value={data.documentNo} />
          <F label="최초등록일"     value={data.firstRegistDate} />
          <F label="등록증 발급일"  value={data.certIssueDate} />
          {/* 본문 */}
          <F label="차종"           value={data.vehicleClass} />
          <F label="용도"           value={data.usage} />
          <F label="차명"           value={data.vehicleName} />
          <F label="형식"           value={data.modelType} colSpan={2} />
          <F label="원동기형식"     value={data.engineType} />
          <F label="차대번호"       value={data.vin} colSpan={3} />
          {/* 제원 */}
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
          <F label="연료소비율 (km/L)" value={num(data.fuelEfficiency)} colSpan={2} />
          <F label="셀 제조사 (전기차)"  value={data.batteryMaker} />
          <F label="셀 형태 (전기차)"    value={data.batteryShape} />
          <F label="셀 주요원료 (전기차)" value={data.batteryMaterial} />
          {/* 번호판 교부 */}
          <F label="번호판 구분"       value={data.plateIssueType} />
          <F label="번호판 발급일"     value={data.plateIssueDate} />
          <F label="번호판 발급대행자" value={data.plateIssueAgent} />
          {/* 저당권 + 출고가격 */}
          <F label="저당권 구분"       value={data.mortgageType} />
          <F label="저당권 날짜"       value={data.mortgageDate} />
          <F label="출고(취득)가격"    value={num(data.acquisitionPrice)} />
          {/* 첨부 — 등록증 사본 (등록증 스펙 일부) */}
          <div className="col-span-4">
            {fileDataUrl ? (
              <div className="form-attach-preview">
                <img
                  src={fileDataUrl}
                  alt={fileName ?? '등록증 사본'}
                  style={{
                    maxWidth: 300,
                    maxHeight: 240,
                    objectFit: 'scale-down',
                    border: '1px solid var(--border)',
                    borderRadius: 4,
                    background: '#fff',
                  }}
                />
                <div style={{ marginTop: 6, fontSize: 12 }}>
                  <a href={fileDataUrl} download={fileName ?? 'registration.jpg'}>
                    {fileName ?? 'registration.jpg'} 다운로드
                  </a>
                </div>
              </div>
            ) : (
              <div
                style={{
                  padding: '20px 12px',
                  textAlign: 'center',
                  color: 'var(--text-sub)',
                  background: 'var(--bg-disabled, #f5f5f5)',
                  border: '1px dashed var(--border)',
                  borderRadius: 4,
                  fontSize: 12,
                }}
              >
                첨부 없음 (OCR 등록 시 자동 첨부)
              </div>
            )}
            {canEditAttachment && (
              <div style={{ marginTop: 8 }}>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={handleFileChange}
                  style={{ fontSize: 12 }}
                />
              </div>
            )}
          </div>
        </Section>
      </fieldset>

      {!hideFooter && (
        <DialogFooter>
          <DialogClose asChild>
            <button className="btn">취소</button>
          </DialogClose>
          {!isReadonly && (
            <button className="btn btn-primary" onClick={handleSubmit}>{submitLabel}</button>
          )}
        </DialogFooter>
      )}
    </>
  );
}

function num(n?: number): string {
  return typeof n === 'number' ? String(n) : '';
}

function Section({ title, icon: Icon, children }: { title: string; icon?: PhosphorIcon; children: React.ReactNode }) {
  return (
    <div className="form-section">
      <div className="form-section-title">
        {Icon && <Icon size={13} weight="bold" />}
        <span>{title}</span>
      </div>
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
