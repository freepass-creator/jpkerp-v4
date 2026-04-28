'use client';

import { useState } from 'react';
import { Upload, FileXls, Pencil, Plus, FilePdf, Image as ImageIcon, X, CheckCircle } from '@phosphor-icons/react';
import { Dialog, DialogTrigger, DialogContent } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/cn';
import { RegistrationForm } from './registration-form';
import type { Asset } from '@/lib/sample-assets';

type Props = {
  onCreate: (asset: Partial<Asset>) => void;
  /** 외부 컨트롤 — controlled mode. 미제공 시 내부 상태 사용 */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** 트리거 버튼 표시 여부 (기본 true) */
  showTrigger?: boolean;
};

type ParsedItem = {
  id: string;
  fileName: string;
  data: Partial<Asset>;
};

export function AssetRegisterDialog({ onCreate, open: openProp, onOpenChange, showTrigger = true }: Props) {
  const [openInner, setOpenInner] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : openInner;
  const setOpen = (v: boolean) => {
    if (!isControlled) setOpenInner(v);
    onOpenChange?.(v);
  };
  const [certQueue, setCertQueue] = useState<File[]>([]);
  const [parsedList, setParsedList] = useState<ParsedItem[]>([]);
  const [parsing, setParsing] = useState(false);

  function ocrStub(file: File): Partial<Asset> {
    // 실제 OCR API 연동 전 stub — 첨부 등록증(01도9893 모닝) 파싱 결과 흉내
    return {
      companyCode: 'CP01',
      documentNo: '7836830517987332',
      firstRegistDate: '2017-09-21',
      certIssueDate: '2025-12-22',
      plate: `${file.name.slice(0, 2)}도${Math.floor(1000 + Math.random() * 9000)}`,
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
      maker: '기아', modelName: '모닝',
      status: '대기',
    };
  }

  async function runOcr() {
    if (certQueue.length === 0) return;
    setParsing(true);

    // 실제 OCR이라면 Promise.all로 병렬 처리. 지금은 stub이라 짧은 delay만.
    await new Promise((r) => setTimeout(r, 400 + 200 * certQueue.length));

    const items: ParsedItem[] = certQueue.map((f, i) => ({
      id: `p-${Date.now()}-${i}`,
      fileName: f.name,
      data: ocrStub(f),
    }));
    setParsedList(items);
    setCertQueue([]);
    setParsing(false);
  }

  function addCertFiles(files: FileList | File[]) {
    setCertQueue((prev) => [...prev, ...Array.from(files)]);
  }

  function removeCertAt(i: number) {
    setCertQueue((prev) => prev.filter((_, idx) => idx !== i));
  }

  function removeParsedAt(id: string) {
    setParsedList((prev) => prev.filter((p) => p.id !== id));
  }

  function reset() {
    setCertQueue([]);
    setParsedList([]);
    setParsing(false);
  }

  function registerOne(item: ParsedItem) {
    onCreate(item.data);
    setParsedList((prev) => {
      const next = prev.filter((p) => p.id !== item.id);
      if (next.length === 0) {
        setOpen(false);
        setTimeout(reset, 100);
      }
      return next;
    });
  }

  function registerAll() {
    parsedList.forEach((p) => onCreate(p.data));
    setOpen(false);
    setTimeout(reset, 100);
  }

  function handleClose(o: boolean) {
    setOpen(o);
    if (!o) reset();
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      {showTrigger && (
        <DialogTrigger asChild>
          <button className="btn btn-primary">
            <Plus size={14} weight="bold" /> 자산등록
          </button>
        </DialogTrigger>
      )}

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
            {parsedList.length > 0 ? (
              <ParsedListView
                items={parsedList}
                onRemove={removeParsedAt}
                onRegisterAll={registerAll}
                onRegisterOne={registerOne}
                onCancelAll={() => { setOpen(false); setTimeout(reset, 100); }}
              />
            ) : (
              <UploadStage
                certQueue={certQueue}
                onCertAdd={addCertFiles}
                onCertRemove={removeCertAt}
                parsing={parsing}
                onAnalyze={runOcr}
              />
            )}
          </TabsContent>

          <TabsContent value="manual">
            <RegistrationForm data={{}} onSubmit={(d) => { onCreate(d); setOpen(false); reset(); }} />
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

/* ─── 1. 업로드 단계 — 등록증 다중 선택 → 목록 → [분석 시작] ─── */
function UploadStage({
  certQueue,
  onCertAdd,
  onCertRemove,
  parsing,
  onAnalyze,
}: {
  certQueue: File[];
  onCertAdd: (files: FileList | File[]) => void;
  onCertRemove: (i: number) => void;
  parsing: boolean;
  onAnalyze: () => void;
}) {
  return (
    <div className="space-y-3">
      <CertMultiSlot files={certQueue} onAdd={onCertAdd} onRemove={onCertRemove} />

      <div className="flex items-center justify-end gap-2 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
        {certQueue.length === 0 && <span className="text-weak">자동차등록증을 먼저 올려주세요</span>}
        {certQueue.length > 0 && (
          <span className="text-sub">{certQueue.length}장 — 분석 시작 누르면 한꺼번에 OCR 처리</span>
        )}
        <button
          className="btn btn-primary"
          disabled={certQueue.length === 0 || parsing}
          onClick={onAnalyze}
        >
          {parsing ? '분석 중...' : '분석 시작'}
        </button>
      </div>
    </div>
  );
}

/* ─── 2. 분석 결과 미리보기 — 행별 등록/제거 (개별입력 폼 안 띄움) ───
   상세 수정이 필요하면 일단 등록 후 수정 버튼으로 처리. */
function ParsedListView({
  items,
  onRemove,
  onRegisterAll,
  onRegisterOne,
  onCancelAll,
}: {
  items: ParsedItem[];
  onRemove: (id: string) => void;
  onRegisterAll: () => void;
  onRegisterOne: (item: ParsedItem) => void;
  onCancelAll: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="alert alert-info">
        <CheckCircle size={14} className="mt-0.5 flex-shrink-0" />
        <div>
          <strong>{items.length}장</strong> 분석 완료. 내용 확인 후 등록하세요. 정정 필요한 자산은 등록 후 [수정] 버튼으로 편집.
        </div>
      </div>

      <div className="border" style={{ borderColor: 'var(--border)', overflowX: 'auto' }}>
        <table className="table">
          <thead>
            <tr>
              {/* 파일명 + 식별자 */}
              <th>파일명</th>
              <th>회사코드</th>

              {/* 등록증 ① ~ ⑩ */}
              <th>차량번호</th>
              <th>차종</th>
              <th>용도</th>
              <th>차명</th>
              <th>형식</th>
              <th className="date">제작연월</th>
              <th>차대번호</th>
              <th>원동기형식</th>
              <th>사용본거지</th>
              <th>성명(명칭)</th>
              <th>생년월일(법인등록번호)</th>

              {/* 1. 제원 ⑪ ~ ㉔ */}
              <th>제원관리번호</th>
              <th className="num">길이</th>
              <th className="num">너비</th>
              <th className="num">높이</th>
              <th className="num">총중량</th>
              <th className="num">승차정원</th>
              <th className="num">최대적재량</th>
              <th className="num">배기량/구동축전지 용량</th>
              <th>정격출력</th>
              <th>기통수</th>
              <th>연료종류</th>
              <th className="num">연료소비율</th>
              <th>구동축전지 셀 제조사</th>
              <th>구동축전지 셀 형태</th>
              <th>구동축전지 셀 주요원료</th>

              {/* 2. 등록번호판 교부 ㉕ ~ ㉗ */}
              <th>구분</th>
              <th className="date">번호판 발급일</th>
              <th>발급대행자확인</th>

              {/* 3. 저당권 ㉘ ~ ㉙ */}
              <th>구분(설정/말소)</th>
              <th className="date">날짜</th>

              {/* 등록증 메타 */}
              <th>문서확인번호</th>
              <th className="date">최초등록일</th>
              <th className="date">등록증 발급일</th>
              <th className="num">자동차 출고(취득)가격</th>

              {/* 부가 (선택입력) */}
              <th>제조사</th>
              <th>모델명</th>
              <th>세부모델</th>
              <th>세부트림</th>
              <th>선택옵션</th>
              <th>외부색상</th>
              <th>내부색상</th>
              <th className="center">구동방식</th>

              {/* 동작 — sticky 우측 */}
              <th className="center" style={{ width: 110, position: 'sticky', right: 0, background: 'var(--bg-header)' }}>동작</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => {
              const d = p.data;
              return (
                <tr key={p.id}>
                  {/* 파일명 + 식별자 */}
                  <td className="mono dim truncate" style={{ maxWidth: 160 }} title={p.fileName}>{p.fileName}</td>
                  <td className="plate">{v(d.companyCode)}</td>

                  {/* 등록증 ① ~ ⑩ */}
                  <td className="plate text-medium">{v(d.plate)}</td>
                  <td className="dim">{v(d.vehicleClass)}</td>
                  <td className="dim">{v(d.usage)}</td>
                  <td>{v(d.vehicleName)}</td>
                  <td className="mono">{v(d.modelType)}</td>
                  <td className="date">{v(d.manufactureDate)}</td>
                  <td className="mono dim">{v(d.vin)}</td>
                  <td className="mono">{v(d.engineType)}</td>
                  <td className="dim">{v(d.ownerLocation)}</td>
                  <td>{v(d.ownerName)}</td>
                  <td className="mono dim">{v(d.ownerRegNumber)}</td>

                  {/* 1. 제원 */}
                  <td className="mono dim">{v(d.approvalNumber)}</td>
                  <td className="num">{n(d.length)}</td>
                  <td className="num">{n(d.width)}</td>
                  <td className="num">{n(d.height)}</td>
                  <td className="num">{n(d.totalWeight)}</td>
                  <td className="num">{n(d.capacity)}</td>
                  <td className="num">{n(d.maxLoad)}</td>
                  <td className="num">{n(d.displacement)}</td>
                  <td className="mono">{v(d.ratedOutput)}</td>
                  <td>{v(d.cylinders)}</td>
                  <td>{v(d.fuelType)}</td>
                  <td className="num">{n(d.fuelEfficiency)}</td>
                  <td>{v(d.batteryMaker)}</td>
                  <td>{v(d.batteryShape)}</td>
                  <td>{v(d.batteryMaterial)}</td>

                  {/* 2. 등록번호판 교부 */}
                  <td>{v(d.plateIssueType)}</td>
                  <td className="date">{v(d.plateIssueDate)}</td>
                  <td>{v(d.plateIssueAgent)}</td>

                  {/* 3. 저당권 */}
                  <td>{v(d.mortgageType)}</td>
                  <td className="date">{v(d.mortgageDate)}</td>

                  {/* 메타 */}
                  <td className="mono dim">{v(d.documentNo)}</td>
                  <td className="date">{v(d.firstRegistDate)}</td>
                  <td className="date">{v(d.certIssueDate)}</td>
                  <td className="num">{n(d.acquisitionPrice)}</td>

                  {/* 부가 */}
                  <td>{v(d.maker)}</td>
                  <td>{v(d.modelName)}</td>
                  <td>{v(d.detailModel)}</td>
                  <td>{v(d.detailTrim)}</td>
                  <td>{v(d.options?.join(', '))}</td>
                  <td>{v(d.exteriorColor)}</td>
                  <td>{v(d.interiorColor)}</td>
                  <td className="center">{v(d.driveType)}</td>

                  {/* 동작 — sticky 우측 */}
                  <td className="center" style={{ position: 'sticky', right: 0, background: 'var(--bg-card)' }}>
                    <div className="flex items-center gap-1 justify-center">
                      <button className="btn btn-sm btn-primary" onClick={() => onRegisterOne(p)} title="이 차량만 등록">
                        등록
                      </button>
                      <button className="btn btn-sm" onClick={() => onRemove(p.id)} title="목록에서 제외">
                        <X size={11} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-end gap-2 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
        <span className="text-sub">{items.length}건 대기 중</span>
        <button className="btn" onClick={onCancelAll}>
          <X size={12} weight="bold" /> 전체 취소
        </button>
        <button className="btn btn-primary" onClick={onRegisterAll}>
          <CheckCircle size={14} weight="bold" /> 전체 등록
        </button>
      </div>
    </div>
  );
}

/* 등록증 다중 업로드 슬롯 — 여러 장 누적 + 항목별 제거 */
function CertMultiSlot({
  files,
  onAdd,
  onRemove,
}: {
  files: File[];
  onAdd: (files: FileList | File[]) => void;
  onRemove: (i: number) => void;
}) {
  if (files.length === 0) {
    return (
      <label className="block border border-dashed py-12 text-center cursor-pointer hover:bg-stripe">
        <input
          type="file"
          accept="image/*,.pdf"
          className="hidden"
          multiple
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              onAdd(e.target.files);
              e.target.value = '';
            }
          }}
        />
        <Upload size={28} className="mx-auto text-weak" />
        <div className="mt-2 text-medium">자동차등록증 <span className="text-red">*</span></div>
        <div className="mt-1 text-weak">JPG / PNG / PDF — 여러 장 동시 업로드 가능</div>
      </label>
    );
  }

  return (
    <div className="border p-3 flex flex-col" style={{ borderColor: 'var(--border)' }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-medium">자동차등록증 <span className="text-sub">· {files.length}장</span></span>
        <label className="btn btn-sm cursor-pointer">
          <Plus size={12} weight="bold" /> 추가
          <input
            type="file"
            accept="image/*,.pdf"
            className="hidden"
            multiple
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                onAdd(e.target.files);
                e.target.value = '';
              }
            }}
          />
        </label>
      </div>
      <div className="flex-1 max-h-48 overflow-y-auto space-y-1">
        {files.map((f, i) => {
          const isImage = f.type.startsWith('image/');
          const isPdf = f.type === 'application/pdf';
          return (
            <div key={`${f.name}-${i}`} className={cn('flex items-center gap-2 p-2 bg-stripe')}>
              {isImage ? <ImageIcon size={16} className="text-sub" /> : isPdf ? <FilePdf size={16} className="text-sub" /> : <Upload size={16} className="text-sub" />}
              <div className="flex-1 min-w-0">
                <div className="truncate">{f.name}</div>
                <div className="text-weak">{(f.size / 1024).toFixed(1)} KB</div>
              </div>
              <button className="btn-ghost btn btn-sm" onClick={() => onRemove(i)} title="제거">
                <X size={11} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* 셀 헬퍼 — 빈 값은 빈 문자열, 숫자는 ko-KR 포맷 */
function v(s?: string): string { return s ?? ''; }
function n(num?: number): string { return num === undefined || num === null ? '' : num.toLocaleString('ko-KR'); }
