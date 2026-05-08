'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShoppingCart, MagnifyingGlass } from '@phosphor-icons/react';
import { Dialog, DialogContent, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { useCompanyStore } from '@/lib/use-company-store';
import { useAssetStore } from '@/lib/use-asset-store';
import { useContractStore } from '@/lib/use-contract-store';
import { useAuditStamp } from '@/lib/audit-fields';
import { activeCompanies } from '@/lib/sample-companies';
import { type Asset, DEFAULT_PRODUCTIZATION_ITEMS } from '@/lib/sample-assets';
import { type Contract, type CustomerKind, generateContractSchedule } from '@/lib/sample-contracts';
import { nextDateScopedCode } from '@/lib/code-gen';
import { generatePurchasePlate } from '@/lib/purchase-flow';
import { todayStr } from '@/lib/date-utils';
import { CatalogSelectorDialog, type CatalogSelection } from '@/components/purchase/catalog-selector-dialog';

/**
 * 차량구매 시작 — 2 모드:
 *   · 선도구매     : 자산만 push (재고용). 계약 X.
 *   · 계약매칭구매 : 자산 + 계약 동시 push.
 *
 * 두 모드 모두 자산 즉시 생성 (placeholder plate `구매-YYMM-NNN`) 후
 * /purchase 리스트에 등장. 다음 단계(증차신청)부터 인라인 진행.
 */
type Mode = 'stock' | 'matched';

export function PurchaseStartDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const router = useRouter();
  const audit = useAuditStamp();
  const [companies] = useCompanyStore();
  const [assets, setAssets] = useAssetStore();
  const [contracts, setContracts] = useContractStore();

  const activeComps = useMemo(() => activeCompanies(companies), [companies]);

  const [mode, setMode] = useState<Mode>('stock');
  const [companyCode, setCompanyCode] = useState('');
  const [vehicleSpecMemo, setVehicleSpecMemo] = useState('');
  const [exteriorColor, setExteriorColor] = useState('');
  const [expectedIntakeDate, setExpectedIntakeDate] = useState('');
  const [decisionNote, setDecisionNote] = useState('');
  const [catalogPicker, setCatalogPicker] = useState(false);
  const [catalogSel, setCatalogSel] = useState<CatalogSelection | null>(null);

  const [customerName, setCustomerName] = useState('');
  const [customerKind, setCustomerKind] = useState<CustomerKind>('개인');
  const [customerIdent, setCustomerIdent] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [monthlyAmount, setMonthlyAmount] = useState(0);
  const [deposit, setDeposit] = useState(0);
  const [paymentDay, setPaymentDay] = useState<number | ''>('');

  useEffect(() => {
    if (!open) return;
    setMode('stock');
    setCompanyCode(activeComps.length === 1 ? activeComps[0].code : '');
    setVehicleSpecMemo(''); setExteriorColor(''); setExpectedIntakeDate(''); setDecisionNote('');
    setCustomerName(''); setCustomerKind('개인'); setCustomerIdent(''); setCustomerPhone('');
    setStartDate(''); setEndDate(''); setMonthlyAmount(0); setDeposit(0); setPaymentDay('');
    setCatalogSel(null);
  }, [open, activeComps]);

  function handleCatalogPicked(sel: CatalogSelection) {
    setCatalogSel(sel);
    // 차종 메모: "메이커 모델 트림 (연식)" 형태로 자동 채움 — 사용자가 수정 가능
    const parts = [sel.maker, sel.model, sel.trim, sel.year ? `(${sel.year})` : ''].filter(Boolean);
    setVehicleSpecMemo(parts.join(' ').trim());
    setCatalogPicker(false);
  }

  const errors = useMemo(() => {
    const e: string[] = [];
    if (!companyCode) e.push('회사 선택 필요');
    if (!vehicleSpecMemo.trim()) e.push('차종 메모 필수');
    if (mode === 'matched') {
      if (!customerName.trim()) e.push('고객명 필수');
      if (!customerIdent.trim()) e.push('등록번호 필수');
      if (!startDate) e.push('시작일 필수');
      if (!endDate) e.push('만기일 필수');
      if (!monthlyAmount || monthlyAmount <= 0) e.push('월대여료 필수 (>0)');
      if (startDate && endDate && startDate > endDate) e.push('시작일 > 만기일');
    }
    return e;
  }, [companyCode, vehicleSpecMemo, mode, customerName, customerIdent, startDate, endDate, monthlyAmount]);

  function apply() {
    if (errors.length > 0) {
      alert('입력 확인:\n' + errors.map((e) => '· ' + e).join('\n'));
      return;
    }
    const today = todayStr();
    const stamp = `${today} ${new Date().toTimeString().slice(0, 5)}`;
    const auditCreate = audit.create();
    const placeholderPlate = generatePurchasePlate(new Date(), assets.map((a) => a.plate));
    const assetId = `a-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    let createdContract: Contract | null = null;
    if (mode === 'matched') {
      const contractId = `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const contractNo = nextDateScopedCode('C', contracts.map((c) => c.contractNo), { date: startDate || today });
      const events = generateContractSchedule(startDate, endDate, monthlyAmount, {
        autopayDay: typeof paymentDay === 'number' ? paymentDay : undefined,
      });
      createdContract = {
        id: contractId,
        companyCode,
        contractNo,
        plate: placeholderPlate,
        customerName: customerName.trim(),
        customerKind,
        customerIdent: customerIdent.trim(),
        customerPhone: customerPhone.trim(),
        startDate, endDate,
        monthlyAmount,
        deposit: deposit || 0,
        status: '대기',
        events,
        paymentDay: typeof paymentDay === 'number' ? paymentDay : undefined,
        ...auditCreate,
      };
    }

    const newAsset: Asset = {
      id: assetId,
      companyCode,
      plate: placeholderPlate,
      vehicleClass: '', usage: '',
      vehicleName: vehicleSpecMemo.trim(),
      vin: '', ownerName: '',
      firstRegistDate: '',
      exteriorColor: exteriorColor || undefined,
      status: '등록예정',
      purchase: {
        decidedAt: stamp,
        decidedBy: auditCreate.createdBy ?? { uid: 'system' },
        matchedContractId: createdContract?.id,
        vehicleSpecMemo: vehicleSpecMemo.trim(),
        exteriorColor: exteriorColor || undefined,
        expectedIntakeDate: expectedIntakeDate || undefined,
        decisionNote: decisionNote || undefined,
        productizationItems: DEFAULT_PRODUCTIZATION_ITEMS.map((i) => ({ ...i })),
      },
      ...auditCreate,
    };

    setAssets((prev) => [...prev, newAsset]);
    audit.log({
      action: 'create',
      entityType: 'asset',
      entityId: assetId,
      label: `차량구매 ${mode === 'matched' ? '계약매칭' : '선도'} - ${vehicleSpecMemo}`,
      after: newAsset,
    });

    if (createdContract) {
      const finalContract = createdContract;
      setContracts((prev) => [...prev, finalContract]);
      audit.log({
        action: 'create',
        entityType: 'contract',
        entityId: finalContract.id,
        label: `${finalContract.contractNo} (구매 동시 등록)`,
        after: finalContract,
      });
    }

    onOpenChange(false);
    router.push(`/asset/purchase/${assetId}`);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="차량구매" size="lg">
        <div className="space-y-3">
          <div className="form-grid">
            <label className="block col-span-2">
              <span className="label">회사 *</span>
              <select className="input w-full" value={companyCode} onChange={(e) => setCompanyCode(e.target.value)}>
                <option value="">선택</option>
                {activeComps.map((c) => (
                  <option key={c.code} value={c.code}>{c.code} · {c.name}</option>
                ))}
              </select>
            </label>
            <label className="block col-span-2">
              <span className="label">차종 *</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  className="input"
                  style={{ flex: 1 }}
                  placeholder="그랜저 IG 2024"
                  value={vehicleSpecMemo}
                  onChange={(e) => { setVehicleSpecMemo(e.target.value); setCatalogSel(null); }}
                />
                <button type="button" className="btn btn-sm" onClick={() => setCatalogPicker(true)} title="freepasserp3 카탈로그에서 차종·트림·옵션 선택">
                  <MagnifyingGlass size={12} weight="bold" /> 카탈로그
                </button>
              </div>
              {catalogSel ? (
                <span className="text-success text-xs">
                  ✓ 카탈로그 매칭 — {catalogSel.maker} · {catalogSel.model}
                  {catalogSel.trim && ` · ${catalogSel.trim}`}
                  {catalogSel.options && catalogSel.options.length > 0 && ` · 옵션 ${catalogSel.options.length}개`}
                </span>
              ) : (
                <span className="text-weak text-xs">자유 텍스트 또는 [카탈로그] 버튼으로 freepasserp3 차종 매트릭스에서 선택.</span>
              )}
            </label>
            <label className="block">
              <span className="label">색상</span>
              <input className="input w-full" value={exteriorColor} onChange={(e) => setExteriorColor(e.target.value)} />
            </label>
            <label className="block">
              <span className="label">예상 입고일</span>
              <input type="date" className="input w-full" value={expectedIntakeDate} onChange={(e) => setExpectedIntakeDate(e.target.value)} />
            </label>
            <label className="block col-span-2">
              <span className="label">비고</span>
              <input className="input w-full" value={decisionNote} onChange={(e) => setDecisionNote(e.target.value)} placeholder="협상 메모, 견적 비교 등" />
            </label>
          </div>

          {/* 계약매칭 토글 — ON 시 손님·계약 슬롯 펼침 */}
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: 10,
              background: mode === 'matched' ? 'var(--brand-soft, #eef2fb)' : 'var(--bg-card)',
              border: `1px solid ${mode === 'matched' ? 'var(--brand)' : 'var(--border)'}`,
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={mode === 'matched'}
              onChange={(e) => setMode(e.target.checked ? 'matched' : 'stock')}
            />
            <span>
              <strong>계약매칭으로 진행</strong>
              <span className="text-weak text-xs" style={{ marginLeft: 8 }}>
                {mode === 'matched'
                  ? '손님·계약 정보 입력 슬롯이 펼쳐졌습니다 — 자산+계약 동시 등록'
                  : '체크 시 손님·계약 정보 슬롯이 펼쳐집니다 (계약매칭 구매)'}
              </span>
            </span>
          </label>

          {mode === 'matched' && (
            <>
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                <strong className="text-xs">손님 정보</strong>
              </div>
              <div className="form-grid">
                <label className="block col-span-2">
                  <span className="label">고객명 *</span>
                  <input className="input w-full" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
                </label>
                <label className="block">
                  <span className="label">신분 *</span>
                  <select className="input w-full" value={customerKind} onChange={(e) => setCustomerKind(e.target.value as CustomerKind)}>
                    <option value="개인">개인</option>
                    <option value="사업자">사업자</option>
                    <option value="법인">법인</option>
                  </select>
                </label>
                <label className="block">
                  <span className="label">등록번호 *</span>
                  <input className="input w-full" value={customerIdent} onChange={(e) => setCustomerIdent(e.target.value)} placeholder="900101-1234567" />
                </label>
                <label className="block col-span-2">
                  <span className="label">연락처</span>
                  <input className="input w-full" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="010-1234-5678" />
                </label>
              </div>

              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                <strong className="text-xs">계약 조건</strong>
              </div>
              <div className="form-grid">
                <label className="block">
                  <span className="label">시작일 *</span>
                  <input type="date" className="input w-full" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </label>
                <label className="block">
                  <span className="label">만기일 *</span>
                  <input type="date" className="input w-full" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </label>
                <label className="block">
                  <span className="label">월대여료 (원) *</span>
                  <input type="number" className="input w-full" value={monthlyAmount} onChange={(e) => setMonthlyAmount(Number(e.target.value) || 0)} />
                </label>
                <label className="block">
                  <span className="label">보증금 (원)</span>
                  <input type="number" className="input w-full" value={deposit} onChange={(e) => setDeposit(Number(e.target.value) || 0)} />
                </label>
                <label className="block">
                  <span className="label">결제일 (1-31)</span>
                  <input
                    type="number" min={1} max={31}
                    className="input w-full"
                    value={paymentDay}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      setPaymentDay(Number.isFinite(n) && n >= 1 && n <= 31 ? n : '');
                    }}
                  />
                </label>
              </div>
            </>
          )}

          {errors.length > 0 && (
            <div className="text-red text-xs" style={{ background: 'var(--alert-red-bg, #fee)', padding: 8, borderRadius: 4 }}>
              {errors.map((e, i) => <div key={i}>· {e}</div>)}
            </div>
          )}

          <div className="text-weak text-xs" style={{ background: 'var(--bg-card)', padding: 8, borderRadius: 4 }}>
            <strong>적용 시:</strong>
            <br />· 자산 즉시 push (placeholder 차량번호 <code>구매-YYMM-NNN</code>) — 차량등록 단계에서 실제값 교체
            {mode === 'matched' && (
              <>
                <br />· 계약 즉시 push (status=&quot;대기&quot;) — 인도 단계에서 운행중 전환
              </>
            )}
            <br />· /purchase 리스트에 등장 — 다음 단계(증차신청)부터 인라인 진행
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild><button className="btn">취소</button></DialogClose>
          <button className="btn btn-primary" onClick={apply} disabled={errors.length > 0}>
            <ShoppingCart size={13} weight="bold" /> 구매결정 + 흐름 시작
          </button>
        </DialogFooter>
      </DialogContent>
      <CatalogSelectorDialog
        open={catalogPicker}
        onOpenChange={setCatalogPicker}
        onPick={handleCatalogPicked}
      />
    </Dialog>
  );
}
