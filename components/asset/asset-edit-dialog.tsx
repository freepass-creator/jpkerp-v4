'use client';

/**
 * AssetEditDialog — 기존 자산 수정 / 복사 (스펙 복제) 전용 다이얼로그.
 * AssetRegisterDialog의 OCR 업로드 단계 없이 폼만 바로 노출.
 *
 * mode='edit'      — 기존 자산 그대로 수정 (모든 필드 편집 가능)
 * mode='duplicate' — 스펙 복사. plate / vin / 차대번호 등 unique 필드는 비워서 시작
 */

import { Dialog, DialogContent } from '@/components/ui/dialog';
import { RegistrationForm } from './registration-form';
import type { Asset } from '@/lib/sample-assets';

export type EditMode = 'edit' | 'duplicate';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: EditMode;
  initial: Partial<Asset>;
  onSave: (asset: Partial<Asset>) => void;
};

export function AssetEditDialog({ open, onOpenChange, mode, initial, onSave }: Props) {
  const data = mode === 'duplicate' ? clearUniqueFields(initial) : initial;
  const title = mode === 'edit' ? '자산 수정' : '자산 복사 (스펙 복제)';

  function handleSave(next: Partial<Asset>) {
    onSave(next);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title} size="xl">
        {mode === 'duplicate' && (
          <div className="alert alert-info mb-3">
            스펙은 그대로, <strong>차량번호 · 차대번호 · 등록일</strong>은 비워졌습니다. 새 차량 정보로 채워주세요.
          </div>
        )}
        <RegistrationForm data={data} onSubmit={handleSave} submitLabel={mode === 'edit' ? '수정' : '등록'} />
      </DialogContent>
    </Dialog>
  );
}

/** 스펙 복사 시 비워야 할 unique 필드들 */
function clearUniqueFields(asset: Partial<Asset>): Partial<Asset> {
  return {
    ...asset,
    id: undefined,
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
  };
}
