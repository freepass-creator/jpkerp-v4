import type { Asset, PurchaseFlow, ProductizationItem } from './sample-assets';
import { DEFAULT_PRODUCTIZATION_ITEMS } from './sample-assets';
import type { Contract } from './sample-contracts';
import type { AuditActor } from './audit-fields';

/**
 * 차량구매 8단계 — 페이지의 timeline + 단계별 입력폼 기준.
 *
 *  1. decide              구매결정          (다이얼로그 시점에 즉시 완료)
 *  2. productionConfirm   생산일정확정      (제조사 출고 일정 통보)
 *  3. apply               증차신청          (구청·VAN)
 *  4. intake              차량출고(입고)    (우리가 차량 받음)
 *  5. productize          상품화·차량등록   (등록증 발급 + 블박/선팅/번호판 등)
 *  6. happyCall1          1차 해피콜        (고객 진행 안내·일정 협의)
 *  7. happyCall2          2차 해피콜        (인도일정 최종 확정)
 *  8. deliver             고객인도          (출고 event 완료 + 운행중 전환)
 */
export const PURCHASE_STAGES = [
  'decide',
  'productionConfirm',
  'apply',
  'intake',
  'productize',
  'happyCall1',
  'happyCall2',
  'deliver',
] as const;

export type PurchaseStage = typeof PURCHASE_STAGES[number];

export const PURCHASE_STAGE_LABEL: Record<PurchaseStage, string> = {
  decide:            '구매결정',
  productionConfirm: '생산일정확정',
  apply:             '증차신청',
  intake:            '차량출고(입고)',
  productize:        '상품화·차량등록',
  happyCall1:        '1차 해피콜',
  happyCall2:        '2차 해피콜',
  deliver:           '고객인도',
};

/**
 * placeholder 차량번호 — 구매결정 시 즉시 자산 push 용.
 * "구매-{YYMM}-{seq3}". 5단계(상품화·등록)에서 실제 plate 로 교체.
 */
export function generatePurchasePlate(date: Date, existingPlates: readonly string[]): string {
  const yymm = `${String(date.getFullYear()).slice(2)}${String(date.getMonth() + 1).padStart(2, '0')}`;
  const prefix = `구매-${yymm}-`;
  let max = 0;
  for (const p of existingPlates) {
    if (!p.startsWith(prefix)) continue;
    const n = Number(p.slice(prefix.length));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

export function isPurchasePlaceholderPlate(plate: string): boolean {
  return /^구매-\d{4}-\d{3}$/.test(plate);
}

/** 상품화 모든 required 항목 완료 여부. */
export function isProductizationDone(items: readonly ProductizationItem[] | undefined): boolean {
  if (!items || items.length === 0) return false;
  return items.filter((i) => i.required !== false).every((i) => !!i.doneAt);
}

/**
 * 자산의 현재 구매 단계 — 미완료 첫 단계. 모두 완료(또는 N/A)면 null.
 *
 *  · decide:            decidedAt 존재 (다이얼로그 시점에 항상)
 *  · productionConfirm: productionConfirmAt 존재
 *  · apply:             applicationDoneAt 존재
 *  · intake:            intakeAt 존재
 *  · productize:        registeredAt 존재 + 모든 required 상품화 항목 완료
 *  · happyCall1:        happyCall1At 존재
 *  · happyCall2:        happyCall2At 존재
 *  · deliver:           매칭 계약의 출고 event status='완료' (계약매칭만)
 */
export function currentPurchaseStage(asset: Asset, contract: Contract | null): PurchaseStage | null {
  const p = asset.purchase;
  if (!p) return null;
  if (!p.decidedAt) return 'decide';
  if (!p.productionConfirmAt) return 'productionConfirm';
  if (!p.applicationDoneAt) return 'apply';
  if (!p.intakeAt) return 'intake';
  if (!p.registeredAt || !isProductizationDone(p.productizationItems)) return 'productize';
  if (!p.happyCall1At) return 'happyCall1';
  if (!p.happyCall2At) return 'happyCall2';
  // deliver — 계약매칭만 적용
  if (!p.matchedContractId || !contract) return null;
  const delivery = contract.events.find((e) => e.type === '출고');
  if (delivery && delivery.status !== '완료') return 'deliver';
  return null;
}

/** wizard timeline 표시용 — 각 단계의 완료 여부 + 메타. */
export type PurchaseStageStatus = {
  stage: PurchaseStage;
  done: boolean;
  doneAt?: string;
  doneBy?: AuditActor;
  /** 계약매칭이 아닐 때 deliver 단계는 N/A. */
  notApplicable?: boolean;
};

export function purchaseStageStatuses(asset: Asset, contract: Contract | null): PurchaseStageStatus[] {
  const p: PurchaseFlow | undefined = asset.purchase;
  return PURCHASE_STAGES.map((stage) => {
    if (!p) return { stage, done: false };
    switch (stage) {
      case 'decide':
        return { stage, done: !!p.decidedAt, doneAt: p.decidedAt, doneBy: p.decidedBy };
      case 'productionConfirm':
        return { stage, done: !!p.productionConfirmAt, doneAt: p.productionConfirmAt, doneBy: p.productionConfirmBy };
      case 'apply':
        return { stage, done: !!p.applicationDoneAt, doneAt: p.applicationDoneAt, doneBy: p.applicationDoneBy };
      case 'intake':
        return { stage, done: !!p.intakeAt, doneAt: p.intakeAt, doneBy: p.intakeBy };
      case 'productize': {
        const done = !!p.registeredAt && isProductizationDone(p.productizationItems);
        return { stage, done, doneAt: p.productizationCompletedAt ?? p.registeredAt, doneBy: p.registeredBy };
      }
      case 'happyCall1':
        return { stage, done: !!p.happyCall1At, doneAt: p.happyCall1At, doneBy: p.happyCall1By };
      case 'happyCall2':
        return { stage, done: !!p.happyCall2At, doneAt: p.happyCall2At, doneBy: p.happyCall2By };
      case 'deliver': {
        if (!p.matchedContractId || !contract) return { stage, done: false, notApplicable: true };
        const delivery = contract.events.find((e) => e.type === '출고');
        if (!delivery) return { stage, done: false };
        return { stage, done: delivery.status === '완료', doneAt: delivery.doneDate, doneBy: delivery.doneBy };
      }
    }
  });
}

/** 진행률 (완료 단계 / 전체 적용 단계). 선도구매면 deliver 제외. */
export function purchaseProgress(asset: Asset, contract: Contract | null): { done: number; total: number } {
  const statuses = purchaseStageStatuses(asset, contract);
  const applicable = statuses.filter((s) => !s.notApplicable);
  return { done: applicable.filter((s) => s.done).length, total: applicable.length };
}

/** AuditActor → 표시용 짧은 이름. */
export function actorDisplayName(actor: AuditActor | undefined): string {
  if (!actor) return '';
  return actor.name || actor.email || actor.uid;
}

export { DEFAULT_PRODUCTIZATION_ITEMS };
