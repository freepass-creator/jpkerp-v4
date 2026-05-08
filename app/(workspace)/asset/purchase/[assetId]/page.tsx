'use client';

import { Fragment, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, CheckCircle, CircleNotch, Warning, Truck, Plus, X, Phone } from '@phosphor-icons/react';
import { PageShell } from '@/components/layout/page-shell';
import { useAssetStore } from '@/lib/use-asset-store';
import { useContractStore } from '@/lib/use-contract-store';
import { useAuditStamp } from '@/lib/audit-fields';
import { ASSET_SUBTABS, useAssetSubtabPending } from '@/lib/asset-subtabs';
import {
  PURCHASE_STAGE_LABEL,
  type PurchaseStage,
  currentPurchaseStage,
  purchaseStageStatuses,
  actorDisplayName,
  isPurchasePlaceholderPlate,
} from '@/lib/purchase-flow';
import { todayStr } from '@/lib/date-utils';
import type { Asset, ProductizationItem } from '@/lib/sample-assets';
import type { Contract } from '@/lib/sample-contracts';

/**
 * 차량구매 상세 — 한 자산의 8단계 진행 페이지.
 *
 * 미완료 첫 단계 입력폼이 자동 펼침. 완료처리 시 다음 단계로 자동 펼침.
 * timeline 은 상단에 가로로, 그 아래 현재 단계 입력폼 + 이전 완료 단계 요약.
 */
export default function PurchaseDetailPage() {
  const params = useParams();
  const assetId = String(params?.assetId ?? '');
  const audit = useAuditStamp();
  const [assets, setAssets] = useAssetStore();
  const [contracts, setContracts] = useContractStore();
  const subTabPending = useAssetSubtabPending();

  const asset = useMemo(() => assets.find((a) => a.id === assetId) ?? null, [assets, assetId]);
  const contract = useMemo(() => {
    const cid = asset?.purchase?.matchedContractId;
    if (!cid) return null;
    return contracts.find((c) => c.id === cid) ?? null;
  }, [asset, contracts]);

  if (!asset) {
    return (
      <PageShell subTabs={ASSET_SUBTABS} subTabPending={subTabPending}>
        <div style={{ padding: 32, textAlign: 'center' }}>
          <div className="text-weak">자산을 찾을 수 없음 — id: <span className="mono">{assetId}</span></div>
          <Link href="/asset/purchase" className="btn" style={{ marginTop: 12 }}>← 차량구매로</Link>
        </div>
      </PageShell>
    );
  }

  if (!asset.purchase) {
    return (
      <PageShell subTabs={ASSET_SUBTABS} subTabPending={subTabPending}>
        <div style={{ padding: 32, textAlign: 'center' }}>
          <div className="text-weak">이 자산은 구매 흐름이 없습니다.</div>
          <Link href="/asset" className="btn" style={{ marginTop: 12 }}>자산관리로</Link>
        </div>
      </PageShell>
    );
  }

  const stageStatuses = purchaseStageStatuses(asset, contract);
  const current = currentPurchaseStage(asset, contract);

  return (
    <PageShell
      subTabs={ASSET_SUBTABS}
      subTabPending={subTabPending}
      filterbar={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 8px' }}>
          <Link href="/asset/purchase" className="btn btn-sm">
            <ArrowLeft size={12} weight="bold" /> 목록
          </Link>
          <span className="text-xs">
            <strong className="mono">
              {isPurchasePlaceholderPlate(asset.plate) ? (
                <span className="text-amber"><Warning size={11} weight="fill" /> {asset.plate}</span>
              ) : (
                asset.plate
              )}
            </strong>
            <span className="dim"> · </span>
            <span>{asset.purchase.vehicleSpecMemo || '(차종 미입력)'}</span>
            {contract && (
              <>
                <span className="dim"> · </span>
                <span className="mono">{contract.contractNo}</span>
                <span className="dim"> · </span>
                <span>{contract.customerName}</span>
              </>
            )}
            {!contract && <><span className="dim"> · </span><span className="dim">선도(재고)</span></>}
          </span>
        </div>
      }
      footerLeft={
        <span className="stat-item text-weak text-xs">
          단계별 완료처리 시 담당자·시각 자동 기록
        </span>
      }
    >
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* 가로 timeline */}
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 4, overflowX: 'auto' }}>
          {stageStatuses.map((s, i) => (
            <Fragment key={s.stage}>
              <div
                style={{
                  flex: 1,
                  minWidth: 110,
                  padding: '8px 10px',
                  background: s.done ? 'var(--success-green-bg, #e7f5ea)' : s.notApplicable ? 'transparent' : current === s.stage ? 'var(--brand-soft, #eef2fb)' : 'var(--bg-card)',
                  border: `1px solid ${current === s.stage ? 'var(--brand)' : 'var(--border)'}`,
                  borderRadius: 4,
                  opacity: s.notApplicable ? 0.4 : 1,
                  fontSize: 11,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {s.done
                    ? <CheckCircle size={12} weight="fill" style={{ color: 'var(--success-green, #2a9d3a)' }} />
                    : current === s.stage
                      ? <CircleNotch size={12} weight="bold" style={{ color: 'var(--brand)' }} />
                      : null}
                  <strong>{i + 1}. {PURCHASE_STAGE_LABEL[s.stage]}</strong>
                </div>
                {s.done && (
                  <div className="text-weak" style={{ fontSize: 10 }}>
                    {s.doneAt?.slice(0, 16)}
                    <br />{actorDisplayName(s.doneBy)}
                  </div>
                )}
                {s.notApplicable && <div className="dim" style={{ fontSize: 10 }}>해당 없음</div>}
                {!s.done && !s.notApplicable && current === s.stage && (
                  <div style={{ fontSize: 10, color: 'var(--brand)' }}>← 진행 중</div>
                )}
              </div>
              {i < stageStatuses.length - 1 && (
                <div style={{ flex: '0 0 6px', alignSelf: 'center', borderTop: '1px dashed var(--border)' }} />
              )}
            </Fragment>
          ))}
        </div>

        {/* 현재단계 입력폼 */}
        {current ? (
          <div style={{ background: 'var(--bg-card)', border: '2px solid var(--brand)', borderRadius: 6, padding: 16 }}>
            <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
              <CircleNotch size={16} weight="bold" style={{ color: 'var(--brand)' }} />
              <strong>{PURCHASE_STAGE_LABEL[current]}</strong>
              <span className="text-weak text-xs">— 입력 후 완료처리</span>
            </div>
            <StageForm
              stage={current}
              asset={asset}
              contract={contract}
              audit={audit}
              setAssets={setAssets}
              setContracts={setContracts}
            />
          </div>
        ) : (
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, padding: 20, textAlign: 'center' }}>
            <CheckCircle size={20} weight="fill" style={{ color: 'var(--success-green, #2a9d3a)' }} />
            <div style={{ marginTop: 6 }}>
              <strong>흐름 완료</strong>
              <span className="text-weak text-xs" style={{ marginLeft: 8 }}>
                {asset.purchase.matchedContractId ? '인도까지 마침. 자산·계약 운행중 전환.' : '입고까지 마침. 재고 보관.'}
              </span>
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}

/* ─── 단계별 입력폼 ─── */
type StageFormProps = {
  stage: PurchaseStage;
  asset: Asset;
  contract: Contract | null;
  audit: ReturnType<typeof useAuditStamp>;
  setAssets: ReturnType<typeof useAssetStore>[1];
  setContracts: ReturnType<typeof useContractStore>[1];
};

function StageForm(props: StageFormProps) {
  switch (props.stage) {
    case 'productionConfirm': return <ProductionConfirmForm {...props} />;
    case 'apply':              return <ApplyForm {...props} />;
    case 'intake':             return <IntakeForm {...props} />;
    case 'productize':         return <ProductizeForm {...props} />;
    case 'happyCall1':         return <HappyCallForm {...props} which={1} />;
    case 'happyCall2':         return <HappyCallForm {...props} which={2} />;
    case 'deliver':            return <DeliverForm {...props} />;
    default: return null;  // 'decide' 는 다이얼로그에서 이미 완료
  }
}

/* 2 — 생산일정확정 */
function ProductionConfirmForm({ asset, audit, setAssets }: StageFormProps) {
  const [date, setDate] = useState(asset.purchase?.expectedProductionDate ?? '');
  function complete() {
    const stamp = `${todayStr()} ${new Date().toTimeString().slice(0, 5)}`;
    const updateMeta = audit.update();
    setAssets((prev) => prev.map((a) =>
      a.id !== asset.id || !a.purchase ? a : ({
        ...a,
        purchase: {
          ...a.purchase,
          productionConfirmAt: stamp,
          productionConfirmBy: updateMeta.updatedBy ?? { uid: 'system' },
          expectedProductionDate: date || undefined,
        },
        ...updateMeta,
      })
    ));
    audit.log({ action: 'update', entityType: 'asset', entityId: asset.id,
      label: `생산일정확정${date ? ` (${date})` : ''}` });
  }
  return (
    <div className="form-grid">
      <label className="block col-span-2">
        <span className="label">제조사 예상 출고일 (입고예정)</span>
        <input type="date" className="input w-full" value={date} onChange={(e) => setDate(e.target.value)} />
        <span className="text-weak text-xs">제조사·딜러로부터 통보받은 차량 출고 예정일.</span>
      </label>
      <div className="col-span-4">
        <button className="btn btn-primary" onClick={complete}>완료처리 → 다음 단계 (증차신청)</button>
      </div>
    </div>
  );
}

/* 3 — 증차신청 */
function ApplyForm({ asset, audit, setAssets }: StageFormProps) {
  const [no, setNo] = useState('');
  function complete() {
    const stamp = `${todayStr()} ${new Date().toTimeString().slice(0, 5)}`;
    const updateMeta = audit.update();
    setAssets((prev) => prev.map((a) =>
      a.id !== asset.id || !a.purchase ? a : ({
        ...a,
        purchase: {
          ...a.purchase,
          applicationNo: no.trim() || undefined,
          applicationDoneAt: stamp,
          applicationDoneBy: updateMeta.updatedBy ?? { uid: 'system' },
        },
        ...updateMeta,
      })
    ));
    audit.log({ action: 'update', entityType: 'asset', entityId: asset.id,
      label: `증차신청 완료${no ? ` (${no})` : ''}` });
  }
  return (
    <div className="form-grid">
      <label className="block col-span-2">
        <span className="label">증차신청번호 (선택)</span>
        <input className="input w-full" value={no} onChange={(e) => setNo(e.target.value)} placeholder="VAN/구청 발급 번호" />
      </label>
      <div className="col-span-4">
        <button className="btn btn-primary" onClick={complete}>완료처리 → 다음 단계 (입고)</button>
      </div>
    </div>
  );
}

/* 4 — 차량출고(입고) */
function IntakeForm({ asset, audit, setAssets }: StageFormProps) {
  const [location, setLocation] = useState('');
  function complete() {
    const stamp = `${todayStr()} ${new Date().toTimeString().slice(0, 5)}`;
    const updateMeta = audit.update();
    setAssets((prev) => prev.map((a) =>
      a.id !== asset.id || !a.purchase ? a : ({
        ...a,
        purchase: {
          ...a.purchase,
          intakeAt: stamp,
          intakeBy: updateMeta.updatedBy ?? { uid: 'system' },
          intakeLocation: location.trim() || undefined,
        },
        ...updateMeta,
      })
    ));
    audit.log({ action: 'update', entityType: 'asset', entityId: asset.id,
      label: `차량 입고 완료${location ? ` (${location})` : ''}` });
  }
  return (
    <div className="form-grid">
      <label className="block col-span-2">
        <span className="label">입고 위치</span>
        <input className="input w-full" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="강남 차고지 / 본사 주차장 등" />
      </label>
      <div className="col-span-4">
        <button className="btn btn-primary" onClick={complete}>완료처리 → 다음 단계 (상품화·등록)</button>
      </div>
    </div>
  );
}

/* 5 — 상품화·차량등록 */
function ProductizeForm({ asset, audit, setAssets, setContracts }: StageFormProps) {
  const [plate, setPlate]   = useState('');
  const [vin, setVin]       = useState('');
  const [vehicleClass, setVehicleClass] = useState('');
  const [vehicleName, setVehicleName]   = useState(asset.purchase?.vehicleSpecMemo ?? '');
  const [firstRegistDate, setFirstRegistDate] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [items, setItems] = useState<ProductizationItem[]>(
    asset.purchase?.productizationItems ?? []
  );
  const [newItemKey, setNewItemKey] = useState('');

  const registered = !!asset.purchase?.registeredAt;

  // 등록 완료 처리 — 1차로 등록증 항목 + placeholder 교체
  function completeRegister() {
    const errors: string[] = [];
    if (!plate.trim()) errors.push('차량번호');
    if (!vin.trim())   errors.push('차대번호');
    if (!ownerName.trim()) errors.push('성명(명칭)');
    if (errors.length > 0) { alert('필수 누락: ' + errors.join(', ')); return; }
    const stamp = `${todayStr()} ${new Date().toTimeString().slice(0, 5)}`;
    const updateMeta = audit.update();
    const newPlate = plate.trim();
    const oldPlate = asset.plate;
    setAssets((prev) => prev.map((a) =>
      a.id !== asset.id || !a.purchase ? a : ({
        ...a,
        plate: newPlate,
        vin: vin.trim(),
        vehicleClass: vehicleClass.trim(),
        vehicleName: vehicleName.trim(),
        firstRegistDate: firstRegistDate || a.firstRegistDate,
        ownerName: ownerName.trim(),
        purchase: {
          ...a.purchase,
          registeredAt: stamp,
          registeredBy: updateMeta.updatedBy ?? { uid: 'system' },
        },
        ...updateMeta,
      })
    ));
    if (asset.purchase?.matchedContractId) {
      setContracts((prev) => prev.map((c) =>
        c.id !== asset.purchase!.matchedContractId ? c : { ...c, plate: newPlate, ...updateMeta }
      ));
    }
    audit.log({ action: 'update', entityType: 'asset', entityId: asset.id,
      label: `차량등록 완료 (${oldPlate} → ${newPlate})` });
  }

  function toggleItem(idx: number) {
    const updateMeta = audit.update();
    const stamp = `${todayStr()} ${new Date().toTimeString().slice(0, 5)}`;
    const next = items.map((it, i) => {
      if (i !== idx) return it;
      if (it.doneAt) return { ...it, doneAt: undefined, doneBy: undefined };
      return { ...it, doneAt: stamp, doneBy: updateMeta.updatedBy ?? { uid: 'system' } };
    });
    setItems(next);
    setAssets((prev) => prev.map((a) =>
      a.id !== asset.id || !a.purchase ? a : ({
        ...a,
        purchase: { ...a.purchase, productizationItems: next },
        ...updateMeta,
      })
    ));
  }

  function addItem() {
    const k = newItemKey.trim();
    if (!k) return;
    const next = [...items, { key: k, required: false }];
    setItems(next);
    setNewItemKey('');
    setAssets((prev) => prev.map((a) =>
      a.id !== asset.id || !a.purchase ? a : ({
        ...a,
        purchase: { ...a.purchase, productizationItems: next },
        ...audit.update(),
      })
    ));
  }

  function removeItem(idx: number) {
    if (!confirm('이 항목 삭제?')) return;
    const next = items.filter((_, i) => i !== idx);
    setItems(next);
    setAssets((prev) => prev.map((a) =>
      a.id !== asset.id || !a.purchase ? a : ({
        ...a,
        purchase: { ...a.purchase, productizationItems: next },
        ...audit.update(),
      })
    ));
  }

  function completeStage() {
    const allDone = items.filter((i) => i.required !== false).every((i) => !!i.doneAt);
    if (!allDone) { alert('필수 상품화 항목이 모두 완료되어야 합니다'); return; }
    const stamp = `${todayStr()} ${new Date().toTimeString().slice(0, 5)}`;
    const updateMeta = audit.update();
    setAssets((prev) => prev.map((a) =>
      a.id !== asset.id || !a.purchase ? a : ({
        ...a,
        purchase: { ...a.purchase, productizationCompletedAt: stamp },
        ...updateMeta,
      })
    ));
    audit.log({ action: 'update', entityType: 'asset', entityId: asset.id,
      label: '상품화·등록 단계 완료' });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* 차량등록 — placeholder 교체 */}
      <div style={{ padding: 12, background: 'var(--bg-stripe)', borderRadius: 4 }}>
        <div style={{ marginBottom: 8 }}>
          <strong className="text-xs">① 차량등록 (등록증 발급 → placeholder 교체)</strong>
          {registered && <span className="text-success text-xs" style={{ marginLeft: 8 }}>✓ 완료</span>}
        </div>
        {!registered ? (
          <div className="form-grid">
            <label className="block">
              <span className="label">차량번호 *</span>
              <input className="input w-full" value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="12가1234" />
            </label>
            <label className="block">
              <span className="label">차대번호 (VIN) *</span>
              <input className="input w-full" value={vin} onChange={(e) => setVin(e.target.value)} placeholder="17자리" />
            </label>
            <label className="block">
              <span className="label">차종</span>
              <input className="input w-full" value={vehicleClass} onChange={(e) => setVehicleClass(e.target.value)} placeholder="승용자동차" />
            </label>
            <label className="block">
              <span className="label">차명</span>
              <input className="input w-full" value={vehicleName} onChange={(e) => setVehicleName(e.target.value)} />
            </label>
            <label className="block">
              <span className="label">최초등록일</span>
              <input type="date" className="input w-full" value={firstRegistDate} onChange={(e) => setFirstRegistDate(e.target.value)} />
            </label>
            <label className="block">
              <span className="label">성명(명칭) *</span>
              <input className="input w-full" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="회사명 또는 소유자" />
            </label>
            <div className="col-span-4">
              <button className="btn btn-primary" onClick={completeRegister}>등록 완료 (placeholder {asset.plate} → {plate || '실제값'})</button>
            </div>
          </div>
        ) : (
          <div className="text-xs text-weak">
            <span className="mono">{asset.plate}</span> · {asset.vin} · {asset.vehicleName} · 등록 {asset.purchase?.registeredAt?.slice(0, 16)}
          </div>
        )}
      </div>

      {/* 상품화 항목 — 체크리스트 */}
      <div style={{ padding: 12, background: 'var(--bg-stripe)', borderRadius: 4 }}>
        <div style={{ marginBottom: 8 }}>
          <strong className="text-xs">② 상품화 (개별 작업 체크)</strong>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 40 }}></th>
              <th>항목</th>
              <th style={{ width: 80 }}>필수</th>
              <th style={{ width: 200 }}>완료</th>
              <th style={{ width: 50 }}></th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i}>
                <td className="center">
                  <input type="checkbox" checked={!!it.doneAt} onChange={() => toggleItem(i)} />
                </td>
                <td>{it.key}</td>
                <td className="text-xs">{it.required !== false ? '필수' : <span className="dim">선택</span>}</td>
                <td className="text-xs">
                  {it.doneAt ? (
                    <>
                      {it.doneAt.slice(0, 16)} · <span className="dim">{actorDisplayName(it.doneBy)}</span>
                    </>
                  ) : (
                    <span className="dim">-</span>
                  )}
                </td>
                <td className="center">
                  {it.required === false && (
                    <button className="btn btn-sm" onClick={() => removeItem(i)} title="삭제">
                      <X size={11} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            <tr>
              <td></td>
              <td colSpan={4}>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    className="input"
                    style={{ flex: 1 }}
                    value={newItemKey}
                    onChange={(e) => setNewItemKey(e.target.value)}
                    placeholder="추가 항목 (예: 발판, 매트, 시트커버)"
                    onKeyDown={(e) => { if (e.key === 'Enter') addItem(); }}
                  />
                  <button className="btn btn-sm" onClick={addItem} disabled={!newItemKey.trim()}>
                    <Plus size={11} weight="bold" /> 추가
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div>
        <button className="btn btn-primary" onClick={completeStage} disabled={!registered}>
          단계 완료 → 다음 (1차 해피콜)
        </button>
        {!registered && <span className="text-weak text-xs" style={{ marginLeft: 8 }}>차량등록 먼저 완료 필요</span>}
      </div>
    </div>
  );
}

/* 6, 7 — 해피콜 (공용) */
function HappyCallForm({ asset, audit, setAssets, which }: StageFormProps & { which: 1 | 2 }) {
  const [note, setNote] = useState('');
  const [expectedDelivery, setExpectedDelivery] = useState(asset.purchase?.expectedDeliveryDate ?? '');
  function complete() {
    const stamp = `${todayStr()} ${new Date().toTimeString().slice(0, 5)}`;
    const updateMeta = audit.update();
    const actor = updateMeta.updatedBy ?? { uid: 'system' };
    setAssets((prev) => prev.map((a) =>
      a.id !== asset.id || !a.purchase ? a : ({
        ...a,
        purchase: which === 1
          ? {
              ...a.purchase,
              happyCall1At: stamp,
              happyCall1By: actor,
              happyCall1Note: note.trim() || undefined,
              expectedDeliveryDate: expectedDelivery || a.purchase.expectedDeliveryDate,
            }
          : {
              ...a.purchase,
              happyCall2At: stamp,
              happyCall2By: actor,
              happyCall2Note: note.trim() || undefined,
              expectedDeliveryDate: expectedDelivery || a.purchase.expectedDeliveryDate,
            },
        ...updateMeta,
      })
    ));
    audit.log({ action: 'update', entityType: 'asset', entityId: asset.id,
      label: `${which}차 해피콜 완료${expectedDelivery ? ` (출고예정 ${expectedDelivery})` : ''}` });
  }
  return (
    <div className="form-grid">
      <div className="col-span-4 text-weak text-xs" style={{ marginBottom: 4 }}>
        <Phone size={11} weight="bold" /> 고객과 통화 — 진행상황 안내·일정 협의·문의사항 응대 후 메모.
        {which === 1 && ' (1차: 입고 완료 안내·일정 1차 협의)'}
        {which === 2 && ' (2차: 인도일 최종 확정)'}
      </div>
      <label className="block col-span-2">
        <span className="label">출고예정일 (고객 인도 예정)</span>
        <input type="date" className="input w-full" value={expectedDelivery} onChange={(e) => setExpectedDelivery(e.target.value)} />
        <span className="text-weak text-xs">D-2 자동 SMS 알람 발송 예정 (Aligo cron — 다음 단계 구현)</span>
      </label>
      <label className="block col-span-4">
        <span className="label">통화 메모</span>
        <textarea className="input w-full" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="고객 응답·요청사항·다음 약속 등" />
      </label>
      <div className="col-span-4">
        <button className="btn btn-primary" onClick={complete}>
          <Phone size={13} weight="bold" /> {which}차 해피콜 완료처리 → 다음 단계
        </button>
      </div>
    </div>
  );
}

/* 8 — 고객인도 */
function DeliverForm({ asset, contract, audit, setAssets, setContracts }: StageFormProps) {
  const today = todayStr();
  function complete() {
    if (!contract) { alert('매칭 계약 없음'); return; }
    const updateMeta = audit.update();
    const actor = updateMeta.updatedBy ?? { uid: 'system' };
    const stamp = `${today} ${new Date().toTimeString().slice(0, 5)}`;
    setContracts((prev) => prev.map((c) =>
      c.id !== contract.id ? c : ({
        ...c,
        status: '운행중' as const,
        events: c.events.map((e) =>
          e.type === '출고' && e.status !== '완료'
            ? { ...e, status: '완료' as const, doneDate: today, doneBy: actor }
            : e,
        ),
        ...updateMeta,
      })
    ));
    setAssets((prev) => prev.map((a) =>
      a.id !== asset.id || !a.purchase ? a : ({
        ...a,
        status: '운행중' as const,
        purchase: {
          ...a.purchase,
          deliveredAt: stamp,
          deliveredBy: actor,
          closedAt: stamp,
        },
        ...updateMeta,
      })
    ));
    audit.log({ action: 'update', entityType: 'contract', entityId: contract.id,
      label: `고객인도 완료 → 운행중 (${contract.contractNo})` });
    audit.log({ action: 'update', entityType: 'asset', entityId: asset.id,
      label: '고객인도 완료 → 운행중' });
  }
  return (
    <div className="form-grid">
      <div className="col-span-4 text-xs text-weak">
        고객인도 완료 시 계약 출고 event 가 status=&quot;완료&quot; 로 전환되고 자산·계약 모두 운행중 됩니다.
        <br />수납 회차도 시작일 기준 자동 진행 (이후 자금일보 매칭으로 운영).
      </div>
      <div className="col-span-4">
        <button className="btn btn-primary" onClick={complete}>
          <Truck size={13} weight="bold" /> 고객인도 완료 → 운행중
        </button>
      </div>
    </div>
  );
}
