'use client';

/**
 * AssetEditDialog — 기존 자산 조회 / 수정 / 복사(스펙 복제) 다이얼로그.
 * AssetRegisterDialog의 OCR 업로드 단계 없이 폼만 바로 노출.
 *
 * mode='view'      — readonly. 회색 헤더. [수정][삭제][닫기] 푸터 (수정 시 edit 모드 전환)
 * mode='edit'      — editable. 황색(#fff8e1) 헤더. [저장][취소→view] 푸터
 * mode='duplicate' — editable. 녹색(#e8f5e9) 헤더. unique 필드 비움. [등록][취소] 푸터
 */

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { RegistrationForm } from './registration-form';
import type { Asset } from '@/lib/sample-assets';

export type EditMode = 'view' | 'edit' | 'duplicate';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: EditMode;
  initial: Partial<Asset>;
  onSave: (asset: Partial<Asset>) => void;
  onDelete?: () => void;
};

const MODE_DOT: Record<EditMode, string> = {
  view: '#9ca3af',       // 회색
  edit: '#f59e0b',       // 황색
  duplicate: '#22c55e',  // 녹색
};

export function AssetEditDialog({ open, onOpenChange, mode, initial, onSave, onDelete }: Props) {
  const [currentMode, setCurrentMode] = useState<EditMode>(mode);

  // 외부 mode prop 이 바뀌거나 다이얼로그가 새로 열릴 때 동기화
  useEffect(() => { setCurrentMode(mode); }, [mode, open]);

  const data = currentMode === 'duplicate' ? clearUniqueFields(initial) : initial;

  const titleText = currentMode === 'view'
    ? `자산 상세 — ${initial.assetCode || initial.plate || ''}`
    : currentMode === 'edit'
    ? `자산 수정 — ${initial.assetCode || initial.plate || ''}`
    : '자산 복사 (스펙 복제)';

  // DialogContent 가 headerStyle prop 미지원 — title 옆 색깔 dot 으로 모드 시각화
  const titleNode = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span
        aria-hidden
        style={{
          display: 'inline-block',
          width: 10,
          height: 10,
          borderRadius: '50%',
          background: MODE_DOT[currentMode],
          flexShrink: 0,
        }}
      />
      <span>{titleText}</span>
    </span>
  );

  function handleSave(next: Partial<Asset>) {
    onSave(next);
    onOpenChange(false);
  }

  function handleDeleteClick() {
    onDelete?.();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={titleNode} size="xl">
        {currentMode === 'duplicate' && (
          <div className="alert alert-info mb-3">
            스펙은 그대로, <strong>차량번호 · 차대번호 · 등록일</strong>은 비워졌습니다. 새 차량 정보로 채워주세요.
          </div>
        )}

        {currentMode === 'view' ? (
          <>
            <RegistrationForm data={data} mode="view" onSubmit={() => {}} hideFooter />
            <DialogFooter>
              {onDelete && (
                <button
                  className="btn"
                  style={{ marginRight: 'auto', color: 'var(--danger, #dc2626)' }}
                  onClick={handleDeleteClick}
                >
                  삭제
                </button>
              )}
              <DialogClose asChild>
                <button className="btn">닫기</button>
              </DialogClose>
              <button className="btn btn-primary" onClick={() => setCurrentMode('edit')}>
                수정
              </button>
            </DialogFooter>
          </>
        ) : currentMode === 'edit' ? (
          <>
            <RegistrationForm
              data={data}
              mode="edit"
              onSubmit={handleSave}
              hideFooter
            />
            <DialogFooter>
              <button
                className="btn"
                style={{ marginRight: 'auto' }}
                onClick={() => setCurrentMode('view')}
              >
                취소 (조회로 복귀)
              </button>
              <DialogClose asChild>
                <button className="btn">닫기</button>
              </DialogClose>
              <button className="btn btn-primary" onClick={() => handleSave(data)}>
                저장
              </button>
            </DialogFooter>
          </>
        ) : (
          // duplicate
          <RegistrationForm
            data={data}
            mode="duplicate"
            onSubmit={handleSave}
            submitLabel="등록"
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/** 스펙 복사 시 비워야 할 unique 필드들 */
function clearUniqueFields(asset: Partial<Asset>): Partial<Asset> {
  return {
    ...asset,
    id: undefined,
    assetCode: undefined,  // 복사 시 새 자산코드 자동 부여
    plate: '',
    vin: '',
    documentNo: '',
    firstRegistDate: '',
    certIssueDate: '',
    plateIssueDate: '',
    plateIssueAgent: '',
    plateIssueType: '',
    mortgageType: '',
    mortgageDate: '',
    inspectionFrom: '',
    inspectionTo: '',
    inspectionPlace: '',
    mileage: undefined,
    inspectionAuthority: '',
    inspectionType: '',
    status: '등록예정',
    // 첨부 — 복사 시 원본 등록증은 다른 차량 거 이므로 비움
    fileDataUrl: undefined,
    fileName: undefined,
  };
}
